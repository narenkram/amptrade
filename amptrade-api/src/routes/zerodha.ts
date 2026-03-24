import express, { RequestHandler } from 'express';
import axios from 'axios';
import { StoredCredentials } from '../types/types';
import crypto from 'crypto';
import { createProxyMiddleware } from 'http-proxy-middleware';

// Create router function that takes in stored credentials
const zerodhaRouter = (storedCredentials: StoredCredentials) => {
  const router = express.Router();

  // Proxy middleware setup
  router.use(
    "/zerodhaApi",
    createProxyMiddleware({
      target: "https://api.kite.trade",
      changeOrigin: true,
      pathRewrite: {
        "^/zerodhaApi": "",
      },
    })
  );

  // Endpoint to generate access token using request token
  const generateTokenHandler: RequestHandler = async (
    req,
    res
  ) => {
    try {
      const userId = 'default';
      
      if (!userId) {
        res.status(401).json({ success: false, message: 'User not authenticated' });
        return;
      }

      const { api_key, request_token, api_secret } = req.body;

      if (!api_key || !request_token || !api_secret) {
        res.status(400).json({ 
          success: false, 
          message: 'Missing required parameters: api_key, request_token, or api_secret' 
        });
        return;
      }

      // Make request to Zerodha API to exchange token
      const response = await axios.post(
        'https://api.kite.trade/session/token',
        `api_key=${api_key}&request_token=${request_token}&checksum=${api_secret}`,
        {
          headers: {
            'X-Kite-Version': '3',
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      // Save user credentials
      if (!storedCredentials[userId]) {
        storedCredentials[userId] = {};
      }

      storedCredentials[userId].zerodha = {
        api_key: api_key,
        access_token: response.data.data.access_token,
        user_id: response.data.data.user_id
      };

      res.status(200).json({
        success: true,
        message: 'Token generated successfully',
        data: {
          user_id: response.data.data.user_id,
          access_token: response.data.data.access_token
        }
      });
      
    } catch (error: any) {
      console.error('Zerodha token generation error:', error.response?.data || error.message);
      
      res.status(500).json({
        success: false,
        message: 'Failed to generate Zerodha token',
        error: error.response?.data || error.message
      });
    }
  };

  // Get margin information endpoint
  const getMarginsHandler: RequestHandler = async (
    req,
    res
  ) => {
    try {
      const userId = 'default';
      
      if (!userId) {
        res.status(401).json({ success: false, message: 'User not authenticated' });
        return;
      }

      // Get user's Zerodha credentials
      const userCredentials = storedCredentials[userId]?.zerodha;
      
      if (!userCredentials || !userCredentials.api_key || !userCredentials.access_token) {
        res.status(400).json({ 
          success: false, 
          message: 'Zerodha credentials not found' 
        });
        return;
      }

      // Make request to Zerodha API to get margins data
      const response = await axios.get('https://api.kite.trade/user/margins', {
        headers: {
          'X-Kite-Version': '3',
          'Authorization': `token ${userCredentials.api_key}:${userCredentials.access_token}`
        }
      });

      res.status(200).json({
        success: true,
        data: response.data
      });
      
    } catch (error: any) {
      console.error('Zerodha margins error:', error.response?.data || error.message);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch margins',
        error: error.response?.data || error.message
      });
    }
  };

  // Get positions information endpoint
  const getPositionsHandler: RequestHandler = async (
    req,
    res
  ) => {
    try {
      const userId = 'default';
      
      if (!userId) {
        res.status(401).json({ success: false, message: 'User not authenticated' });
        return;
      }

      // Get user's Zerodha credentials
      const userCredentials = storedCredentials[userId]?.zerodha;
      
      if (!userCredentials || !userCredentials.api_key || !userCredentials.access_token) {
        res.status(400).json({ 
          success: false, 
          message: 'Zerodha credentials not found' 
        });
        return;
      }

      // Make request to Zerodha API to get positions data
      const response = await axios.get('https://api.kite.trade/portfolio/positions', {
        headers: {
          'X-Kite-Version': '3',
          'Authorization': `token ${userCredentials.api_key}:${userCredentials.access_token}`
        }
      });

      res.status(200).json({
        success: true,
        data: response.data
      });
      
    } catch (error: any) {
      console.error('Zerodha positions error:', error.response?.data || error.message);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch positions',
        error: error.response?.data || error.message
      });
    }
  };

  // Get orders and trades information endpoint
  const getOrdersAndTradesHandler: RequestHandler = async (
    req,
    res
  ) => {
    try {
      const userId = 'default';
      
      if (!userId) {
        res.status(401).json({ success: false, message: 'User not authenticated' });
        return;
      }

      // Get user's Zerodha credentials
      const userCredentials = storedCredentials[userId]?.zerodha;
      
      if (!userCredentials || !userCredentials.api_key || !userCredentials.access_token) {
        res.status(400).json({ 
          success: false, 
          message: 'Zerodha credentials not found' 
        });
        return;
      }

      // Authorization header for Zerodha API
      const authHeader = {
        'X-Kite-Version': '3',
        'Authorization': `token ${userCredentials.api_key}:${userCredentials.access_token}`
      };

      // Make parallel requests to Zerodha API to get orders and trades data
      const [ordersResponse, tradesResponse] = await Promise.all([
        axios.get('https://api.kite.trade/orders', {
          headers: authHeader
        }),
        axios.get('https://api.kite.trade/trades', {
          headers: authHeader
        })
      ]);

      res.status(200).json({
        success: true,
        data: {
          orderBook: ordersResponse.data.data,
          tradeBook: tradesResponse.data.data
        }
      });
      
    } catch (error: any) {
      console.error('Zerodha orders and trades error:', error.response?.data || error.message);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch orders and trades',
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
      
      if (!userId) {
        res.status(401).json({ success: false, message: 'User not authenticated' });
        return;
      }

      // Get user's Zerodha credentials
      const userCredentials = storedCredentials[userId]?.zerodha;
      
      if (!userCredentials || !userCredentials.api_key || !userCredentials.access_token) {
        res.status(400).json({ 
          success: false, 
          message: 'Zerodha credentials not found' 
        });
        return;
      }

      // Extract required parameters from request body
      const {
        exch,      // Exchange (NSE, BSE, NFO, etc.)
        tsym,      // Trading symbol
        qty,       // Quantity
        prc,       // Price (for limit orders)
        prd,       // Product type (CNC, MIS, NRML)
        trantype,  // Transaction type (B for Buy, S for Sell)
        prctyp,    // Price type (LMT, MKT, SL-LMT, SL-MKT)
        ret        // Validity (DAY, IOC, TTL)
      } = req.body;

      // Map the order parameters to Zerodha API format
      const orderParams = new URLSearchParams();
      
      // Map exchange
      orderParams.append('exchange', exch);
      
      // Map trading symbol
      orderParams.append('tradingsymbol', tsym);
      
      // Map quantity
      orderParams.append('quantity', qty);
      
      // Map transaction type (B/S to BUY/SELL)
      orderParams.append('transaction_type', trantype === 'B' ? 'BUY' : 'SELL');
      
      // Map product type
      const productTypeMap: { [key: string]: string } = {
        'I': 'MIS',    // Intraday
        'C': 'CNC',    // Cash and Carry
        'M': 'NRML',   // Normal/Carry Forward
      };
      orderParams.append('product', productTypeMap[prd] || prd);
      
      // Map order type
      const orderTypeMap: { [key: string]: string } = {
        'MKT': 'MARKET',
        'LMT': 'LIMIT',
        'SL-LMT': 'SL',
        'SL-MKT': 'SL-M'
      };
      orderParams.append('order_type', orderTypeMap[prctyp] || prctyp);
      
      // Map price (for limit orders)
      if (prctyp === 'LMT' || prctyp === 'SL-LMT') {
        orderParams.append('price', prc);
      }
      
      // Map validity
      const validityMap: { [key: string]: string } = {
        'DAY': 'DAY',
        'IOC': 'IOC'
      };
      orderParams.append('validity', validityMap[ret] || 'DAY');
      
      // Make request to Zerodha API to place order
      const response = await axios.post(
        'https://api.kite.trade/orders/regular',
        orderParams,
        {
          headers: {
            'X-Kite-Version': '3',
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `token ${userCredentials.api_key}:${userCredentials.access_token}`
          }
        }
      );

      res.status(200).json({
        success: true,
        data: response.data
      });
      
    } catch (error: any) {
      console.error('Zerodha place order error:', error.response?.data || error.message);
      res.status(500).json({
        success: false,
        message: 'Failed to place order',
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
      
      // Get user's Zerodha credentials
      const userCredentials = storedCredentials[userId]?.zerodha;
      
      if (!userCredentials || !userCredentials.api_key || !userCredentials.access_token) {
        res.status(400).json({ 
          success: false, 
          message: 'Zerodha credentials not found' 
        });
        return;
      }

      // Extract order ID from request body
      const { norenordno } = req.body;

      // Make request to Zerodha API to cancel order
      const response = await axios.delete(
        `https://api.kite.trade/orders/regular/${norenordno}`,
        {
          headers: {
            'X-Kite-Version': '3',
            'Authorization': `token ${userCredentials.api_key}:${userCredentials.access_token}`
          }
        }
      );

      res.status(200).json({
        success: true,
        data: response.data
      });
      
    } catch (error: any) {
      console.error('Zerodha cancel order error:', error.response?.data || error.message);
      res.status(500).json({
        success: false,
        message: 'Failed to cancel order',
        error: error.response?.data || error.message
      });
    }
  };

  // Register routes
  router.post('/generateToken', generateTokenHandler);
  router.get('/fundLimit', getMarginsHandler);
  router.get('/getPositionBook', getPositionsHandler);
  router.get('/getOrdersAndTrades', getOrdersAndTradesHandler);
  router.post('/placeOrder', placeOrderHandler);
  router.post('/cancelOrder', cancelOrderHandler);

  return router;
};

export default zerodhaRouter; 
