# Broker Instrument File Headers Reference

A comprehensive reference of all column headers/field names used by each broker's instrument files.

---

## Zerodha
**Format**: CSV with headers  
**Source**: `https://api.kite.trade/instruments`

| Column Name | Description |
|-------------|-------------|
| `instrument_token` | Unique instrument token |
| `exchange_token` | Exchange-specific token |
| `tradingsymbol` | Trading symbol |
| `name` | Instrument name |
| `last_price` | Last traded price |
| `expiry` | Expiry date |
| `strike` | Strike price |
| `tick_size` | Minimum price movement |
| `lot_size` | Lot size |
| `instrument_type` | Type (EQ, FUT, CE, PE, etc.) |
| `segment` | Market segment |
| `exchange` | Exchange (NSE, BSE, NFO, etc.) |

---

## Dhan
**Format**: CSV with headers  
**Source**: Dhan API

| Column Name | Description |
|-------------|-------------|
| `SEM_EXM_EXCH_ID` | Exchange ID |
| `SEM_SEGMENT` | Segment (E/D/M/C) |
| `SEM_SMST_SECURITY_ID` | Security ID/Token |
| `SEM_INSTRUMENT_NAME` | Instrument name |
| `SEM_TRADING_SYMBOL` | Trading symbol |
| `SEM_CUSTOM_SYMBOL` | Custom symbol |
| `SEM_SERIES` | Series |
| `SEM_EXPIRY_DATE` | Expiry date |
| `SEM_STRIKE_PRICE` | Strike price |
| `SEM_OPTION_TYPE` | Option type (CE/PE) |
| `SEM_LOT_UNITS` | Lot size |
| `SEM_TICK_SIZE` | Tick size |
| `SM_SYMBOL_NAME` | Symbol name |
| `SEM_EXCH_INSTRUMENT_TYPE` | Exchange instrument type |

---

## Upstox
**Format**: Gzipped JSON array  
**Source**: `https://assets.upstox.com/market-quote/instruments/exchange/complete.json.gz`

| Field Name | Description |
|------------|-------------|
| `segment` | Segment (NSE_EQ, NSE_FO, etc.) |
| `name` | Instrument name |
| `exchange` | Exchange |
| `isin` | ISIN code |
| `instrument_type` | Type (EQ, FUT, CE, PE) |
| `instrument_key` | Unique instrument key (token) |
| `lot_size` | Lot size |
| `freeze_quantity` | Freeze quantity |
| `exchange_token` | Exchange token |
| `tick_size` | Tick size |
| `trading_symbol` | Trading symbol |
| `short_name` | Short name |
| `security_type` | Security type |
| `expiry` | Expiry (Unix timestamp) |
| `strike_price` | Strike price |
| `underlying_symbol` | Underlying symbol |
| `underlying_key` | Underlying key |
| `underlying_type` | Underlying type |
| `weekly` | Is weekly expiry |
| `minimum_lot` | Minimum lot |

---

## Groww
**Format**: CSV with headers  
**Source**: Groww API

| Column Name | Description |
|-------------|-------------|
| `exchange` | Exchange |
| `exchange_token` | Exchange token |
| `trading_symbol` | Trading symbol |
| `groww_symbol` | Groww-specific symbol |
| `name` | Instrument name |
| `instrument_type` | Type (EQ, FUT, CE, PE) |
| `segment` | Segment |
| `series` | Series |
| `isin` | ISIN code |
| `underlying_symbol` | Underlying symbol |
| `lot_size` | Lot size |
| `expiry_date` | Expiry date |
| `strike_price` | Strike price |
| `tick_size` | Tick size |
| `freeze_qty` | Freeze quantity |
| `buying_allowed` | Is buying allowed |
| `selling_allowed` | Is selling allowed |

---

## Fyers
**Format**: JSON (sym_master.json)  
**Source**: `https://public.fyers.in/sym_details/[EXCHANGE]_sym_master.json`

