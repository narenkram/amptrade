"""
WebSocket Handler Runner

This module starts individual broker WebSocket handlers.
It uses the unified NorenAPI handler for compatible brokers (Flattrade, Shoonya, Zebu,
Tradesmart, Infinn) and keeps Zerodha separate (different API architecture).
"""

import asyncio
import sys

# Unified NorenAPI handler for compatible brokers
from brokers.noren_broker_config import NOREN_BROKERS, get_broker_config
from brokers.noren_websocket_handler import create_noren_websocket_server

# Zerodha uses different API architecture (Kite Connect)
from brokers.zerodha_websocket import (
    main as zerodha_main,
    get_connection_count as get_zerodha_connection_count
)

# Upstox uses V3 WebSocket API
from brokers.upstox_websocket import (
    main as upstox_main,
    get_connection_count as get_upstox_connection_count
)
from config import ZERODHA_WS_PORT, UPSTOX_WS_PORT

# Connection count functions - dynamically populated for NorenAPI brokers
connection_count_functions = {}

# Store references to created handlers
noren_handlers = {}


def setup_noren_handlers():
    """Initialize unified handlers for all NorenAPI brokers"""
    for broker_id, config in NOREN_BROKERS.items():
        websocket_server, get_connection_count, main_func, port = create_noren_websocket_server(
            broker_id, config
        )
        noren_handlers[broker_id] = {
            "main": main_func,
            "get_connection_count": get_connection_count,
            "port": port,
        }
        connection_count_functions[broker_id] = get_connection_count
    
    # Add Zerodha separately
    connection_count_functions["zerodha"] = get_zerodha_connection_count
    
    # Add Upstox separately
    connection_count_functions["upstox"] = get_upstox_connection_count


async def metrics_server(port, broker_type):
    """Simple TCP server to report connection metrics"""
    get_connection_count = connection_count_functions.get(broker_type)
    
    async def handle_client(reader, writer):
        try:
            data = await reader.read(100)
            if data == b"GET_METRICS":
                count = get_connection_count() if get_connection_count else 0
                writer.write(str(count).encode())
                await writer.drain()
        except Exception as e:
            print(f"Error handling metrics request: {e}")
        finally:
            writer.close()
            await writer.wait_closed()
    
    server = await asyncio.start_server(handle_client, '127.0.0.1', port)
    print(f"Metrics server for {broker_type} started on port {port}")
    
    async with server:
        await server.serve_forever()


async def run_handler(handler_type: str, metrics_port: int = None):
    """Run a WebSocket handler for the specified broker"""
    # Ensure handlers are set up
    if not noren_handlers:
        setup_noren_handlers()
    
    # Start metrics server if port is provided
    if metrics_port:
        asyncio.create_task(metrics_server(metrics_port, handler_type))
    
    # Check if this is a NorenAPI broker
    if handler_type in noren_handlers:
        handler = noren_handlers[handler_type]
        await handler["main"]()
    elif handler_type == "zerodha":
        # Zerodha uses different API architecture
        await zerodha_main(ZERODHA_WS_PORT)
    elif handler_type == "upstox":
        # Upstox uses V3 WebSocket API
        await upstox_main(UPSTOX_WS_PORT)
    else:
        print(f"Unknown handler type: {handler_type}")
        print(f"Available handlers: {', '.join(list(NOREN_BROKERS.keys()) + ['zerodha', 'upstox'])}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python run_handler.py <handler_type> [metrics_port]")
        print(f"Available handlers: {', '.join(list(NOREN_BROKERS.keys()) + ['zerodha'])}")
        sys.exit(1)

    handler_type = sys.argv[1].lower()
    metrics_port = int(sys.argv[2]) if len(sys.argv) > 2 else None
    
    asyncio.run(run_handler(handler_type, metrics_port))

