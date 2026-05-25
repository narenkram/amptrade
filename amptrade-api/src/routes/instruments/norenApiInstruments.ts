import express, { Router, Request, Response } from "express";
import * as fastcsv from "fast-csv";
import fs from "fs";
import unzipper from "unzipper";
import { promisify } from "util";
import path from "path";
import https from "https";
import schedule from "node-schedule";
import {
  SymbolIndexes,
  SymbolData,
  FuturesResponse,
  InstrumentQueryParams,
  InstrumentType,
  InstrumentHandlerParams,
  OptionResponse,
  OptionStrikesResponse,
  OptionExpiryResponse,
  NorenSymbolCache
} from "../../types/types";
import { INSTRUMENT_TYPE_MAP, CACHE_DURATION, API_ARCHITECTURES } from "../../constants/constants";

/**
 * NorenAPI Instruments Router Module
 * Handles instrument data for NorenAPI brokers (EQ, FUTIDX, FUTSTK, OPTIDX, OPTSTK)
 * Implements caching to optimize performance and reduce system load
 */

//=============================================================================
// CONFIGURATION
//=============================================================================

// Exchange configuration
const EXCHANGES = ["NSE", "NFO", "BSE", "BFO", "MCX"] as const;
type Exchange = (typeof EXCHANGES)[number];

const INSTRUMENT_URLS: Record<Exchange, string> = {
  NSE: "https://api.shoonya.com/NSE_symbols.txt.zip",
  NFO: "https://api.shoonya.com/NFO_symbols.txt.zip",
  BSE: "https://api.shoonya.com/BSE_symbols.txt.zip",
  BFO: "https://api.shoonya.com/BFO_symbols.txt.zip",
  MCX: "https://api.shoonya.com/MCX_symbols.txt.zip",
};

// Response format types
type ResponseFormat = "simple" | "detailed";

//=============================================================================
// CACHE MANAGEMENT
//=============================================================================

// Initialize empty cache structure
const createEmptyIndexes = (): SymbolIndexes => ({
  bySymbol: new Map(),
  byInstrument: new Map(),
  byToken: new Map(),
});

const createEmptyCache = (): NorenSymbolCache => ({
  NSE: new Map(),
  NFO: new Map(),
  BSE: new Map(),
  BFO: new Map(),
  MCX: new Map(),
  indexes: Object.fromEntries(
    EXCHANGES.map((exchange) => [exchange, createEmptyIndexes()])
  ) as Record<Exchange, SymbolIndexes>,
  lastUpdated: 0,
});

// Initialize cache
let symbolCache = createEmptyCache();

//=============================================================================
// UTILITY FUNCTIONS
//=============================================================================

/**
 * Calculates similarity score between two strings for fuzzy matching
 */
function calculateMatchScore(input: string, target: string): number {
  input = input.toLowerCase().replace(/\s+/g, "");
  target = target.toLowerCase().replace(/\s+/g, "");

  if (input === target) return 1;
  if (target.includes(input) || input.includes(target)) return 0.5;

  const matches = input
    .split("")
    .filter((char) => target.includes(char)).length;
  return (matches / Math.max(input.length, target.length)) * 0.3;
}

/**
 * Groups array items by a specified key
 */
function groupBy<T>(array: T[], key: keyof T): Map<string, T[]> {
  return array.reduce((map, item) => {
    const k = String(item[key]);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(item);
    return map;
  }, new Map<string, T[]>());
}

/**
 * Creates indexed access structures for quick symbol lookup
 */
function createIndexes(data: any[]): SymbolIndexes {
  return {
    bySymbol: groupBy(data, "Symbol"),
    byInstrument: groupBy(data, "Instrument"),
    byToken: new Map(data.map((row) => [row.Token, row])),
  };
}

//=============================================================================
// FILE OPERATIONS
//=============================================================================

/**
 * Downloads an instrument file from the specified URL
 */
