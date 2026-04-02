"""
MT5Instance — one portable terminal copy per login.

Operations run in a subprocess (`python -m app.mt5_worker`) to avoid IPC collisions
and Windows multiprocessing issues when handling multiple accounts.
"""

from __future__ import annotations

import json
import os
import random
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Dict, Optional

import psutil

from .config import INSTANCES_DIR, TEMPLATE_PATH, validate_mt5_template
from .errors import WorkerError

SUBPROCESS_TIMEOUT = 60
INSTANCE_MARKER = ".aurasync_instance_ok"
BUILD_SUFFIX = ".build.tmp"
_LOCK_TIMEOUT_SEC = 180.0
_STDOUT_SNIP = 800
_STDERR_MAX = 16_000


def _snip(text: str, limit: int) -> str:
    t = (text or "").strip()
    if len(t) <= limit:
        return t
    return t[:limit] + "…"


def _try_parse_worker_json(raw: str) -> Optional[Dict[str, Any]]:
    s = (raw or "").strip()
    if not s:
        return None
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        return None


def _instance_lock_path(login: int) -> Path:
    return INSTANCES_DIR / f".acc_{login}.instancelock"


def _lock_is_stale(lock_path: Path) -> bool:
    try:
        pid_s = lock_path.read_text(encoding="utf-8", errors="replace").strip()
        pid = int(pid_s)
        return not psutil.pid_exists(pid)
    except (OSError, ValueError):
        return True


def _acquire_instance_lock(login: int) -> Path:
    lock_path = _instance_lock_path(login)
    INSTANCES_DIR.mkdir(parents=True, exist_ok=True)
    deadline = time.monotonic() + _LOCK_TIMEOUT_SEC
    while time.monotonic() < deadline:
        if lock_path.exists() and _lock_is_stale(lock_path):
            try:
                lock_path.unlink()
            except OSError:
                pass
        try:
            fd = os.open(
                str(lock_path),
                os.O_CREAT | os.O_EXCL | os.O_WRONLY,
            )
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                fh.write(str(os.getpid()))
            return lock_path
        except FileExistsError:
            time.sleep(0.05 + random.random() * 0.05)
    raise WorkerError(
        "MT5_INSTANCE_LOCK_TIMEOUT",
        "Another request is preparing this account instance; retry later.",
        http_status=503,
    )


def _release_instance_lock(lock_path: Path) -> None:
    try:
        lock_path.unlink(missing_ok=True)
    except OSError:
        pass


def _instance_looks_ready(path: Path) -> bool:
    exe = path / "terminal64.exe"
    marker = path / INSTANCE_MARKER
    return path.is_dir() and exe.is_file() and marker.is_file()


def _rmtree_quiet(target: Path) -> None:
    if not target.exists():
        return
    try:
        shutil.rmtree(target, ignore_errors=False)
    except OSError as e:
        raise WorkerError(
            "MT5_INSTANCE_REMOVE_FAILED",
            f"Could not remove instance path {target}: {e}",
            http_status=503,
        ) from e


