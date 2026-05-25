import express, { Router, Request, Response } from "express";
import * as fastcsv from "fast-csv";
import fs from "fs";
import { promisify } from "util";
import path from "path";
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
  KiteConnectSymbolCache
} from "../../types/types";
import { INSTRUMENT_TYPE_MAP, CACHE_DURATION, API_ARCHITECTURES } from "../../constants/constants";
import https from "https";
import schedule from "node-schedule";

/**
 * KiteConnect API Instruments Router Module
 *
 * This module handles all instrument-related operations for KiteConnect API (Zerodha) including:
 * - Equity instruments
 * - Index Futures
 * - Stock Futures
 * - Index Options
 * - Stock Options
 *
 * The module implements caching to optimize performance and reduce load on the system.
 * Data is loaded from a single file containing all symbols.
 */

//=============================================================================
// UTILITY FUNCTIONS
//=============================================================================

/**
 * Converts dates from Zerodha format (YYYY-MM-DD) to app format (DD-MMM-YYYY)
 * @param dateStr - Date string in Zerodha format
 * @returns Formatted date string or original string if conversion fails
 */
function formatExpiryDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      const day = date.getDate().toString().padStart(2, '0');
      const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
      const month = monthNames[date.getMonth()];
      const year = date.getFullYear();
      return `${day}-${month}-${year}`;
    }
    return dateStr; // Return original string if not a valid date
  } catch (error) {
    console.error('Error formatting date:', error, dateStr);
    return dateStr;
  }
}

// Add this helper function to convert DD-MMM-YYYY to YYYY-MM-DD
function parseExpiryDate(expiryStr: string): string {
  try {
    const [day, month, year] = expiryStr.split('-');
    const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const monthIndex = monthNames.indexOf(month.toUpperCase());
    if (monthIndex === -1) return expiryStr;

    // Convert to YYYY-MM-DD format
    const monthNum = (monthIndex + 1).toString().padStart(2, '0');
    return `${year}-${monthNum}-${day}`;
  } catch (error) {
    console.error('Error parsing expiry date:', error);
    return expiryStr;
  }
}

//=============================================================================
// CONFIGURATION
//=============================================================================

// URL for Zerodha instruments
const INSTRUMENT_URL = "https://api.kite.trade/instruments";

// Response type for different formats
type ResponseFormat = "simple" | "detailed";

//=============================================================================
// CACHE MANAGEMENT
//=============================================================================

// Initialize cache - now using the KiteConnectSymbolCache type
let symbolCache: KiteConnectSymbolCache = {
  instruments: [],
  indexes: {
    byName: new Map(),
    byToken: new Map(),
    byExchange: new Map(),
    byInstrumentType: new Map(),
    bySegment: new Map(),
  },
  lastUpdated: 0,
};

//=============================================================================
// FILE OPERATIONS
//=============================================================================

/**
 * Loads and parses the CSV file containing instrument data.
 * @param filePath - Path to the CSV file
 * @returns Promise resolving to parsed CSV data as array of objects
 * @throws Error if file reading or parsing fails
 */
async function loadCsvFile(filePath: string): Promise<any[]> {
  const absolutePath = path.resolve(filePath);
  return new Promise((resolve, reject) => {
    const results: any[] = [];
    fs.createReadStream(absolutePath)
      .pipe(
        fastcsv.parse({
          headers: true,
          delimiter: ",",
          trim: true,
        })
      )
      .on("data", (row) => results.push(row))
      .on("error", reject)
      .on("end", () => resolve(results));
  });
}

/**
 * Downloads the instruments file from KiteConnect API
 */
async function downloadInstrumentFile(): Promise<void> {
  const instrumentsDir = path.resolve("./instruments");
  if (!fs.existsSync(instrumentsDir)) {
    fs.mkdirSync(instrumentsDir, { recursive: true });
  }

  const filePath = path.resolve("./instruments/kite_instruments.csv");

  return new Promise((resolve, reject) => {
    console.log("Downloading KiteConnect instruments file...");
    const file = fs.createWriteStream(filePath);
    https
      .get(INSTRUMENT_URL, (response) => {
        response.pipe(file);
        file.on("finish", () => {
          file.close();
          console.log("KiteConnect instruments file downloaded successfully");
          resolve();
        });
      })
      .on("error", (err) => {
        fs.unlinkSync(filePath);
        console.error("Error downloading KiteConnect instruments file:", err);
        reject(err);
      });
  });
}

