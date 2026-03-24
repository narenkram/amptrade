"""
Upstox WebSocket V3 Implementation

Authentication Flow:
1. Client connects with:
   - Firebase token (for app authentication)
   - Broker access token (access_token)

2. Server validates:
   - Firebase token using Firebase Admin SDK
   - Gets authorized WebSocket URL from Upstox API

3. Connection State:
   clients[websocket] maintains per-connection state including:
   - firebase_uid: App user identifier
   - subscribed_symbols: User's active subscriptions
   - quote_queue: Async queue for user's messages

4. Upstox V3 WebSocket Format:
   - Subscribe: {"guid": "unique-id", "method": "sub", "data": {"mode": "ltpc", "instrumentKeys": ["NSE_EQ|2885"]}}
   - Unsubscribe: {"guid": "unique-id", "method": "unsub", "data": {"instrumentKeys": ["NSE_EQ|2885"]}}
   - Response: {"type": "live_feed", "feeds": {"NSE_EQ|2885": {"ltpc": {"ltp": 100.5, "ltt": "123", "ltq": "10", "cp": 99.0}}}}
"""

import asyncio
import websockets
import json
import logging
import uuid
import time
import aiohttp
from config import WS_HOST, CONNECTION_DISPLAY_INTERVAL

# Import Protobuf message classes
from brokers import MarketDataFeed_pb2

# Configure logging
logging.basicConfig(level=logging.INFO)

# Disable websockets debug logging
logging.getLogger("websockets").setLevel(logging.WARNING)
logging.getLogger("websocket").setLevel(logging.WARNING)

# Global variables
clients = {}  # Store client connections and their associated data

# Upstox API endpoints
UPSTOX_API_BASE = "https://api.upstox.com"
UPSTOX_WS_AUTH_URL = f"{UPSTOX_API_BASE}/v3/feed/market-data-feed/authorize"

# Constants
PRINT_INTERVAL = 5


async def get_upstox_websocket_url(access_token):
    """Get authorized WebSocket URL from Upstox API"""
    try:
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json"
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.get(UPSTOX_WS_AUTH_URL, headers=headers) as response:
                if response.status == 200:
                    data = await response.json()
                    if data.get("status") == "success":
                        return data["data"]["authorized_redirect_uri"]
                    else:
                        logging.error(f"Upstox API error: {data}")
                        return None
                else:
                    error_text = await response.text()
                    logging.error(f"Failed to get Upstox WS URL: {response.status} - {error_text}")
                    return None
    except Exception as e:
        logging.error(f"Error getting Upstox WebSocket URL: {e}")
        return None


async def connect_to_upstox(websocket_url):
    """Establish a connection to the Upstox WebSocket"""
    try:
        uws = await websockets.connect(websocket_url, compression=None)
        logging.info("Connected to Upstox WebSocket")
        return uws
    except Exception as e:
        logging.error(f"Error connecting to Upstox WS: {e}")
        return None


def generate_guid():
    """Generate a unique GUID for Upstox requests"""
    return str(uuid.uuid4())[:20]


async def subscribe_symbols(uws, instrument_keys, mode="ltpc"):
    """Subscribe to symbols on the Upstox WebSocket
    
    Upstox V3 WebSocket requires subscription messages to be sent as binary-encoded JSON.
    """
    try:
        if not instrument_keys:
            logging.warning("No instrument keys provided for subscription")
            return False
        
        logging.debug(f"Subscribing to {len(instrument_keys)} instruments with mode: {mode}")
        
        message = {
            "guid": generate_guid(),
            "method": "sub",
            "data": {
                "mode": mode,
                "instrumentKeys": instrument_keys
            }
        }
        
        # Upstox V3 requires binary-encoded JSON for subscriptions
        binary_message = json.dumps(message).encode('utf-8')
        await uws.send(binary_message)
        
        logging.debug(f"Successfully subscribed to {len(instrument_keys)} instruments")
        return True
    except Exception as e:
        logging.error(f"Error subscribing to symbols: {e}")
        return False