class MT5Instance:
    def __init__(self, login: int, password: str, server: str) -> None:
        self._login = login
        self._password = password
        self._server = server
        self.instance_path = INSTANCES_DIR / f"acc_{login}"

    def ensure_instance(self) -> None:
        validate_mt5_template()

        if _instance_looks_ready(self.instance_path):
            return

        lock_path = _acquire_instance_lock(self._login)
        try:
            validate_mt5_template()
            if _instance_looks_ready(self.instance_path):
                return

            if self.instance_path.exists() and not _instance_looks_ready(self.instance_path):
                _rmtree_quiet(self.instance_path)

            build_dir = INSTANCES_DIR / f"acc_{self._login}{BUILD_SUFFIX}"
            if build_dir.exists():
                _rmtree_quiet(build_dir)

            try:
                shutil.copytree(
                    TEMPLATE_PATH.resolve(),
                    build_dir,
                    dirs_exist_ok=False,
                    ignore_dangling_symlinks=True,
                )
            except OSError as e:
                raise WorkerError(
                    "MT5_INSTANCE_COPY_FAILED",
                    f"Could not copy MT5 template into build folder: {e}",
                    http_status=503,
                ) from e

            exe = build_dir / "terminal64.exe"
            if not exe.is_file():
                _rmtree_quiet(build_dir)
                raise WorkerError(
                    "MT5_INSTANCE_INVALID",
                    "Instance copy finished but terminal64.exe is missing (partial or bad template copy).",
                    http_status=503,
                )

            try:
                (build_dir / INSTANCE_MARKER).write_text("ok\n", encoding="utf-8")
            except OSError as e:
                _rmtree_quiet(build_dir)
                raise WorkerError(
                    "MT5_INSTANCE_COPY_FAILED",
                    f"Could not finalize instance marker: {e}",
                    http_status=503,
                ) from e

            if self.instance_path.exists():
                _rmtree_quiet(self.instance_path)

            try:
                build_dir.replace(self.instance_path)
            except OSError as e:
                _rmtree_quiet(build_dir)
                raise WorkerError(
                    "MT5_INSTANCE_COPY_FAILED",
                    f"Could not move built instance into place: {e}",
                    http_status=503,
                ) from e

            if not _instance_looks_ready(self.instance_path):
                raise WorkerError(
                    "MT5_INSTANCE_INVALID",
                    "Instance folder is present but failed post-copy validation.",
                    http_status=503,
                )
        finally:
            _release_instance_lock(lock_path)

    def _run(self, action: str) -> dict:
        if not _instance_looks_ready(self.instance_path):
            raise WorkerError(
                "MT5_INSTANCE_INVALID",
                f"Portable instance for login {self._login} is missing or corrupted.",
                http_status=503,
            )

        cmd = [
            sys.executable,
            "-m",
            "app.mt5_worker",
            str(self.instance_path.resolve()),
            str(self._login),
            self._password,
            self._server,
            action,
        ]

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=SUBPROCESS_TIMEOUT,
                cwd=str(INSTANCES_DIR.parent),
                shell=False,
            )
        except subprocess.TimeoutExpired:
            self._cleanup_orphaned_terminal()
            raise WorkerError(
                "MT5_SUBPROCESS_TIMEOUT",
                f"MT5 operation '{action}' timed out after {SUBPROCESS_TIMEOUT}s "
                f"(login={self._login}). Check broker server name and credentials.",
                http_status=504,
            )

        out = (result.stdout or "").strip()
        err = (result.stderr or "").strip()

        parsed: Optional[Dict[str, Any]] = None
        if out:
            parsed = _try_parse_worker_json(out)

        if result.returncode != 0:
            if isinstance(parsed, dict) and parsed.get("ok") is False:
                code = str(parsed.get("code") or "MT5_WORKER_ERROR")
                msg = str(parsed.get("error") or parsed.get("message") or "MT5 worker reported failure")
                raise WorkerError(code, f"[login={self._login} action={action}] {msg}", http_status=502)

            hint = _snip(err or out, _STDERR_MAX)
            raise WorkerError(
                "MT5_SUBPROCESS_FAILED",
                f"[login={self._login} action={action}] subprocess exit {result.returncode}: {hint or 'no output'}",
                http_status=502,
            )

        if not out:
            stderr_bit = f" stderr={_snip(err, 500)!r}" if err else ""
            raise WorkerError(
                "MT5_SUBPROCESS_NO_OUTPUT",
                f"[login={self._login} action={action}] empty stdout from worker{stderr_bit}",
                http_status=502,
            )

        if parsed is None:
            raise WorkerError(
                "MT5_SUBPROCESS_BAD_JSON",
                f"[login={self._login} action={action}] invalid JSON on stdout: {_snip(out, _STDOUT_SNIP)!r}",
                http_status=502,
            )

        if not parsed.get("ok"):
            code = str(parsed.get("code") or "MT5_WORKER_ERROR")
            msg = str(parsed.get("error") or "UNKNOWN_ERROR")
            raise WorkerError(code, f"[login={self._login} action={action}] {msg}", http_status=502)

        return parsed

    def account_info(self) -> dict:
        return self._run("account_info")

    def positions(self) -> dict:
        return self._run("positions")

    def _cleanup_orphaned_terminal(self) -> None:
        target_path = str(self.instance_path.resolve()).lower()
        for proc in psutil.process_iter(["pid", "name", "exe"]):
            try:
                name = proc.info.get("name") or ""
                exe = proc.info.get("exe")
                if "terminal64.exe" in name.lower() and exe:
                    if target_path in str(exe).lower():
                        proc.kill()
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                pass
