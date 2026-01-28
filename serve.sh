#!/bin/bash
echo "Starting local web server..."
echo ""
echo "Once started, open your browser and go to:"
echo "http://localhost:8000"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Try Python 3 first
if command -v python3 &> /dev/null; then
    python3 -m http.server 8000
elif command -v python &> /dev/null; then
    python -m http.server 8000
else
    echo "ERROR: Python is not installed"
    echo ""
    echo "Please install Python or use another method to serve the files over HTTP"
fi
