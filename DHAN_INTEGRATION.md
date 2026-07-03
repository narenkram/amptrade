# Dhan Broker Integration Guide

This guide explains how to integrate and use Dhan broker with AmpTrade for automated trading and copy trading.

## Table of Contents
1. [Setup](#setup)
2. [Authentication](#authentication)
3. [API Endpoints](#api-endpoints)
4. [Usage Examples](#usage-examples)
5. [Trading Operations](#trading-operations)
6. [Troubleshooting](#troubleshooting)

---

## Setup

### Prerequisites
- Dhan trading account
- API access enabled on your Dhan account
- Client ID and Access Token from Dhan

### Getting Dhan API Credentials

1. **Login to Dhan Web Platform**
   - Visit: https://web.dhan.co
   - Log in with your credentials

2. **Generate API Credentials**
   - Go to: **Profile** → **DhanHQ Trading APIs**
   - Click **"Request Access"** (first time users)
   - Generate **Access Token**
   - Note your **Client ID** (usually found in API settings)

3. **Configure Environment**
   ```bash
   cp .env.dhan .env.development
   # Update with your actual credentials
   ```

---

## Authentication

### Generate Token

Before making any trading requests, you must authenticate with your Dhan credentials.

**Endpoint**: `POST /dhan/generateToken`

**Request**:
```bash
curl -X POST http://localhost:3089/dhan/generateToken \
  -H "Content-Type: application/json" \
  -d "{
    \"client_id\": \"YOUR_CLIENT_ID\",
    \"access_token\": \"YOUR_ACCESS_TOKEN\"
  }"
```

**Response**:
```json
{
  "success": true,
  "message": "Dhan token generated and stored successfully",
  "data": {
    "client_id": "YOUR_CLIENT_ID"
  }
}
```

**Error Response**:
```json
{
  "success": false,
  "message": "Invalid Dhan credentials",
  "error": "Invalid access token"
}
```

### Important Notes
- Credentials are stored in server memory (not persisted)
- Generate token once per session
- Invalid tokens will be rejected with 401 status

---

## API Endpoints

### 1. Get Fund Limits (Margins)

**Endpoint**: `GET /dhan/fundLimit`

**Purpose**: Retrieve account margin information and available funds

**Request**:
```bash
curl -X GET http://localhost:3089/dhan/fundLimit
```

**Response**:
```json
{
  "success": true,
  "data": {
    "equity_amount": 500000,
    "commodity_amount": 250000,
    "utilised_amount": 100000,
    "opening_balance": 750000,
    "available_balance": 650000
  }
}
```

---

### 2. Get Position Book

**Endpoint**: `GET /dhan/getPositionBook`

**Purpose**: Retrieve all open positions

**Request**:
```bash
curl -X GET http://localhost:3089/dhan/getPositionBook
```

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "product_type": "INTRA",
      "exchange_segment": "NSE",
      "security_id": "12345",
      "quantity": 10,
      "average_price": 100.50,
      "current_price": 105.25,
      "pnl": 475
    }
  ]
}
```

---

### 3. Get Orders and Trades

**Endpoint**: `GET /dhan/getOrdersAndTrades`

**Purpose**: Retrieve order and trade history

**Request**:
```bash
curl -X GET http://localhost:3089/dhan/getOrdersAndTrades
```

**Response**:
```json
{
  "success": true,
  "data": {
    "orderBook": [
      {
        "order_id": "ORD001",
        "order_status": "PENDING",
        "exchange_segment": "NSE",
        "transaction_type": "BUY",
        "quantity": 5,
        "price": 100.00,
        "created_at": "2026-07-03T10:30:00Z"
      }
    ],
    "tradeBook": [
      {
        "trade_id": "TRD001",
        "order_id": "ORD001",
        "quantity": 5,
        "price": 100.50,
        "executed_at": "2026-07-03T10:30:15Z"
      }
    ]
  }
}
```

---

## Usage Examples

### Example 1: Complete Trading Flow

```bash
#!/bin/bash

# Step 1: Authenticate
echo "Step 1: Authenticating with Dhan..."
curl -X POST http://localhost:3089/dhan/generateToken \
  -H "Content-Type: application/json" \
  -d "{
    \"client_id\": \"DC123456\",
    \"access_token\": \"your_access_token_here\"
  }"

# Step 2: Check available margins
echo "\nStep 2: Checking available margins..."
curl -X GET http://localhost:3089/dhan/fundLimit

# Step 3: Place a market buy order
echo "\nStep 3: Placing market order..."
curl -X POST http://localhost:3089/dhan/placeOrder \
  -H "Content-Type: application/json" \
  -d "{
    \"security_id\": \"12345\",
    \"exchange_segment\": \"NSE\",
    \"transaction_type\": \"BUY\",
    \"quantity\": 1,
    \"order_type\": \"MARKET\",
    \"product_type\": \"INTRA\",
    \"validity\": \"DAY\"
  }"

# Step 4: Check positions
echo "\nStep 4: Checking positions..."
curl -X GET http://localhost:3089/dhan/getPositionBook
```

### Example 2: JavaScript/Node.js

```javascript
const axios = require('axios');

const API_BASE = 'http://localhost:3089';

// Authenticate
async function authenticateDhan(clientId, accessToken) {
  try {
    const response = await axios.post(`${API_BASE}/dhan/generateToken`, {
      client_id: clientId,
      access_token: accessToken
    });
    console.log('Authentication successful:', response.data);
    return response.data;
  } catch (error) {
    console.error('Authentication failed:', error.response.data);
    throw error;
  }
}

// Get margins
async function getMargins() {
  try {
    const response = await axios.get(`${API_BASE}/dhan/fundLimit`);
    console.log('Available margins:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error fetching margins:', error.response.data);
    throw error;
  }
}

// Place order
async function placeOrder(orderDetails) {
  try {
    const response = await axios.post(`${API_BASE}/dhan/placeOrder`, orderDetails);
    console.log('Order placed:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error placing order:', error.response.data);
    throw error;
  }
}

// Usage
(async () => {
  try {
    // Step 1: Authenticate
    await authenticateDhan('DC123456', 'your_access_token');
    
    // Step 2: Get margins
    const margins = await getMargins();
    console.log('Available funds:', margins.data.equity_amount);
    
    // Step 3: Place order
    const order = await placeOrder({
      security_id: '12345',
      exchange_segment: 'NSE',
      transaction_type: 'BUY',
      quantity: 1,
      order_type: 'MARKET',
      product_type: 'INTRA',
      validity: 'DAY'
    });
    
    console.log('Order ID:', order.data.order_id);
  } catch (error) {
    console.error('Error:', error);
  }
})();
```

---

## Trading Operations

### Place Order

**Endpoint**: `POST /dhan/placeOrder`

**Request Body**:
```json
{
  "security_id": "12345",
  "exchange_segment": "NSE",
  "transaction_type": "BUY",
  "quantity": 1,
  "order_type": "MARKET",
  "product_type": "INTRA",
  "price": 100.50,
  "trigger_price": 95.00,
  "validity": "DAY"
}
```

**Parameter Explanation**:

| Parameter | Required | Type | Description | Example |
|-----------|----------|------|-------------|----------|
| security_id | Yes | string | Dhan security ID | "12345" |
| exchange_segment | Yes | string | Exchange (NSE/BSE/NFO/BFO/MCX) | "NSE" |
| transaction_type | Yes | string | BUY or SELL | "BUY" |
| quantity | Yes | number | Order quantity | 1 |
| order_type | Yes | string | MARKET/LIMIT/STOP_LOSS/STOP_LOSS_MARKET | "MARKET" |
| product_type | Yes | string | CNC/INTRA/MARGIN/CO/BO | "INTRA" |
| price | No | number | Price for limit orders | 100.50 |
| trigger_price | No | number | Trigger price for stop loss | 95.00 |
| validity | Yes | string | DAY or IOC | "DAY" |

**Example Orders**:

```javascript
// Market buy order
{
  "security_id": "12345",
  "exchange_segment": "NSE",
  "transaction_type": "BUY",
  "quantity": 1,
  "order_type": "MARKET",
  "product_type": "INTRA",
  "validity": "DAY"
}

// Limit sell order
{
  "security_id": "12345",
  "exchange_segment": "NSE",
  "transaction_type": "SELL",
  "quantity": 1,
  "order_type": "LIMIT",
  "product_type": "INTRA",
  "price": 105.00,
  "validity": "DAY"
}

// Stop loss order
{
  "security_id": "12345",
  "exchange_segment": "NSE",
  "transaction_type": "SELL",
  "quantity": 1,
  "order_type": "STOP_LOSS",
  "product_type": "INTRA",
  "trigger_price": 95.00,
  "price": 94.50,
  "validity": "DAY"
}
```

---

### Cancel Order

**Endpoint**: `POST /dhan/cancelOrder`

**Request Body**:
```json
{
  "order_id": "ORD001"
}
```

**Example**:
```bash
curl -X POST http://localhost:3089/dhan/cancelOrder \
  -H "Content-Type: application/json" \
  -d "{
    \"order_id\": \"ORD001\"
  }"
