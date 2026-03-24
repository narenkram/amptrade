@echo off
setlocal enabledelayedexpansion

:: Store the root directory
set "ROOT_DIR=%cd%"

cls
echo ================================
echo    AMPTRADE INSTALLER
echo ================================
echo Installing dependencies for all submodules...
echo Root directory: %ROOT_DIR%
echo.

:: Initialize and update submodules first
echo [1/6] Initializing and updating git submodules...
git submodule init
git submodule update --recursive
if !errorlevel! equ 0 (
    echo ✓ Git submodules updated
) else (
    echo ✗ Failed to update git submodules
)
echo.

:: Install amptrade-web dependencies
echo [2/6] Installing amptrade-web dependencies...
pushd "%ROOT_DIR%\amptrade-web" 2>nul
if !errorlevel! equ 0 (
    if exist package.json (
        echo Running npm install in %cd%...
        call npm install --silent
        if !errorlevel! equ 0 (
            echo ✓ amptrade-web dependencies installed
        ) else (
            echo ✗ Failed to install amptrade-web dependencies
        )
    ) else (
        echo ⚠ package.json not found in amptrade-web
    )
    popd
) else (
    echo ⚠ amptrade-web directory not found
)
echo.

:: Install amptrade-api dependencies
echo [3/6] Installing amptrade-api dependencies...
pushd "%ROOT_DIR%\amptrade-api" 2>nul
if !errorlevel! equ 0 (
    if exist package.json (
        echo Running npm install in %cd%...
        call npm install --silent
        if !errorlevel! equ 0 (
            echo ✓ amptrade-api dependencies installed
        ) else (
            echo ✗ Failed to install amptrade-api dependencies
        )
    ) else (
        echo ⚠ package.json not found in amptrade-api
    )
    popd
) else (
    echo ⚠ amptrade-api directory not found
)
echo.

:: Install amptrade-websocket dependencies
echo [6/6] Installing amptrade-websocket dependencies...
pushd "%ROOT_DIR%\amptrade-websocket" 2>nul
if !errorlevel! equ 0 (
    if exist requirements.txt (
        echo Running pip install in %cd%...
        pip install -r requirements.txt --quiet
        if !errorlevel! equ 0 (
            echo ✓ amptrade-websocket dependencies installed
        ) else (
            echo ✗ Failed to install amptrade-websocket dependencies
        )
    ) else (
        echo ⚠ requirements.txt not found in amptrade-websocket
    )
    popd
) else (
    echo ⚠ amptrade-websocket directory not found
)
echo.

:: Return to root directory
cd /d "%ROOT_DIR%"

echo ================================
echo     INSTALLATION COMPLETE
echo ================================
echo All submodule dependencies have been processed.
echo Current directory: %cd%
echo You can now use start-servers.bat to run all services.
echo.

:: Auto-close after 10 seconds or on any key press
echo This window will close automatically in 10 seconds...
echo Press any key to close immediately.
timeout /t 10 >nul 2>&1 