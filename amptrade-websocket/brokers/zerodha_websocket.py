"""
Zerodha WebSocket Implementation

Authentication Flow:
1. Client connects with:
   - Firebase token (for app authentication)
   - Broker access token (access_token)
   - Broker user ID (api_key)

2. Server validates:
   - Firebase token using Firebase Admin SDK
   - Broker credentials using broker's API

3. Connection State:
   clients[websocket] maintains per-connection state including:
   - firebase_uid: App user identifier
   - api_key: Broker user identifier (API key)
   - subscribed_symbols: User's active subscriptions
   - quote_queue: Async queue for user's messages

4. Message Routing:
   - Each quote update is sent only to the specific websocket connection
   - Uses websocket object as key to maintain user isolation
   - Prevents cross-user data leakage
"""

import asyncio
import websockets
import json
import logging
import struct
import time
from config import WS_HOST, CONNECTION_DISPLAY_INTERVAL

# Configure logging - only show INFO and above
logging.basicConfig(level=logging.INFO)

# Disable websockets debug logging
logging.getLogger("websockets").setLevel(logging.WARNING)
logging.getLogger("websocket").setLevel(logging.WARNING)

# Global variables with initial values
clients = {}  # Store client connections and their associated API instances
# Format: {websocket: {'subscribed_symbols': set(), 'quote_queue': Queue, 'loop': EventLoop, etc.}}

# Constants
PRINT_INTERVAL = 5  # Interval in seconds for printing quote data

# Define Kite WebSocket endpoint
KITE_WEBSOCKET_URL = "wss://ws.kite.trade"

# Define available data modes
MODE_FULL = "full"  # Market depth
MODE_QUOTE = "quote"  # Regular quote without market depth
MODE_LTP = "ltp"  # Only LTP

# Binary packet sizes based on modes
PACKET_SIZE = {
    MODE_LTP: 8,
    MODE_QUOTE: 44,
    MODE_FULL: 184
}


async def connect_to_kite(api_key, access_token):
    """Establish a connection to the Kite WebSocket"""
    try:
        url = f"{KITE_WEBSOCKET_URL}?api_key={api_key}&access_token={access_token}"
        kws = await websockets.connect(url)
        return kws
    except Exception as e:
        logging.error(f"Error connecting to Kite WS: {e}")
        return None


async def subscribe_symbols(kws, instrument_tokens, mode=MODE_QUOTE):
    """Subscribe to symbols on the Kite WebSocket"""
    try:
        if not instrument_tokens:
            logging.warning("No instrument tokens provided for subscription")
            return False
            
        logging.info(f"Subscribing to {len(instrument_tokens)} tokens with mode: {mode}")
        
        # Subscribe to the tokens first
        message = {"a": "subscribe", "v": instrument_tokens}
        await kws.send(json.dumps(message))
        
        # Small delay to ensure subscription is processed before setting mode
        await asyncio.sleep(0.1)
        
        # Set mode for the subscribed tokens
        mode_message = {"a": "mode", "v": [mode, instrument_tokens]}
        logging.debug(f"Setting mode {mode} for tokens: {instrument_tokens}")
        await kws.send(json.dumps(mode_message))
        
        logging.info(f"Successfully subscribed to {len(instrument_tokens)} tokens with mode: {mode}")
        return True
    except Exception as e:
        logging.error(f"Error subscribing to symbols: {e}")
        return False


async def unsubscribe_symbols(kws, instrument_tokens):
    """Unsubscribe from symbols on the Kite WebSocket"""
    try:
        message = {"a": "unsubscribe", "v": instrument_tokens}
        await kws.send(json.dumps(message))
        return True
    except Exception as e:
        logging.error(f"Error unsubscribing from symbols: {e}")
        return False


