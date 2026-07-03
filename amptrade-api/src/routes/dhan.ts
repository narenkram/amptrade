import express, { RequestHandler } from 'express';
import axios from 'axios';
import { StoredCredentials } from '../types/types';

// Create router function that takes in stored credentials
const dhanRouter = (storedCredentials: StoredCredentials) => {
  const router = express.Router();

  // Dhan API base URL
  const DHAN_API_BASE = 'https://api.dhan.co/v2';

  /**
   * Helper function to get user credentials from storage
   * Currently uses 'default' user, can be extended for multi-user support
   */
  const getUserCredentials = (userId: string = 'default') => {
    return storedCredentials[userId]?.dhan;
  };

  /**
   * Helper function to make Dhan API calls with proper authentication
   */
  const makeDhanApiCall = async (
    method: string,
    endpoint: string,
    clientId: string,
    accessToken: string,
    data?: any
  ) => {
    const url = `${DHAN_API_BASE}${endpoint}`;
    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };

    try {
      const config = {
        method,
        url,
        headers,
        ...(data && { data }),
      };

      const response = await axios(config);
      return response.data;
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message;
      const errorCode = error.response?.status || 500;
      throw new Error(`Dhan API Error (${errorCode}): ${errorMessage}`);
    }
  };

  // ============================================================================
  // AUTH HANDLERS
  // ============================================================================

  /**
   * Generate and store Dhan access token
   * POST /dhan/generateToken
   * Body: { client_id, access_token }
   */
  const generateTokenHandler: RequestHandler = async (req, res) => {
    try {
      const userId = 'default';
      const { client_id, access_token } = req.body;

      if (!client_id || !access_token) {
        res.status(400).json({
          success: false,
          message: 'Missing required parameters: client_id or access_token',
        });
        return;
      }

      // Verify credentials by making a test API call
      try {
        await makeDhanApiCall(
          'GET',
          '/limits',
          client_id,
          access_token
        );
      } catch (error) {
        res.status(401).json({
          success: false,
          message: 'Invalid Dhan credentials',
          error: error instanceof Error ? error.message : String(error),
        });
        return;
      }

      // Store credentials
      if (!storedCredentials[userId]) {
        storedCredentials[userId] = {};
      }

      storedCredentials[userId].dhan = {
        client_id,
        access_token,
      };

      res.status(200).json({
        success: true,
        message: 'Dhan token generated and stored successfully',
        data: {
          client_id,
        },
      });
    } catch (error: any) {
      console.error('Dhan token generation error:', error.message);
      res.status(500).json({
        success: false,
        message: 'Failed to generate Dhan token',
        error: error.message,
      });
    }
  };

  // ============================================================================
  // FUND/MARGIN HANDLERS
  // ============================================================================

  /**
   * Get fund limits (margins) for Dhan account
   * GET /dhan/fundLimit
   */
  const getFundLimitHandler: RequestHandler = async (req, res) => {
    try {
      const userId = 'default';
      const userCredentials = getUserCredentials(userId);

      if (!userCredentials || !userCredentials.client_id || !userCredentials.access_token) {
        res.status(400).json({
          success: false,
          message: 'Dhan credentials not found',
        });
        return;
      }

      const response = await makeDhanApiCall(
        'GET',
        '/limits',
        userCredentials.client_id,
        userCredentials.access_token
      );

      res.status(200).json({
        success: true,
        data: response,
      });
    } catch (error: any) {
      console.error('Dhan fund limit error:', error.message);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch fund limits',
        error: error.message,
      });
    }
  };

  // ============================================================================
  // POSITION HANDLERS
  // ============================================================================

  /**
   * Get positions for Dhan account
   * GET /dhan/getPositionBook
   */
  const getPositionBookHandler: RequestHandler = async (req, res) => {
    try {
      const userId = 'default';
      const userCredentials = getUserCredentials(userId);

      if (!userCredentials || !userCredentials.client_id || !userCredentials.access_token) {
        res.status(400).json({
          success: false,
          message: 'Dhan credentials not found',
        });
        return;
      }

      const response = await makeDhanApiCall(
        'GET',
        '/positions',
        userCredentials.client_id,
        userCredentials.access_token
      );

      res.status(200).json({
        success: true,
        data: response,
      });
    } catch (error: any) {
      console.error('Dhan positions error:', error.message);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch positions',
        error: error.message,
      });
    }
  };

  // ============================================================================
  // ORDERS & TRADES HANDLERS
  // ============================================================================

  /**
   * Get orders and trades for Dhan account
   * GET /dhan/getOrdersAndTrades
   */
  const getOrdersAndTradesHandler: RequestHandler = async (req, res) => {
    try {
      const userId = 'default';
      const userCredentials = getUserCredentials(userId);

      if (!userCredentials || !userCredentials.client_id || !userCredentials.access_token) {
        res.status(400).json({
          success: false,
          message: 'Dhan credentials not found',
        });
        return;
      }

      const [ordersResponse, tradesResponse] = await Promise.all([
        makeDhanApiCall(
          'GET',
          '/orders',
          userCredentials.client_id,
          userCredentials.access_token
        ),
        makeDhanApiCall(
          'GET',
          '/trades',
          userCredentials.client_id,
          userCredentials.access_token
        ),
      ]);

      res.status(200).json({
        success: true,
        data: {
          orderBook: ordersResponse,
          tradeBook: tradesResponse,
        },
      });
    } catch (error: any) {
      console.error('Dhan orders and trades error:', error.message);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch orders and trades',
        error: error.message,
      });
    }
  };

  // ============================================================================
  // PLACE ORDER HANDLER
  // ============================================================================

  /**
   * Place an order on Dhan
   * POST /dhan/placeOrder
   * Body: {
   *   security_id: string,
   *   exchange_segment: string (NSE/BSE/NFO/BFO/MCX),
   *   transaction_type: string (BUY/SELL),
   *   quantity: number,
   *   order_type: string (MARKET/LIMIT/STOP_LOSS/STOP_LOSS_MARKET),
   *   product_type: string (CNC/INTRA/MARGIN/CO/BO),
   *   price: number (for limit orders),
   *   trigger_price: number (for stop loss orders),
   *   validity: string (DAY/IOC)
   * }
   */
  const placeOrderHandler: RequestHandler = async (req, res) => {
    try {
      const userId = 'default';
      const userCredentials = getUserCredentials(userId);

      if (!userCredentials || !userCredentials.client_id || !userCredentials.access_token) {
        res.status(400).json({
          success: false,
          message: 'Dhan credentials not found',
        });
        return;
      }

      const {
        security_id,
        exchange_segment,
        transaction_type,
        quantity,
        order_type,
        product_type,
        price,
        trigger_price,
        validity,
      } = req.body;

      // Build order payload
      const orderPayload: any = {
        security_id,
        exchange_segment,
        transaction_type,
        quantity,
        order_type,
        product_type,
        validity,
      };

      // Add price for limit orders
      if ((order_type === 'LIMIT' || order_type === 'STOP_LOSS') && price) {
        orderPayload.price = price;
      }

      // Add trigger price for stop loss orders
      if ((order_type === 'STOP_LOSS' || order_type === 'STOP_LOSS_MARKET') && trigger_price) {
        orderPayload.trigger_price = trigger_price;
      }

      const response = await makeDhanApiCall(
        'POST',
        '/orders',
        userCredentials.client_id,
        userCredentials.access_token,
        orderPayload
      );

      res.status(200).json({
        success: true,
        data: response,
      });
    } catch (error: any) {
      console.error('Dhan place order error:', error.message);
      res.status(500).json({
        success: false,
        message: 'Failed to place order',
        error: error.message,
      });
    }
  };

  // ============================================================================
  // CANCEL ORDER HANDLER
  // ============================================================================

  /**
   * Cancel an order on Dhan
   * POST /dhan/cancelOrder
   * Body: { order_id: string }
   */
  const cancelOrderHandler: RequestHandler = async (req, res) => {
    try {
      const userId = 'default';
      const userCredentials = getUserCredentials(userId);

      if (!userCredentials || !userCredentials.client_id || !userCredentials.access_token) {
        res.status(400).json({
          success: false,
          message: 'Dhan credentials not found',
        });
        return;
      }

      const { order_id } = req.body;

      if (!order_id) {
        res.status(400).json({
          success: false,
          message: 'order_id is required',
        });
        return;
      }

      const response = await makeDhanApiCall(
        'DELETE',
        `/orders/${order_id}`,
        userCredentials.client_id,
        userCredentials.access_token
      );

      res.status(200).json({
        success: true,
        data: response,
      });
    } catch (error: any) {
      console.error('Dhan cancel order error:', error.message);
      res.status(500).json({
        success: false,
        message: 'Failed to cancel order',
        error: error.message,
      });
    }
  };

  // ============================================================================
  // MODIFY ORDER HANDLER
  // ============================================================================

  /**
   * Modify an existing order on Dhan
   * PUT /dhan/modifyOrder
   * Body: {
   *   order_id: string,
   *   order_type: string,
   *   quantity: number,
   *   price: number,
   *   trigger_price: number,
   *   validity: string
   * }
   */
  const modifyOrderHandler: RequestHandler = async (req, res) => {
    try {
      const userId = 'default';
      const userCredentials = getUserCredentials(userId);

      if (!userCredentials || !userCredentials.client_id || !userCredentials.access_token) {
        res.status(400).json({
          success: false,
          message: 'Dhan credentials not found',
        });
        return;
      }

      const { order_id, order_type, quantity, price, trigger_price, validity } = req.body;

      if (!order_id) {
        res.status(400).json({
          success: false,
          message: 'order_id is required',
        });
        return;
      }

      // Build modify payload
      const modifyPayload: any = {
        order_type,
        quantity,
        validity,
      };

      if (price) {
        modifyPayload.price = price;
      }

      if (trigger_price) {
        modifyPayload.trigger_price = trigger_price;
      }

      const response = await makeDhanApiCall(
        'PUT',
        `/orders/${order_id}`,
        userCredentials.client_id,
        userCredentials.access_token,
        modifyPayload
      );

      res.status(200).json({
        success: true,
        data: response,
      });
    } catch (error: any) {
      console.error('Dhan modify order error:', error.message);
      res.status(500).json({
        success: false,
        message: 'Failed to modify order',
        error: error.message,
      });
    }
  };

  // ============================================================================
  // ROUTE REGISTRATION
  // ============================================================================

  router.post('/generateToken', generateTokenHandler);
  router.get('/fundLimit', getFundLimitHandler);
  router.get('/getPositionBook', getPositionBookHandler);
  router.get('/getOrdersAndTrades', getOrdersAndTradesHandler);
  router.post('/placeOrder', placeOrderHandler);
  router.post('/cancelOrder', cancelOrderHandler);
  router.put('/modifyOrder', modifyOrderHandler);

  return router;
};

export default dhanRouter;