| Field Name | Description |
|------------|-------------|
| `fyToken` | Fyers unique token |
| `isin` | ISIN code |
| `exSymbol` | Exchange symbol |
| `symDetails` | Symbol details |
| `symTicker` | Symbol ticker (trading symbol) |
| `exchange` | Exchange code (10=NSE, 11=MCX, 12=BSE) |
| `segment` | Segment code (10=CM, 11=FO, 12=CD, 20=COM) |
| `exSymName` | Exchange symbol name |
| `exInstType` | Exchange instrument type |
| `optType` | Option type |
| `strikePrice` | Strike price |
| `minLotSize` | Minimum lot size |
| `tickSize` | Tick size |
| `expiryDate` | Expiry date |
| `underFyToken` | Underlying Fyers token |
| `underExSymbol` | Underlying exchange symbol |

---

## 5paisa
**Format**: CSV with headers  
**Source**: `https://Openapi.5paisa.com/VendorsAPI/Service1.svc/ScripMaster/segment/[SEGMENT]`

| Column Name | Description |
|-------------|-------------|
| `Exch` | Exchange: N=NSE, B=BSE, M=MCX |
| `ExchType` | Segment: C=Equity, D=Derivatives, U=Currency, X=NCDEX, Y=Commodity |
| `ScripCode` | Unique numerical identifier |
| `Name` | Contract name (Symbol+Expiry+OptionType+Strike for F&O) |
| `Series` | Series (BE/EQ for equity) |
| `Expiry` | Expiry date (for F&O) |
| `CpType` | Option type: CE=Call, PE=Put |
| `StrikeRate` | Strike price |
| `ISIN` | ISIN code (for equity) |
| `FullName` | Full instrument name |
| `TickSize` | Tick size |
| `LotSize` | Lot size |

---

## Shoonya (Finvasia)
**Format**: CSV with headers inside ZIP  
**Source**: Exchange-specific ZIP files (e.g., `NSE_symbols.txt.zip`)

| Column Name | Description |
|-------------|-------------|
| `exch` | Exchange code (NSE, BSE, NFO, MCX, CDS) |
| `token` | Unique contract token |
| `tsym` | Trading symbol (e.g., "RELIANCE-EQ") |
| `pp` | Price precision |
| `ti` | Tick size (minimum price increment) |
| `ls` | Lot size |
| `instname` | Instrument name |
| `expiry` | Expiry date (for derivatives) |
| `optt` | Option type (CE/PE) |
| `strprc` | Strike price |


---

## ICICI Direct
**Format**: CSV files inside ZIP  
**Source**: `https://directlink.icicidirect.com/NewSecurityMaster/SecurityMaster.zip`

| Column Name | Description |
|-------------|-------------|
| `Exchange` | Exchange |
| `ExchangeCode` | Exchange code |
| `ScripCode` | Scrip code (token) |
| `ShortName` | Short name (trading symbol) |
| `Series` | Series |
| `CompanyName` | Full name |
| `Token` | Alternate token |
| `ExpiryDate` | Expiry date |
| `StrikePrice` | Strike price |
| `OptionType` | CE/PE |
| `LotSize` | Lot size |
| `TickSize` | Tick size |
| `ISIN` | ISIN code |

---

## HDFC Sky
**Format**: CSV or JSON  
**Source**: `https://developer.hdfcsky.com/api/v1/security-master/[SEGMENT].csv`

| Column Name | Description |
|-------------|-------------|
| `exchange_token` | Exchange token |
| `trading_symbol` | Trading symbol |
| `company_name` | Company name |
| `close_price` | Close price |
| `expiry` | Expiry date |
| `strike` | Strike price |
| `tick_size` | Tick size |
| `lot_size` | Lot size |
| `instrument_name` | Instrument name |
| `option_type` | Option type |
| `segment` | Segment |
| `exchange` | Exchange |
| `fin_instrm_pdct_tp_cd` | product type code |
| `asset_code` | Asset code |
| `settlement_type` | Settlement type |
| `isin` | ISIN code |

---

## Motilal Oswal
**Format**: CSV with headers  
**Source**: `https://openapi.motilaloswal.com/getscripmastercsv?name=[SEGMENT]`

| Column Name | Description |
|-------------|-------------|
| `exchange` | Exchange code |
| `exchangename` | Exchange name |
| `scripcode` | Unique scrip code (token) |
| `scripname` | Full scrip name |
| `scripshortname` | Short trading symbol |
| `strikeprice` | Strike price |
| `optiontype` | Option type (CE/PE) |
| `instrumentname` | Instrument type (OPTIDX, FUTIDX, etc.) |
| `expirydate` | Contract expiry date |
| `marketlot` | Lot size |
| `lowercircuitprice` | Lower circuit price |
| `uppercircuitprice` | Upper circuit price |
| `Series` | Series (EQ, BE, etc.) |

