/**
 * Dhan-specific TypeScript types and interfaces
 */

export interface DhanCredentials {
  client_id: string;
  access_token: string;
}

export interface DhanOrderRequest {
  security_id: string;
  exchange_segment: 'NSE' | 'BSE' | 'NFO' | 'BFO' | 'MCX';
  transaction_type: 'BUY' | 'SELL';
  quantity: number;
  order_type: 'MARKET' | 'LIMIT' | 'STOP_LOSS' | 'STOP_LOSS_MARKET';
  product_type: 'CNC' | 'INTRA' | 'MARGIN' | 'CO' | 'BO';
  price?: number;
  trigger_price?: number;
  validity: 'DAY' | 'IOC';
}

export interface DhanCancelOrderRequest {
  order_id: string;
}

export interface DhanModifyOrderRequest {
  order_id: string;
  order_type?: 'MARKET' | 'LIMIT' | 'STOP_LOSS' | 'STOP_LOSS_MARKET';
  quantity?: number;
  price?: number;
  trigger_price?: number;
  validity?: 'DAY' | 'IOC';
}

export interface DhanOrderResponse {
  status: string;
  message: string;
  data?: {
    order_id: string;
    [key: string]: any;
  };
}

export interface DhanPosition {
  product_type: string;
  exchange_segment: string;
  security_id: string;
  quantity: number;
  average_price: number;
  [key: string]: any;
}

export interface DhanOrder {
  order_id: string;
  order_status: string;
  exchange_segment: string;
  transaction_type: string;
  [key: string]: any;
}

export interface DhanTrade {
  trade_id: string;
  order_id: string;
  [key: string]: any;
}

export interface DhanLimits {
  status: string;
  data?: {
    equity_amount: number;
    commodity_amount: number;
    utilised_amount: number;
    opening_balance: number;
    [key: string]: any;
  };
}
