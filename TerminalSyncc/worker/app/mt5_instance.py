"""
MT5Instance — manages one account's portable terminal.

All MT5 operations run in a subprocess (via subprocess.Popen)
so multiple accounts can be active simultaneously without
IPC collisions, and Windows multiprocessing issues are avoided.
"""

import sys
import json
import shutil
import subprocess
import psutil

from .config import TEMPLATE_PATH, INSTANCES_DIR


# Max seconds to wait for the subprocess to finish
SUBPROCESS_TIMEOUT = 60


class MT5Instance:

    def __init__(self, login: int, password: str, server: str):
        self._login = login
        self._password = password
        self._server = server
        self.instance_path = INSTANCES_DIR / f"acc_{login}"

    # ── Ensure portable copy exists ──────────────────
    def ensure_instance(self):
        if not self.instance_path.exists():
            shutil.copytree(TEMPLATE_PATH, self.instance_path)

    # ── Run an action in a subprocess ────────────────
    def _run(self, action: str) -> dict:
        try:
            result = subprocess.run(
                [
                    sys.executable,
                    "-m", "app.mt5_worker",
                    str(self.instance_path),
                    str(self._login),
                    self._password,
                    self._server,
                    action,
                ],
                capture_output=True,
                text=True,
                timeout=SUBPROCESS_TIMEOUT,
                cwd=str(INSTANCES_DIR.parent),  # worker/ directory
            )
        except subprocess.TimeoutExpired:
            self._cleanup_orphaned_terminal()
            raise RuntimeError(f"MT5_TIMEOUT: The operation timed out after {SUBPROCESS_TIMEOUT}s. Check broker server name or credentials.")

        if result.returncode != 0:
            stderr = result.stderr.strip()
            raise RuntimeError(
                f"MT5_SUBPROCESS_CRASHED: {stderr or 'no stderr'}"
            )

        stdout = result.stdout.strip()
        if not stdout:
            raise RuntimeError("MT5_SUBPROCESS_NO_OUTPUT")

        data = json.loads(stdout)

        if not data.get("ok"):
            raise RuntimeError(data.get("error", "UNKNOWN_ERROR"))

        return data

    # ── Public API ───────────────────────────────────
    def account_info(self) -> dict:
        return self._run("account_info")

    def positions(self) -> dict:
        return self._run("positions")

    # ── Process Cleanup ──────────────────────────────
    def _cleanup_orphaned_terminal(self):
        """Forcefully kills any terminal64.exe running from this instance path."""
        target_path = str(self.instance_path).lower()
        for proc in psutil.process_iter(['pid', 'name', 'exe']):
            try:
                name = proc.info.get('name')
                exe = proc.info.get('exe')
                if name and 'terminal64.exe' in name.lower() and exe:
                    if target_path in exe.lower():
                        proc.kill()
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                pass