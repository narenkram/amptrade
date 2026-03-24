export const INSTRUMENT_TYPE_MAP = {
  "Index Options": "OPTIDX",
  "Stocks Options": "OPTSTK",
  "Index Futures": "FUTIDX",
  "Stocks Futures": "FUTSTK",
  "Stocks Equity": "EQ",
  "Commodity Options": "OPTFUT",
  "Commodity Futures": "FUTCOM",
} as const;

export const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

export const API_ARCHITECTURES = {
  NOREN_API: "noren-api",
  KITE_CONNECT: "kite-connect",
  UPSTOX_API: "upstox-api"
} as const;