async function downloadInstrumentFile(
  url: string,
  filePath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filePath);
    https
      .get(url, (response) => {
        response.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve();
        });
      })
      .on("error", (err) => {
        fs.unlink(filePath, () => { }); // Ignore unlink errors
        reject(err);
      });
  });
}

/**
 * Ensures all necessary instrument files are downloaded
 */
async function ensureFilesDownloaded(): Promise<void> {
  const instrumentsDir = path.resolve("./instruments");
  if (!fs.existsSync(instrumentsDir)) {
    fs.mkdirSync(instrumentsDir, { recursive: true });
  }

  await Promise.allSettled(
    Object.entries(INSTRUMENT_URLS).map(async ([exchange, url]) => {
      const fileName = url.split("/").pop()!;
      const filePath = path.resolve(`./instruments/${fileName}`);

      try {
        await downloadInstrumentFile(url, filePath);
        console.log(`Downloaded ${exchange} symbols`);
      } catch (error) {
        console.error(`Failed to download ${exchange} symbols:`, error);
      }
    })
  );
}

/**
 * Loads and parses a zip file containing instrument data
 */
async function loadZipFile(filePath: string): Promise<any[]> {
  try {
    const absolutePath = path.resolve(filePath);
    const fileContent = await promisify(fs.readFile)(absolutePath);
    const directory = await unzipper.Open.buffer(fileContent);
    const file = directory.files[0];
    const content = await file.buffer();

    return new Promise((resolve, reject) => {
      const results: any[] = [];
      fastcsv
        .parseString(content.toString(), {
          headers: true,
          delimiter: ",",
          trim: true,
        })
        .on("data", (row) => results.push(row))
        .on("error", reject)
        .on("end", () => resolve(results));
    });
  } catch (error) {
    console.error(`Error loading file ${filePath}:`, error);
    return [];
  }
}

/**
 * Loads and caches symbol data from all exchange files
 */
async function loadSymbolData(): Promise<NorenSymbolCache> {
  const currentTime = Date.now();

  // Return cached data if still valid
  if (
    symbolCache.lastUpdated &&
    currentTime - symbolCache.lastUpdated < CACHE_DURATION
  ) {
    return symbolCache;
  }

  try {
    // Ensure files exist before loading
    await ensureFilesDownloaded();
    console.log("Clearing existing symbol cache before reloading new data...");

    // Reset cache to empty state
    symbolCache = createEmptyCache();
    console.log("Symbol cache has been cleared.");

    // Load data for each exchange
    for (const exchange of EXCHANGES) {
      const fileName = INSTRUMENT_URLS[exchange].split("/").pop()!;
      const data = await loadZipFile(`./instruments/${fileName}`);

      if (data.length > 0) {
        symbolCache[exchange] = groupBy(data, "Instrument");
        symbolCache.indexes[exchange] = createIndexes(data);
      }
    }

    symbolCache.lastUpdated = currentTime;
    console.log(`Symbol cache updated: ${symbolCache.lastUpdated}`);
    return symbolCache;
  } catch (error) {
    console.error("Error loading symbol data:", error);
    throw error;
  }
}

//=============================================================================
// FUTURES INSTRUMENT HANDLERS
//=============================================================================

/**
 * Processes futures data for a specific symbol or expiry
 */
function handleSpecificFutures(
  data: any[],
  symbol: string,
  expiry?: string
): FuturesResponse {
  if (expiry) {
    const matchingFuture = data.find(
      (row) =>
        row.Symbol === symbol &&
        row.Expiry === expiry &&
        row.OptionType === "XX"
    );

    if (matchingFuture) {
      return {
        token: matchingFuture.Token,
        tradingSymbol: matchingFuture.TradingSymbol,
        lotSize: Number(matchingFuture.LotSize),
        tickSize: matchingFuture.TickSize ? Number(matchingFuture.TickSize) : 0.05,
      };
    }
    return { token: null };
  }

  const expiryDates = new Set<string>();
  let lotSize = 1;
  let tickSize = 0.05;

  data.forEach((row) => {
    if (row.Symbol === symbol && row.OptionType === "XX") {
      expiryDates.add(row.Expiry);
      lotSize = Number(row.LotSize);
      tickSize = row.TickSize ? Number(row.TickSize) : 0.05;
    }
  });

  return {
    expiryDates: Array.from(expiryDates).sort(),
    lotSize,
    tickSize,
  };
}

