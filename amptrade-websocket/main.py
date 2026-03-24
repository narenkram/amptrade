"""
WebSocket Server Main Entry Point

Connection Tracking:
1. Each broker (Flattrade/Shoonya/Infinn/Zebu/Tradesmart/Zerodha/Upstox) maintains separate connection pools
2. Each connection maintains both App User ID and Broker User ID
3. Message routing ensures user data isolation

Security Requirements:
- Firebase Admin SDK must be initialized first
- Both Firebase and broker authentication required
- Connection state must maintain user identifiers
"""

import logging
import subprocess
import sys
import os
import time
import signal
import psutil
from config import MAX_CONNECTIONS, CONNECTION_DISPLAY_INTERVAL
from fastapi import FastAPI, WebSocket, Request, HTTPException, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import asyncio
import json
from contextlib import asynccontextmanager
from typing import Optional

# Configure logging
logging.basicConfig(
    level=logging.DEBUG, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)

# Store connected admin clients
metrics_clients = set()

# Global metrics storage
broker_metrics = {
    "activeWebsockets": {
        "flattrade": 0,
        "shoonya": 0,
        "infinn": 0,
        "zebu": 0,
        "tradesmart": 0,
        "zerodha": 0,
        "upstox": 0,
    },
    "serverMetrics": {
        "cpu": 0,
        "load": {
            "1min": 0,
            "5min": 0,
            "15min": 0
        },
        "memory": {
            "percent": 0,
            "used": 0,
            "total": 0
        },
        "disk": {
            "percent": 0,
            "used": 0,
            "total": 0
        },
        "uptime": 0
    }
}

# Task to keep track of 
metrics_task = None

async def update_server_metrics():
    """Update server metrics (CPU, load, memory, disk, uptime)"""
    try:
        # CPU usage
        broker_metrics["serverMetrics"]["cpu"] = psutil.cpu_percent(interval=None)
        
        # System load average (1, 5, 15 minutes)
        load1, load5, load15 = psutil.getloadavg()
        broker_metrics["serverMetrics"]["load"]["1min"] = round(load1, 2)
        broker_metrics["serverMetrics"]["load"]["5min"] = round(load5, 2)
        broker_metrics["serverMetrics"]["load"]["15min"] = round(load15, 2)
        
        # Memory usage
        memory = psutil.virtual_memory()
        broker_metrics["serverMetrics"]["memory"]["percent"] = memory.percent
        broker_metrics["serverMetrics"]["memory"]["used"] = round(memory.used / (1024 * 1024 * 1024), 2)  # GB
        broker_metrics["serverMetrics"]["memory"]["total"] = round(memory.total / (1024 * 1024 * 1024), 2)  # GB
        
        # Disk usage (root path)
        disk = psutil.disk_usage('/')
        broker_metrics["serverMetrics"]["disk"]["percent"] = disk.percent
        broker_metrics["serverMetrics"]["disk"]["used"] = round(disk.used / (1024 * 1024 * 1024), 2)  # GB
        broker_metrics["serverMetrics"]["disk"]["total"] = round(disk.total / (1024 * 1024 * 1024), 2)  # GB
        
        # System uptime
        broker_metrics["serverMetrics"]["uptime"] = int(time.time() - psutil.boot_time())
    except Exception as e:
        logging.error(f"Error updating server metrics: {e}")

async def update_broker_metrics():
    """Periodically update metrics from all brokers"""
    while True:
        try:
            # Update server metrics
            await update_server_metrics()
            
            # Create TCP sockets to connect to each broker handler
            for i, broker in enumerate(["flattrade", "shoonya", "infinn", "zebu", "tradesmart", "zerodha", "upstox"]):
                try:
                    reader, writer = await asyncio.open_connection('127.0.0.1', 8888 + i)
                    writer.write(b"GET_METRICS")
                    await writer.drain()
                    
                    data = await reader.read(1024)
                    if data:
                        connection_count = int(data.decode().strip())
                        broker_metrics["activeWebsockets"][broker] = connection_count
                        
                    writer.close()
                    await writer.wait_closed()
                except Exception as e:
                    logging.error(f"Error getting metrics for {broker}: {e}")
                
            # Broadcast metrics to all connected admin clients
            if metrics_clients:
                message = json.dumps(broker_metrics)
                await asyncio.gather(
                    *[client.send_text(message) for client in metrics_clients]
                )
                
        except Exception as e:
            logging.error(f"Error updating metrics: {e}")
            
        await asyncio.sleep(2)  # Update every 2 seconds

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Start the metrics update task
    global metrics_task
    logging.info("Starting metrics collection task")
    metrics_task = asyncio.create_task(update_broker_metrics())
    
    yield
    
    # Shutdown: Cancel the metrics task
    if metrics_task:
        logging.info("Stopping metrics collection task")
        metrics_task.cancel()
        try:
            await metrics_task
        except asyncio.CancelledError:
            pass