//=============================================================================
// INDEX CREATION AND CACHE UTILITIES
//=============================================================================

/**
 * Creates indexed access structures for quick symbol lookup.
 * @param data - Array of instrument data
 * @returns Indexes for efficient lookup
 */
function createIndexes(data: any[]): KiteConnectSymbolCache["indexes"] {
  const byName = new Map<string, any[]>();      // Changed from bySymbol
  const byToken = new Map<string, any>();       // Will use instrument_token
  const byExchange = new Map<string, any[]>();
  const byInstrumentType = new Map<string, any[]>();
  const bySegment = new Map<string, any[]>();

  data.forEach((row) => {
    // Index by name instead of symbol
    if (!byName.has(row.name)) {
      byName.set(row.name, []);
    }
    byName.get(row.name)!.push(row);

    // Index by instrument_token instead of exchange_token
    byToken.set(row.instrument_token.toString(), row);

    // Index by exchange
    if (!byExchange.has(row.exchange)) {
      byExchange.set(row.exchange, []);
    }
    byExchange.get(row.exchange)!.push(row);

    // Index by instrument type
    if (!byInstrumentType.has(row.instrument_type)) {
      byInstrumentType.set(row.instrument_type, []);
    }
    byInstrumentType.get(row.instrument_type)!.push(row);

    // Index by segment
    if (!bySegment.has(row.segment)) {
      bySegment.set(row.segment, []);
    }
    bySegment.get(row.segment)!.push(row);
  });

  return { byName, byToken, byExchange, byInstrumentType, bySegment };
}

/**
 * Loads and caches symbol data from KiteConnect API.
 * Implements caching with CACHE_DURATION timeout.
 * @returns Promise resolving to populated symbol cache
 * @throws Error if data loading fails
 */
async function loadSymbolData(): Promise<KiteConnectSymbolCache> {
  const currentTime = Date.now();

  // Return cached data if still valid
  if (
    symbolCache.lastUpdated &&
    currentTime - symbolCache.lastUpdated < CACHE_DURATION
  ) {
    return symbolCache;
  }

  try {
    // Download the latest instruments file
    await downloadInstrumentFile();

    // Load and parse the CSV file
    const instruments = await loadCsvFile("./instruments/kite_instruments.csv");

    // Create indexes for efficient lookups
    const indexes = createIndexes(instruments);

    // Update the cache
    symbolCache = {
      instruments,
      indexes,
      lastUpdated: currentTime,
    };

    console.log("KiteConnect symbol cache updated:", {
      instrumentCount: instruments.length,
      timestamp: new Date(currentTime).toISOString(),
    });

    return symbolCache;
  } catch (error) {
    console.error("Error loading KiteConnect symbol data:", error);
    throw error;
  }
}

//=============================================================================
// EQUITY INSTRUMENT HANDLERS
//=============================================================================

// Get equity symbols
function getEquitySymbols(format: ResponseFormat = "simple", exchange: string = "NSE"): any {
  const equityInstruments = symbolCache.indexes.bySegment.get(exchange) || [];

  // Filter equity instruments
  const equitySymbols = equityInstruments.filter(
    (row) => row.instrument_type === "EQ"
  );

  // Sort symbols alphabetically
  equitySymbols.sort((a, b) =>
    a.tradingsymbol.localeCompare(b.tradingsymbol)
  );

  if (format === "simple") {
    return equitySymbols.map((row) => row.tradingsymbol);
  }

  return equitySymbols.map((row) => ({
    Symbol: row.name,
    token: row.instrument_token,
    tradingSymbol: row.tradingsymbol,
    LotSize: Number(row.lot_size || 1),
  }));
}

// Get specific equity symbol details
function getSpecificEquitySymbol(symbol: string): any {
  // Search in NSE segment
  const equityInstruments = symbolCache.indexes.bySegment.get("NSE") || [];

  // Find equity instrument by tradingsymbol
  const equityInstrument = equityInstruments.find(
    (row) =>
      row.instrument_type === "EQ" &&
      row.tradingsymbol === symbol
  );

  if (equityInstrument) {
    return {
      token: equityInstrument.instrument_token.toString(),
      lotSize: Number(equityInstrument.lot_size || 1),
      tradingSymbol: equityInstrument.tradingsymbol,
    };
  }

  return { token: null };
}

