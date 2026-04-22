#!/bin/bash

echo ""
echo "========================================"
echo "    AHUB FILM SCOUT - LINUX STARTUP"
echo "========================================"
echo ""

# Create venv if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate environment
echo "Activating environment..."
source venv/bin/activate

# Install/Update dependencies
echo "Installing dependencies..."
pip install -r requirements.txt

echo ""
echo "Starting Backend on http://localhost:8001"
echo ""

# Optional: Uncomment the line below if you have a browser on this machine
# xdg-open frontend/index.html &

echo "NOTE: Ensure this terminal stays open to keep the backend active."
echo ""

# Run the app
python main.py