/**
 * Gets all futures symbols
 */
function getAllFuturesSymbols(data: any[]): string[] {
  const symbols = new Set<string>();
  data.forEach((row) => {
    if (row.OptionType === "XX") {
      symbols.add(row.Symbol);
    }
  });
  return Array.from(symbols).sort();
}

/**
 * Gets futures symbols that have options available
 */
function getFuturesSymbolsWithOptions(
  futuresData: any[],
  optionSymbols: Set<string>
): string[] {
  const symbols = new Set<string>();
  futuresData.forEach((row) => {
    if (row.OptionType === "XX" && optionSymbols.has(row.Symbol)) {
      symbols.add(row.Symbol);
    }
  });
  return Array.from(symbols).sort();
}

//=============================================================================
// EQUITY INSTRUMENT HANDLERS
//=============================================================================

/**
 * Handles equity symbol details
 */
async function handleSpecificEquitySymbol(
  symbol: string,
  symbolCache: NorenSymbolCache,
  exchange: string
) {
  const validExchange = exchange as Exchange;
  const equitySymbols = symbolCache[validExchange].get("EQ") || [];
  const matchingSymbol = equitySymbols.find((row) => row.Symbol === symbol);

  if (matchingSymbol) {
    return {
      token: matchingSymbol.Token,
      lotSize: Number(matchingSymbol.LotSize),
      tickSize: matchingSymbol.TickSize ? Number(matchingSymbol.TickSize) : 0.05,
      tradingSymbol: matchingSymbol.TradingSymbol,
    };
  }
  return { token: null };
}

/**
 * Handles listing of all equity symbols
 */
async function handleAllEquitySymbols(
  symbolCache: NorenSymbolCache,
  exchange: string,
  format: ResponseFormat = "simple"
) {
  const validExchange = exchange as Exchange;
  const equitySymbols = symbolCache[validExchange].get("EQ") || [];

  // Get all equity symbols, excluding TEST symbols
  const filteredSymbols = equitySymbols
    .filter((row) => !row.Symbol.includes("TEST"))
    .sort((a, b) => a.Symbol.localeCompare(b.Symbol));

  // Return simple format (array of symbols) for TradeForm
  if (format === "simple") {
    return filteredSymbols.map((row) => row.Symbol);
  }

  // Return detailed format for Scanner
  return filteredSymbols.map((row) => ({
    Symbol: row.Symbol,
    token: row.Token,
    tradingSymbol: row.TradingSymbol,
    LotSize: row.LotSize,
  }));
}

//=============================================================================
// OPTIONS INSTRUMENT HANDLERS
//=============================================================================

/**
 * Resolves the underlying token for an option's symbol
 */
