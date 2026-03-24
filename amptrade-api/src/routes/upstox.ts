import express, { RequestHandler } from 'express';
import axios from 'axios';
import { StoredCredentials, ModifyOrderRequest } from '../types/types';

// Create router function that takes in stored credentials
const upstoxRouter = (storedCredentials: StoredCredentials) => {
  const router = express.Router();

  // Endpoint to generate access token using authorization code
  const generateTokenHandler: RequestHandler = async (
    req,
    res
  ) => {
    try {
      const userId = 'default';

      const { client_id, client_secret, code, redirect_uri, grant_type } = req.body;

      if (!client_id || !client_secret || !code || !redirect_uri) {
        res.status(400).json({
          success: false,
          message: 'Missing required parameters: client_id, client_secret, code, redirect_uri'
        });
        return;
      }

      // Upstox OAuth token exchange (v2)
      const form = new URLSearchParams({
        client_id,
        client_secret,
        code,
        redirect_uri,
        grant_type: grant_type || 'authorization_code'
      });

      const response = await axios.post(
        'https://api.upstox.com/v2/login/authorization/token',
        form.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json'
          }
        }
      );

      // Save user credentials
      if (!storedCredentials[userId]) {
        storedCredentials[userId] = {};
      }

      const accessToken = response.data?.access_token;
      const user_id = response.data?.user_id;

      if (!accessToken) {
        res.status(500).json({
          success: false,
          message: 'Failed to retrieve access_token from Upstox'
        });
        return;
      }

      storedCredentials[userId].upstox = {
        client_id,
        access_token: accessToken,
        user_id
      };

      res.status(200).json({
        success: true,
        message: 'Token generated successfully',
        data: {
          user_id,
          access_token: accessToken
        }
      });
    } catch (error: any) {
      console.error('Upstox token generation error:', error.response?.data || error.message);
      res.status(500).json({
        success: false,
        message: 'Failed to generate Upstox token',
        error: error.response?.data || error.message
      });
    }
  };

  // Get fund/margins information endpoint
  const getFundLimitHandler: RequestHandler = async (
    req,
    res
  ) => {
    try {
      const userId = 'default';

      // Read access token from query params (matching pattern used by other brokers)
      const accessToken = req.query['UPSTOX_API_TOKEN'] as string;

      if (!accessToken) {
        res.status(400).json({
          success: false,
          message: 'UPSTOX_API_TOKEN is required'
        });
        return;
      }

      // Upstox margins/funds endpoint (v2)
      const response = await axios.get('https://api.upstox.com/v2/user/get-funds-and-margin', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json'
        }
      });

      res.status(200).json({
        success: true,
        data: response.data
      });
    } catch (error: any) {
      console.error('Upstox fundLimit error:', error.response?.data || error.message);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch Upstox fund limits',
        error: error.response?.data || error.message
      });
    }
  };

  // Get positions endpoint
  const getPositionsHandler: RequestHandler = async (
    req,
    res
  ) => {
    try {
      const userId = 'default';

      // Read access token from query params
      const accessToken = req.query['UPSTOX_API_TOKEN'] as string;

      if (!accessToken) {
        res.status(400).json({
          success: false,
          message: 'UPSTOX_API_TOKEN is required'
        });
        return;
      }

      // Upstox positions endpoint (v2)
      const response = await axios.get('https://api.upstox.com/v2/portfolio/short-term-positions', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json'
        }
      });

      res.status(200).json({
        success: true,
        data: response.data
      });
    } catch (error: any) {
      console.error('Upstox positions error:', error.response?.data || error.message);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch Upstox positions',
        error: error.response?.data || error.message
      });
    }
  };

  // Get orders and trades endpoint
  const getOrdersAndTradesHandler: RequestHandler = async (
    req,
    res
  ) => {
    try {
      const userId = 'default';

      // Read access token from query params
      const accessToken = req.query['UPSTOX_API_TOKEN'] as string;

      if (!accessToken) {
        res.status(400).json({
          success: false,
          message: 'UPSTOX_API_TOKEN is required'
        });
        return;
      }

      // Make parallel requests to get orders and trades
      const [ordersResponse, tradesResponse] = await Promise.all([
        axios.get('https://api.upstox.com/v2/order/retrieve-all', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json'
          }
        }),
        axios.get('https://api.upstox.com/v2/order/trades/get-trades-for-day', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json'
          }
        }).catch(() => ({ data: { data: [] } })) // Fallback if trades endpoint fails
      ]);

      res.status(200).json({
        success: true,
        data: {
          orderBook: ordersResponse.data?.data || [],
          tradeBook: tradesResponse.data?.data || []
        }
      });
    } catch (error: any) {
      console.error('Upstox orders and trades error:', error.response?.data || error.message);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch Upstox orders and trades',
        error: error.response?.data || error.message
      });
    }
  };

  // Place order endpoint
  const placeOrderHandler: RequestHandler = async (
    req,
    res
  ) => {
    try {
      const userId = 'default';

      // Read access token from query params
      const accessToken = req.query['UPSTOX_API_TOKEN'] as string;

      if (!accessToken) {
        res.status(400).json({
          success: false,
          message: 'UPSTOX_API_TOKEN is required'
        });
        return;
      }

      // Extract parameters from request body (using NorenAPI format for compatibility)
      const {
        exch,      // Exchange (NSE, BSE, NFO, etc.)
        tsym,      // Trading symbol
        qty,       // Quantity
        prc,       // Price (for limit orders)
        prd,       // Product type (I=Intraday, C=CNC/Delivery, M=NRML)
        trantype,  // Transaction type (B for Buy, S for Sell)
        prctyp,    // Price type (LMT, MKT, SL-LMT, SL-MKT)
        ret,       // Validity (DAY, IOC)
        trgprc,    // Trigger price (for SL orders)
        token      // Instrument token (from instrument search)
      } = req.body;

      // Debug: Log incoming request body to see what frontend is sending
      console.log('Upstox placeOrder - received body:', JSON.stringify(req.body, null, 2));
      console.log('Upstox placeOrder - token value:', token);

      // Map product type from NorenAPI format to Upstox format
      const productTypeMap: { [key: string]: string } = {
        'I': 'I',    // Intraday
        'C': 'D',    // CNC/Delivery -> D in Upstox
        'M': 'D',    // NRML -> D in Upstox (for F&O)
      };

      // Map order type from NorenAPI format to Upstox format
      const orderTypeMap: { [key: string]: string } = {
        'MKT': 'MARKET',
        'LMT': 'LIMIT',
        'SL-LMT': 'SL',
        'SL-MKT': 'SL-M'
      };

      // Construct Upstox order payload
      const orderPayload = {
        quantity: parseInt(qty),
        product: productTypeMap[prd] || 'D',
        validity: ret || 'DAY',
        price: prctyp === 'MKT' || prctyp === 'SL-MKT' ? 0 : parseFloat(prc) || 0,
        instrument_token: token, // As per Upstox API docs: "instrument_token": "NSE_EQ|INE669E01016"
        order_type: orderTypeMap[prctyp] || 'MARKET',
        transaction_type: trantype === 'B' ? 'BUY' : 'SELL',
        disclosed_quantity: 0,
        trigger_price: parseFloat(trgprc) || 0,
        is_amo: false
      };

      console.log('Upstox place order payload:', orderPayload);

      // Upstox place order endpoint (HFT endpoint for faster execution)
      const response = await axios.post('https://api-hft.upstox.com/v2/order/place', orderPayload, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        }
      });

      res.status(200).json({
        success: true,
        data: response.data
      });
    } catch (error: any) {
      console.error('Upstox place order error:', error.response?.data || error.message);
      res.status(500).json({
        success: false,
        message: 'Failed to place Upstox order',
        error: error.response?.data || error.message
      });
    }
  };

  // Cancel order endpoint
  const cancelOrderHandler: RequestHandler = async (
    req,
    res
  ) => {
    try {
      const userId = 'default';

      // Read access token from query params
      const accessToken = req.query['UPSTOX_API_TOKEN'] as string;

      if (!accessToken) {
        res.status(400).json({
          success: false,
          message: 'UPSTOX_API_TOKEN is required'
        });
        return;
      }

      // Extract order ID from request body (NorenAPI uses norenordno)
      const { norenordno } = req.body;

      if (!norenordno) {
        res.status(400).json({
          success: false,
          message: 'Order ID (norenordno) is required'
        });
        return;
      }

      // Upstox cancel order endpoint (HFT endpoint for faster execution)
      const response = await axios.delete(
        `https://api-hft.upstox.com/v2/order/cancel?order_id=${norenordno}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/json'
          }
        }
      );

      res.status(200).json({
        success: true,
        data: response.data
      });
    } catch (error: any) {
      console.error('Upstox cancel order error:', error.response?.data || error.message);
      res.status(500).json({
        success: false,
        message: 'Failed to cancel Upstox order',
        error: error.response?.data || error.message
      });
    }
  };

  // Modify order endpoint
  const modifyOrderHandler: RequestHandler = async (
    req,
    res
  ) => {
    try {
      const userId = 'default';

      const accessToken = req.query['UPSTOX_API_TOKEN'] as string;

      if (!accessToken) {
        res.status(400).json({
          success: false,
          message: 'UPSTOX_API_TOKEN is required'
        });
        return;
      }

      const body = req.body as ModifyOrderRequest & {
        trgprc?: string | number;
        ret?: string;
      };
      const { norenordno, qty, prc, prctyp } = body;

      if (!norenordno) {
        res.status(400).json({
          success: false,
          message: 'Order ID (norenordno) is required'
        });
        return;
      }

      const orderTypeMap: { [key: string]: string } = {
        'MKT': 'MARKET',
        'LMT': 'LIMIT',
        'SL-LMT': 'SL',
        'SL-MKT': 'SL-M'
      };

      const mappedOrderType = orderTypeMap[prctyp] || prctyp;
      const triggerPrice =
        body.trgprc !== undefined && body.trgprc !== null && body.trgprc !== ''
          ? Number(body.trgprc)
          : 0;

      const modifyPayload = {
        quantity: Number(qty),
        validity: body.ret || 'DAY',
        price: mappedOrderType === 'MARKET' || mappedOrderType === 'SL-M' ? 0 : Number(prc) || 0,
        order_id: norenordno,
        order_type: mappedOrderType,
        disclosed_quantity: 0,
        trigger_price: Number.isFinite(triggerPrice) ? triggerPrice : 0,
      };

      const response = await axios.put('https://api-hft.upstox.com/v2/order/modify', modifyPayload, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        }
      });

      res.status(200).json({
        success: true,
        data: response.data
      });
    } catch (error: any) {
      console.error('Upstox modify order error:', error.response?.data || error.message);
      res.status(500).json({
        success: false,
        message: 'Failed to modify Upstox order',
        error: error.response?.data || error.message
      });
    }
  };

  // Get authorized WebSocket URL for market data feed
  const getMarketDataFeedUrlHandler: RequestHandler = async (
    req,
    res
  ) => {
    try {
      const userId = 'default';

      const accessToken = storedCredentials[userId]?.upstox?.access_token;
      if (!accessToken) {
        res.status(401).json({
          success: false,
          message: 'Upstox credentials not found'
        });
        return;
      }

      // Get authorized WebSocket URL from Upstox V3 API
      const response = await axios.get(
        'https://api.upstox.com/v3/feed/market-data/authorize',
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json'
          }
        }
      );

      if (response.data?.status === 'success' && response.data?.data?.authorized_redirect_uri) {
        res.status(200).json({
          success: true,
          websocketUrl: response.data.data.authorized_redirect_uri
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Failed to get WebSocket URL from Upstox',
          data: response.data
        });
      }
    } catch (error: any) {
      console.error('Upstox WebSocket auth error:', error.response?.data || error.message);
      res.status(500).json({
        success: false,
        message: 'Failed to get Upstox WebSocket URL',
        error: error.response?.data || error.message
      });
    }
  };

  // Register routes
  router.post('/generateToken', generateTokenHandler);
  router.get('/fundLimit', getFundLimitHandler);
  router.get('/getPositionBook', getPositionsHandler);
  router.get('/getOrdersAndTrades', getOrdersAndTradesHandler);
  router.post('/placeOrder', placeOrderHandler);
  router.post('/cancelOrder', cancelOrderHandler);
  router.post('/modifyOrder', modifyOrderHandler);
  router.get('/getMarketDataFeedUrl', getMarketDataFeedUrlHandler);

  return router;
};

export default upstoxRouter;