//=============================================================================
// FUTURES INSTRUMENT HANDLERS
//=============================================================================

// Instrument type classification utility for KiteConnect
const INDEX_NAMES = [
  "NIFTY", "BANKNIFTY", "MIDCPNIFTY", "FINNIFTY", "SENSEX", "BANKEX"
];

function classifyInstrument(row: any): InstrumentType | null {
  if ((row.segment === "NFO-OPT" || row.segment === "BFO-OPT") &&
    INDEX_NAMES.includes(row.name) &&
    (row.instrument_type === "CE" || row.instrument_type === "PE")) {
    return "OPTIDX";
  }
  if ((row.segment === "NFO-FUT" || row.segment === "BFO-FUT") &&
    INDEX_NAMES.includes(row.name) &&
    row.instrument_type === "FUT") {
    return "FUTIDX";
  }
  if ((row.segment === "NFO-OPT" || row.segment === "BFO-OPT") &&
    !INDEX_NAMES.includes(row.name) &&
    (row.instrument_type === "CE" || row.instrument_type === "PE")) {
    return "OPTSTK";
  }
  if ((row.segment === "NFO-FUT" || row.segment === "BFO-FUT") &&
    !INDEX_NAMES.includes(row.name) &&
    row.instrument_type === "FUT") {
    return "FUTSTK";
  }
  if ((row.segment === "NSE" || row.segment === "BSE") &&
    row.instrument_type === "EQ") {
    return "EQ";
  }
  // Add MCX logic as needed
  return null;
}

// Get futures symbols - updated to handle NFO-FUT and BFO-FUT
function getFuturesSymbols(isIndex: boolean = false, exchange: string = "NSE"): string[] {
  const segmentKey = exchange === "BSE" ? "BFO-FUT" : "NFO-FUT";
  const instruments = symbolCache.indexes.bySegment.get(segmentKey) || [];
  const symbolSet = new Set<string>();
  instruments.forEach((row) => {
    const type = classifyInstrument(row);
    if (isIndex && type === "FUTIDX") {
      symbolSet.add(row.name);
    } else if (!isIndex && type === "FUTSTK") {
      symbolSet.add(row.name);
    }
  });
  return Array.from(symbolSet).sort();
}

// Get specific futures details - updated for KiteConnect format
function getSpecificFutures(
  symbol: string,
  isIndex: boolean = false,
  expiry?: string,
  exchange: string = "NSE"
): FuturesResponse {
  const segmentKey = exchange === "BSE" ? "BFO-FUT" : "NFO-FUT";
  const instruments = symbolCache.indexes.bySegment.get(segmentKey) || [];
  const symbolInstruments = instruments.filter(
    (row) => row.name === symbol && classifyInstrument(row) === (isIndex ? "FUTIDX" : "FUTSTK")
  );

  console.log(`Found ${symbolInstruments.length} matching futures for ${symbol} (isIndex: ${isIndex})`);

  if (expiry) {
    // Convert the input expiry to YYYY-MM-DD format for comparison
    const parsedExpiry = parseExpiryDate(expiry);
    console.log(`Looking for expiry: ${expiry}, parsed as: ${parsedExpiry}`);

    const matchingFuture = symbolInstruments.find((row) => row.expiry === parsedExpiry);

    if (matchingFuture) {
      console.log(`Found matching future for ${symbol} with expiry ${expiry}:`, matchingFuture);
      return {
        token: matchingFuture.instrument_token.toString(),
        tradingSymbol: matchingFuture.tradingsymbol,
        lotSize: Number(matchingFuture.lot_size),
      };
    }
    console.log(`No matching future found for ${symbol} with expiry ${expiry} (parsed: ${parsedExpiry})`);
    return { token: null };
  }

  const expiryDates = new Set<string>();
  let lotSize = 1;

  symbolInstruments.forEach((row) => {
    if (row.expiry) {
      expiryDates.add(formatExpiryDate(row.expiry));
      lotSize = Number(row.lot_size);
    }
  });

  console.log(`Found ${expiryDates.size} future expiry dates for ${symbol}: ${Array.from(expiryDates).join(', ')}`);

  return {
    expiryDates: Array.from(expiryDates).sort(),
    lotSize,
  };
}