**Segments**: NSE, BSE, NSEFO, NSECD, MCX

---

## Angel One
**Format**: JSON array  
**Source**: `https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json`

| Field Name | Description |
|------------|-------------|
| `token` | Unique instrument token |
| `symbol` | Trading symbol |
| `name` | Instrument name (underlying for derivatives) |
| `exch_seg` | Exchange segment (NSE, BSE, NFO, MCX, CDS, BFO) |
| `instrumenttype` | Instrument type (OPTIDX, FUTIDX, OPTSTK, FUTSTK, EQ) |
| `expiry` | Expiry date (format: "02FEB2025") |
| `strike` | Strike price (**in paise - divide by 100**) |
| `lotsize` | Lot size |
| `tick_size` | Tick size |

> **Note**: Strike price is stored in paise and must be divided by 100 to get rupees.

---

## IIFL Securities
**Format**: CSV with headers  
**Source**: `http://content.indiainfoline.com/IIFLTT/Scripmaster.csv`

| Column Name | Description |
|-------------|-------------|
| `Exch` | Exchange: N=NSE, B=BSE, M=MCX |
| `ExchType` | Segment: C=Equity, D=Derivative, U=Currency |
| `Scripcode` | Unique scrip code (token) |
| `Name` | Contract name (Symbol+Expiry+OptionType+Strike for F&O) |
| `Series` | Series (BE, EQ for equity) |
| `Expiry` | Expiry date (for F&O) |
| `CpType` | Option type: CE=Call, PE=Put |
| `StrikeRate` | Strike price |
| `ISIN` | ISIN code (equity only) |
| `FullName` | Full instrument name |
| `LotSize` | Lot size |
| `TickSize` | Tick size |

---

## Summary: Key Field Mappings

| Purpose | Zerodha | Dhan | Upstox | Fyers | 5paisa | Shoonya | Groww | ICICI | HDFC Sky | Motilal Oswal | Angel One | IIFL |
|---------|---------|------|--------|-------|--------|---------|-------|-------|----------|---------------|-----------|------|
| **Symbol** | `tradingsymbol` | `SEM_TRADING_SYMBOL` | `trading_symbol` | `symTicker` | `Name` | `tsym` | `trading_symbol` | `ShortName` | `tradingSymbol` | `scripshortname` | `symbol` | `Name` |
| **Token** | `instrument_token` | `SEM_SMST_SECURITY_ID` | `instrument_key` | `fyToken` | `ScripCode` | `token` | `exchange_token` | `ScripCode` | `token` | `scripcode` | `token` | `Scripcode` |
| **Exchange** | `exchange` | `SEM_EXM_EXCH_ID` | `exchange` | `exchangeName` | `Exch` | `exch` | `exchange` | `Exchange` | `exchange` | `exchangename` | `exch_seg` | `Exch` |
| **Name** | `name` | `SM_SYMBOL_NAME` | `name` | `exSymName` | `FullName` | `instname` | `name` | `CompanyName` | `name` | `scripname` | `name` | `FullName` |
| **Expiry** | `expiry` | `SEM_EXPIRY_DATE` | `expiry` | `expiryDate` | `Expiry` | `expiry` | `expiry_date` | `ExpiryDate` | `expiryDate` | `expirydate` | `expiry` | `Expiry` |
| **Strike** | `strike` | `SEM_STRIKE_PRICE` | `strike_price` | `strikePrice` | `StrikeRate` | `strprc` | `strike_price` | `StrikePrice` | `strikePrice` | `strikeprice` | `strike`* | `StrikeRate` |
| **Lot Size** | `lot_size` | `SEM_LOT_UNITS` | `lot_size` | `minLotSize` | `LotSize` | `ls` | `lot_size` | `LotSize` | `lotSize` | `marketlot` | `lotsize` | `LotSize` |
| **Tick Size** | `tick_size` | `SEM_TICK_SIZE` | `tick_size` | `tickSize` | `TickSize` | `ti` | `tick_size` | `TickSize` | `tickSize` | - | `tick_size` | `TickSize` |

*Angel One strike price is in paise (divide by 100)