async def unsubscribe_symbols(uws, instrument_keys):
    """Unsubscribe from symbols on the Upstox WebSocket"""
    try:
        message = {
            "guid": generate_guid(),
            "method": "unsub",
            "data": {
                "instrumentKeys": instrument_keys
            }
        }
        # Upstox V3 requires binary-encoded JSON
        binary_message = json.dumps(message).encode('utf-8')
        await uws.send(binary_message)
        return True
    except Exception as e:
        logging.error(f"Error unsubscribing from symbols: {e}")
        return False


def parse_upstox_message(data):
    """Parse Upstox WebSocket message and convert to standardized format"""
    try:
        message_type = data.get("type", "")
        
        if message_type == "market_info":
            # Market status message
            return {"type": "market_info", "data": data.get("marketInfo", {})}
        
        elif message_type in ("live_feed", "initial_feed"):
            # Live market data or initial snapshot - both have same structure
            feeds = data.get("feeds", {})
            parsed_quotes = []
            
            for instrument_key, feed_data in feeds.items():
                # Extract exchange and token from instrument_key (e.g., "NSE_FO|59182")
                parts = instrument_key.split("|")
                exchange = parts[0] if len(parts) > 0 else ""
                numeric_token = parts[1] if len(parts) > 1 else instrument_key
                
                # Use full instrument_key as tk for frontend matching
                # Frontend subscribes with full format like "NSE_FO|59182"
                quote = {
                    "tk": instrument_key,  # Full instrument key for matching
                    "e": exchange,
                }
                
                # Handle LTPC mode
                if "ltpc" in feed_data:
                    ltpc = feed_data["ltpc"]
                    quote.update({
                        "lp": ltpc.get("ltp", 0),
                        "c": ltpc.get("cp", 0),  # Close price
                    })
                
                # Handle Full mode with greeks
                if "firstLevelWithGreeks" in feed_data:
                    full_data = feed_data["firstLevelWithGreeks"]
                    if "ltpc" in full_data:
                        ltpc = full_data["ltpc"]
                        quote.update({
                            "lp": ltpc.get("ltp", 0),
                            "c": ltpc.get("cp", 0),
                        })
                    if "optionGreeks" in full_data:
                        greeks = full_data["optionGreeks"]
                        quote.update({
                            "delta": greeks.get("delta"),
                            "theta": greeks.get("theta"),
                            "gamma": greeks.get("gamma"),
                            "vega": greeks.get("vega"),
                            "iv": full_data.get("iv"),
                        })
                    quote["oi"] = full_data.get("oi", 0)
                    quote["v"] = full_data.get("vtt", 0)
                
                # Handle Full Feed mode
                if "fullFeed" in feed_data:
                    market_ff = feed_data["fullFeed"].get("marketFF", {})
                    if "ltpc" in market_ff:
                        ltpc = market_ff["ltpc"]
                        quote.update({
                            "lp": ltpc.get("ltp", 0),
                            "c": ltpc.get("cp", 0),
                        })
                    if "marketOHLC" in market_ff:
                        ohlc_list = market_ff["marketOHLC"].get("ohlc", [])
                        for ohlc in ohlc_list:
                            if ohlc.get("interval") == "1d":
                                quote.update({
                                    "o": ohlc.get("open", 0),
                                    "h": ohlc.get("high", 0),
                                    "l": ohlc.get("low", 0),
                                })
                                break
                    if "optionGreeks" in market_ff:
                        greeks = market_ff["optionGreeks"]
                        quote.update({
                            "delta": greeks.get("delta"),
                            "theta": greeks.get("theta"),
                            "gamma": greeks.get("gamma"),
                            "vega": greeks.get("vega"),
                            "iv": market_ff.get("iv"),
                        })
                    quote["oi"] = market_ff.get("oi", 0)
                    quote["v"] = market_ff.get("vtt", 0)
                    quote["ap"] = market_ff.get("atp", 0)
                
                parsed_quotes.append(quote)
            
            return parsed_quotes
        
        return None
    except Exception as e:
        logging.error(f"Error parsing Upstox message: {e}")
        return None