async function resolveUnderlyingToken(
  symbol: string,
  symbolCache: NorenSymbolCache,
  segment: string,
  exchange: string
): Promise<string | null> {
  // Handle MCX commodity options
  if (exchange === "MCX" && segment === "Commodity Options") {
    const futures = symbolCache.MCX.get("FUTCOM") || [];

    // Find matching futures by symbol
    const matchingFutures = futures.filter((f) => f.Symbol === symbol);

    if (matchingFutures.length > 0) {
      // Get current date for comparison
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Filter unexpired futures
      const validFutures = matchingFutures.filter(future => {
        if (!future.Expiry) return false;
        const expiryDate = new Date(future.Expiry.split('-').reverse().join('-')); // Convert DD-MMM-YYYY to Date
        return expiryDate >= today;
      });

      if (validFutures.length > 0) {
        // Sort by expiry date (ascending) to get the nearest expiry
        validFutures.sort((a, b) => {
          if (!a.Expiry || !b.Expiry) return 0;
          const dateA = new Date(a.Expiry.split('-').reverse().join('-'));
          const dateB = new Date(b.Expiry.split('-').reverse().join('-'));
          return dateA.getTime() - dateB.getTime();
        });

        // Return the token of the nearest expiry contract
        return validFutures[0].Token;
      }
    }

    // Fallback to fuzzy matching if no exact match with valid expiry is found
    let bestMatchScore = 0;
    let bestMatchToken: string | null = null;

    futures.forEach((row) => {
      const score = calculateMatchScore(symbol, row.Symbol);
      if (score > bestMatchScore) {
        bestMatchScore = score;
        bestMatchToken = row.Token;
      }
    });

    if (bestMatchToken) {
      console.warn(`Using fuzzy matched FUTCOM token for ${symbol}`);
      return bestMatchToken;
    }
  }

  // Special cases for BSE indices
  if (exchange === "BSE") {
    if (symbol === "BSXOPT") return "1"; // BSE SENSEX
    if (symbol === "BKXOPT") return "12"; // BSE BANKEX
  }

  // Find best match in appropriate exchange
  let underlyingToken: string | null = null;
  let bestMatchScore = 0;
  const sourceExchange = exchange === "BSE" ? "BSE" : "NSE";
  const symbolType = segment === "Index Options" ? "INDEX" : "EQ";
  const symbols = symbolCache[sourceExchange as Exchange].get(symbolType) || [];

  for (const row of symbols) {
    if (row.TradingSymbol === String(symbol)) {
      return row.Token;
    }

    const symbolScore = calculateMatchScore(String(symbol), row.Symbol);
    const tradingSymbolScore = calculateMatchScore(
      String(symbol),
      row.TradingSymbol
    );
    const currentScore = Math.max(symbolScore, tradingSymbolScore);

    if (currentScore > bestMatchScore) {
      bestMatchScore = currentScore;
      underlyingToken = row.Token;
    }
  }

  return underlyingToken;
}

/**
 * Handles specific option data retrieval
 */
function handleSpecificOption(
  optionsData: any[],
  { symbol, expiry, strikePrice, optionType, underlyingToken }: any
): OptionResponse {
  const matchingOption = optionsData.find(
    (row) =>
      row.Symbol === symbol &&
      row.Expiry === expiry &&
      Number(row.StrikePrice) === Number(strikePrice) &&
      row.OptionType === optionType
  );

  return {
    token: matchingOption?.Token || null,
    tradingSymbol: matchingOption?.TradingSymbol,
    underlyingToken,
  };
}

/**
 * Handles option strikes data retrieval
 */
function handleOptionStrikes(
  optionsData: any[],
  { symbol, expiry, underlyingToken }: any
): OptionStrikesResponse {
  const strikes = { CE: [] as number[], PE: [] as number[] };
  let lotSize = 1;
  let tickSize = 0.05;

  optionsData.forEach((row) => {
    if (row.Symbol === symbol && row.Expiry === expiry) {
      if (row.OptionType === "CE") {
        strikes.CE.push(Number(row.StrikePrice));
      } else if (row.OptionType === "PE") {
        strikes.PE.push(Number(row.StrikePrice));
      }
      lotSize = Number(row.LotSize);
      tickSize = row.TickSize ? Number(row.TickSize) : 0.05;
    }
  });

  return {
    CE: strikes.CE.sort((a, b) => a - b),
    PE: strikes.PE.sort((a, b) => a - b),
    lotSize,
    tickSize,
    underlyingToken,
  };
}

/**
 * Handles option expiry data retrieval
 */
function handleOptionExpiry(
  optionsData: any[],
  { symbol, underlyingToken }: any
): OptionExpiryResponse {
  const expiryDates = new Set<string>();

  optionsData.forEach((row) => {
    if (row.Symbol === symbol) {
      expiryDates.add(row.Expiry);
    }
  });

  return {
    expiryDates: Array.from(expiryDates).sort(),
    underlyingToken,
  };
}

