import express, { Router, Request, Response } from "express";
import fs from "fs";
import path from "path";
import https from "https";
import zlib from "zlib";
import schedule from "node-schedule";
import {
    FuturesResponse,
    InstrumentHandlerParams,
    InstrumentType,
    OptionResponse,
    OptionStrikesResponse,
    OptionExpiryResponse,
} from "../../types/types";
import { INSTRUMENT_TYPE_MAP, CACHE_DURATION } from "../../constants/constants";

/**
 * Upstox API Instruments Router Module
 *
 * This module handles all instrument-related operations for Upstox API including:
 * - Equity instruments
 * - Index Futures
 * - Stock Futures
 * - Index Options
 * - Stock Options
 * - Commodity Futures and Options (MCX)
 *
 * The module implements caching to optimize performance.
 * Data is loaded from a gzipped JSON file from Upstox.
 */

//=============================================================================
// TYPES
//=============================================================================

interface UpstoxInstrument {
    segment: string;
    name: string;
    exchange: string;
    isin?: string;
    instrument_type: string;
    instrument_key: string;
    lot_size: number;
    freeze_quantity?: number;
    exchange_token: string;
    tick_size: number;
    trading_symbol: string;
    short_name?: string;
    security_type?: string;
    expiry?: number; // Unix timestamp in milliseconds
    strike_price?: number;
    underlying_symbol?: string;
    underlying_key?: string;
    underlying_type?: string;
    weekly?: boolean;
    minimum_lot?: number;
}

interface UpstoxSymbolCache {
    instruments: UpstoxInstrument[];
    indexes: {
        byName: Map<string, UpstoxInstrument[]>;
        byToken: Map<string, UpstoxInstrument>;
        byExchange: Map<string, UpstoxInstrument[]>;
        byInstrumentType: Map<string, UpstoxInstrument[]>;
        bySegment: Map<string, UpstoxInstrument[]>;
    };
    lastUpdated: number;
}

type ResponseFormat = "simple" | "detailed";

//=============================================================================
// CONFIGURATION
//=============================================================================

// URL for Upstox instruments (gzipped JSON)
const INSTRUMENT_URL = "https://assets.upstox.com/market-quote/instruments/exchange/complete.json.gz";

// Index names for classification
const INDEX_NAMES = [
    "NIFTY", "BANKNIFTY", "MIDCPNIFTY", "FINNIFTY", "SENSEX", "BANKEX",
    "NIFTY 50", "NIFTY BANK", "NIFTY FIN SERVICE", "NIFTY MIDCAP SELECT"
];

//=============================================================================
// CACHE MANAGEMENT
//=============================================================================

