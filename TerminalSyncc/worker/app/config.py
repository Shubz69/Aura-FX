from pathlib import Path
import os
from typing import Tuple

from .errors import TemplateValidationError

BASE_DIR = Path(__file__).resolve().parent.parent

TEMPLATE_PATH = BASE_DIR / "MT5_TEMPLATE"
INSTANCES_DIR = BASE_DIR / "mt5_instances"

# Prefer env in production; fallback keeps local/smoke setups working.
WORKER_SECRET = (os.environ.get("WORKER_SECRET") or "AuraTerminal2026A").strip()

# Minimum portable tree (relative to template root). bases/ is created by MT5 if absent.
_TEMPLATE_REQUIREMENTS: Tuple[Tuple[str, str], ...] = (
    ("terminal64.exe", "file"),
    ("config", "dir"),
    ("MQL5", "dir"),
)


def validate_mt5_template(base: Path | None = None) -> None:
    """
    Validate TEMPLATE_PATH is present and looks like a MetaTrader 5 portable root.
    Raises TemplateValidationError with MT5_TEMPLATE_MISSING | MT5_TEMPLATE_INVALID | MT5_TERMINAL_MISSING.
    """
    root = (base or TEMPLATE_PATH).resolve()
    if not root.exists():
        raise TemplateValidationError(
            "MT5_TEMPLATE_MISSING",
            f"MT5 template directory does not exist: {root}",
        )
    if not root.is_dir():
        raise TemplateValidationError(
            "MT5_TEMPLATE_INVALID",
            f"MT5 template path is not a directory: {root}",
        )

    for rel, kind in _TEMPLATE_REQUIREMENTS:
        p = root / rel
        if kind == "file":
            if not p.is_file():
                if rel == "terminal64.exe":
                    raise TemplateValidationError(
                        "MT5_TERMINAL_MISSING",
                        f"terminal64.exe not found under template: {root}",
                    )
                raise TemplateValidationError(
                    "MT5_TEMPLATE_INVALID",
                    f"Required template file missing: {rel}",
                )
        else:
            if not p.is_dir():
                raise TemplateValidationError(
                    "MT5_TEMPLATE_INVALID",
                    f"Required template directory missing: {rel}/",
                )


INSTANCES_DIR.mkdir(parents=True, exist_ok=True)
