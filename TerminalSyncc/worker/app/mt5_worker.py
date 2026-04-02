"""
Standalone subprocess script for MT5 operations.

Run as: python -m app.mt5_worker <instance_path> <login> <password> <server> <action>

Outputs JSON to stdout. Exits cleanly after each operation.
This file is invoked via subprocess.Popen from mt5_instance.py,
so it never triggers multiprocessing re-import issues on Windows.
"""

import sys
import json
import MetaTrader5 as mt5


def main():
    if len(sys.argv) != 6:
        print(json.dumps({
            "ok": False,
            "error": "Usage: mt5_worker <instance_path> <login> <password> <server> <action>"
        }))
        sys.exit(1)

    instance_path = sys.argv[1]
    login = int(sys.argv[2])
    password = sys.argv[3]
    server = sys.argv[4]
    action = sys.argv[5]

    terminal = f"{instance_path}\\terminal64.exe"

    try:
        # ── Initialize + Login in one step ───────────────
        if not mt5.initialize(
            path=terminal,
            login=login,
            password=password,
            server=server,
            portable=True,
            data_path=instance_path,
            timeout=60000  # 60 seconds inside MT5 to accommodate LiveUpdates
        ):
            error = mt5.last_error()
            print(json.dumps({
                "ok": False,
                "error": f"MT5_INIT_FAILED: {error}"
            }))
            return

        # ── Perform Action ───────────────────────────────
        if action == "account_info":
            acc = mt5.account_info()
            if acc is None:
                print(json.dumps({
                    "ok": False,
                    "error": "ACCOUNT_INFO_UNAVAILABLE"
                }))
            else:
                print(json.dumps({
                    "ok": True,
                    "data": {
                        "balance": acc.balance,
                        "equity": acc.equity,
                        "profit": acc.profit,
                        "margin": acc.margin,
                        "currency": acc.currency,
                    }
                }))

        elif action == "positions":
            pos = mt5.positions_get()
            if pos is None:
                error = mt5.last_error()
                print(json.dumps({
                    "ok": False,
                    "error": f"POSITIONS_GET_FAILED: {error}"
                }))
                return

            trades = [p._asdict() for p in pos]
            # Convert any non-serializable types
            for t in trades:
                for k, v in t.items():
                    if not isinstance(v, (str, int, float, bool, type(None))):
                        t[k] = str(v)
            print(json.dumps({
                "ok": True,
                "trades": trades
            }))

        else:
            print(json.dumps({
                "ok": False,
                "error": f"UNKNOWN_ACTION: {action}"
            }))

    except Exception as e:
        print(json.dumps({
            "ok": False,
            "error": str(e)
        }))

    finally:
        try:
            mt5.shutdown()
        except Exception:
            pass


if __name__ == "__main__":
    main()
