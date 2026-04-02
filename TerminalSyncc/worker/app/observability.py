"""
Structured MT5 pipeline observability (stderr JSON lines; no passwords or secrets).
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from typing import Any


def mt5_obs_log(module: str, action: str, **fields: Any) -> None:
    payload = {
        "ts": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "module": module,
        "action": action,
        **fields,
    }
    sys.stderr.write(json.dumps(payload, default=str) + "\n")
