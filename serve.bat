@echo off
echo Starting local web server...
echo.
echo Once started, open your browser and go to:
echo http://localhost:8000
echo.
echo Press Ctrl+C to stop the server
echo.

REM Try Python 3 first
python -m http.server 8000 2>nul
if %ERRORLEVEL% EQU 0 goto :end

REM Try Python 2 if Python 3 failed
python -m SimpleHTTPServer 8000 2>nul
if %ERRORLEVEL% EQU 0 goto :end

REM If no Python, show error
echo ERROR: Python is not installed or not in PATH
echo.
echo Please install Python from https://www.python.org/downloads/
echo Or use another method to serve the files over HTTP
pause

:end
