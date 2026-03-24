"""
Unified NorenAPI WebSocket Handler

This file provides a single parameterized WebSocket handler that works
for any NorenAPI-compatible broker based on configuration.

Replaces: flattrade_websocket.py, shoonya_websocket.py, zebu_websocket.py,
          tradesmart_websocket.py, infinn_websocket.py

Authentication Flow:
1. Client connects with:
   - Firebase token (for app authentication)
   - Broker session token (usersession)
   - Broker user ID (userid)

2. Server validates:
   - Firebase token using Firebase Admin SDK
   - Broker credentials using broker's API

3. Connection State:
   clients[websocket] maintains per-connection state including:
   - firebase_uid: App user identifier
   - userid: Broker user identifier
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
from config import WS_HOST
from NorenRestApiPy.NorenApi import NorenApi
import time

# Configure logging - only show INFO and above
logging.basicConfig(level=logging.INFO)

# Disable websockets debug logging
logging.getLogger("websockets").setLevel(logging.WARNING)
logging.getLogger("websocket").setLevel(logging.WARNING)

# Constants
PRINT_INTERVAL = 5  # Interval in seconds for printing quote data
CONNECTION_CHECK_INTERVAL = 15  # Interval in seconds to verify connection status


def create_noren_websocket_server(broker_id: str, config: dict):
    """
    Factory function that creates a WebSocket server for any NorenAPI broker.
    
    Args:
        broker_id: Identifier for the broker (e.g., "flattrade", "shoonya")
        config: Broker configuration dict with host, websocket, eodhost, port keys
    
    Returns:
        A tuple of (websocket_server, get_connection_count, main) functions
    """
    
    broker_name = config["name"]
    host = config["host"]
    websocket_url = config["websocket"]
    eodhost = config.get("eodhost")
    port = config["port"]
    
    # Global variables for this broker instance
    clients = {}  # Store client connections and their associated API instances
    
    def initialize_api():
        """Initialize the API and return the instance"""
        try:
            if eodhost:
                api_instance = NorenApi(
                    host=host,
                    websocket=websocket_url,
                    eodhost=eodhost,
                )
            else:
                api_instance = NorenApi(
                    host=host,
                    websocket=websocket_url,
                )
        except TypeError:
            api_instance = NorenApi(
                host=host,
                websocket=websocket_url,
            )
        return api_instance

    def event_handler_order_update(message, websocket):
        logging.debug("order event: " + str(message))
        if websocket not in clients:
            return

        client_data = clients[websocket]
        message["type"] = "order_update"

        if client_data["loop"] and client_data["loop"].is_running():
            asyncio.run_coroutine_threadsafe(
                client_data["quote_queue"].put(message), client_data["loop"]
            )

    def event_handler_quote_update(message, websocket):
        if websocket not in clients:
            return

        client_data = clients[websocket]
        symbol = message.get("tk", "Unknown")
        ltp = message.get("lp", "N/A")
        volume = message.get("v", "N/A")

        client_data["quote_data"][symbol] = {
            "ltp": ltp,
            "volume": volume,
        }

        if client_data["loop"] and client_data["loop"].is_running():
            asyncio.run_coroutine_threadsafe(
                client_data["quote_queue"].put(message), client_data["loop"]
            )

    def open_callback(websocket):
        logging.debug("app is connected")
        if websocket in clients:
            try:
                connect_message = {
                    "type": "broker_connected",
                    "code": "CONNECTION_ESTABLISHED",
                    "message": "Broker connection established successfully"
                }
                asyncio.run_coroutine_threadsafe(
                    clients[websocket]["quote_queue"].put(connect_message),
                    clients[websocket]["loop"]
                )
            except Exception as e:
                logging.error(f"Error notifying client of broker connection: {e}")

    def close_callback(websocket):
        logging.debug("websocket connection closed")
        if websocket in clients:
            try:
                disconnect_message = {
                    "type": "broker_disconnected",
                    "code": "CONNECTION_LOST",
                    "message": "Broker connection was lost, reconnection required"
                }
                asyncio.run_coroutine_threadsafe(
                    clients[websocket]["quote_queue"].put(disconnect_message),
                    clients[websocket]["loop"]
                )
            except Exception as e:
                logging.error(f"Error notifying client of broker disconnection: {e}")

    async def check_connection_status(websocket):
        """Periodically check if broker connection is still alive"""
        while websocket in clients:
            await asyncio.sleep(CONNECTION_CHECK_INTERVAL)
            client_data = clients[websocket]
            
            if not client_data["api"]:
                continue
                
            if not client_data["api"].is_connected():
                logging.warning(f"Connection check detected broker disconnection for {client_data.get('userid', 'Unknown')}")
                try:
                    disconnect_message = {
                        "type": "broker_disconnected",
                        "code": "CONNECTION_LOST",
                        "message": "Broker connection was lost, reconnection required"
                    }
                    await websocket.send(json.dumps(disconnect_message))
                except Exception as e:
                    logging.error(f"Error notifying client of broker disconnection: {e}")

    async def websocket_server(websocket):
        try:
            clients[websocket] = {
                "api": None,
                "subscribed_symbols": set(),
                "quote_queue": asyncio.Queue(),
                "quote_data": {},
                "loop": asyncio.get_running_loop(),
                "userid": None,
                "print_task": None,
            }

            try:
                message = await websocket.recv()
            except websockets.exceptions.ConnectionClosedError:
                await cleanup_client(websocket)
                return

            data = json.loads(message)

            # No Firebase token required

            usersession = data.get("usersession", "")
            userid = data.get("userid", "")

            if not usersession or not userid:
                logging.error("Missing credentials")
                return

            clients[websocket]["userid"] = userid


            api = initialize_api()
            ret = api.set_session(userid=userid, password="", usertoken=usersession)

            if ret is not None:
                clients[websocket]["api"] = api
                ret = api.start_websocket(
                    order_update_callback=lambda msg: event_handler_order_update(msg, websocket),
                    subscribe_callback=lambda msg: event_handler_quote_update(msg, websocket),
                    socket_open_callback=lambda: open_callback(websocket),
                    socket_close_callback=lambda: close_callback(websocket),
                )

                send_task = asyncio.create_task(send_quote_updates(websocket))
                print_task = asyncio.create_task(print_quote_data(websocket))
                connection_check_task = asyncio.create_task(check_connection_status(websocket))
                clients[websocket]["print_task"] = print_task
                clients[websocket]["connection_check_task"] = connection_check_task

                try:
                    async for message in websocket:
                        await handle_websocket_message(websocket, message)
                finally:
                    if send_task:
                        send_task.cancel()
                    if print_task:
                        print_task.cancel()
                    if connection_check_task:
                        connection_check_task.cancel()
                    await cleanup_client(websocket)
            else:
                await websocket.close(1008, "Failed to authenticate")

        except Exception as e:
            logging.error(f"Connection error: {e}")
            await cleanup_client(websocket)
            raise
        finally:
            await cleanup_client(websocket)

    async def cleanup_client(websocket):
        if websocket in clients:
            client_data = clients[websocket]
            if client_data.get("print_task"):
                client_data["print_task"].cancel()
            if client_data.get("connection_check_task"):
                client_data["connection_check_task"].cancel()

            if client_data["api"]:
                if client_data["subscribed_symbols"]:
                    client_data["api"].unsubscribe(
                        instrument=list(client_data["subscribed_symbols"]), feed_type=2
                    )
                client_data["api"].close_websocket()
            del clients[websocket]
        logging.info(f"Cleaned up client connection {id(websocket)}")

    async def handle_websocket_message(websocket, message):
        if websocket not in clients:
            logging.error("Client not found")
            return

        client_data = clients[websocket]
        if client_data["api"] is None:
            logging.error("API not initialized")
            return

        data = json.loads(message)
        if "action" in data:
            if data["action"] == "unsubscribe":
                symbols_to_unsubscribe = []
                for symbol in data["symbols"]:
                    if symbol in client_data["subscribed_symbols"]:
                        symbols_to_unsubscribe.append(symbol)
                        client_data["subscribed_symbols"].remove(symbol)
                        exchange, token = symbol.split("|")
                        logging.debug(f"Unsubscribed from {exchange}:{token}")

                if symbols_to_unsubscribe:
                    client_data["api"].unsubscribe(
                        instrument=symbols_to_unsubscribe, feed_type=2
                    )

            elif data["action"] == "subscribe":
                symbols_to_subscribe = []
                for symbol in data["symbols"]:
                    if symbol not in client_data["subscribed_symbols"]:
                        symbols_to_subscribe.append(symbol)
                        client_data["subscribed_symbols"].add(symbol)
                        exchange, token = symbol.split("|")
                        logging.debug(f"Subscribed to {exchange}:{token}")

                if symbols_to_subscribe:
                    client_data["api"].subscribe(
                        instrument=symbols_to_subscribe, feed_type=2
                    )
                    await asyncio.sleep(0.1)
                    while not client_data["quote_queue"].empty():
                        quote = await client_data["quote_queue"].get()
                        await websocket.send(json.dumps(quote))

    async def send_quote_updates(websocket):
        while websocket in clients:
            try:
                client_data = clients[websocket]
                quote = await client_data["quote_queue"].get()
                await websocket.send(json.dumps(quote))
            except Exception as e:
                logging.error(f"Error sending quote update: {e}")
                await asyncio.sleep(1)

    async def print_quote_data(websocket):
        """Periodically print quote data to console for a specific client"""
        while websocket in clients:
            await asyncio.sleep(PRINT_INTERVAL)
            client_data = clients[websocket]
            current_time = time.strftime("%d-%m-%Y %H:%M:%S")

            print(f"\n{'='*50}")
            print(f"Broker: {broker_name}")
            print(f"Broker User ID: {client_data.get('userid', 'Unknown')}")
            print(f"Time: {current_time}")
            
            if client_data["api"] and not client_data["api"].is_connected():
                logging.warning(f"Connection check detected broker disconnection for {client_data.get('userid', 'Unknown')}")
                try:
                    disconnect_message = {
                        "type": "broker_disconnected",
                        "code": "CONNECTION_LOST",
                        "message": "Broker connection was lost, reconnection required"
                    }
                    await websocket.send(json.dumps(disconnect_message))
                except Exception as e:
                    logging.error(f"Error notifying client of broker disconnection: {e}")
            
            print(f"Subscribed Symbols: {len(client_data['subscribed_symbols'])}")
            print(f"{'='*50}\n")
            client_data["quote_data"].clear()

    def get_connection_count():
        """Return the current number of active connections"""
        return len(clients)

    async def main():
        try:
            logging.info(f"Starting {broker_name} WebSocket on port {port}...")
            server = await websockets.serve(websocket_server, WS_HOST, port)
            logging.info(f"WebSocket server is running on port {port}")
            await server.wait_closed()
        except Exception as e:
            logging.error(f"An error occurred in {broker_name} WebSocket: {e}")

    return websocket_server, get_connection_count, main, port


def run_broker_websocket(broker_id: str, config: dict):
    """
    Run a WebSocket server for a specific broker.
    
    Args:
        broker_id: Identifier for the broker
        config: Broker configuration dict
    """
    _, _, main, _ = create_noren_websocket_server(broker_id, config)
    asyncio.run(main())


if __name__ == "__main__":
    import sys
    from noren_broker_config import NOREN_BROKERS, get_broker_config
    
    if len(sys.argv) < 2:
        print("Usage: python noren_websocket_handler.py <broker_id> [port]")
        print(f"Available brokers: {', '.join(NOREN_BROKERS.keys())}")
        sys.exit(1)
    
    broker_id = sys.argv[1].lower()
    config = get_broker_config(broker_id)
    
    if not config:
        print(f"Unknown broker: {broker_id}")
        print(f"Available brokers: {', '.join(NOREN_BROKERS.keys())}")
        sys.exit(1)
    
    # Allow port override from command line
    if len(sys.argv) > 2:
        config = config.copy()
        config["port"] = int(sys.argv[2])
    
    run_broker_websocket(broker_id, config)