def parse_binary_message(binary_data):
    """Parse the binary message received from Kite WebSocket"""
    try:
        # Check if binary data is too short
        if len(binary_data) < 2:
            logging.warning(f"Received binary message too short: {len(binary_data)} bytes")
            return []
            
        packets = []
        offset = 0
        
        # First 2 bytes represent number of packets
        num_packets = struct.unpack('>H', binary_data[offset:offset+2])[0]
        offset += 2
        
        # Sanity check on number of packets
        if num_packets <= 0 or num_packets > 100:  # Arbitrary upper limit for safety
            logging.warning(f"Invalid number of packets: {num_packets}")
            return []
            
        for _ in range(num_packets):
            # Ensure there's enough data for packet length (2 bytes)
            if offset + 2 > len(binary_data):
                logging.warning("Binary message truncated at packet length")
                break
                
            # Next 2 bytes represent the length of the packet
            packet_length = struct.unpack('>H', binary_data[offset:offset+2])[0]
            offset += 2
            
            # Sanity check on packet length
            if packet_length <= 0 or packet_length > 1024:  # Another arbitrary limit
                logging.warning(f"Invalid packet length: {packet_length}")
                continue
                
            # Ensure there's enough data for the packet
            if offset + packet_length > len(binary_data):
                logging.warning("Binary message truncated at packet data")
                break
                
            # Extract the packet data
            packet_data = binary_data[offset:offset+packet_length]
            offset += packet_length
            
            # Parse the packet based on its length
            packet = parse_packet(packet_data)
            packets.append(packet)
            
        return packets
    except Exception as e:
        logging.error(f"Error parsing binary message: {e}, data length: {len(binary_data)}")
        return []


def parse_packet(packet_data):
    """Parse an individual packet based on its size"""
    instrument_token = struct.unpack('>I', packet_data[0:4])[0]
    
    # Extract exchange type from instrument token
    # Exchange type is stored in bits 16-23 of the instrument token
    # Exchange types: 1=NSE, 2=BSE, 3=NFO, 4=CDS, 5=MCX, 7=INDICES
    exchange_type = (instrument_token & 0xff00) >> 8
    
    # Check if this is an index (exchange type 7)
    is_index = exchange_type == 7
    
    # Add logging for index detection
    token_str = str(instrument_token)
    exchange_segment = (instrument_token & 0xFF0000) >> 16
    
    # More reliable index detection: 
    # 1. First digits are 2 and length is 6 for most index tokens (NIFTY family)
    # 2. Very small tokens (under 1000) are likely BSE indices like SENSEX (265)
    is_index_by_pattern = (token_str.startswith('2') and len(token_str) == 6) or (instrument_token < 1000)
    
    # Enhanced logging for index detection
    if is_index or is_index_by_pattern:
        logging.info(f"Index token detected: {instrument_token}, exchange_type={exchange_type}, " 
                    f"starts_with_2={token_str.startswith('2')}, length={len(token_str)}, "
                    f"packet_length={len(packet_data)}")
        
        # Add specific logging for BSE indices like SENSEX
        if instrument_token < 1000:
            logging.info(f"Possible BSE index detected (SENSEX/etc): {instrument_token}")
    
    # Check if this is an index packet (indices like NIFTY, BANKNIFTY, SENSEX)
    if is_index or is_index_by_pattern:
        # Index packets
        if len(packet_data) == 28:
            # This is an index packet in quote mode (28 bytes)
            return parse_index_packet(packet_data, instrument_token)
        elif len(packet_data) == 32:
            # This is an index packet in full mode (32 bytes)
            return parse_index_packet(packet_data, instrument_token)
        else:
            logging.warning(f"Unknown index packet size: {len(packet_data)} for token: {instrument_token}")
            # Try to parse what we can - even if packet size is unexpected, try to extract LTP
            try:
                if len(packet_data) >= 8:  # At least token + LTP
                    ltp = struct.unpack('>I', packet_data[4:8])[0] / 100.0
                    return {
                        "instrument_token": instrument_token,
                        "last_price": ltp,
                        "type": "index"
                    }
            except Exception as e:
                logging.error(f"Failed to extract LTP from unexpected packet size: {e}")
            
            return {"instrument_token": instrument_token, "type": "index"}
    else:
        # Determine the mode based on packet length
        if len(packet_data) == PACKET_SIZE[MODE_LTP]:
            return parse_ltp_packet(packet_data, instrument_token)
        elif len(packet_data) == PACKET_SIZE[MODE_QUOTE]:
            return parse_quote_packet(packet_data, instrument_token)
        elif len(packet_data) == PACKET_SIZE[MODE_FULL]:
            return parse_full_packet(packet_data, instrument_token)
        else:
            logging.warning(f"Unknown packet size: {len(packet_data)} for token: {instrument_token}")
            return {"instrument_token": instrument_token}


