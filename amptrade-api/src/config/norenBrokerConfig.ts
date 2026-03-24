/**
 * NorenAPI Broker Configuration
 *
 * This file centralizes configuration for all NorenAPI-compatible brokers.
 * Each broker uses the same API protocol but with different host URLs.
 *
 * Broker Types:
 * - QuickAuth brokers: Shoonya, Zebu, Tradesmart, Infinn (use login endpoint with QuickAuth)
 * - OAuth brokers: Flattrade (uses generateToken with api_key/api_secret/request_code)
 */

export interface NorenBrokerConfig {
    /** Display name for the broker */
    name: string;
    /** Broker identifier used in routes and storage keys */
    id: string;
    /** Base URL for proxy middleware (for auth redirects) */
    proxyTarget: string;
    /** Base URL for API calls */
    apiHost: string;
    /** Query parameter prefix for token/client id (e.g., "FLATTRADE", "SHOONYA") */
    queryParamPrefix: string;
    /** Auth type determines which login flow to use */
    authType: "quickAuth" | "oauth";
    /** Auth URL for OAuth brokers (only for oauth type) */
    authUrl?: string;
}

/**
 * Configuration for all NorenAPI-compatible brokers.
 * Order: Quickauth brokers first, then OAuth broker (Flattrade)
 */
export const NOREN_BROKERS: Record<string, NorenBrokerConfig> = {
    shoonya: {
        name: "Shoonya",
        id: "shoonya",
        proxyTarget: "https://api.shoonya.com",
        apiHost: "https://api.shoonya.com/NorenWClientTP",
        queryParamPrefix: "SHOONYA",
        authType: "quickAuth",
    },
    zebu: {
        name: "Zebu",
        id: "zebu",
        proxyTarget: "https://go.mynt.in",
        apiHost: "https://go.mynt.in/NorenWClientTP",
        queryParamPrefix: "ZEBU",
        authType: "quickAuth",
    },
    tradesmart: {
        name: "Tradesmart",
        id: "tradesmart",
        proxyTarget: "https://v2api.tradesmartonline.in",
        apiHost: "https://v2api.tradesmartonline.in/NorenWClientTP",
        queryParamPrefix: "TRADESMART",
        authType: "quickAuth",
    },
    infinn: {
        name: "Infinn",
        id: "infinn",
        proxyTarget: "https://api.infinn.in",
        apiHost: "https://api.infinn.in/NorenWClientTP",
        queryParamPrefix: "INFINN",
        authType: "quickAuth",
    },
    flattrade: {
        name: "Flattrade",
        id: "flattrade",
        proxyTarget: "https://authapi.flattrade.in",
        apiHost: "https://piconnect.flattrade.in/PiConnectTP",
        queryParamPrefix: "FLATTRADE",
        authType: "oauth",
        authUrl: "https://authapi.flattrade.in/trade/apitoken",
    },
};

/**
 * Get broker configuration by ID
 */
export function getBrokerConfig(brokerId: string): NorenBrokerConfig | undefined {
    return NOREN_BROKERS[brokerId.toLowerCase()];
}

/**
 * Get all broker IDs
 */
export function getAllBrokerIds(): string[] {
    return Object.keys(NOREN_BROKERS);
}

/**
 * Check if a broker uses QuickAuth login flow
 */
export function isQuickAuthBroker(brokerId: string): boolean {
    const config = getBrokerConfig(brokerId);
    return config?.authType === "quickAuth";
}