//=============================================================================
// OPTIONS INSTRUMENT HANDLERS
//=============================================================================

// Handler function for options
function handleOptionsInstrument(
  params: InstrumentHandlerParams,
  isIndex: boolean = false,
  exchange: string = "NSE"
) {
  const { symbol, expiry, strikePrice, optionType } = params;
  const segmentKey = exchange === "BSE" ? "BFO-OPT" : "NFO-OPT";
  const optionsData = symbolCache.indexes.bySegment.get(segmentKey) || [];

  // Debug logging
  console.log(`Processing options for symbol: ${symbol}, segment: ${segmentKey}`);
  console.log(`Found ${optionsData.length} options data entries`);

  // If just requesting available symbols (no specific symbol provided)
  if (!symbol) {
    if (isIndex) {
      if (exchange === "NSE") {
        return ["NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY"];
      } else if (exchange === "BSE") {
        return ["SENSEX", "BANKEX"];
      }
    }
    const symbols = new Set<string>();
    optionsData.forEach((row) => {
      const type = classifyInstrument(row);
      if ((isIndex && type === "OPTIDX") || (!isIndex && type === "OPTSTK")) {
        symbols.add(row.name);
      }
    });
    return Array.from(symbols).sort();
  }

  // Convert SENSEX/BANKEX for BSE processing
  const processedSymbol = symbol;
  const underlyingToken = resolveUnderlyingToken(processedSymbol, isIndex, exchange);

  if (expiry && strikePrice && optionType) {
    const filtered = optionsData.filter(
      (row) => row.name === processedSymbol && classifyInstrument(row) === (isIndex ? "OPTIDX" : "OPTSTK")
    );

    console.log(`Found ${filtered.length} filtered options for symbol: ${processedSymbol}`);

    // Log a few sample records to debug their structure
    if (filtered.length > 0) {
      console.log('Sample option data:', filtered.slice(0, 2).map(opt => ({
        name: opt.name,
        expiry: opt.expiry,
        strike: opt.strike,
        instrument_type: opt.instrument_type,
        segment: opt.segment,
        exchange: opt.exchange
      })));
    }

    // Convert the input expiry to YYYY-MM-DD format for comparison
    const parsedExpiry = parseExpiryDate(expiry);
    console.log(`Comparing expiry dates - Input: ${expiry}, Parsed: ${parsedExpiry}`);

    const matchingOption = filtered.find(
      (row) =>
        row.expiry === parsedExpiry &&
        Number(row.strike) === Number(strikePrice) &&
        row.instrument_type === optionType
    );

    if (matchingOption) {
      console.log(`Found matching option:`, matchingOption);
    } else {
      console.log(`No matching option found for ${processedSymbol} with expiry ${expiry}, strike ${strikePrice}, type ${optionType}`);
    }

    return {
      token: matchingOption?.instrument_token || null,
      tradingSymbol: matchingOption?.tradingsymbol,
      underlyingToken,
    };
  }

  if (expiry) {
    const filtered = optionsData.filter(
      (row) => row.name === processedSymbol && classifyInstrument(row) === (isIndex ? "OPTIDX" : "OPTSTK")
    );

    console.log(`Found ${filtered.length} filtered options for symbol: ${processedSymbol}`);

    // Log a few sample records to debug their structure
    if (filtered.length > 0) {
      console.log('Sample option data:', filtered.slice(0, 2).map(opt => ({
        name: opt.name,
        expiry: opt.expiry,
        strike: opt.strike,
        instrument_type: opt.instrument_type,
        segment: opt.segment,
        exchange: opt.exchange
      })));
    }

    // Convert the input expiry to YYYY-MM-DD format for comparison
    const parsedExpiry = parseExpiryDate(expiry);
    console.log(`Comparing expiry dates - Input: ${expiry}, Parsed: ${parsedExpiry}`);

    const strikes = { CE: [] as number[], PE: [] as number[] };
    let lotSize = 1;

    filtered.forEach((row) => {
      // Compare with the converted date format
      if (row.expiry === parsedExpiry) {
        if (row.instrument_type === "CE") strikes.CE.push(Number(row.strike));
        else if (row.instrument_type === "PE") strikes.PE.push(Number(row.strike));
        lotSize = Number(row.lot_size || 1);
      }
    });

    console.log(`Found ${strikes.CE.length} CE strikes and ${strikes.PE.length} PE strikes for ${processedSymbol}`);

    return {
      CE: strikes.CE.sort((a, b) => a - b),
      PE: strikes.PE.sort((a, b) => a - b),
      lotSize,
      underlyingToken,
    };
  }

  // Get expiry dates
  const filtered = optionsData.filter(
    (row) => row.name === processedSymbol && classifyInstrument(row) === (isIndex ? "OPTIDX" : "OPTSTK")
  );

  console.log(`Found ${filtered.length} matching instruments for ${processedSymbol}`);

  // Add debug information for option instruments
  if (filtered.length > 0) {
    console.log('Sample option instrument:', filtered[0]);
  } else {
    console.log('No matching instruments found. Search criteria:', {
      symbol: processedSymbol,
      segment: isIndex ? "OPTIDX" : "OPTSTK",
      instrumentCount: optionsData.length
    });

    // Log a few samples from optionsData to help diagnose
    if (optionsData.length > 0) {
      console.log('Sample options data from available options:',
        optionsData.slice(0, 3).map(opt => ({
          name: opt.name,
          expiry: opt.expiry,
          instrument_type: opt.instrument_type,
          segment: opt.segment
        }))
      );
    }
  }

  const expiryDates = new Set<string>();
  filtered.forEach((row) => {
    if (row.expiry) {
      expiryDates.add(formatExpiryDate(row.expiry));
    }
  });

  // Debug output
  console.log(`Found ${expiryDates.size} expiry dates for ${processedSymbol}: ${Array.from(expiryDates).join(', ')}`);

  return {
    expiryDates: Array.from(expiryDates).sort(),
    underlyingToken,
  };
}

