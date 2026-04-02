from pathlib import Path
import os

BASE_DIR = Path(__file__).resolve().parent.parent

TEMPLATE_PATH = BASE_DIR / "MT5_TEMPLATE"
INSTANCES_DIR = BASE_DIR / "mt5_instances"

WORKER_SECRET = os.getenv(
    "WORKER_SECRET",
    "terminalsync_internal"
)

INSTANCES_DIR.mkdir(exist_ok=True)