```

---

### Modify Order

**Endpoint**: `PUT /dhan/modifyOrder`

**Request Body**:
```json
{
  "order_id": "ORD001",
  "order_type": "LIMIT",
  "quantity": 2,
  "price": 102.00,
  "validity": "DAY"
}
```

**Example**:
```bash
curl -X PUT http://localhost:3089/dhan/modifyOrder \
  -H "Content-Type: application/json" \
  -d "{
    \"order_id\": \"ORD001\",
    \"quantity\": 2,
    \"price\": 102.00
  }"
```

---

## Troubleshooting

### Issue: "Dhan credentials not found"

**Solution**: Generate token first
```bash
curl -X POST http://localhost:3089/dhan/generateToken \
  -H "Content-Type: application/json" \
  -d "{
    \"client_id\": \"YOUR_CLIENT_ID\",
    \"access_token\": \"YOUR_ACCESS_TOKEN\"
  }"
```

---

### Issue: "Invalid Dhan credentials"

**Solution**: Verify credentials
1. Check Client ID in Dhan API settings
2. Verify Access Token is correct
3. Ensure token has not expired
4. Check if API access is enabled on your account

---

### Issue: "Failed to fetch margins"

**Solution**: Check account status
1. Verify account is active
2. Check if sufficient balance exists
3. Verify API endpoints are accessible
4. Check network connectivity

---

### Issue: "Order placement failed"

**Solution**: Validate order parameters
1. Verify security_id is correct
2. Check exchange_segment (NSE/BSE/NFO/etc.)
3. Ensure sufficient margin available
4. Verify order quantity and price
5. Check market hours (trading hours only)

---

## Advanced Usage

### Copy Trading Setup

Use Dhan integration with amptrade for copy trading:

1. **Master Account**: Connect primary Dhan account
2. **Child Accounts**: Add multiple Dhan accounts for copying
3. **Order Flow**: Orders from master → automatically placed in child accounts
4. **Multipliers**: Apply position size multipliers per account

---

### Risk Management

1. **Check Margins**: Always verify available funds before trading
2. **Order Validation**: Validate parameters before placement
3. **Position Monitoring**: Monitor positions in real-time
4. **Loss Limits**: Set stop losses to limit risk

---

## Support

- **Dhan API Docs**: https://dhanhq.co/docs/v2/
- **AmpTrade Issues**: Create issue on GitHub
- **Dhan Support**: Contact Dhan directly via their platform

---

## Version History

- **v1.0** (July 2026): Initial Dhan integration
  - Authentication support
  - Order management (place, cancel, modify)
  - Position and margin tracking
  - Full REST API support
