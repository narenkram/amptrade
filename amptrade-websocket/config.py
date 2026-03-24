import os
from dotenv import load_dotenv

# Load environment variables
ENV = os.getenv("ENV", "development")
env_file = f".env.{ENV}"
load_dotenv(env_file)

# WebSocket ports
FLATTRADE_WS_PORT = int(os.getenv("FLATTRADE_WS_PORT", 8789))
SHOONYA_WS_PORT = int(os.getenv("SHOONYA_WS_PORT", 8790))
ZEBU_WS_PORT = int(os.getenv("ZEBU_WS_PORT", 8791))
INFINN_WS_PORT = int(os.getenv("INFINN_WS_PORT", 8792))
TRADESMART_WS_PORT = int(os.getenv("TRADESMART_WS_PORT", 8793))
ZERODHA_WS_PORT = int(os.getenv("ZERODHA_WS_PORT", 8794))
UPSTOX_WS_PORT = int(os.getenv("UPSTOX_WS_PORT", 8795))
# WebSocket server settings
WS_HOST = "0.0.0.0"
MAX_CONNECTIONS = 10000

# Display settings
CONNECTION_DISPLAY_INTERVAL = 5

