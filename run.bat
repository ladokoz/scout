@echo off
echo.
echo ========================================
echo    SHORT FILM SCOUT - STANDALONE
echo ========================================
echo.

IF NOT EXIST venv (
    echo Creating virtual environment...
    python -m venv venv
)

echo Activating environment...
call venv\Scripts\activate

echo Installing dependencies...
pip install -r requirements.txt

echo.
echo Starting Backend on http://localhost:8001
echo Opening Frontend...
echo.

:: Start the frontend in the default browser
start "" "frontend\index.html"

echo NOTE: Ensure the backend stays running in this window.
echo.

python main.py
pause
