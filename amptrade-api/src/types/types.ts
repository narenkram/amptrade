import { Request } from "express";

export interface StoredCredentials {
  [userId: string]: {
    shoonya?: {
      usersession: string;
      userid: string;
    };
    flattrade?: {
      usersession: string;
      userid: string;
    };
    zebu?: {
      usersession: string;
      userid: string;
    };
    tradesmart?: {
      usersession: string;
      userid: string;
    };
    infinn?: {
      usersession: string;
      userid: string;
    };
    // Index signature to support dynamic broker IDs from configuration
    [brokerId: string]: { usersession?: string; userid?: string; api_key?: string; access_token?: string; user_id?: string; client_id?: string } | undefined;
  };
}


export interface OrderRequest {
  uid: string;
  actid: string;
  exch: string;
  tsym: string;
  qty: number;
  prc: number;
  prd: string;
  trantype: string;
  prctyp: string;
  ret: string;
}

export interface CancelOrderRequest {
  norenordno: string;
  uid: string;
}

export interface ModifyOrderRequest {
  norenordno: string;  // Order number to modify
  uid: string;         // User ID
  exch: string;        // Exchange
  tsym: string;        // Trading symbol
  qty: number;         // Quantity
  prc: number;         // New price (0 for market)
  prctyp: string;      // Price type: MKT or LMT
}

export interface AuthenticatedRequest extends Request {
  user?: {
    uid: string;
    email?: string;
  };
}

export interface InstrumentData {
  Symbol: string;
  Token: string;
  TradingSymbol: string;
  LotSize: string;
  TickSize?: string; // Minimum price increment (ti)
  OptionType?: string;
  Expiry?: string;
  StrikePrice?: string;
  Instrument: string;
}

export interface SymbolIndexes {
  bySymbol: Map<string, InstrumentData[]>;
  byInstrument: Map<string, InstrumentData[]>;
  byToken: Map<string, InstrumentData>;
}

export interface SymbolData {
  NSE: Map<string, InstrumentData[]>;
  NFO: Map<string, InstrumentData[]>;
  BSE: Map<string, InstrumentData[]>;
  BFO: Map<string, InstrumentData[]>;
  MCX: Map<string, InstrumentData[]>;
  indexes: {
    NSE: SymbolIndexes;
    NFO: SymbolIndexes;
    BSE: SymbolIndexes;
    BFO: SymbolIndexes;
    MCX: SymbolIndexes;
  };
  lastUpdated: number;
}

// Base interface for all symbol caches
export interface BaseSymbolCache {
  lastUpdated: number;
}

// KiteConnect specific symbol cache structure
export interface KiteConnectSymbolCache extends BaseSymbolCache {
  instruments: any[];
  indexes: {
    byName: Map<string, any[]>;
    byToken: Map<string, any>;
    byExchange: Map<string, any[]>;
    byInstrumentType: Map<string, any[]>;
    bySegment: Map<string, any[]>;
  };
}

// NorenAPI specific symbol cache (existing SymbolData interface)
export type NorenSymbolCache = SymbolData;

// Union type for both cache types
export type SymbolCache = NorenSymbolCache | KiteConnectSymbolCache;

export interface FuturesResponse {
  token?: string | null;
  tradingSymbol?: string;
  lotSize?: number;
  tickSize?: number;
  expiryDates?: string[];
}

export interface InstrumentHandlerParams {
  symbol?: string;
  symbolCache: SymbolData | KiteConnectSymbolCache;
  expiry?: string;
  strikePrice?: string;
  optionType?: string;
  segment?: string;
  exchange: "NSE" | "NFO" | "BSE" | "BFO" | "MCX";
}
/**
Instrument Types Classification for NorenAPI Files (the ones downloaded by norenApiInstruments.ts)
 * EQ - Equities
 * FUTIDX - Futures Index
 * FUTSTK - Futures Stock
 * OPTIDX - Options Index
 * OPTSTK - Options Stock
 * FUTCOM - Commodity Futures
 * OPTFUT - Commodity Options
 **/
export type InstrumentType =
  | "EQ"
  | "FUTIDX"
  | "FUTSTK"
  | "OPTIDX"
  | "OPTSTK"
  | "FUTCOM"
  | "OPTFUT";

export interface InstrumentQueryParams {
  exchange?: "NSE" | "NFO" | "BSE" | "BFO" | "MCX";
  segment?: string;
  symbol?: string;
  expiry?: string;
  strikePrice?: string;
  optionType?: string;
}

export interface OptionResponse {
  token: string | null;
  tradingSymbol?: string;
  underlyingToken: string | null;
}

export interface OptionStrikesResponse {
  CE: number[];
  PE: number[];
  lotSize: number;
  tickSize?: number;
  underlyingToken: string | null;
}

export interface OptionExpiryResponse {
  expiryDates: string[];
  underlyingToken: string | null;
}