def parse_ltp_packet(packet_data, instrument_token):
    """Parse LTP mode packet"""
    ltp = struct.unpack('>I', packet_data[4:8])[0] / 100.0
    
    return {
        "instrument_token": instrument_token,
        "last_price": ltp,
        "type": "ltp"
    }


def parse_quote_packet(packet_data, instrument_token):
    """Parse QUOTE mode packet"""
    ltp = struct.unpack('>I', packet_data[4:8])[0] / 100.0
    
    # Extract other fields
    last_quantity = struct.unpack('>I', packet_data[8:12])[0]
    average_price = struct.unpack('>I', packet_data[12:16])[0] / 100.0
    volume = struct.unpack('>I', packet_data[16:20])[0]
    buy_quantity = struct.unpack('>I', packet_data[20:24])[0]
    sell_quantity = struct.unpack('>I', packet_data[24:28])[0]
    open_price = struct.unpack('>I', packet_data[28:32])[0] / 100.0
    high_price = struct.unpack('>I', packet_data[32:36])[0] / 100.0
    low_price = struct.unpack('>I', packet_data[36:40])[0] / 100.0
    close_price = struct.unpack('>I', packet_data[40:44])[0] / 100.0
    
    return {
        "instrument_token": instrument_token,
        "last_price": ltp,
        "last_quantity": last_quantity,
        "average_price": average_price,
        "volume": volume,
        "buy_quantity": buy_quantity,
        "sell_quantity": sell_quantity,
        "open": open_price,
        "high": high_price,
        "low": low_price,
        "close": close_price,
        "type": "quote"
    }


def parse_full_packet(packet_data, instrument_token):
    """Parse FULL mode packet (including market depth)"""
    # First get the quote part
    quote_data = parse_quote_packet(packet_data[:44], instrument_token)
    
    # Additional fields in full mode
    last_trade_time = struct.unpack('>I', packet_data[44:48])[0]
    oi = struct.unpack('>I', packet_data[48:52])[0]
    oi_day_high = struct.unpack('>I', packet_data[52:56])[0]
    oi_day_low = struct.unpack('>I', packet_data[56:60])[0]
    exchange_timestamp = struct.unpack('>I', packet_data[60:64])[0]
    
    # Parse market depth - 5 buy and 5 sell entries
    depth = {"buy": [], "sell": []}
    
    # Parse buy entries (64 to 124 bytes)
    for i in range(5):
        idx = 64 + (i * 12)
        quantity = struct.unpack('>I', packet_data[idx:idx+4])[0]
        price = struct.unpack('>I', packet_data[idx+4:idx+8])[0] / 100.0
        orders = struct.unpack('>H', packet_data[idx+8:idx+10])[0]
        # Skip 2 bytes of padding
        
        depth["buy"].append({
            "quantity": quantity,
            "price": price,
            "orders": orders
        })
    
    # Parse sell entries (124 to 184 bytes)
    for i in range(5):
        idx = 124 + (i * 12)
        quantity = struct.unpack('>I', packet_data[idx:idx+4])[0]
        price = struct.unpack('>I', packet_data[idx+4:idx+8])[0] / 100.0
        orders = struct.unpack('>H', packet_data[idx+8:idx+10])[0]
        # Skip 2 bytes of padding
        
        depth["sell"].append({
            "quantity": quantity,
            "price": price,
            "orders": orders
        })
    
    # Add to quote data
    quote_data.update({
        "last_trade_time": last_trade_time,
        "oi": oi,
        "oi_day_high": oi_day_high,
        "oi_day_low": oi_day_low,
        "exchange_timestamp": exchange_timestamp,
        "depth": depth,
        "type": "full"
    })
    
    return quote_data