async def receive_upstox_updates(uws, websocket):
    """Receive and process updates from Upstox WebSocket
    
    Upstox V3 sends messages in this order:
    1. market_info (JSON) - Market status
    2. snapshot (Protobuf) - Initial data  
    3. live_feed (Protobuf) - Real-time updates
    """
    if websocket not in clients:
        return
    
    client_data = clients[websocket]
    message_count = 0
    
    while True:
        try:
            data = await uws.recv()
            message_count += 1
            
            # Debug: Log raw data info (only first 3 messages)
            if message_count <= 3:
                logging.debug(f"Received message #{message_count}, type: {type(data)}, length: {len(data) if data else 0}")
            
            # First try to decode as JSON (market_info comes as JSON)
            is_json = False
            try:
                if isinstance(data, bytes):
                    json_data = json.loads(data.decode('utf-8'))
                else:
                    json_data = json.loads(data)
                is_json = True
                
                # Check if this is market_info message
                if json_data.get("type") == "market_info":
                    if message_count <= 3:
                        logging.debug(f"Received market_info: {json_data}")
                    continue  # Skip market_info for now
                
                # If it's some other JSON message, log and continue
                if message_count <= 3:
                    logging.debug(f"Received JSON message: {json_data}")
                continue
                
            except (json.JSONDecodeError, UnicodeDecodeError):
                # Not JSON, will try Protobuf
                is_json = False
            
            # If not JSON, try Protobuf decoding
            if not is_json:
                try:
                    # Decode Protobuf binary message
                    feed_response = MarketDataFeed_pb2.FeedResponse()
                    feed_response.ParseFromString(data)
                    
                    # Debug: Log decoded response info
                    if message_count <= 3:
                        logging.debug(f"Decoded FeedResponse - type: {feed_response.type}, feeds count: {len(feed_response.feeds)}")
                        for key in list(feed_response.feeds.keys())[:3]:
                            logging.debug(f"Feed key: {key}")
                    
                    # Skip if no feeds
                    if len(feed_response.feeds) == 0:
                        if message_count <= 3:
                            logging.debug(f"No feeds in message, skipping")
                        continue
                    
                    # Convert to dict-like structure for parsing
                    message = {
                        "type": "live_feed" if feed_response.type == 1 else "initial_feed",
                        "feeds": {}
                    }
                    
                    for instrument_key, feed in feed_response.feeds.items():
                        feed_dict = {}
                        
                        # Check which type of feed we have
                        if feed.HasField("ltpc"):
                            feed_dict["ltpc"] = {
                                "ltp": feed.ltpc.ltp,
                                "ltt": feed.ltpc.ltt,
                                "ltq": feed.ltpc.ltq,
                                "cp": feed.ltpc.cp
                            }
                            if message_count <= 3:
                                logging.debug(f"LTPC data for {instrument_key}: ltp={feed.ltpc.ltp}")
                        elif feed.HasField("ff"):
                            full_feed = feed.ff
                            if full_feed.HasField("marketFF"):
                                mff = full_feed.marketFF
                                feed_dict["fullFeed"] = {
                                    "marketFF": {
                                        "ltpc": {
                                            "ltp": mff.ltpc.ltp,
                                            "ltt": mff.ltpc.ltt,
                                            "ltq": mff.ltpc.ltq,
                                            "cp": mff.ltpc.cp
                                        } if mff.HasField("ltpc") else {},
                                        "optionGreeks": {
                                            "delta": mff.optionGreeks.delta,
                                            "theta": mff.optionGreeks.theta,
                                            "gamma": mff.optionGreeks.gamma,
                                            "vega": mff.optionGreeks.vega,
                                            "iv": mff.optionGreeks.iv
                                        } if mff.HasField("optionGreeks") else {}
                                    }
                                }
                                if message_count <= 3:
                                    logging.debug(f"MarketFF data for {instrument_key}")
                            elif full_feed.HasField("indexFF"):
                                iff = full_feed.indexFF
                                feed_dict["fullFeed"] = {
                                    "indexFF": {
                                        "ltpc": {
                                            "ltp": iff.ltpc.ltp,
                                            "ltt": iff.ltpc.ltt,
                                            "ltq": iff.ltpc.ltq,
                                            "cp": iff.ltpc.cp
                                        } if iff.HasField("ltpc") else {}
                                    }
                                }
                                if message_count <= 3:
                                    logging.debug(f"IndexFF data for {instrument_key}")
                        elif feed.HasField("oc"):
                            oc = feed.oc
                            feed_dict["optionChain"] = {
                                "ltpc": {
                                    "ltp": oc.ltpc.ltp,
                                    "ltt": oc.ltpc.ltt,
                                    "ltq": oc.ltpc.ltq,
                                    "cp": oc.ltpc.cp
                                } if oc.HasField("ltpc") else {},
                                "optionGreeks": {
                                    "delta": oc.optionGreeks.delta,
                                    "theta": oc.optionGreeks.theta,
                                    "gamma": oc.optionGreeks.gamma,
                                    "vega": oc.optionGreeks.vega,
                                    "iv": oc.optionGreeks.iv
                                } if oc.HasField("optionGreeks") else {}
                            }
                            if message_count <= 3:
                                logging.debug(f"OptionChain data for {instrument_key}")
                        else:
                            if message_count <= 3:
                                logging.debug(f"Unknown feed type for {instrument_key}")
                        
                        message["feeds"][instrument_key] = feed_dict
                    
                    # Debug: Log message before parsing
                    if message_count <= 3:
                        logging.debug(f"Message to parse: {message}")
                    
                    # Parse the message
                    parsed = parse_upstox_message(message)
                    
                    if message_count <= 3:
                        logging.debug(f"Parsed result: {parsed}")
                    
                    if parsed and isinstance(parsed, list):
                        for quote in parsed:
                            # tk is now the full instrument key (e.g., "NSE_INDEX|Nifty 50")
                            instrument_key = quote.get("tk", "")
                            
                            if message_count <= 3:
                                logging.debug(f"Checking instrument_key: {instrument_key} against subscribed: {client_data['subscribed_symbols']}")
                            
                            # Check if this instrument is subscribed
                            if instrument_key in client_data["subscribed_symbols"]:
                                # Add to client's queue
                                await client_data["quote_queue"].put(quote)
                                if message_count <= 3:
                                    logging.debug(f"Added quote to queue for {instrument_key}")
                            else:
                                if message_count <= 3:
                                    logging.debug(f"Instrument {instrument_key} not in subscribed symbols")
                    
                except Exception as e:
                    logging.error(f"Error decoding Protobuf message: {e}")
                    import traceback
                    traceback.print_exc()
            
        except websockets.exceptions.ConnectionClosed:
            logging.info("Upstox WebSocket connection closed")
            break
        except Exception as e:
            logging.error(f"Error processing Upstox WebSocket data: {e}")
            if "cannot read from closed" in str(e).lower():
                break
            await asyncio.sleep(0.5)


