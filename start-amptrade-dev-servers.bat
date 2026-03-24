@echo off
:menu
cls
echo =====================================
echo  AMPTRADE DEVELOPMENT SERVER MANAGER
echo =====================================
echo 1. Start All Servers
echo 2. Exit
echo --------------------------------
set /p choice="Enter your choice (1-2): "

if "%choice%"=="1" (
    echo Starting servers...

    :: Start API server
    start cmd /k "cd amptrade-api && npm run dev"

    :: Wait a bit for the API server to start
    timeout /t 5

    :: Start Vue app
    start cmd /k "cd amptrade-web && npm run dev"

    :: Wait a bit for the Vue app to start
    timeout /t 5

    :: Start WebSocket server
    start cmd /k "cd amptrade-websocket && python main.py"

    :: Open browsers with Firefox specifically
    start firefox http://localhost:3089
    start firefox http://localhost:5178

    echo Servers started and browsers opened!
    echo.
    echo Press any key to stop all processes and return to menu...
    pause >nul
    
    :: Kill all related processes and ports
    taskkill /F /IM node.exe >nul 2>&1
    taskkill /F /IM python.exe >nul 2>&1
    taskkill /F /IM cmd.exe >nul 2>&1
    for /f "tokens=5" %%a in ('netstat -aon ^| find "3089"') do taskkill /F /PID %%a >nul 2>&1
    for /f "tokens=5" %%a in ('netstat -aon ^| find "5178"') do taskkill /F /PID %%a >nul 2>&1
    goto menu
) else if "%choice%"=="2" (
    exit
) else (
    echo Invalid choice. Please try again.
    timeout /t 2 >nul
    goto menu
)