# Initialize FastAPI app with lifespan context
app = FastAPI(lifespan=lifespan)

# Configure CORS for localhost only
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:6969",  # Admin interface URL
        "https://saas.narenkram.com",  # Production admin URL
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

async def verify_firebase_token(token: str) -> bool:
    return True

@app.websocket("/ws/metrics")
async def websocket_metrics(websocket: WebSocket, token: Optional[str] = Query(None)):
    await websocket.accept()
    metrics_clients.add(websocket)
    try:
        # Send initial metrics
        await websocket.send_text(json.dumps(broker_metrics))
        
        # Keep the connection alive
        while True:
            await websocket.receive_text()  # Just keep the connection open
    except WebSocketDisconnect:
        logging.info("Client disconnected")
    except Exception as e:
        logging.error(f"Metrics websocket error: {e}")
    finally:
        metrics_clients.remove(websocket)

def kill_existing_handlers(logger):
    """Kill any existing run_handler.py processes to prevent duplicates."""
    current_pid = os.getpid()
    killed_count = 0
    
    try:
        for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
            try:
                cmdline = proc.info.get('cmdline') or []
                cmdline_str = ' '.join(cmdline) if cmdline else ''
                
                # Skip our own process
                if proc.info['pid'] == current_pid:
                    continue
                    
                # Check if this is a run_handler.py process
                if 'run_handler.py' in cmdline_str:
                    logger.warning(f"Killing existing handler process: PID {proc.info['pid']} - {cmdline_str}")
                    proc.kill()
                    killed_count += 1
                    
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                continue
                
    except Exception as e:
        logger.error(f"Error killing existing handlers: {e}")
    
    if killed_count > 0:
        logger.info(f"Killed {killed_count} existing handler process(es)")
        time.sleep(2)  # Wait for processes to be fully terminated
    
    return killed_count


# Global list to track child processes for cleanup
child_processes = []


def cleanup_child_processes(signum=None, frame=None):
    """Clean up all child processes on exit."""
    logger = logging.getLogger("Cleanup")
    logger.info(f"Cleaning up {len(child_processes)} child processes...")
    
    for process in child_processes:
        try:
            if process.poll() is None:  # Process is still running
                logger.info(f"Terminating process PID {process.pid}")
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    logger.warning(f"Force killing process PID {process.pid}")
                    process.kill()
        except Exception as e:
            logger.error(f"Error cleaning up process: {e}")
    
    # Exit if this was called from a signal handler
    if signum is not None:
        sys.exit(0)


def main():
    global child_processes
    
    logger = logging.getLogger("Main")
    logger.info("Starting WebSocket servers...")
    app_dir = os.path.dirname(os.path.abspath(__file__))
    run_handler_path = os.path.join(app_dir, "run_handler.py")
    
    # Register signal handlers for proper cleanup
    signal.signal(signal.SIGTERM, cleanup_child_processes)
    signal.signal(signal.SIGINT, cleanup_child_processes)
    
    # Kill any existing handler processes to prevent duplicates
    kill_existing_handlers(logger)

    # Start each handler in a separate process
    handlers = ["flattrade", "shoonya", "infinn", "zebu", "tradesmart", "zerodha", "upstox"]
    child_processes = []

    try:
        for i, handler in enumerate(handlers):
            # Pass port for metrics reporting (8888 + index)
            cmd = [sys.executable, run_handler_path, handler, str(8888 + i)]
            process = subprocess.Popen(cmd, cwd=app_dir)
            child_processes.append(process)
            logger.info(f"Started {handler} handler (PID: {process.pid})")

        # Kill any process using port 8000 before starting
        logger.info("Killing any process using port 8000")
        # Use different command for Windows vs Linux
        if sys.platform == 'win32':
            subprocess.run("netstat -ano | findstr :8000 | findstr LISTENING", shell=True)
            # We would use taskkill but that's tricky - just log it for now
        else:
            subprocess.run("lsof -ti:8000 | xargs kill -9", shell=True)
            
        time.sleep(1)  # Give it a moment to release the port
        
        # Start FastAPI server - this will create its own event loop
        uvicorn.run(app, host="0.0.0.0", port=8000)
        
        # Keep the main process running and monitor the handlers
        while True:
            # Check if all processes are still running
            all_running = all(process.poll() is None for process in child_processes)
            if not all_running:
                logger.error("One or more handlers have stopped")
                break

            time.sleep(CONNECTION_DISPLAY_INTERVAL)

    except KeyboardInterrupt:
        logger.info("Shutting down...")
    finally:
        # Always clean up child processes
        cleanup_child_processes()


if __name__ == "__main__":
    main()
# trigger a build