async def websocket_server(websocket):
    """Handle client WebSocket connections"""
    uws = None  # Upstox WebSocket connection
    
    try:
        # Initialize client-specific data
        clients[websocket] = {
            "subscribed_symbols": set(),
            "quote_queue": asyncio.Queue(),
            "quote_data": {},
            "loop": asyncio.get_running_loop(),
            "access_token": None,
            "print_task": None,
        }

        # Wait for initial credentials
        try:
            message = await websocket.recv()
        except websockets.exceptions.ConnectionClosedError:
            await cleanup_client(websocket)
            return

        data = json.loads(message)

        # No Firebase token required

        # Extract broker credentials
        access_token = data.get("access_token", "")

        if not access_token:
            logging.error("Missing access token")
            await websocket.close(1008, "Missing credentials")
            return

        # Store access token
        clients[websocket]["access_token"] = access_token


        # Get Upstox WebSocket URL
        ws_url = await get_upstox_websocket_url(access_token)
        if not ws_url:
            await websocket.close(1008, "Failed to get Upstox WebSocket URL")
            return

        # Connect to Upstox WebSocket
        uws = await connect_to_upstox(ws_url)
        if uws:
            clients[websocket]["uws"] = uws
            
            # Send broker connected notification
            await websocket.send(json.dumps({
                "type": "broker_connected",
                "message": "Connected to Upstox WebSocket"
            }))
            
            # Start tasks
            receive_task = asyncio.create_task(receive_upstox_updates(uws, websocket))
            send_task = asyncio.create_task(send_quote_updates(websocket))
            print_task = asyncio.create_task(print_quote_data(websocket))
            clients[websocket]["print_task"] = print_task
            clients[websocket]["receive_task"] = receive_task
            
            try:
                async for message in websocket:
                    await handle_websocket_message(websocket, message, uws)
            finally:
                if receive_task:
                    receive_task.cancel()
                if send_task:
                    send_task.cancel()
                if print_task:
                    print_task.cancel()
                await cleanup_client(websocket)
        else:
            await websocket.close(1008, "Failed to connect to Upstox WebSocket")

    except Exception as e:
        logging.error(f"Connection error: {e}")
        await cleanup_client(websocket)
    finally:
        await cleanup_client(websocket)