let symbolCache: UpstoxSymbolCache = {
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

// Prevents concurrent downloads — all callers share the same in-flight promise
let loadingPromise: Promise<UpstoxSymbolCache> | null = null;

//=============================================================================
// UTILITY FUNCTIONS
//=============================================================================

/**
 * Converts Unix timestamp to DD-MMM-YYYY format
 */
function formatExpiryDate(timestamp: number): string {
    try {
        const date = new Date(timestamp);
        if (isNaN(date.getTime())) return "";

        const day = date.getDate().toString().padStart(2, '0');
        const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        const month = monthNames[date.getMonth()];
        const year = date.getFullYear();
        return `${day}-${month}-${year}`;
    } catch (error) {
        console.error('Error formatting expiry date:', error);
        return "";
    }
}

/**
 * Converts DD-MMM-YYYY to Unix timestamp for comparison
 */
function parseExpiryDate(expiryStr: string): number | null {
    try {
        const [day, month, year] = expiryStr.split('-');
        const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        const monthIndex = monthNames.indexOf(month.toUpperCase());
        if (monthIndex === -1) return null;

        const date = new Date(parseInt(year), monthIndex, parseInt(day));
        return date.getTime();
    } catch (error) {
        console.error('Error parsing expiry date:', error);
        return null;
    }
}

/**
 * Normalizes symbol name for consistent matching
 */
function normalizeSymbol(symbol: string): string {
    // Map common variations
    const symbolMap: Record<string, string> = {
        "NIFTY 50": "NIFTY",
        "NIFTY BANK": "BANKNIFTY",
        "NIFTY FIN SERVICE": "FINNIFTY",
        "NIFTY MIDCAP SELECT": "MIDCPNIFTY",
    };
    return symbolMap[symbol] || symbol;
}

/**
 * Downloads and extracts the gzipped instruments file from Upstox.
 * Writes to a temp file first, then renames to the final path for atomicity.
 */
async function downloadInstrumentFile(): Promise<void> {
    const instrumentsDir = path.resolve("./instruments");
    if (!fs.existsSync(instrumentsDir)) {
        fs.mkdirSync(instrumentsDir, { recursive: true });
    }

    const jsonFilePath = path.resolve("./instruments/upstox_instruments.json");
    const tmpFilePath = path.resolve("./instruments/upstox_instruments.json.tmp");

    return new Promise((resolve, reject) => {
        console.log("Downloading Upstox instruments file...");

        const downloadWithRedirect = (url: string, redirectCount: number = 0) => {
            if (redirectCount > 5) {
                reject(new Error("Too many redirects"));
                return;
            }

            // Parse URL to get hostname and path
            const urlObj = new URL(url);

            const options = {
                hostname: urlObj.hostname,
                path: urlObj.pathname + urlObj.search,
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/json, application/gzip, */*',
                    'Accept-Encoding': 'gzip, deflate, br',
                }
            };

            const req = https.request(options, (response) => {
                // Handle redirects
                if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307) {
                    const redirectUrl = response.headers.location;
                    if (redirectUrl) {
                        console.log(`Following redirect to: ${redirectUrl}`);
                        downloadWithRedirect(redirectUrl, redirectCount + 1);
                        return;
                    }
                }

                if (response.statusCode !== 200) {
                    reject(new Error(`HTTP ${response.statusCode}: Failed to download Upstox instruments`));
                    return;
                }

                console.log("Upstox instruments download started, decompressing...");

                // Create gunzip stream and write to temp file
                const gunzip = zlib.createGunzip();
                const output = fs.createWriteStream(tmpFilePath);

                // Handle gunzip errors
                gunzip.on("error", (err) => {
                    console.error("Gzip decompression error:", err);
                    // If gzip fails, the file might not be compressed - try saving directly
                    console.log("Attempting to save as plain JSON...");
                    response.unpipe(gunzip);

                    // Re-download and save without decompression
                    const retryReq = https.request(options, (retryResponse) => {
                        const directOutput = fs.createWriteStream(tmpFilePath);
                        retryResponse.pipe(directOutput);
                        directOutput.on("finish", () => {
                            directOutput.close();
                            // Atomically rename temp file to final path
                            fs.renameSync(tmpFilePath, jsonFilePath);
                            console.log("Upstox instruments file saved (uncompressed)");
                            resolve();
                        });
                        directOutput.on("error", reject);
                    });
                    retryReq.on("error", reject);
                    retryReq.end();
                });

                // Pipe: HTTP response -> gunzip -> temp file
                response.pipe(gunzip).pipe(output);

                output.on("finish", () => {
                    output.close();
                    // Atomically rename temp file to final path
                    fs.renameSync(tmpFilePath, jsonFilePath);
                    console.log("Upstox instruments file extracted successfully");
                    resolve();
                });

                output.on("error", (err) => {
                    console.error("File write error:", err);
                    reject(err);
                });
            });

            req.on("error", (err) => {
                console.error("Error downloading Upstox instruments file:", err);
                reject(err);
            });

            req.end();
        };

        downloadWithRedirect(INSTRUMENT_URL);
    });
}

/**
 * Loads and parses the JSON instruments file
 */
async function loadJsonFile(filePath: string): Promise<UpstoxInstrument[]> {
    const absolutePath = path.resolve(filePath);
    return new Promise((resolve, reject) => {
        fs.readFile(absolutePath, 'utf-8', (err, data) => {
            if (err) {
                reject(err);
                return;
            }
            try {
                const instruments = JSON.parse(data) as UpstoxInstrument[];
                resolve(instruments);
            } catch (parseError) {
                reject(parseError);
            }
        });
    });
}

//=============================================================================
// INDEX CREATION AND CACHE UTILITIES
//=============================================================================

/**
 * Creates indexed access structures for quick symbol lookup
 */
function createIndexes(data: UpstoxInstrument[]): UpstoxSymbolCache["indexes"] {
    const byName = new Map<string, UpstoxInstrument[]>();
    const byToken = new Map<string, UpstoxInstrument>();
    const byExchange = new Map<string, UpstoxInstrument[]>();
    const byInstrumentType = new Map<string, UpstoxInstrument[]>();
    const bySegment = new Map<string, UpstoxInstrument[]>();

    data.forEach((row) => {
        // Index by name
        const name = row.name || row.underlying_symbol || "";
        if (name) {
            if (!byName.has(name)) {
                byName.set(name, []);
            }
            byName.get(name)!.push(row);
        }

        // Index by instrument_key (token)
        byToken.set(row.instrument_key, row);

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
 * Loads and caches symbol data from Upstox.
 * Uses a shared promise lock so concurrent callers wait for a single
 * download + parse cycle instead of triggering duplicate downloads.
 */
async function loadSymbolData(): Promise<UpstoxSymbolCache> {
    // Return cached data if still valid
    if (
        symbolCache.lastUpdated &&
        Date.now() - symbolCache.lastUpdated < CACHE_DURATION
    ) {
        return symbolCache;
    }

    // If a load is already in progress, all callers share it
    if (loadingPromise) {
        return loadingPromise;
    }

    loadingPromise = (async () => {
        try {
            // Download the latest instruments file
            await downloadInstrumentFile();

            // Load and parse the JSON file
            const instruments = await loadJsonFile("./instruments/upstox_instruments.json");

            // Create indexes for efficient lookups
            const indexes = createIndexes(instruments);

            const currentTime = Date.now();

            // Update the cache
            symbolCache = {
                instruments,
                indexes,
                lastUpdated: currentTime,
            };

            console.log("Upstox symbol cache updated:", {
                instrumentCount: instruments.length,
                timestamp: new Date(currentTime).toISOString(),
            });

            return symbolCache;
        } catch (error) {
            console.error("Error loading Upstox symbol data:", error);
            throw error;
        } finally {
            loadingPromise = null;
        }
    })();

    return loadingPromise;
}

//=============================================================================
// INSTRUMENT TYPE CLASSIFICATION
//=============================================================================

function classifyInstrument(row: UpstoxInstrument): InstrumentType | null {
    const segment = row.segment || "";
    const instType = row.instrument_type || "";
    const name = row.name || row.underlying_symbol || "";

    // Index Options
    if (segment.includes("NSE_FO") || segment.includes("BSE_FO")) {
        if ((instType === "CE" || instType === "PE") && INDEX_NAMES.some(idx => name.includes(idx))) {
            return "OPTIDX";
        }
        if (instType === "FUT" && INDEX_NAMES.some(idx => name.includes(idx))) {
            return "FUTIDX";
        }
        if (instType === "CE" || instType === "PE") {
            return "OPTSTK";
        }
        if (instType === "FUT") {
            return "FUTSTK";
        }
    }

    // Equity
    if ((segment === "NSE_EQ" || segment === "BSE_EQ") && instType === "EQ") {
        return "EQ";
    }

    // Commodities
    if (segment.includes("MCX")) {
        if (instType === "FUT") return "FUTCOM";
        if (instType === "CE" || instType === "PE") return "OPTFUT";
    }

    return null;
}

//=============================================================================
// EQUITY INSTRUMENT HANDLERS
//=============================================================================

function getEquitySymbols(format: ResponseFormat = "simple", exchange: string = "NSE"): any {
    const segmentKey = exchange === "BSE" ? "BSE_EQ" : "NSE_EQ";
    const equityInstruments = symbolCache.indexes.bySegment.get(segmentKey) || [];

    const equitySymbols = equityInstruments.filter(
        (row) => row.instrument_type === "EQ"
    );

    equitySymbols.sort((a, b) =>
        a.trading_symbol.localeCompare(b.trading_symbol)
    );

    if (format === "simple") {
        return equitySymbols.map((row) => row.trading_symbol);
    }

    return equitySymbols.map((row) => ({
        Symbol: row.name,
        token: row.instrument_key,
        tradingSymbol: row.trading_symbol,
        LotSize: Number(row.lot_size || 1),
    }));
}

function getSpecificEquitySymbol(symbol: string, exchange: string = "NSE"): any {
    const segmentKey = exchange === "BSE" ? "BSE_EQ" : "NSE_EQ";
    const equityInstruments = symbolCache.indexes.bySegment.get(segmentKey) || [];

    const equityInstrument = equityInstruments.find(
        (row) =>
            row.instrument_type === "EQ" &&
            (row.trading_symbol === symbol || row.name === symbol)
    );

    if (equityInstrument) {
        return {
            token: equityInstrument.instrument_key,
            lotSize: Number(equityInstrument.lot_size || 1),
            tradingSymbol: equityInstrument.trading_symbol,
        };
    }

    return { token: null };
}

//=============================================================================
// FUTURES INSTRUMENT HANDLERS
//=============================================================================

function getFuturesSymbols(isIndex: boolean = false, exchange: string = "NSE"): string[] {
    const segmentKey = exchange === "BSE" ? "BSE_FO" : "NSE_FO";
    const instruments = symbolCache.indexes.bySegment.get(segmentKey) || [];
    const symbolSet = new Set<string>();

    instruments.forEach((row) => {
        if (row.instrument_type !== "FUT") return;

        const name = row.name || row.underlying_symbol || "";
        const isIdxFuture = INDEX_NAMES.some(idx => name.includes(idx));

        if (isIndex && isIdxFuture) {
            symbolSet.add(normalizeSymbol(name));
        } else if (!isIndex && !isIdxFuture) {
            symbolSet.add(name);
        }
    });

    return Array.from(symbolSet).sort();
}

function getSpecificFutures(
    symbol: string,
    isIndex: boolean = false,
    expiry?: string,
    exchange: string = "NSE"
): FuturesResponse {
    const segmentKey = exchange === "BSE" ? "BSE_FO" : "NSE_FO";
    const instruments = symbolCache.indexes.bySegment.get(segmentKey) || [];

    const symbolInstruments = instruments.filter((row) => {
        if (row.instrument_type !== "FUT") return false;
        const name = row.name || row.underlying_symbol || "";
        return name === symbol || normalizeSymbol(name) === symbol;
    });

    console.log(`Found ${symbolInstruments.length} matching Upstox futures for ${symbol}`);

    if (expiry) {
        const parsedExpiry = parseExpiryDate(expiry);
        console.log(`Looking for expiry: ${expiry}, parsed as timestamp: ${parsedExpiry}`);

        const matchingFuture = symbolInstruments.find((row) => {
            if (!row.expiry) return false;
            // Compare dates (within same day)
            const rowDate = new Date(row.expiry);
            const targetDate = parsedExpiry ? new Date(parsedExpiry) : null;
            if (!targetDate) return false;
            return rowDate.toDateString() === targetDate.toDateString();
        });

        if (matchingFuture) {
            console.log(`Found matching Upstox future:`, matchingFuture.trading_symbol);
            return {
                token: matchingFuture.instrument_key,
                tradingSymbol: matchingFuture.trading_symbol,
                lotSize: Number(matchingFuture.lot_size),
                tickSize: Number(matchingFuture.tick_size),
            };
        }
        console.log(`No matching future found for ${symbol} with expiry ${expiry}`);
        return { token: null };
    }

    const expiryDates = new Set<string>();
    let lotSize = 1;
    let tickSize = 0.05;

    symbolInstruments.forEach((row) => {
        if (row.expiry) {
            expiryDates.add(formatExpiryDate(row.expiry));
            lotSize = Number(row.lot_size);
            tickSize = Number(row.tick_size);
        }
    });

    console.log(`Found ${expiryDates.size} Upstox future expiry dates for ${symbol}`);

    return {
        expiryDates: Array.from(expiryDates).sort(),
        lotSize,
        tickSize,
    };
}

//=============================================================================
// OPTIONS INSTRUMENT HANDLERS
//=============================================================================

function handleOptionsInstrument(
    params: InstrumentHandlerParams,
    isIndex: boolean = false,
    exchange: string = "NSE"
) {
    const { symbol, expiry, strikePrice, optionType } = params;
    const segmentKey = exchange === "BSE" ? "BSE_FO" : "NSE_FO";
    const optionsData = symbolCache.indexes.bySegment.get(segmentKey) || [];

    console.log(`Processing Upstox options for symbol: ${symbol}, segment: ${segmentKey}`);

    // If just requesting available symbols
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
            if (row.instrument_type !== "CE" && row.instrument_type !== "PE") return;
            const name = row.name || row.underlying_symbol || "";
            const isIdxOption = INDEX_NAMES.some(idx => name.includes(idx));
            if ((isIndex && isIdxOption) || (!isIndex && !isIdxOption)) {
                symbols.add(normalizeSymbol(name));
            }
        });
        return Array.from(symbols).sort();
    }

    const underlyingToken = resolveUnderlyingToken(symbol, isIndex, exchange);

    // Filter options for this symbol
    const filtered = optionsData.filter((row) => {
        if (row.instrument_type !== "CE" && row.instrument_type !== "PE") return false;
        const name = row.name || row.underlying_symbol || "";
        return name === symbol || normalizeSymbol(name) === symbol;
    });

    console.log(`Found ${filtered.length} filtered Upstox options for symbol: ${symbol}`);

    // Get specific option
    if (expiry && strikePrice && optionType) {
        const parsedExpiry = parseExpiryDate(expiry);
        console.log(`Looking for option: ${symbol} ${expiry} ${strikePrice} ${optionType}`);

        const matchingOption = filtered.find((row) => {
            if (!row.expiry) return false;
            const rowDate = new Date(row.expiry);
            const targetDate = parsedExpiry ? new Date(parsedExpiry) : null;
            if (!targetDate) return false;
            return (
                rowDate.toDateString() === targetDate.toDateString() &&
                Number(row.strike_price) === Number(strikePrice) &&
                row.instrument_type === optionType
            );
        });

        if (matchingOption) {
            console.log(`Found matching Upstox option:`, matchingOption.trading_symbol);
        }

        return {
            token: matchingOption?.instrument_key || null,
            tradingSymbol: matchingOption?.trading_symbol,
            underlyingToken,
        };
    }

    // Get strikes for expiry
    if (expiry) {
        const parsedExpiry = parseExpiryDate(expiry);
        const strikes = { CE: [] as number[], PE: [] as number[] };
        let lotSize = 1;
        let tickSize = 0.05;

        filtered.forEach((row) => {
            if (!row.expiry || !row.strike_price) return;
            const rowDate = new Date(row.expiry);
            const targetDate = parsedExpiry ? new Date(parsedExpiry) : null;
            if (!targetDate || rowDate.toDateString() !== targetDate.toDateString()) return;

            if (row.instrument_type === "CE") strikes.CE.push(Number(row.strike_price));
            else if (row.instrument_type === "PE") strikes.PE.push(Number(row.strike_price));
            lotSize = Number(row.lot_size || 1);
            tickSize = Number(row.tick_size || 0.05);
        });

        console.log(`Found ${strikes.CE.length} CE and ${strikes.PE.length} PE strikes for ${symbol}`);

        return {
            CE: strikes.CE.sort((a, b) => a - b),
            PE: strikes.PE.sort((a, b) => a - b),
            lotSize,
            tickSize,
            underlyingToken,
        };
    }

    // Get expiry dates
    const expiryDates = new Set<string>();
    filtered.forEach((row) => {
        if (row.expiry) {
            expiryDates.add(formatExpiryDate(row.expiry));
        }
    });

    console.log(`Found ${expiryDates.size} Upstox expiry dates for ${symbol}`);

    return {
        expiryDates: Array.from(expiryDates).sort(),
        underlyingToken,
    };
}

function resolveUnderlyingToken(
    symbol: string,
    isIndex: boolean = false,
    exchange: string = "NSE"
): string | null {
    // For index options, look for the index in INDEX segment
    if (isIndex) {
        const indexSegment = exchange === "BSE" ? "BSE_INDEX" : "NSE_INDEX";
        const instruments = symbolCache.indexes.bySegment.get(indexSegment) || [];

        // Map common option names to index names
        const indexMap: Record<string, string[]> = {
            "NIFTY": ["NIFTY 50", "Nifty 50", "NIFTY"],
            "BANKNIFTY": ["NIFTY BANK", "Nifty Bank", "BANKNIFTY"],
            "FINNIFTY": ["NIFTY FIN SERVICE", "FINNIFTY"],
            "MIDCPNIFTY": ["NIFTY MIDCAP SELECT", "MIDCPNIFTY"],
            "SENSEX": ["SENSEX"],
            "BANKEX": ["BANKEX", "BSE BANKEX"],
        };

        const possibleNames = indexMap[symbol] || [symbol];

        for (const name of possibleNames) {
            const match = instruments.find(inst =>
                inst.name === name || inst.trading_symbol === name
            );
            if (match) return match.instrument_key;
        }
    } else {
        // For stock options, find the equity instrument
        const segmentKey = exchange === "BSE" ? "BSE_EQ" : "NSE_EQ";
        const instruments = symbolCache.indexes.bySegment.get(segmentKey) || [];

        const equityInstrument = instruments.find(
            inst => (inst.name === symbol || inst.trading_symbol === symbol) &&
                inst.instrument_type === "EQ"
        );

        if (equityInstrument) return equityInstrument.instrument_key;
    }

    return null;
}

//=============================================================================
// COMMODITY HANDLERS
//=============================================================================

function handleCommodityFutures(symbol?: string, expiry?: string): any {
    const mcxInstruments = symbolCache.indexes.bySegment.get("MCX_FO") || [];
    const futures = mcxInstruments.filter(row => row.instrument_type === "FUT");

    if (!symbol) {
        const symbols = new Set<string>();
        futures.forEach(row => symbols.add(row.name || row.underlying_symbol || ""));
        return Array.from(symbols).sort();
    }

    const symbolInstruments = futures.filter(row =>
        row.name === symbol || row.underlying_symbol === symbol
    );

    if (expiry) {
        const parsedExpiry = parseExpiryDate(expiry);
        const matchingFuture = symbolInstruments.find((row) => {
            if (!row.expiry) return false;
            const rowDate = new Date(row.expiry);
            const targetDate = parsedExpiry ? new Date(parsedExpiry) : null;
            if (!targetDate) return false;
            return rowDate.toDateString() === targetDate.toDateString();
        });

        if (matchingFuture) {
            return {
                token: matchingFuture.instrument_key,
                tradingSymbol: matchingFuture.trading_symbol,
                lotSize: Number(matchingFuture.lot_size),
            };
        }
        return { token: null };
    }

    const expiryDates = new Set<string>();
    let lotSize = 1;

    symbolInstruments.forEach(row => {
        if (row.expiry) {
            expiryDates.add(formatExpiryDate(row.expiry));
            lotSize = Number(row.lot_size || 1);
        }
    });

    return {
        expiryDates: Array.from(expiryDates).sort(),
        lotSize,
    };
}

function handleCommodityOptions(params: InstrumentHandlerParams): any {
    const { symbol, expiry, strikePrice, optionType } = params;
    const mcxInstruments = symbolCache.indexes.bySegment.get("MCX_FO") || [];
    const options = mcxInstruments.filter(row =>
        row.instrument_type === "CE" || row.instrument_type === "PE"
    );

    if (!symbol) {
        const symbols = new Set<string>();
        options.forEach(row => symbols.add(row.name || row.underlying_symbol || ""));
        return Array.from(symbols).sort();
    }

    const underlyingToken = null; // MCX underlying handling

    const filtered = options.filter(row =>
        row.name === symbol || row.underlying_symbol === symbol
    );

    if (expiry && strikePrice && optionType) {
        const parsedExpiry = parseExpiryDate(expiry);
        const matchingOption = filtered.find((row) => {
            if (!row.expiry) return false;
            const rowDate = new Date(row.expiry);
            const targetDate = parsedExpiry ? new Date(parsedExpiry) : null;
            if (!targetDate) return false;
            return (
                rowDate.toDateString() === targetDate.toDateString() &&
                Number(row.strike_price) === Number(strikePrice) &&
                row.instrument_type === optionType
            );
        });

        return {
            token: matchingOption?.instrument_key || null,
            tradingSymbol: matchingOption?.trading_symbol,
            underlyingToken,
        };
    }

    if (expiry) {
        const parsedExpiry = parseExpiryDate(expiry);
        const strikes = { CE: [] as number[], PE: [] as number[] };
        let lotSize = 1;

        filtered.forEach((row) => {
            if (!row.expiry || !row.strike_price) return;
            const rowDate = new Date(row.expiry);
            const targetDate = parsedExpiry ? new Date(parsedExpiry) : null;
            if (!targetDate || rowDate.toDateString() !== targetDate.toDateString()) return;

            if (row.instrument_type === "CE") strikes.CE.push(Number(row.strike_price));
            else if (row.instrument_type === "PE") strikes.PE.push(Number(row.strike_price));
            lotSize = Number(row.lot_size || 1);
        });

        return {
            CE: strikes.CE.sort((a, b) => a - b),
            PE: strikes.PE.sort((a, b) => a - b),
            lotSize,
            underlyingToken,
        };
    }

    const expiryDates = new Set<string>();
    filtered.forEach(row => {
        if (row.expiry) expiryDates.add(formatExpiryDate(row.expiry));
    });

    return {
        expiryDates: Array.from(expiryDates).sort(),
        underlyingToken,
    };
}

//=============================================================================
// INSTRUMENT HANDLERS
//=============================================================================

const instrumentHandlers = {
    async EQ({
        symbol,
        format,
        exchange = "NSE",
    }: InstrumentHandlerParams & { format?: ResponseFormat }): Promise<any> {
        if (symbol) {
            return getSpecificEquitySymbol(symbol, exchange);
        }
        return getEquitySymbols(format, exchange);
    },

    async FUTIDX({
        symbol,
        expiry,
        exchange = "NSE",
    }: InstrumentHandlerParams): Promise<any> {
        if (symbol) {
            return getSpecificFutures(symbol, true, expiry, exchange);
        }
        return getFuturesSymbols(true, exchange);
    },

    async FUTSTK({
        symbol,
        expiry,
        exchange = "NSE",
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
        return handleCommodityFutures(symbol, expiry);
    },

    async OPTFUT(params: InstrumentHandlerParams): Promise<any> {
        return handleCommodityOptions(params);
    },
};

//=============================================================================
// ROUTER
//=============================================================================

const createRouter = (): Router => {
    const router = express.Router();

    // Initialize data on startup
    loadSymbolData().catch(console.error);

    // Schedule daily download at 12:30 AM IST (19:00 UTC) - same as Zerodha and Noren
    schedule.scheduleJob("0 19 * * *", () => {
        console.log("Running daily instrument file update for Upstox API");
        downloadInstrumentFile().then(() => {
            symbolCache.lastUpdated = 0; // Force cache refresh on next request
        });
    });

    // Status endpoint
    router.get("/status", (req, res) => {
        res.json({
            lastUpdated: symbolCache.lastUpdated,
            cacheAge: Date.now() - symbolCache.lastUpdated,
            apiType: "Upstox",
            instrumentCount: symbolCache.instruments.length,
        });
    });

    // Reload cache endpoint
    router.get("/reload-cache", async (req, res) => {
        try {
            symbolCache.lastUpdated = 0;
            await loadSymbolData();
            res.json({
                success: true,
                message: "Upstox cache reloaded successfully",
                instrumentCount: symbolCache.instruments.length,
            });
        } catch (error) {
            res.status(500).json({ error: "Failed to reload cache" });
        }
    });

    // Main instruments endpoint
    router.get("/", async (req: Request, res: Response) => {
        try {
            const {
                segment,
                symbol,
                expiry,
                strikePrice,
                optionType,
                format,
                exchange = "NSE",
            } = req.query;

            // Ensure data is loaded
            await loadSymbolData();

            // Map segment to instrument type
            const instrumentType = INSTRUMENT_TYPE_MAP[segment as keyof typeof INSTRUMENT_TYPE_MAP];

            if (!instrumentType) {
                res.status(400).json({
                    error: "Invalid segment",
                    validSegments: Object.keys(INSTRUMENT_TYPE_MAP),
                });
                return;
            }

            const handler = instrumentHandlers[instrumentType as keyof typeof instrumentHandlers];

            if (!handler) {
                res.status(400).json({
                    error: `No handler for instrument type: ${instrumentType}`,
                });
                return;
            }

            const result = await handler({
                symbol: symbol as string,
                expiry: expiry as string,
                strikePrice: strikePrice as string,
                optionType: optionType as string,
                exchange: (exchange as "NSE" | "NFO" | "BSE" | "BFO" | "MCX") || "NSE",
                format: format as ResponseFormat,
                segment: segment as string,
                symbolCache: symbolCache as any,
            });

            res.json(result);
        } catch (error) {
            console.error("Upstox instruments error:", error);
            res.status(500).json({
                error: "Failed to fetch Upstox instruments",
                message: error instanceof Error ? error.message : "Unknown error",
            });
        }
    });

    return router;
};

export default createRouter;
