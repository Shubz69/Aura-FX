"""
Subprocess entrypoint for MT5 (one shot per invocation).

Usage: python -m app.mt5_worker <instance_path> <login> <password> <server> <action>

Prints a single JSON object on stdout and exits 0 on success, 1 on failure.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, Dict

import MetaTrader5 as mt5

ACTIONS = frozenset({"account_info", "positions"})


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


def main() -> int:
    if len(sys.argv) != 6:
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
            return _fail(code, msg)

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
        elif action == "positions":
            pos = mt5.positions_get()
            if pos is None:
                return _fail("POSITIONS_GET_FAILED", str(mt5.last_error()))

            trades = [p._asdict() for p in pos]
            for t in trades:
                for k, v in list(t.items()):
                    if not isinstance(v, (str, int, float, bool, type(None))):
                        t[k] = str(v)
            exit_code = _ok({"trades": trades})

    except Exception as e:
        return _fail("MT5_WORKER_EXCEPTION", str(e))
    finally:
        try:
            mt5.shutdown()
        except Exception:
            pass

    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