def parse_index_packet(packet_data, instrument_token):
    """Parse index packet (for NIFTY, SENSEX, etc.)"""
    ltp = struct.unpack('>I', packet_data[4:8])[0] / 100.0
    
    # Extract other fields for indices
    high = struct.unpack('>I', packet_data[8:12])[0] / 100.0
    low = struct.unpack('>I', packet_data[12:16])[0] / 100.0
    open_price = struct.unpack('>I', packet_data[16:20])[0] / 100.0
    close_price = struct.unpack('>I', packet_data[20:24])[0] / 100.0
    change = struct.unpack('>I', packet_data[24:28])[0] / 100.0
    
    # Add detailed logging, especially for small tokens like SENSEX
    if instrument_token < 1000:
        logging.info(f"Parsing index packet for token {instrument_token} (small token, likely SENSEX)")
    else:
        logging.info(f"Parsing index packet for token {instrument_token} (starts with {str(instrument_token)[0]}, length {len(str(instrument_token))})")
    
    # Log the index data for debugging
    logging.info(f"Index data for {instrument_token}: LTP={ltp}, Change={change}%")
    
    # For index in quote mode (28 bytes), return with what we have
    if len(packet_data) == 28:
        return {
            "instrument_token": instrument_token,
            "last_price": ltp,
            "high": high,
            "low": low,
            "open": open_price,
            "close": close_price,
            "change": change,
            "type": "index"
        }
    
    # For index in full mode (32 bytes), include exchange timestamp
    elif len(packet_data) == 32:
        exchange_timestamp = struct.unpack('>I', packet_data[28:32])[0]
        return {
            "instrument_token": instrument_token,
            "last_price": ltp,
            "high": high,
            "low": low,
            "open": open_price,
            "close": close_price,
            "change": change,
            "exchange_timestamp": exchange_timestamp,
            "type": "index"
        }
    
    else:
        # Fallback for unexpected packet sizes
        logging.warning(f"Unexpected index packet size: {len(packet_data)}")
        return {
            "instrument_token": instrument_token,
            "last_price": ltp,
            "type": "index"
        }