// Resolve underlying token for options - modified to work with new data format
function resolveUnderlyingToken(
  symbol: string,
  isIndex: boolean = false,
  exchange: string = "NSE"
): string | null {
  // If it's an index option, look in the INDICES segment
  if (isIndex) {
    const segmentKey = "INDICES";
    const instruments = symbolCache.indexes.bySegment.get(segmentKey) || [];

    // Try to find exact match by name in INDICES segment
    let match = instruments.find(inst =>
      inst.name === symbol &&
      inst.exchange === exchange);

    // Handle special cases for common indices
    if (!match) {
      // Map common index option names to their index names
      const indexMap: Record<string, string> = {
        "NIFTY": "NIFTY 50",
        "BANKNIFTY": "NIFTY BANK",
        "FINNIFTY": "NIFTY FIN SERVICE",
        "MIDCPNIFTY": "NIFTY MIDCAP SELECT (MIDCPNIFTY)",
        "SENSEX": "SENSEX",
        "BANKEX": "BSE INDEX BANKEX"
      };

      const mappedName = indexMap[symbol];
      if (mappedName) {
        match = instruments.find(inst =>
          inst.name === mappedName &&
          inst.exchange === exchange);
      }
    }

    if (match) {
      return match.instrument_token.toString();
    }
  }
  // For stock options, look in the NSE/BSE segment with EQ instrument type
  else {
    const segmentKey = exchange;
    const instruments = symbolCache.indexes.bySegment.get(segmentKey) || [];

    // Find the equity instrument with the same name
    const equityInstrument = instruments.find(
      inst => inst.name === symbol && inst.instrument_type === "EQ"
    );

    if (equityInstrument) {
      return equityInstrument.instrument_token.toString();
    }

    // If no exact match is found, try to find by trading symbol
    const byTradingSymbol = instruments.find(
      inst => inst.tradingsymbol === symbol && inst.instrument_type === "EQ"
    );

    if (byTradingSymbol) {
      return byTradingSymbol.instrument_token.toString();
    }
  }

  return null;
}

//=============================================================================
// COMMODITY INSTRUMENT HANDLERS
//=============================================================================

