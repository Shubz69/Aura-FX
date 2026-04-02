"""
Subprocess entrypoint for MT5 (one shot per invocation).

Usage:
  python -m app.mt5_worker <instance_path> <login> <password> <server> <action> [history_days]

- account_info / positions: 6 args
- deal_history: optional 7th arg = lookback days (1–3650), default 90

Prints a single JSON object on stdout and exits 0 on success, 1 on failure.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List

import MetaTrader5 as mt5

from .observability import mt5_obs_log

ACTIONS = frozenset({"account_info", "positions", "deal_history"})

# Closed-leg deals carry realized P/L; skip account operations and opening legs.
_DEAL_ENTRY_OUT = getattr(mt5, "DEAL_ENTRY_OUT", 1)
_NON_TRADE_DEAL_TYPES = frozenset({
    getattr(mt5, "DEAL_TYPE_BALANCE", 2),
    getattr(mt5, "DEAL_TYPE_CREDIT", 3),
    getattr(mt5, "DEAL_TYPE_CHARGE", 4),
    getattr(mt5, "DEAL_TYPE_CORRECTION", 5),
    getattr(mt5, "DEAL_TYPE_BONUS", 6),
    getattr(mt5, "DEAL_TYPE_COMMISSION", 7),
    getattr(mt5, "DEAL_TYPE_COMMISSION_DAILY", 8),
    getattr(mt5, "DEAL_TYPE_COMMISSION_MONTHLY", 9),
    getattr(mt5, "DEAL_TYPE_COMMISSION_AGENT_DAILY", 10),
    getattr(mt5, "DEAL_TYPE_COMMISSION_AGENT_MONTHLY", 11),
    getattr(mt5, "DEAL_TYPE_INTEREST", 12),
    getattr(mt5, "DEAL_TYPE_BUY_CANCELED", 13),
    getattr(mt5, "DEAL_TYPE_SELL_CANCELED", 14),
})


def _classify_init_failure(last_err: object) -> tuple[str, str]:
    """Map MetaTrader5 last_error() to stable codes (best-effort string heuristics)."""
    raw = str(last_err)
    low = raw.lower()
    net_hints = (
        "network", "host", "dns", "server", "unreachable", "cannot connect",
        "no connection", "connection", "timed out", "timeout", "wsa", "socket",
    )
    auth_hints = (
        "invalid account", "invalid password", "authentication", "authorize",
        "auth failed", "not authorized", "wrong password",
    )
    if any(h in low for h in net_hints):
        return "MT5_SERVER_INVALID", raw
    if any(h in low for h in auth_hints):
        return "MT5_LOGIN_FAILED", raw
    return "MT5_INIT_FAILED", raw


def _emit(payload: Dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def _fail(code: str, message: str) -> int:
    _emit({"ok": False, "code": code, "error": message})
    return 1


def _ok(payload: Dict[str, Any]) -> int:
    body = {"ok": True, **payload}
    _emit(body)
    return 0


def _json_safe_value(v: Any) -> Any:
    if v is None or isinstance(v, (str, int, float, bool)):
        return v
    if isinstance(v, datetime):
        return v.isoformat(sep=" ", timespec="seconds")
    return str(v)


def _deal_row(d: Any) -> Dict[str, Any]:
    """TradeDeal → dict for Aura mtTradeNormalize (exit deals only)."""
    dd = d._asdict()
    out: Dict[str, Any] = {}
    for k, v in dd.items():
        out[k] = _json_safe_value(v)
    # Help JS infer closed deals / direction
    try:
        out["entryType"] = "DEAL_ENTRY_OUT" if int(d.entry) == int(_DEAL_ENTRY_OUT) else f"DEAL_ENTRY_{int(d.entry)}"
    except (TypeError, ValueError, AttributeError):
        out["entryType"] = ""
    return out


def main() -> int:
    if len(sys.argv) < 6:
        return _fail(
            "MT5_WORKER_USAGE",
            "Expected: mt5_worker <instance_path> <login> <password> <server> <action>",
        )

    instance_raw = sys.argv[1]
    try:
        login = int(sys.argv[2])
    except ValueError:
        return _fail("MT5_WORKER_BAD_LOGIN", "Login must be an integer")

    password = sys.argv[3]
    server = sys.argv[4]
    action = sys.argv[5]

    history_days = 90
    if action == "deal_history" and len(sys.argv) >= 7:
        try:
            history_days = max(1, min(3650, int(sys.argv[6])))
        except ValueError:
            history_days = 90

    mt5_obs_log("mt5_worker", "job_start", login=login, server=server, action=action, history_days=history_days)

    instance_path = Path(instance_raw).expanduser().resolve()
    terminal = instance_path / "terminal64.exe"

    if not instance_path.is_dir():
        return _fail(
            "MT5_INSTANCE_INVALID",
            f"Instance path is not a directory: {instance_path}",
        )

    if not terminal.is_file():
        return _fail(
            "MT5_TERMINAL_MISSING",
            f"terminal64.exe not found at {terminal}",
        )

    exit_code = 1
    try:
        if action not in ACTIONS:
            return _fail("UNKNOWN_ACTION", f"Unsupported action: {action!r}")

        # Portable mode: terminal exe + data under the same instance root.
        if not mt5.initialize(
            path=str(terminal),
            login=login,
            password=password,
            server=server,
            portable=True,
            data_path=str(instance_path),
            timeout=60000,
        ):
            code, msg = _classify_init_failure(mt5.last_error())
            mt5_obs_log("mt5_worker", "login_failed", login=login, server=server, error_code=code)
            return _fail(code, msg)

        mt5_obs_log("mt5_worker", "terminal_initialized", login=login, server=server, action=action)

        if action == "account_info":
            acc = mt5.account_info()
            if acc is None:
                return _fail(
                    "ACCOUNT_INFO_UNAVAILABLE",
                    str(mt5.last_error()),
                )
            exit_code = _ok(
                {
                    "data": {
                        "balance": acc.balance,
                        "equity": acc.equity,
                        "profit": acc.profit,
                        "margin": acc.margin,
                        "currency": acc.currency,
                    }
                }
            )
            mt5_obs_log("mt5_worker", "account_info_ok", login=login)
        elif action == "positions":
            pos = mt5.positions_get()
            if pos is None:
                mt5_obs_log("mt5_worker", "positions_error", login=login, error_code="POSITIONS_GET_FAILED")
                return _fail("POSITIONS_GET_FAILED", str(mt5.last_error()))

            trades = [p._asdict() for p in pos]
            for t in trades:
                for k, v in list(t.items()):
                    t[k] = _json_safe_value(v)
            exit_code = _ok({"trades": trades})
            mt5_obs_log("mt5_worker", "positions_fetched", login=login, count=len(trades))

        elif action == "deal_history":
            utc_to = datetime.now()
            utc_from = utc_to - timedelta(days=history_days)
            deals = mt5.history_deals_get(utc_from, utc_to)
            if deals is None:
                mt5_obs_log("mt5_worker", "history_error", login=login, error_code="DEAL_HISTORY_FAILED")
                return _fail("DEAL_HISTORY_FAILED", str(mt5.last_error()))

            buy = getattr(mt5, "DEAL_TYPE_BUY", 0)
            sell = getattr(mt5, "DEAL_TYPE_SELL", 1)
            trades_out: List[Dict[str, Any]] = []
            for d in deals:
                try:
                    if d.type in _NON_TRADE_DEAL_TYPES:
                        continue
                    if d.type not in (buy, sell):
                        continue
                    if int(d.entry) != int(_DEAL_ENTRY_OUT):
                        continue
                    sym = str(getattr(d, "symbol", "") or "").strip()
                    if not sym:
                        continue
                    trades_out.append(_deal_row(d))
                except (TypeError, ValueError, AttributeError):
                    continue

            exit_code = _ok({"trades": trades_out})
            mt5_obs_log(
                "mt5_worker",
                "history_fetched",
                login=login,
                count=len(trades_out),
                history_days=history_days,
            )

    except Exception as e:
        mt5_obs_log("mt5_worker", "worker_exception", login=login, error_code="MT5_WORKER_EXCEPTION")
        return _fail("MT5_WORKER_EXCEPTION", str(e))
    finally:
        try:
            mt5.shutdown()
        except Exception:
            pass

    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
