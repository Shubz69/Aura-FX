import logging
import os
from contextlib import asynccontextmanager
from typing import Dict, Optional

import uvicorn
from fastapi import FastAPI, HTTPException, Header
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from .config import WORKER_SECRET, validate_mt5_template
from .errors import TemplateValidationError, WorkerError
from .mt5_instance import MT5Instance

logger = logging.getLogger("terminalsync.worker")


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.template_error: Optional[Dict[str, str]] = None
    try:
        validate_mt5_template()
    except TemplateValidationError as e:
        app.state.template_error = {"code": e.code, "message": e.message}
        logger.error("MT5 template validation failed: %s — %s", e.code, e.message)
    yield


app = FastAPI(title="TerminalSync Engine v1", lifespan=lifespan)


# ================================
# REQUEST MODEL (MT5-only worker; accepts Aura API extras: platform, days)
# ================================

class MT5Credentials(BaseModel):
    login: int
    password: str
    server: str
    platform: Optional[str] = None
    days: Optional[int] = Field(default=None, ge=1, le=365)

    model_config = ConfigDict(extra="ignore")


# ================================
# SECURITY
# ================================

def verify_internal_access(secret: Optional[str]):
    if secret != WORKER_SECRET:
        raise HTTPException(403, detail={"code": "UNAUTHORIZED_WORKER_ACCESS", "message": "Invalid worker secret."})


# ================================
# HELPERS
# ================================

MT4_NOT_SUPPORTED_MSG = (
    "This worker supports MetaTrader 5 only. "
    "MT4 accounts are not supported; connect with an MT5 account or use an MT4-capable worker."
)


def _reject_mt4_platform(platform: Optional[str]) -> None:
    if platform is None or not str(platform).strip():
        return
    if str(platform).strip().upper() == "MT4":
        raise HTTPException(
            status_code=400,
            detail={"code": "MT4_NOT_SUPPORTED", "message": MT4_NOT_SUPPORTED_MSG},
        )


def _require_template_ready(app: FastAPI) -> None:
    err = getattr(app.state, "template_error", None)
    if err:
        raise HTTPException(
            status_code=503,
            detail={"code": err["code"], "message": err["message"]},
        )


def _get_instance(app: FastAPI, creds: MT5Credentials) -> MT5Instance:
    _require_template_ready(app)
    instance = MT5Instance(
        login=creds.login,
        password=creds.password,
        server=creds.server,
    )
    instance.ensure_instance()
    return instance


def _http_from_worker_error(e: WorkerError) -> HTTPException:
    return HTTPException(
        status_code=e.http_status,
        detail={"code": e.code, "message": e.message},
    )


# ================================
# ACCOUNT SNAPSHOT
# ================================

@app.post("/api/v1/sync")
def sync_account(
    creds: MT5Credentials,
    x_worker_secret: str = Header(default=None),
):
    verify_internal_access(x_worker_secret)

    _reject_mt4_platform(creds.platform)

    try:
        instance = _get_instance(app, creds)
        result = instance.account_info()

        return {
            "status": "success",
            "data": result["data"]
        }

    except HTTPException:
        raise
    except WorkerError as e:
        raise _http_from_worker_error(e) from e
    except Exception:
        logger.exception("Unexpected error in /api/v1/sync (login=%s)", creds.login)
        raise HTTPException(
            status_code=500,
            detail={"code": "INTERNAL_ERROR", "message": "Unexpected worker failure."},
        ) from None


# ================================
# POSITIONS
# ================================

@app.post("/api/v1/positions")
def get_positions(
    creds: MT5Credentials,
    x_worker_secret: str = Header(default=None)
):

    verify_internal_access(x_worker_secret)

    _reject_mt4_platform(creds.platform)

    try:
        instance = _get_instance(app, creds)
        result = instance.positions()

        return {
            "status": "success",
            "trades": result["trades"]
        }

    except HTTPException:
        raise
    except WorkerError as e:
        raise _http_from_worker_error(e) from e
    except Exception:
        logger.exception("Unexpected error in /api/v1/positions (login=%s)", creds.login)
        raise HTTPException(
            status_code=500,
            detail={"code": "INTERNAL_ERROR", "message": "Unexpected worker failure."},
        ) from None


@app.get("/health")
def health():
    err = getattr(app.state, "template_error", None)
    if err:
        return JSONResponse(
            status_code=503,
            content={
                "ok": False,
                "status": "TerminalSync worker degraded: MT5 template invalid",
                "code": err["code"],
                "message": err["message"],
            },
        )
    return {
        "ok": True,
        "status": "TerminalSync Worker Running",
    }


if __name__ == "__main__":
    host = os.getenv("WORKER_HOST", "0.0.0.0")
    port = int(os.getenv("PORT", os.getenv("WORKER_PORT", "8000")))
    uvicorn.run(
        "app.main:app",
        host=host,
        port=port,
        reload=False
    )