/**
 * Unified handler for options instruments
 */
async function handleOptionsInstrument(
  params: InstrumentHandlerParams & { symbolCache: NorenSymbolCache },
  instrumentType: "OPTIDX" | "OPTSTK" | "OPTFUT",
  segmentType: string,
  dataSource: "NFO" | "BFO" | "MCX"
) {
  const { symbol, symbolCache, exchange } = params;

  if (!symbol) {
    // Return hardcoded symbols for NSE Index Options
    if (exchange === "NSE" && instrumentType === "OPTIDX") {
      return ["NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY"];
    }

    // Return hardcoded symbols for BSE Index Options
    if (params.exchange === "BSE" && instrumentType === "OPTIDX") {
      return ["SENSEX", "BANKEX"];
    }

    const optionsData = symbolCache[dataSource].get(instrumentType) || [];
    const symbols = new Set<string>();
    optionsData.forEach((row) => {
      if (row.OptionType === "CE" || row.OptionType === "PE") {
        symbols.add(row.Symbol);
      }
    });
    return Array.from(symbols).sort();
  }

  // Handle special BSE symbols
  const processedSymbol =
    symbol === "SENSEX" ? "BSXOPT" : symbol === "BANKEX" ? "BKXOPT" : symbol;

  // Get underlying token
  const underlyingToken = await resolveUnderlyingToken(
    processedSymbol,
    symbolCache,
    segmentType,
    params.exchange
  );

  // Return appropriate data based on provided parameters
  if (params.expiry && params.strikePrice && params.optionType) {
    const optionsData = symbolCache[dataSource].get(instrumentType) || [];
    return handleSpecificOption(optionsData, {
      symbol: processedSymbol,
      expiry: params.expiry,
      strikePrice: params.strikePrice,
      optionType: params.optionType,
      underlyingToken,
    });
  }

  if (params.expiry) {
    const optionsData = symbolCache[dataSource].get(instrumentType) || [];
    return handleOptionStrikes(optionsData, {
      symbol: processedSymbol,
      expiry: params.expiry,
      underlyingToken,
    });
  }

  const optionsData = symbolCache[dataSource].get(instrumentType) || [];
  return handleOptionExpiry(optionsData, {
    symbol: processedSymbol,
    underlyingToken,
  });
}

//=============================================================================
// INSTRUMENT HANDLERS REGISTRY
//=============================================================================

