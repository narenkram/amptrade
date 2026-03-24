"""
NorenAPI Broker Configuration

This file centralizes configuration for all NorenAPI-compatible brokers.
Each broker uses the same WebSocket protocol but with different host URLs.

Broker Types:
- All 5 brokers (Flattrade, Shoonya, Zebu, Tradesmart, Infinn) use the
  same NorenAPI protocol with slightly different endpoints.
"""

from config import (
    FLATTRADE_WS_PORT,
    SHOONYA_WS_PORT,
    ZEBU_WS_PORT,
    TRADESMART_WS_PORT,
    INFINN_WS_PORT,
)

# Configuration for each NorenAPI broker
NOREN_BROKERS = {
    "flattrade": {
        "name": "Flattrade",
        "host": "https://piconnect.flattrade.in/PiConnectTP/",
        "websocket": "wss://piconnect.flattrade.in/PiConnectWSTp/",
        "eodhost": "https://web.flattrade.in/chartApi/getdata/",
        "port": FLATTRADE_WS_PORT,
    },
    "shoonya": {
        "name": "Shoonya",
        "host": "https://api.shoonya.com/NorenWClientTP/",
        "websocket": "wss://api.shoonya.com/NorenWSTP/",
        "eodhost": "https://api.shoonya.com/chartApi/getdata/",
        "port": SHOONYA_WS_PORT,
    },
    "zebu": {
        "name": "Zebu",
        "host": "https://go.mynt.in/NorenWClientTP/",
        "websocket": "wss://go.mynt.in/NorenWSWeb/",
        "eodhost": "https://go.mynt.in/chartApi/getdata/",
        "port": ZEBU_WS_PORT,
    },
    "tradesmart": {
        "name": "Tradesmart",
        "host": "https://v2api.tradesmartonline.in/NorenWClientTP/",
        "websocket": "wss://v2api.tradesmartonline.in/NorenWSTP/",
        "eodhost": "https://v2api.tradesmartonline.in/chartApi/getdata/",
        "port": TRADESMART_WS_PORT,
    },
    "infinn": {
        "name": "Infinn",
        "host": "https://api.infinn.in/NorenWClientTP/",
        "websocket": "wss://api.infinn.in/NorenWSTP/",
        "eodhost": "https://api.infinn.in/chartApi/getdata/",
        "port": INFINN_WS_PORT,
    },
}


def get_broker_config(broker_id: str) -> dict | None:
    """Get broker configuration by ID"""
    return NOREN_BROKERS.get(broker_id.lower())


def get_all_broker_ids() -> list[str]:
    """Get list of all broker IDs"""
    return list(NOREN_BROKERS.keys())
