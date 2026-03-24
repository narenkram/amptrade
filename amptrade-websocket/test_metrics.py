"""
Test script to verify the metrics endpoint
"""

import asyncio
import websockets
import json
import sys
import time

async def test_metrics(server_url='ws://localhost:8000/ws/metrics'):
    """Connect to the metrics endpoint and print the received data"""
    print(f"Connecting to {server_url}...")
    
    while True:
        try:
            async with websockets.connect(server_url) as websocket:
                print("✓ Connected to metrics endpoint")
                
                # Receive initial metrics
                response = await websocket.recv()
                metrics = json.loads(response)
                print("\nInitial metrics:")
                print(json.dumps(metrics, indent=2))
                
                # Keep receiving updates
                print("\nWaiting for updates (Ctrl+C to stop)...")
                while True:
                    response = await websocket.recv()
                    metrics = json.loads(response)
                    print("\nMetrics update:")
                    print(json.dumps(metrics, indent=2))
                    print(f"Total connections: {sum(metrics['activeWebsockets'].values())}")
                    await asyncio.sleep(0.1)
        except (ConnectionRefusedError, websockets.exceptions.ConnectionClosedError) as e:
            print(f"Connection error: {e}. Retrying in 5 seconds...")
            await asyncio.sleep(5)
        except KeyboardInterrupt:
            print("\nExiting...")
            break
        except Exception as e:
            print(f"Unexpected error: {e}")
            await asyncio.sleep(5)

if __name__ == "__main__":
    # Allow command-line override of server URL
    url = sys.argv[1] if len(sys.argv) > 1 else 'ws://localhost:8000/ws/metrics'
    
    try:
        print(f"Testing metrics endpoint at {url}")
        print("Press Ctrl+C to exit")
        asyncio.run(test_metrics(url))
    except KeyboardInterrupt:
        print("\nExiting...")
    except Exception as e:
        print(f"Error: {e}") 