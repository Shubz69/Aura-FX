import uvicorn
import os
from typing import Optional

from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel, ConfigDict, Field

from .mt5_instance import MT5Instance
from .config import WORKER_SECRET


app = FastAPI(title="TerminalSync Engine v1")


# ================================
# REQUEST MODEL (MT5-only worker; accepts Aura API extras: platform, days)
# ================================

class MT5Credentials(BaseModel):
    login: int
    password: str
    server: str
    platform: Optional[str] = None
    days: Optional[int] = Field(default=None, ge=1, le=365)

    # Ignore unknown JSON keys from upstream (safe forward-compat).
    model_config = ConfigDict(extra="ignore")


# ================================
# SECURITY
# ================================

def verify_internal_access(secret: str | None):
    if secret != WORKER_SECRET:
        raise HTTPException(
            403,
            "UNAUTHORIZED_WORKER_ACCESS"
        )


# ================================
# HELPERS
# ================================

MT4_NOT_SUPPORTED_MSG = (
    "This worker supports MetaTrader 5 only. "
    "MT4 accounts are not supported; connect with an MT5 account or use an MT4-capable worker."
)


def _reject_mt4_platform(platform: Optional[str]) -> None:
    """Aura may send platform=MT4; this deployment is MT5-only."""
    if platform is None or not str(platform).strip():
        return
    if str(platform).strip().upper() == "MT4":
        raise HTTPException(status_code=400, detail=MT4_NOT_SUPPORTED_MSG)


def _get_instance(creds: MT5Credentials) -> MT5Instance:
    """Create an MT5Instance and ensure the portable copy exists."""
    instance = MT5Instance(
        login=creds.login,
        password=creds.password,
        server=creds.server,
    )
    instance.ensure_instance()
    return instance


# ================================
# ACCOUNT SNAPSHOT
# ================================

@app.post("/api/v1/sync")
def sync_account(
    creds: MT5Credentials,
    x_worker_secret: str = Header(default=None)
):

    verify_internal_access(x_worker_secret)

    try:
        instance = _get_instance(creds)
        result = instance.account_info()

        return {
            "status": "success",
            "data": result["data"]
        }

    except Exception as e:
        raise HTTPException(500, str(e))


# ================================
# POSITIONS
# ================================

@app.post("/api/v1/positions")
def get_positions(
    creds: MT5Credentials,
    x_worker_secret: str = Header(default=None)
):

    verify_internal_access(x_worker_secret)

    try:
        instance = _get_instance(creds)
        result = instance.positions()

        return {
            "status": "success",
            "trades": result["trades"]
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/health")
def health():
    return {"status": "TerminalSync Worker Running", "ok": True}


if __name__ == "__main__":
    host = os.getenv("WORKER_HOST", "0.0.0.0")
    port = int(os.getenv("PORT", os.getenv("WORKER_PORT", "8000")))
    uvicorn.run(
        "app.main:app",
        host=host,
        port=port,
        reload=False
    )