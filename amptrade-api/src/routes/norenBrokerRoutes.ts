/**
 * Unified NorenAPI Broker Routes
 *
 * This file provides a single parameterized router factory that generates routes
 * for any NorenAPI-compatible broker based on configuration.
 *
 * Replaces: flattrade.ts, shoonya.ts, zebu.ts, tradesmart.ts, infinn.ts
 */

import express, { Router, RequestHandler } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import axios from "axios";
import {
    StoredCredentials,
    OrderRequest,
    CancelOrderRequest,
    ModifyOrderRequest,
} from "../types/types";
import { NorenBrokerConfig } from "../config/norenBrokerConfig";

/**
 * Creates a router for a NorenAPI-compatible broker
 *
 * @param config - The broker configuration
 * @param storedCredentials - Shared credentials storage
 * @returns Express Router with all broker endpoints
 */
export function createNorenBrokerRouter(
    config: NorenBrokerConfig,
    storedCredentials: StoredCredentials
): Router {
    const router = express.Router();
    const { name, id, proxyTarget, apiHost, queryParamPrefix, authType, authUrl } = config;

    // Proxy middleware setup
    router.use(
        `/${id}Api`,
        createProxyMiddleware({
            target: proxyTarget,
            changeOrigin: true,
            pathRewrite: {
                [`^/${id}Api`]: "",
            },
        })
    );

    // ============================================================================
    // AUTH HANDLERS
    // ============================================================================

    /**
     * QuickAuth login handler - used by Shoonya, Zebu, Tradesmart, Infinn
     */
    const quickAuthLoginHandler: RequestHandler = async (
        req,
        res
    ) => {
        const appUserId = "default";

        try {
            const { jKey, jData } = req.body;

            if (!jKey || !jData) {
                throw new Error("Missing required login parameters");
            }

            const response = await axios.post(
                `${apiHost}/QuickAuth`,
                `jData=${jData}&jKey=${jKey}`,
                {
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                }
            );

            // Store user-specific credentials
            if (!storedCredentials[appUserId]) {
                storedCredentials[appUserId] = {};
            }
            storedCredentials[appUserId][id] = {
                usersession: response.data.susertoken,
                userid: response.data.actid,
            };

            res.json(response.data);
        } catch (error) {
            console.error(`Error in ${name} login:`, error instanceof Error ? error.message : error);
            res.status(400).json({
                stat: "Not_Ok",
                emsg: error instanceof Error ? error.message : String(error),
            });
        }
    };

    /**
     * OAuth token generation handler - used by Flattrade
     */
    const oauthGenerateTokenHandler: RequestHandler = async (
        req,
        res
    ) => {
        const appUserId = "default";

        try {
            const { api_key, request_code, api_secret } = req.body;

            if (!api_key || !request_code || !api_secret) {
                throw new Error("Missing required parameters");
            }

            const response = await axios.post(
                authUrl!,
                { api_key, request_code, api_secret },
                {
                    headers: { "Content-Type": "application/json" },
                }
            );

            // Store user-specific credentials only if token exists
            if (response.data.token && response.data.client) {
                if (!storedCredentials[appUserId]) {
                    storedCredentials[appUserId] = {};
                }
                storedCredentials[appUserId][id] = {
                    usersession: response.data.token,
                    userid: response.data.client,
                };
            } else {
                throw new Error(`Invalid response format from ${name} API`);
            }

            res.json(response.data);
        } catch (error) {
            console.error("Generate Token Error:", {
                error: error instanceof Error ? error.message : String(error),
                axiosError: axios.isAxiosError(error)
                    ? {
                        response: error.response?.data,
                        status: error.response?.status,
                        statusText: error.response?.statusText,
                    }
                    : null,
            });
            res.status(400).json({
                message: `Error generating ${name} token`,
                error: error instanceof Error ? error.message : String(error),
                details: axios.isAxiosError(error) ? error.response?.data : null,
            });
        }
    };

    // ============================================================================
    // COMMON HANDLERS
    // ============================================================================

    /**
     * Get fund limits endpoint
     */
    const getFundLimitHandler: RequestHandler = async (
        req,
        res
    ) => {
        const appUserId = "default";

        const jKey = req.query[`${queryParamPrefix}_API_TOKEN`] as string;
        const clientId = req.query[`${queryParamPrefix}_CLIENT_ID`] as string;

        if (!jKey || !clientId) {
            res.status(400).json({ message: "API token or Client ID is missing." });
            return;
        }

        const jData = JSON.stringify({ uid: clientId, actid: clientId });
        const payload = `jKey=${jKey}&jData=${jData}`;

        try {
            const response = await axios.post(`${apiHost}/Limits`, payload, {
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
            });
            res.json(response.data);
        } catch (error) {
            res.status(500).json({
                message: `Error fetching ${name} fund limits`,
                error: error instanceof Error ? error.message : String(error),
            });
            console.error(`Error fetching ${name} fund limits:`, error);
        }
    };

    /**
     * Get orders and trades endpoint
     */
    const getOrdersAndTradesHandler: RequestHandler = async (
        req,
        res
    ) => {
        const appUserId = "default";

        const jKey = req.query[`${queryParamPrefix}_API_TOKEN`] as string;
        const clientId = req.query[`${queryParamPrefix}_CLIENT_ID`] as string;

        if (!jKey || !clientId) {
            res.status(400).json({ message: "Token or Client ID is missing." });
            return;
        }

        // Note: Flattrade doesn't include prd in orderBook payload
        const orderBookData = authType === "oauth"
            ? { uid: clientId }
            : { uid: clientId, prd: "M" };

        const orderBookPayload = `jKey=${jKey}&jData=${JSON.stringify(orderBookData)}`;
        const tradeBookPayload = `jKey=${jKey}&jData=${JSON.stringify({
            uid: clientId,
            actid: clientId,
        })}`;

        try {
            const [orderBookRes, tradeBookRes] = await Promise.all([
                axios.post(`${apiHost}/OrderBook`, orderBookPayload, {
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                }),
                axios.post(`${apiHost}/TradeBook`, tradeBookPayload, {
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                }),
            ]);

            res.json({
                orderBook: orderBookRes.data,
                tradeBook: tradeBookRes.data,
            });
        } catch (error) {
            res.status(500).json({
                message: `Error fetching ${name} orders and trades`,
                error: error instanceof Error ? error.message : String(error),
            });
            console.error(`Error fetching ${name} orders and trades:`, error);
        }
    };

    /**
     * Get position book endpoint
     */
    const getPositionBookHandler: RequestHandler = async (
        req,
        res
    ) => {
        const appUserId = "default";

        const jKey = req.query[`${queryParamPrefix}_API_TOKEN`] as string;
        const clientId = req.query[`${queryParamPrefix}_CLIENT_ID`] as string;

        if (!jKey || !clientId) {
            res.status(400).json({ message: "Token or Client ID is missing." });
            return;
        }

        const payload = `jKey=${jKey}&jData=${JSON.stringify({
            uid: clientId,
            actid: clientId,
        })}`;

        try {
            const response = await axios.post(`${apiHost}/PositionBook`, payload, {
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
            });
            res.json(response.data);
        } catch (error) {
            res.status(500).json({
                message: `Error fetching ${name} position book`,
                error: error instanceof Error ? error.message : String(error),
            });
            console.error(`Error fetching ${name} position book:`, error);
        }
    };

    /**
     * Place order endpoint
     */
    const placeOrderHandler: RequestHandler = async (
        req,
        res
    ) => {
        const appUserId = "default";

        try {
            const { uid, actid, exch, tsym, qty, prc, prd, trantype, prctyp, ret } =
                req.body as OrderRequest;
            const jKey = req.query[`${queryParamPrefix}_API_TOKEN`] as string;

            if (!jKey) {
                res.status(400).json({
                    message: "Token is missing. Please generate a token first.",
                });
                return;
            }

            const jData = JSON.stringify({
                uid,
                actid,
                exch,
                tsym,
                qty,
                prc,
                prd,
                trantype,
                prctyp,
                ret,
            });

            const payload = `jKey=${jKey}&jData=${jData}`;

            const response = await axios.post(`${apiHost}/PlaceOrder`, payload, {
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
            });

            res.json(response.data);
        } catch (error) {
            console.error("Error in placeOrderHandler:", {
                error:
                    error instanceof Error
                        ? { message: error.message, stack: error.stack }
                        : error,
                axiosError: axios.isAxiosError(error)
                    ? {
                        response: error.response?.data,
                        status: error.response?.status,
                        statusText: error.response?.statusText,
                    }
                    : null,
            });

            res.status(500).json({
                message: `Error placing ${name} order`,
                error: error instanceof Error ? error.message : String(error),
                details: axios.isAxiosError(error) ? error.response?.data : null,
            });
        }
    };

    /**
     * Cancel order endpoint
     */
    const cancelOrderHandler: RequestHandler = async (
        req,
        res
    ) => {
        const appUserId = "default";

        const { norenordno, uid } = req.body as CancelOrderRequest;
        const jKey = req.query[`${queryParamPrefix}_API_TOKEN`] as string;

        if (!jKey) {
            res.status(400).json({
                message: "Token is missing. Please generate a token first.",
            });
            return;
        }

        const payload = `jKey=${jKey}&jData=${JSON.stringify({ norenordno, uid })}`;

        try {
            const response = await axios.post(`${apiHost}/CancelOrder`, payload, {
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
            });
            res.json(response.data);
        } catch (error) {
            res.status(500).json({
                message: `Error cancelling ${name} order`,
                error: error instanceof Error ? error.message : String(error),
            });
            console.error(`Error cancelling ${name} order:`, error);
        }
    };

    /**
     * Modify order endpoint
     */
    const modifyOrderHandler: RequestHandler = async (
        req,
        res
    ) => {
        const appUserId = "default";

        const { norenordno, uid, exch, tsym, qty, prc, prctyp } = req.body as ModifyOrderRequest;
        const jKey = req.query[`${queryParamPrefix}_API_TOKEN`] as string;

        if (!jKey) {
            res.status(400).json({
                message: "Token is missing. Please generate a token first.",
            });
            return;
        }

        const jData = JSON.stringify({
            norenordno,
            uid,
            exch,
            tsym,
            qty: qty.toString(),
            prc: prc.toString(),
            prctyp,
        });

        const payload = `jKey=${jKey}&jData=${jData}`;

        try {
            const response = await axios.post(`${apiHost}/ModifyOrder`, payload, {
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
            });
            res.json(response.data);
        } catch (error) {
            res.status(500).json({
                message: `Error modifying ${name} order`,
                error: error instanceof Error ? error.message : String(error),
            });
            console.error(`Error modifying ${name} order:`, error);
        }
    };

    // ============================================================================
    // ROUTE REGISTRATION
    // ============================================================================

    // Auth routes - different based on auth type
    if (authType === "quickAuth") {
        router.post("/login", quickAuthLoginHandler);
    } else {
        router.post("/generateToken", oauthGenerateTokenHandler);
    }

    // Common routes
    router.post("/fundLimit", getFundLimitHandler);
    router.get("/getOrdersAndTrades", getOrdersAndTradesHandler);
    router.get("/getPositionBook", getPositionBookHandler);
    router.post("/placeOrder", placeOrderHandler);
    router.post("/cancelOrder", cancelOrderHandler);
    router.post("/modifyOrder", modifyOrderHandler);

    return router;
}

export default createNorenBrokerRouter;