async def cleanup_client(websocket):
    """Clean up client resources when connection is closed"""
    if websocket in clients:
        client_data = clients[websocket]
        
        # Cancel any running tasks
        if "print_task" in client_data and client_data["print_task"]:
            client_data["print_task"].cancel()
        
        if "receive_task" in client_data and client_data["receive_task"]:
            client_data["receive_task"].cancel()
            
        # Close Upstox WebSocket connection
        if "uws" in client_data and client_data["uws"]:
            try:
                await client_data["uws"].close()
            except Exception as e:
                logging.error(f"Error closing Upstox WebSocket: {e}")
        
        # Remove client data
        del clients[websocket]


async def handle_websocket_message(websocket, message, uws):
    """Handle messages received from the client WebSocket"""
    if websocket not in clients:
        return
    
    try:
        data = json.loads(message)
        action = data.get("action", "")
        
        if action == "subscribe":
            # Get symbols - can be in different formats
            symbols = data.get("symbols", [])
            logging.debug(f"Received subscribe request with raw symbols: {symbols}")
            
            instrument_keys = []
            
            for symbol in symbols:
                parts = symbol.split("|")
                
                # Handle different formats:
                # 1. "exchange|exchange_type|token" (e.g., "NFO|NSE_FO|59182") - 3 parts
                # 2. "exchange|token" (e.g., "NFO|59182" or "NSE_FO|59182") - 2 parts  
                # 3. Just token (e.g., "59182") - 1 part
                
                if len(parts) == 3:
                    # Format: NFO|NSE_FO|59182 - the middle part is already Upstox exchange
                    # The instrument key is "upstox_exchange|token"
                    upstox_exchange = parts[1]  # Already in Upstox format (NSE_FO)
                    token = parts[2]
                    instrument_key = f"{upstox_exchange}|{token}"
                    logging.debug(f"Converted (3-part) {symbol} -> {instrument_key}")
                    instrument_keys.append(instrument_key)
                    
                elif len(parts) == 2:
                    exchange, token = parts
                    # Map exchange names to Upstox format
                    exchange_map = {
                        "NSE": "NSE_EQ",
                        "BSE": "BSE_EQ",
                        "NFO": "NSE_FO",
                        "BFO": "BSE_FO",
                        "MCX": "MCX_FO",
                        "CDS": "CDS_FO",
                        # Already in Upstox format
                        "NSE_EQ": "NSE_EQ",
                        "BSE_EQ": "BSE_EQ",
                        "NSE_FO": "NSE_FO",
                        "BSE_FO": "BSE_FO",
                        "MCX_FO": "MCX_FO",
                        "CDS_FO": "CDS_FO",
                        "NSE_INDEX": "NSE_INDEX",
                        "BSE_INDEX": "BSE_INDEX",
                    }
                    upstox_exchange = exchange_map.get(exchange.upper(), exchange)
                    instrument_key = f"{upstox_exchange}|{token}"
                    logging.debug(f"Converted (2-part) {symbol} -> {instrument_key}")
                    instrument_keys.append(instrument_key)
                    
                else:
                    # Just a token or already in correct format
                    logging.debug(f"Using as-is: {symbol}")
                    instrument_keys.append(symbol)
            
            # Get mode (default to ltpc for LTP)
            mode = data.get("mode", "ltpc")
            
            logging.debug(f"Final instrument_keys to subscribe: {instrument_keys}")
            logging.info(f"Subscribing to {len(instrument_keys)} instruments with mode: {mode}")
            
            success = await subscribe_symbols(uws, instrument_keys, mode)
            
            if success:
                # Add to subscribed symbols
                clients[websocket]["subscribed_symbols"].update(instrument_keys)
                await websocket.send(json.dumps({
                    "type": "subscribe_ack",
                    "symbols": instrument_keys,
                    "mode": mode,
                    "status": "success"
                }))
            else:
                await websocket.send(json.dumps({
                    "type": "error",
                    "data": "Failed to subscribe to symbols"
                }))
                
        elif action == "unsubscribe":
            symbols = data.get("symbols", [])
            instrument_keys = []
            
            for symbol in symbols:
                if "|" in symbol:
                    parts = symbol.split("|")
                    if len(parts) == 2:
                        exchange, token = parts
                        exchange_map = {
                            "NSE": "NSE_EQ",
                            "BSE": "BSE_EQ",
                            "NFO": "NSE_FO",
                            "BFO": "BSE_FO",
                            "MCX": "MCX_FO",
                            "CDS": "CDS_FO",
                        }
                        upstox_exchange = exchange_map.get(exchange.upper(), exchange)
                        instrument_keys.append(f"{upstox_exchange}|{token}")
                else:
                    instrument_keys.append(symbol)
            
            logging.info(f"Unsubscribing from {len(instrument_keys)} instruments")
            
            success = await unsubscribe_symbols(uws, instrument_keys)
            
            if success:
                clients[websocket]["subscribed_symbols"] -= set(instrument_keys)
                await websocket.send(json.dumps({
                    "type": "unsubscribe_ack",
                    "symbols": instrument_keys,
                    "status": "success"
                }))
            else:
                await websocket.send(json.dumps({
                    "type": "error",
                    "data": "Failed to unsubscribe from symbols"
                }))
        else:
            await websocket.send(json.dumps({
                "type": "error",
                "data": f"Unknown action: {action}"
            }))
            
    except json.JSONDecodeError:
        await websocket.send(json.dumps({
            "type": "error",
            "data": "Invalid JSON format"
        }))
    except Exception as e:
        logging.error(f"Error handling message: {e}")
        await websocket.send(json.dumps({
            "type": "error",
            "data": "Internal server error"
        }))


