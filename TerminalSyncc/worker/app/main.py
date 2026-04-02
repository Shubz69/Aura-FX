import logging
import os
import uuid
from contextlib import asynccontextmanager
from typing import Dict, Optional

import uvicorn
from fastapi import FastAPI, HTTPException, Header, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator

from .config import WORKER_SECRET, validate_mt5_template
from .errors import TemplateValidationError, WorkerError
from .lifecycle import start_background_sweep, startup_cleanup, stop_background_sweep
from .mt5_instance import MT5Instance, active_mt5_guard, active_mt5_logins
from .observability import mt5_obs_log

logger = logging.getLogger("terminalsync.worker")


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.template_error: Optional[Dict[str, str]] = None
    try:
        validate_mt5_template()
    except TemplateValidationError as e:
        app.state.template_error = {"code": e.code, "message": e.message}
        logger.error("MT5 template validation failed: %s — %s", e.code, e.message)

    startup_cleanup()
    start_background_sweep(active_mt5_logins, active_mt5_guard)

    yield

    stop_background_sweep()


app = FastAPI(title="TerminalSync Engine v1", lifespan=lifespan)


class MT5Credentials(BaseModel):
    login: int
    password: str
    server: str
    platform: Optional[str] = None
    days: Optional[int] = Field(default=None, ge=1, le=3650)

    model_config = ConfigDict(extra="ignore")

    @field_validator("login", mode="before")
    @classmethod
    def coerce_login(cls, v):
        if isinstance(v, str) and v.strip().isdigit():
            return int(v.strip(), 10)
        return v

    @field_validator("login")
    @classmethod
    def login_positive(cls, v: int) -> int:
        if v is None or int(v) <= 0:
            raise ValueError("login must be a positive integer")
        return int(v)

    @field_validator("server")
    @classmethod
    def server_trim(cls, v: str) -> str:
        s = str(v or "").strip()
        s = s.replace("\t", " ").replace("\r", " ").replace("\n", " ")
        s = " ".join(s.split())
        if not s:
            raise ValueError("server is required")
        if len(s) > 160:
            raise ValueError("server name is too long")
        if "\x00" in s or "<" in s or ">" in s:
            raise ValueError("server name contains invalid characters")
        return s

    @field_validator("password")
    @classmethod
    def password_nonempty(cls, v: str) -> str:
        if v is None or not str(v):
            raise ValueError("password is required")
        return str(v)

    @field_validator("platform")
    @classmethod
    def platform_label(cls, v: Optional[str]) -> Optional[str]:
        if v is None or not str(v).strip():
            return None
        u = str(v).strip().upper()
        if u not in ("MT4", "MT5"):
            raise ValueError("platform must be MT4 or MT5 when provided")
        return u


def verify_internal_access(secret: Optional[str]):
    if secret != WORKER_SECRET:
        raise HTTPException(
            403,
            detail={"code": "UNAUTHORIZED_WORKER_ACCESS", "message": "Invalid worker secret."},
        )


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


@app.post("/api/v1/sync")
def sync_account(
    request: Request,
    creds: MT5Credentials,
    x_worker_secret: str = Header(default=None),
):
    verify_internal_access(x_worker_secret)
    _reject_mt4_platform(creds.platform)

    rid = (request.headers.get("x-request-id") or "").strip() or str(uuid.uuid4())
    mt5_obs_log("mt5", "api_sync", login=creds.login, server=creds.server, request_id=rid)

    try:
        instance = _get_instance(app, creds)
        result = instance.account_info()
        return {"status": "success", "data": result["data"]}
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


@app.post("/api/v1/positions")
def get_positions(
    request: Request,
    creds: MT5Credentials,
    x_worker_secret: str = Header(default=None),
):
    verify_internal_access(x_worker_secret)
    _reject_mt4_platform(creds.platform)

    rid = (request.headers.get("x-request-id") or "").strip() or str(uuid.uuid4())
    mt5_obs_log("mt5", "api_positions", login=creds.login, server=creds.server, request_id=rid)

    try:
        instance = _get_instance(app, creds)
        result = instance.positions()
        return {"status": "success", "trades": result["trades"]}
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


@app.post("/api/v1/history")
def get_deal_history(
    request: Request,
    creds: MT5Credentials,
    x_worker_secret: str = Header(default=None),
):
    """Closed deals / realized P&L from account history (not open positions)."""
    verify_internal_access(x_worker_secret)
    _reject_mt4_platform(creds.platform)

    try:
        lookback = int(creds.days) if creds.days is not None else 90
        lookback = max(1, min(3650, lookback))
        rid = (request.headers.get("x-request-id") or "").strip() or str(uuid.uuid4())
        mt5_obs_log(
            "mt5",
            "api_history",
            login=creds.login,
            server=creds.server,
            history_days=lookback,
            request_id=rid,
        )
        instance = _get_instance(app, creds)
        result = instance.deal_history(lookback)
        return {"status": "success", "trades": result["trades"]}
    except HTTPException:
        raise
    except WorkerError as e:
        raise _http_from_worker_error(e) from e
    except Exception:
        logger.exception("Unexpected error in /api/v1/history (login=%s)", creds.login)
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
    return {"ok": True, "status": "TerminalSync Worker Running"}


if __name__ == "__main__":
    host = os.getenv("WORKER_HOST", "0.0.0.0")
    port = int(os.getenv("PORT", os.getenv("WORKER_PORT", "8000")))
    uvicorn.run("app.main:app", host=host, port=port, reload=False)