// Handlers for each instrument type
const instrumentHandlers: Record<InstrumentType, Function> = {
  async EQ({
    symbol,
    symbolCache,
    exchange,
    format,
  }: InstrumentHandlerParams & { format?: ResponseFormat }) {
    // Type assertion since we know this is NorenSymbolCache in this context
    const norenCache = symbolCache as NorenSymbolCache;
    return symbol
      ? await handleSpecificEquitySymbol(symbol, norenCache, exchange)
      : await handleAllEquitySymbols(norenCache, exchange, format);
  },

  async FUTIDX({
    symbol,
    symbolCache,
    expiry,
    exchange,
  }: InstrumentHandlerParams) {
    const norenCache = symbolCache as NorenSymbolCache;
    const futuresData =
      norenCache[exchange === "BSE" ? "BFO" : "NFO"].get("FUTIDX") || [];
    return symbol
      ? handleSpecificFutures(futuresData, symbol, expiry)
      : getAllFuturesSymbols(futuresData);
  },

  async FUTSTK({
    symbol,
    symbolCache,
    expiry,
    exchange,
  }: InstrumentHandlerParams) {
    const norenCache = symbolCache as NorenSymbolCache;
    const futuresData =
      norenCache[exchange === "BSE" ? "BFO" : "NFO"].get("FUTSTK") || [];

    if (symbol) {
      return handleSpecificFutures(futuresData, symbol, expiry);
    }

    const optionSymbols = new Set(
      (norenCache[exchange === "BSE" ? "BFO" : "NFO"].get("OPTSTK") || []).map(
        (row) => row.Symbol
      )
    );
    return getFuturesSymbolsWithOptions(futuresData, optionSymbols);
  },

  async OPTIDX(params: InstrumentHandlerParams) {
    const norenCache = params.symbolCache as NorenSymbolCache;
    return handleOptionsInstrument(
      { ...params, symbolCache: norenCache },
      "OPTIDX",
      "Index Options",
      params.exchange === "BSE" ? "BFO" : "NFO"
    );
  },

  async OPTSTK(params: InstrumentHandlerParams) {
    const norenCache = params.symbolCache as NorenSymbolCache;
    return handleOptionsInstrument(
      { ...params, symbolCache: norenCache },
      "OPTSTK",
      "Stocks Options",
      params.exchange === "BSE" ? "BFO" : "NFO"
    );
  },

  async FUTCOM({ symbol, symbolCache, expiry }: InstrumentHandlerParams) {
    const norenCache = symbolCache as NorenSymbolCache;
    const futuresData = norenCache.MCX.get("FUTCOM") || [];
    return symbol
      ? handleSpecificFutures(futuresData, symbol, expiry)
      : getAllFuturesSymbols(futuresData);
  },

  async OPTFUT(params: InstrumentHandlerParams) {
    const norenCache = params.symbolCache as NorenSymbolCache;
    return handleOptionsInstrument(
      { ...params, symbolCache: norenCache },
      "OPTFUT",
      "Commodity Options",
      "MCX"
    );
  },
};

//=============================================================================
// API ROUTE HANDLERS
//=============================================================================

/**
 * Main instruments handler for all instrument types
 */
async function instrumentsHandler(req: Request, res: Response): Promise<void> {
  try {
    const {
      exchange = "NSE",
      segment,
      symbol,
      expiry,
      strikePrice,
      optionType,
      format = "simple",
    } = req.query as InstrumentQueryParams & { format?: ResponseFormat };

    const instrumentType = INSTRUMENT_TYPE_MAP[
      segment as keyof typeof INSTRUMENT_TYPE_MAP
    ] as InstrumentType;

    if (
      (exchange === "NSE" || exchange === "BSE" || exchange === "MCX") &&
      instrumentType
    ) {
      await loadSymbolData();

      const handler = instrumentHandlers[instrumentType];
      const result = await handler({
        symbol,
        symbolCache,
        expiry,
        strikePrice,
        optionType,
        segment,
        exchange,
        format,
      });

      res.json(result);
      return;
    }

    res.json([]);
  } catch (error) {
    console.error("Error in NorenAPI instruments handler:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * Status endpoint handler
 */
function statusHandler(req: Request, res: Response): void {
  res.json({
    lastUpdated: symbolCache.lastUpdated,
    cacheAge: Date.now() - symbolCache.lastUpdated,
    apiType: "NorenAPI",
  });
}

/**
 * Cache reload endpoint handler
 */
async function reloadCacheHandler(req: Request, res: Response): Promise<void> {
  try {
    symbolCache.lastUpdated = 0;
    await loadSymbolData();
    res.json({ success: true, message: "Cache reloaded successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to reload cache" });
  }
}

//=============================================================================
// ROUTER CONFIGURATION
//=============================================================================

/**
 * Creates and configures the NorenAPI instruments router
 */
const createRouter = (): Router => {
  const router = express.Router();

  // Register route handlers
  router.get("/status", statusHandler);
  router.get("/", instrumentsHandler);
  router.get("/reload-cache", reloadCacheHandler);

  // Schedule daily download at 1:30 AM IST (19:00 UTC)
  schedule.scheduleJob("0 19 * * *", () => {
    console.log("Running daily instrument file update for NorenAPI");
    ensureFilesDownloaded().then(() => {
      symbolCache.lastUpdated = 0; // Force cache refresh on next request
    });
  });

  return router;
};

export default createRouter;
