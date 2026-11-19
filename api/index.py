"""Vercel serverless entry point: serves the FastAPI app from backend_api.py under /api/*."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend_api import app  # noqa: E402,F401
