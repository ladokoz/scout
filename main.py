from fastapi import FastAPI, APIRouter, BackgroundTasks, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from pydantic import BaseModel
from typing import List, Dict, Optional, Any
from contextlib import asynccontextmanager
import uuid
import json
import os
import asyncio
import secrets
import logging
import subprocess
from scout_engine import ScoutEngine, ScoutResult
from dotenv import load_dotenv

# Load credentials from .env
load_dotenv()

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ScoutMain")

# Security Setup
security = HTTPBasic(auto_error=False)

def authenticate(credentials: Optional[HTTPBasicCredentials] = Depends(security)):
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required"
        )
        
    correct_username = os.getenv("SCOUT_USER", "maros")
    correct_password = os.getenv("SCOUT_PASS", "ahub123")
    
    is_user_ok = secrets.compare_digest(credentials.username, correct_username)
    is_pass_ok = secrets.compare_digest(credentials.password, correct_password)
    
    if not (is_user_ok and is_pass_ok):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password"
        )
    return credentials.username

# Global State
engine = ScoutEngine()
jobs: Dict[str, Dict] = {}
DATA_FILE = "jobs_state.json"
EXPORTS_DIR = "exports"

# Ensure exports directory exists
if not os.path.exists(EXPORTS_DIR):
    os.makedirs(EXPORTS_DIR)

def save_state():
    with open(DATA_FILE, "w") as f:
        json.dump(jobs, f, default=lambda x: x.__dict__ if hasattr(x, '__dict__') else x)

def load_state():
    global jobs
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, "r") as f:
                jobs = json.load(f)
        except:
            jobs = {}

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Load memory state
    load_state()
    yield
    # Shutdown: (Optional cleanup)
    pass

# Initialize App
app = FastAPI(
    title="Ahub Film Scout API",
    lifespan=lifespan
)

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create API Router with Authentication
api_router = APIRouter(prefix="/api", dependencies=[Depends(authenticate)])

class BatchRequest(BaseModel):
    queries: List[str]
    search_limit: int = 15
    match_algo: str = "loose"

class SaveExportRequest(BaseModel):
    filename: str
    csv_data: str

async def run_batch_scout(job_id: str, queries: List[str], search_limit: int, match_algo: str):
    jobs[job_id]["status"] = "processing"
    jobs[job_id]["results"] = {}
    
    total = len(queries)
    for i, query in enumerate(queries):
        # Check if stopped
        if jobs[job_id].get("status") == "stopped":
            return

        cleaned_query = query.strip()
        if not cleaned_query: continue
        
        jobs[job_id]["progress"] = f"Searching {i+1}/{total}: {cleaned_query}..."
        try:
            results = await engine.scout_query(cleaned_query, search_limit=search_limit, match_algo=match_algo)
            # Serialize for JSON storage
            jobs[job_id]["results"][cleaned_query] = [res.__dict__ for res in results]
        except Exception as e:
            jobs[job_id]["results"][cleaned_query] = [{"error": str(e)}]
        
        save_state()
        
    jobs[job_id]["status"] = "completed"
    jobs[job_id]["progress"] = "All searches completed."
    save_state()

@api_router.post("/scout/batch")
async def start_batch(request: BatchRequest, background_tasks: BackgroundTasks):
    job_id = str(uuid.uuid4())
    jobs[job_id] = {
        "id": job_id,
        "status": "pending",
        "progress": "Initializing...",
        "results": {},
        "total": len(request.queries),
        "queries": request.queries
    }
    
    background_tasks.add_task(run_batch_scout, job_id, request.queries, request.search_limit, request.match_algo)
    return {"job_id": job_id}

@api_router.get("/version")
async def get_version():
    try:
        with open("VERSION", "r") as f:
            return {"version": f.read().strip()}
    except:
        return {"version": "1.0.0"}

@api_router.post("/update")
async def perform_update():
    try:
        # Use generic 'git' command for cross-platform compatibility (Windows/Linux)
        result = subprocess.run(["git", "pull"], capture_output=True, text=True, check=True)
        return {"status": "success", "output": result.stdout}
    except subprocess.CalledProcessError as e:
        return {"status": "error", "message": str(e), "output": e.stderr}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@api_router.get("/scout/status/{job_id}")
async def get_status(job_id: str):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    return jobs[job_id]

@api_router.post("/scout/stop/{job_id}")
async def stop_job(job_id: str):
    if job_id in jobs:
        jobs[job_id]["status"] = "stopped"
        jobs[job_id]["progress"] = "Search stopped by user."
        save_state()
        return {"status": "stopped"}
    raise HTTPException(status_code=404, detail="Job not found")

@api_router.post("/exports/save")
async def save_export(request: SaveExportRequest):
    try:
        # Ensure filename is safe
        safe_name = "".join([c for c in request.filename if c.isalnum() or c in "._- "]).strip()
        if not safe_name.endswith(".csv"):
            safe_name += ".csv"
        
        file_path = os.path.join(EXPORTS_DIR, safe_name)
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(request.csv_data)
        
        return {"status": "saved", "filename": safe_name}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/exports")
async def list_exports():
    if not os.path.exists(EXPORTS_DIR):
        return []
    
    files = []
    for filename in os.listdir(EXPORTS_DIR):
        if filename.endswith(".csv"):
            path = os.path.join(EXPORTS_DIR, filename)
            stats = os.stat(path)
            files.append({
                "name": filename,
                "size": stats.st_size,
                "created": stats.st_mtime
            })
    
    # Sort by created date (newest first)
    files.sort(key=lambda x: x["created"], reverse=True)
    return files

@api_router.get("/exports/download/{filename}")
async def download_export(filename: str):
    file_path = os.path.join(EXPORTS_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(file_path, media_type='text/csv', filename=filename)

@api_router.delete("/exports/{filename}")
async def delete_export(filename: str):
    file_path = os.path.join(EXPORTS_DIR, filename)
    if os.path.exists(file_path):
        os.remove(file_path)
        return {"status": "deleted"}
    raise HTTPException(status_code=404, detail="File not found")

@api_router.delete("/exports-all")
async def delete_all_exports():
    try:
        for filename in os.listdir(EXPORTS_DIR):
            file_path = os.path.join(EXPORTS_DIR, filename)
            if os.path.isfile(file_path):
                os.remove(file_path)
        return {"status": "all_deleted"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Include API Router
app.include_router(api_router)

# Public routes (Frontend)
@app.get("/")
async def read_index():
    return FileResponse('frontend/index.html')

# Mount static files (the rest of the frontend)
app.mount("/", StaticFiles(directory="frontend"), name="static")

if __name__ == "__main__":
    import uvicorn
    # Log starting message to confirm startup
    print("\n========================================")
    print(" AHUB FILM SCOUT: STARTING SERVER")
    print(" http://localhost:8001")
    print("========================================\n")
    uvicorn.run(app, host="0.0.0.0", port=8001)