// Handlers for each instrument type
const instrumentHandlers = {
  async EQ({
    symbol,
    format,
    exchange = "NSE",
  }: InstrumentHandlerParams & { format?: ResponseFormat }): Promise<any> {
    if (symbol) {
      return getSpecificEquitySymbol(symbol);
    }
    return getEquitySymbols(format, exchange);
  },

  async FUTIDX({
    symbol,
    expiry,
    exchange,
  }: InstrumentHandlerParams): Promise<any> {
    if (symbol) {
      return getSpecificFutures(symbol, true, expiry, exchange);
    }
    return getFuturesSymbols(true, exchange);
  },

  async FUTSTK({
    symbol,
    expiry,
    exchange,
  }: InstrumentHandlerParams): Promise<any> {
    if (symbol) {
      return getSpecificFutures(symbol, false, expiry, exchange);
    }
    return getFuturesSymbols(false, exchange);
  },

  async OPTIDX(params: InstrumentHandlerParams): Promise<any> {
    return handleOptionsInstrument(params, true, params.exchange);
  },

  async OPTSTK(params: InstrumentHandlerParams): Promise<any> {
    return handleOptionsInstrument(params, false, params.exchange);
  },

  async FUTCOM({
    symbol,
    expiry,
  }: InstrumentHandlerParams): Promise<any> {
    // Similar to FUTSTK but for MCX segment
    const mcxInstruments = symbolCache.indexes.bySegment.get("MCX-FUT") || [];

    if (symbol) {
      // Handle specific commodity future
      const symbolInstruments = mcxInstruments.filter(
        (row) => row.name === symbol
      );

      if (expiry) {
        // Convert the input expiry to YYYY-MM-DD format for comparison
        const parsedExpiry = parseExpiryDate(expiry);
        console.log(`Looking for MCX expiry: ${expiry}, parsed as: ${parsedExpiry}`);

        const matchingFuture = symbolInstruments.find(
          (row) => row.expiry === parsedExpiry
        );

        if (matchingFuture) {
          console.log(`Found matching MCX future for ${symbol} with expiry ${expiry}:`, matchingFuture);
          return {
            token: matchingFuture.instrument_token.toString(),
            tradingSymbol: matchingFuture.tradingsymbol,
            lotSize: Number(matchingFuture.lot_size),
          };
        }

        console.log(`No matching MCX future found for ${symbol} with expiry ${expiry} (parsed: ${parsedExpiry})`);
        return { token: null };
      }

      // Return all expiry dates for the symbol
      console.log(`Found ${symbolInstruments.length} matching MCX futures for ${symbol}`);

      const expiryDates = new Set<string>();
      let lotSize = 1;

      symbolInstruments.forEach(row => {
        if (row.expiry) {
          expiryDates.add(formatExpiryDate(row.expiry));
          lotSize = Number(row.lot_size || 1);
        }
      });

      console.log(`Found ${expiryDates.size} MCX future expiry dates for ${symbol}: ${Array.from(expiryDates).join(', ')}`);

      return {
        expiryDates: Array.from(expiryDates).sort(),
        lotSize,
      };
    }

    // Return all commodity futures symbols
    const symbols = mcxInstruments.map(row => row.name);
    return Array.from(new Set(symbols)).sort();
  },

  async OPTFUT(params: InstrumentHandlerParams): Promise<any> {
    // Similar approach to OPTIDX/OPTSTK but for MCX options
    const { symbol, expiry, strikePrice, optionType } = params;

    const mcxOptions = symbolCache.indexes.bySegment.get("MCX-OPT") || [];

    if (!symbol) {
      // Return all symbols with options
      const symbols = mcxOptions.map(row => row.name);
      return Array.from(new Set(symbols)).sort();
    }

    // Get underlying token
    const mcxFutures = symbolCache.indexes.bySegment.get("MCX-FUT") || [];
    const underlying = mcxFutures.find(future => future.name === symbol);
    const underlyingToken = underlying?.instrument_token.toString() || null;

    if (expiry && strikePrice && optionType) {
      // Convert the input expiry to YYYY-MM-DD format for comparison
      const parsedExpiry = parseExpiryDate(expiry);
      console.log(`Looking for MCX option expiry: ${expiry}, parsed as: ${parsedExpiry}`);

      // Get specific option
      const matchingOption = mcxOptions.find(
        option =>
          option.name === symbol &&
          option.expiry === parsedExpiry &&
          Number(option.strike) === Number(strikePrice) &&
          option.instrument_type === optionType
      );

      if (matchingOption) {
        console.log(`Found matching MCX option:`, matchingOption);
      } else {
        console.log(`No matching MCX option found for ${symbol} with expiry ${expiry}, strike ${strikePrice}, type ${optionType}`);
      }

      return {
        token: matchingOption?.instrument_token || null,
        tradingSymbol: matchingOption?.tradingsymbol,
        underlyingToken,
      };
    }

    if (expiry) {
      // Convert the input expiry to YYYY-MM-DD format for comparison
      const parsedExpiry = parseExpiryDate(expiry);
      console.log(`Looking for MCX option strikes with expiry: ${expiry}, parsed as: ${parsedExpiry}`);

      // Get strikes for expiry
      const strikes = { CE: [] as number[], PE: [] as number[] };
      let lotSize = 1;

      mcxOptions.forEach(option => {
        if (option.name === symbol && option.expiry === parsedExpiry) {
          if (option.instrument_type === "CE") {
            strikes.CE.push(Number(option.strike));
          } else if (option.instrument_type === "PE") {
            strikes.PE.push(Number(option.strike));
          }
          lotSize = Number(option.lot_size || 1);
        }
      });

      console.log(`Found ${strikes.CE.length} CE strikes and ${strikes.PE.length} PE strikes for MCX ${symbol}`);

      return {
        CE: strikes.CE.sort((a, b) => a - b),
        PE: strikes.PE.sort((a, b) => a - b),
        lotSize,
        underlyingToken,
      };
    }

    // Get expiry dates
    const filteredOptions = mcxOptions.filter(option => option.name === symbol);
    console.log(`Found ${filteredOptions.length} matching MCX options for ${symbol}`);

    const expiryDates = new Set<string>();

    filteredOptions.forEach(option => {
      if (option.expiry) {
        expiryDates.add(formatExpiryDate(option.expiry));
      }
    });

    console.log(`Found ${expiryDates.size} MCX expiry dates for ${symbol}: ${Array.from(expiryDates).join(', ')}`);

    return {
      expiryDates: Array.from(expiryDates).sort(),
      underlyingToken,
    };
  },
};