async def receive_kite_updates(kws, websocket):
    """Receive and process updates from Kite WebSocket"""
    if websocket not in clients:
        return
        
    client_data = clients[websocket]
    
    while True:
        try:
            data = await kws.recv()
            
            # Check message type - binary or text
            if isinstance(data, bytes):
                # Binary market data
                if len(data) < 2:
                    logging.warning(f"Received binary message too small: {len(data)} bytes, skipping")
                    continue
                    
                try:
                    # Detailed logging for troubleshooting
                    if len(data) <= 30:  # Only log detailed info for small packets to avoid noise
                        try:
                            # First few bytes to help with debugging
                            first_bytes = " ".join([f"{b:02x}" for b in data[:min(16, len(data))]])
                            logging.debug(f"Binary message: len={len(data)}, first bytes: {first_bytes}")
                        except Exception:
                            pass  # Ignore logging errors
                    
                    packets = parse_binary_message(data)
                    for packet in packets:
                        # Log information about each packet for debugging
                        token = packet.get("instrument_token")
                        
                        # Enhanced logging for better troubleshooting
                        if "type" in packet:
                            packet_type = packet.get("type", "unknown")
                            if packet_type == "index":
                                logging.debug(f"Received INDEX packet for token {token}: {packet}")
                            else:
                                logging.debug(f"Received {packet_type} packet for token {token}")
                        
                        # Check if token is in subscribed tokens
                        if token in client_data["subscribed_symbols"]:
                            # Add to client's queue
                            await client_data["quote_queue"].put(packet)
                        else:
                            # Enhanced logging to help diagnose subscription issues
                            exchange_type = (token & 0xff00) >> 8
                            segment = token & 0xFF
                            logging.debug(f"Token {token} (exchange_type={exchange_type}, segment={segment}) not in subscribed symbols {client_data['subscribed_symbols']}, ignoring")
                except Exception as e:
                    logging.error(f"Error processing binary data: {e}, data length: {len(data)}")
                    # Optionally log the first few bytes for debugging
                    if len(data) > 10:
                        logging.error(f"First 10 bytes: {data[:10]}")
            else:
                # Text message (JSON)
                try:
                    message = json.loads(data)
                    message_type = message.get("type")
                    
                    # Log the message type for debugging
                    logging.debug(f"Received text message of type: {message_type}")
                    
                    # Check if this is an order update
                    # Zerodha order postbacks have specific fields we can check
                    if "data" in message and isinstance(message["data"], dict):
                        data_content = message["data"]
                        
                        # Check if it contains order-related fields
                        if ("order_id" in data_content or "status" in data_content or 
                            "tradingsymbol" in data_content or "transaction_type" in data_content):
                            # This is likely an order update
                            message["type"] = "order_update"
                            logging.info(f"Identified order update: {message}")
                        elif "type" not in message:
                            # Default postback type if not identified as an order
                            message["type"] = "postback"
                    elif "type" not in message:
                        # General case for text messages without type but with data
                        if "data" in message:
                            message["type"] = "postback"
                    
                    # Add to client's queue
                    await client_data["quote_queue"].put(message)
                    
                except json.JSONDecodeError as e:
                    logging.error(f"Invalid JSON in text message: {e}")
                except Exception as e:
                    logging.error(f"Error processing text message: {e}")
                
        except websockets.exceptions.ConnectionClosed:
            logging.info("Kite WebSocket connection closed")
            break
        except Exception as e:
            logging.error(f"Error processing Kite WebSocket data: {e}")
            # Don't break on every error, only on connection issues
            if "cannot read from closed" in str(e).lower():
                break
            # Add a small delay to prevent tight loops on persistent errors
            await asyncio.sleep(0.5)


async def websocket_server(websocket):
    """Handle client WebSocket connections"""
    kws = None  # Kite WebSocket connection
    
    try:
        # Initialize client-specific data
        clients[websocket] = {
            "subscribed_symbols": set(),
            "quote_queue": asyncio.Queue(),
            "quote_data": {},
            "loop": asyncio.get_running_loop(),
            "api_key": None,  # Will be set after authentication
            "print_task": None,  # For the quote printing task
        }
        # Wait for initial credentials
        try:
            message = await websocket.recv()
        except websockets.exceptions.ConnectionClosedError:
            # Clean up immediately if connection closes before receiving credentials
            await cleanup_client(websocket)
            return

        data = json.loads(message)

        # No Firebase token required

        # Extract broker credentials
        access_token = data.get("access_token", "")
        api_key = data.get("api_key", "")

        if not access_token or not api_key:
            logging.error("Missing credentials")
            await websocket.close(1008, "Missing credentials")
            return

        # Store api_key for logging
        clients[websocket]["api_key"] = api_key


        # Connect to Kite WebSocket
        kws = await connect_to_kite(api_key, access_token)
        if kws:
            clients[websocket]["kws"] = kws
            
            # Start tasks
            receive_task = asyncio.create_task(receive_kite_updates(kws, websocket))
            send_task = asyncio.create_task(send_quote_updates(websocket))
            print_task = asyncio.create_task(print_quote_data(websocket))
            clients[websocket]["print_task"] = print_task
            clients[websocket]["receive_task"] = receive_task
            
            try:
                async for message in websocket:
                    await handle_websocket_message(websocket, message, kws)
            finally:
                if receive_task:
                    receive_task.cancel()
                if send_task:
                    send_task.cancel()
                if print_task:
                    print_task.cancel()
                await cleanup_client(websocket)
        else:
            await websocket.close(1008, "Failed to connect to Kite WebSocket")

    except auth.ExpiredIdTokenError:
        logging.error("Firebase token expired")
        await websocket.close(1008, "Token expired")
    except auth.InvalidIdTokenError:
        logging.error("Invalid Firebase token")
        await websocket.close(1008, "Invalid token")
    except Exception as e:
        logging.error(f"Connection error: {e}")
        await cleanup_client(websocket)  # Ensure cleanup happens on any error
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
            
        # Close Kite WebSocket connection
        if "kws" in client_data and client_data["kws"]:
            try:
                await client_data["kws"].close()
            except Exception as e:
                logging.error(f"Error closing Kite WebSocket: {e}")
        
        # Remove client data
        del clients[websocket]