async def send_quote_updates(websocket):
    """Send quote updates to the client"""
    if websocket not in clients:
        return
    
    client_data = clients[websocket]
    
    while True:
        try:
            # Get quotes from queue
            quote = await client_data["quote_queue"].get()
            
            # Send to client
            await websocket.send(json.dumps(quote))
            
        except asyncio.CancelledError:
            break
        except Exception as e:
            logging.error(f"Error sending quote update: {e}")
            break


async def print_quote_data(websocket):
    """Periodically print quote data to console for a specific client"""
    if websocket not in clients:
        return
    
    client_data = clients[websocket]
    
    while True:
        try:
            await asyncio.sleep(PRINT_INTERVAL)
            
            current_time = time.strftime("%d-%m-%Y %H:%M:%S")
            
            print(f"\n{'='*50}")
            print(f"Broker: Upstox")
            print(f"Broker User ID: {client_data.get('access_token', 'Unknown')[:20]}...")
            print(f"Time: {current_time}")
            print(f"Subscribed Symbols: {len(client_data.get('subscribed_symbols', set()))}")
            print(f"{'='*50}\n")
                
        except asyncio.CancelledError:
            break
        except Exception as e:
            logging.error(f"Error in print_quote_data: {e}")
            break


async def main(port):
    """Start the WebSocket server"""
    server = await websockets.serve(websocket_server, WS_HOST, port)
    logging.info(f"Upstox WebSocket server started on port {port}")
    
    await server.wait_closed()


def get_connection_count():
    """Return the current number of active connections"""
    return len(clients)


if __name__ == "__main__":
    import sys
    PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8795
    asyncio.run(main(PORT))