//=============================================================================
// ROUTER CONFIGURATION
//=============================================================================

// Main route handler
const createRouter = (): Router => {
  const router = express.Router();

  // File update status endpoint
  router.get("/status", (req, res) => {
    res.json({
      lastUpdated: symbolCache.lastUpdated,
      cacheAge: Date.now() - symbolCache.lastUpdated,
      apiType: "KiteConnect",
      instrumentCount: symbolCache.instruments.length,
    });
  });

  // Schedule daily download at 1:30 AM IST (19:00 UTC)
  schedule.scheduleJob("0 19 * * *", () => {
    console.log("Running daily instrument file update for KiteConnect API");
    downloadInstrumentFile().then(() => {
      symbolCache.lastUpdated = 0; // Force cache refresh on next request
    });
  });

  const instrumentsHandler = async (
    req: Request,
    res: Response
  ): Promise<void> => {
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

      // Add detailed logging
      console.log("KiteConnect instrument request:", {
        exchange,
        segment,
        symbol,
        expiry,
        strikePrice,
        optionType,
        format
      });

      const instrumentType = INSTRUMENT_TYPE_MAP[
        segment as keyof typeof INSTRUMENT_TYPE_MAP
      ] as InstrumentType;

      if (instrumentType) {
        console.log(`Mapped segment ${segment} to instrument type ${instrumentType}`);
        await loadSymbolData();

        const handler = instrumentHandlers[instrumentType];
        if (handler) {
          console.log(`Using handler for ${instrumentType}`);
          const result = await handler({
            symbol,
            symbolCache: symbolCache,
            expiry,
            strikePrice,
            optionType,
            segment,
            exchange,
            format,
          });

          console.log(`Handler result:`, result);
          res.json(result);
          return;
        } else {
          console.log(`No handler found for instrument type ${instrumentType}`);
        }
      } else {
        console.log(`Could not map segment ${segment} to an instrument type`);
      }

      res.json([]);
    } catch (error) {
      console.error("Error in KiteConnect instruments handler:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  };

  router.get("/", instrumentsHandler);

  // KiteConnect Reload Cache Endpoint
  router.get("/reload-cache", async (req, res) => {
    try {
      symbolCache.lastUpdated = 0;
      await loadSymbolData();
      res.json({
        success: true,
        message: "KiteConnect cache reloaded successfully",
        instrumentCount: symbolCache.instruments.length
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to reload cache" });
    }
  });

  return router;
};

export default createRouter; 