async def handle_websocket_message(websocket, message, kws):
    """Handle messages received from the client WebSocket"""
    if websocket not in clients:
        return
        
    try:
        data = json.loads(message)
        action = data.get("action", "")
        
        # Extract mode first since it's used in both subscribe and set_mode
        mode = data.get("mode", MODE_QUOTE)
        
        # Validate mode
        if mode not in [MODE_FULL, MODE_QUOTE, MODE_LTP]:
            logging.warning(f"Invalid mode: {mode}, using default: {MODE_QUOTE}")
            mode = MODE_QUOTE
        
        if action == "subscribe":
            # Handle subscription request
            # Check if using numeric tokens format (Zerodha's client format)
            if "tokens" in data and isinstance(data["tokens"], list):
                instrument_tokens = data.get("tokens", [])
                # Validate tokens are integers
                instrument_tokens = [int(token) if isinstance(token, str) else token for token in instrument_tokens]
            else:
                # Handle legacy format with string symbols
                symbols = data.get("symbols", [])
                instrument_tokens = []
                for symbol in symbols:
                    try:
                        # Extract token from the symbol string
                        exchange, token = symbol.split("|")
                        # Add to the tokens list
                        instrument_tokens.append(int(token))
                    except (ValueError, TypeError) as e:
                        logging.error(f"Invalid symbol format: {symbol}, error: {e}")
            
            logging.info(f"Subscribing to {len(instrument_tokens)} tokens with mode: {mode}")
            
            # Subscribe to tokens
            success = await subscribe_symbols(kws, instrument_tokens, mode)
            
            if success:
                # Add to subscribed symbols
                clients[websocket]["subscribed_symbols"].update(instrument_tokens)
                await websocket.send(json.dumps({
                    "type": "subscribe_ack",
                    "tokens": instrument_tokens,
                    "mode": mode,
                    "status": "success"
                }))
            else:
                await websocket.send(json.dumps({
                    "type": "error",
                    "data": "Failed to subscribe to symbols"
                }))
                
        elif action == "unsubscribe":
            # Handle unsubscription request
            # Check if using numeric tokens format
            if "tokens" in data and isinstance(data["tokens"], list):
                instrument_tokens = data.get("tokens", [])
                # Validate tokens are integers
                instrument_tokens = [int(token) if isinstance(token, str) else token for token in instrument_tokens]
            else:
                # Handle legacy format with string symbols
                symbols = data.get("symbols", [])
                instrument_tokens = []
                for symbol in symbols:
                    try:
                        # Extract token from the symbol string
                        exchange, token = symbol.split("|")
                        # Add to the tokens list
                        instrument_tokens.append(int(token))
                    except (ValueError, TypeError) as e:
                        logging.error(f"Invalid symbol format: {symbol}, error: {e}")
            
            logging.info(f"Unsubscribing from {len(instrument_tokens)} tokens")
            
            # Unsubscribe from tokens
            success = await unsubscribe_symbols(kws, instrument_tokens)
            
            if success:
                # Remove from subscribed symbols
                clients[websocket]["subscribed_symbols"] -= set(instrument_tokens)
                await websocket.send(json.dumps({
                    "type": "unsubscribe_ack",
                    "tokens": instrument_tokens,
                    "status": "success"
                }))
            else:
                await websocket.send(json.dumps({
                    "type": "error",
                    "data": "Failed to unsubscribe from symbols"
                }))
                
        elif action == "set_mode":
            # Handle mode change request
            if "tokens" in data and isinstance(data["tokens"], list):
                instrument_tokens = data.get("tokens", [])
                # Validate tokens are integers
                instrument_tokens = [int(token) if isinstance(token, str) else token for token in instrument_tokens]
            else:
                # Handle legacy format with string symbols
                symbols = data.get("symbols", [])
                instrument_tokens = []
                for symbol in symbols:
                    try:
                        # Extract token from the symbol string
                        exchange, token = symbol.split("|")
                        # Add to the tokens list
                        instrument_tokens.append(int(token))
                    except (ValueError, TypeError) as e:
                        logging.error(f"Invalid symbol format: {symbol}, error: {e}")
            
            logging.info(f"Setting mode {mode} for {len(instrument_tokens)} tokens")
                
            # Set mode for tokens - NOTE: Zerodha expects a specific format
            if instrument_tokens:
                try:
                    # Zerodha expects mode message in format: {"a": "mode", "v": ["quote", [tokens]]}
                    mode_message = {"a": "mode", "v": [mode, instrument_tokens]}
                    await kws.send(json.dumps(mode_message))
                    
                    await websocket.send(json.dumps({
                        "type": "mode_ack",
                        "tokens": instrument_tokens,
                        "mode": mode,
                        "status": "success"
                    }))
                except Exception as e:
                    logging.error(f"Error setting mode: {e}")
                    await websocket.send(json.dumps({
                        "type": "error",
                        "data": f"Failed to set mode: {str(e)}"
                    }))
            else:
                await websocket.send(json.dumps({
                    "type": "error",
                    "data": "No tokens specified for mode change"
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
            # Get quote update from queue
            quote = await client_data["quote_queue"].get()
            
            # Send to client
            await websocket.send(json.dumps(quote))
            
        except Exception as e:
            logging.error(f"Error sending quote update: {e}")
            break


async def print_quote_data(websocket):
    """Periodically print quote data to console for a specific client"""
    while websocket in clients:
        await asyncio.sleep(PRINT_INTERVAL)
        client_data = clients[websocket]
        current_time = time.strftime("%d-%m-%Y %H:%M:%S")

        print(f"\n{'='*50}")
        print(f"Broker: Zerodha")
        print(f"Broker User ID: {client_data.get('api_key', 'Unknown')}")
        print(f"Time: {current_time}")
        
        # Check if Kite websocket is still connected
        if "kws" in client_data and client_data["kws"]:
            try:
                if client_data["kws"].closed:
                    logging.warning(f"Detected Kite WebSocket connection drop for user {client_data.get('api_key', 'Unknown')}")
                    try:
                        disconnect_message = {
                            "type": "broker_disconnected",
                            "code": "CONNECTION_LOST",
                            "message": "Broker connection was lost, reconnection required"
                        }
                        await websocket.send(json.dumps(disconnect_message))
                    except Exception as e:
                        logging.error(f"Error notifying client of broker disconnection: {e}")
            except Exception as e:
                logging.debug(f"Error checking Kite WebSocket status: {e}")
        
        print(f"Subscribed Symbols: {len(client_data['subscribed_symbols'])}")
        print(f"{'='*50}\n")
        client_data["quote_data"].clear()


async def main(port):
    """Start the WebSocket server"""
    async with websockets.serve(websocket_server, WS_HOST, port):
        logging.info(f"Zerodha WebSocket server started on port {port}")
        # Keep the server running
        await asyncio.Future()


def get_connection_count():
    """Return the current number of active connections"""
    return len(clients)


if __name__ == "__main__":
    import sys
    PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8794  # Default port
    asyncio.run(main(PORT)) 
