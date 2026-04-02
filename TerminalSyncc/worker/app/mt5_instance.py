"""
MT5Instance — one portable terminal copy per login.

Operations run in a subprocess (`python -m app.mt5_worker`) to avoid IPC collisions
and Windows multiprocessing issues when handling multiple accounts.
Per-login job serialization + global subprocess cap prevent overload and data races.
"""

from __future__ import annotations

import json
import os
import random
import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Any, Dict, Optional, Set

import psutil

from .config import (
    BUILD_TMP_SUFFIX,
    INSTANCES_DIR,
    INSTANCE_MARKER_NAME,
    LAST_USED_NAME,
    MT5_GLOBAL_JOB_ACQUIRE_TIMEOUT,
    MT5_INSTANCE_LOCK_TIMEOUT,
    MT5_MAX_CONCURRENT_JOBS,
    TEMPLATE_PATH,
    validate_mt5_template,
)
from .errors import WorkerError

SUBPROCESS_TIMEOUT = 60
SUBPROCESS_TIMEOUT_LONG = 120  # deal history can return many rows
_STDOUT_SNIP = 800
_STDERR_MAX = 16_000

_global_job_sem = threading.BoundedSemaphore(MT5_MAX_CONCURRENT_JOBS)

# Logins currently executing a subprocess (for idle sweeper — process-local).
active_mt5_logins: Set[int] = set()
active_mt5_guard = threading.Lock()


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


def _instance_build_lock_path(login: int) -> Path:
    return INSTANCES_DIR / f".acc_{login}.instancelock"


def _instance_job_lock_path(login: int) -> Path:
    return INSTANCES_DIR / f".acc_{login}.joblock"


def _lock_stale(lock_path: Path) -> bool:
    try:
        pid_s = lock_path.read_text(encoding="utf-8", errors="replace").strip()
        pid = int(pid_s)
        return not psutil.pid_exists(pid)
    except (OSError, ValueError):
        return True


def _acquire_lock_exclusive(
    lock_path: Path,
    deadline_sec: float,
    busy_code: str,
    busy_message: str,
) -> Path:
    INSTANCES_DIR.mkdir(parents=True, exist_ok=True)
    deadline = time.monotonic() + deadline_sec
    while time.monotonic() < deadline:
        if lock_path.exists() and _lock_stale(lock_path):
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
    raise WorkerError(busy_code, busy_message, http_status=503)


def _release_lock(lock_path: Path) -> None:
    try:
        lock_path.unlink(missing_ok=True)
    except OSError:
        pass


def _instance_looks_ready(path: Path) -> bool:
    exe = path / "terminal64.exe"
    marker = path / INSTANCE_MARKER_NAME
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


def _touch_last_used(instance_path: Path) -> None:
    try:
        p = instance_path / LAST_USED_NAME
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(str(int(time.time())), encoding="utf-8")
    except OSError:
        pass


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

        lock_path = _acquire_lock_exclusive(
            _instance_build_lock_path(self._login),
            float(MT5_INSTANCE_LOCK_TIMEOUT),
            "MT5_INSTANCE_BUSY",
            "This MetaTrader account is being prepared on the worker; try again shortly.",
        )
        try:
            validate_mt5_template()
            if _instance_looks_ready(self.instance_path):
                return

            if self.instance_path.exists() and not _instance_looks_ready(self.instance_path):
                _rmtree_quiet(self.instance_path)

            build_dir = INSTANCES_DIR / f"acc_{self._login}{BUILD_TMP_SUFFIX}"
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
                (build_dir / INSTANCE_MARKER_NAME).write_text("ok\n", encoding="utf-8")
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
            _release_lock(lock_path)

    def _run(self, action: str, history_days: Optional[int] = None) -> dict:
        if not _instance_looks_ready(self.instance_path):
            raise WorkerError(
                "MT5_INSTANCE_INVALID",
                f"Portable instance for login {self._login} is missing or corrupted.",
                http_status=503,
            )

        job_lock = _acquire_lock_exclusive(
            _instance_job_lock_path(self._login),
            float(MT5_INSTANCE_LOCK_TIMEOUT),
            "MT5_INSTANCE_BUSY",
            f"A sync or positions request is already in progress for login {self._login}.",
        )
        acquired_sem = False
        with active_mt5_guard:
            active_mt5_logins.add(self._login)
        try:
            acquired_sem = _global_job_sem.acquire(timeout=float(MT5_GLOBAL_JOB_ACQUIRE_TIMEOUT))
            if not acquired_sem:
                raise WorkerError(
                    "MT5_WORKER_BUSY",
                    "MetaTrader worker capacity is saturated; try again shortly.",
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
            if action == "deal_history":
                cmd.append(str(int(history_days) if history_days is not None else 90))

            timeout_sec = SUBPROCESS_TIMEOUT_LONG if action == "deal_history" else SUBPROCESS_TIMEOUT

            try:
                result = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    timeout=timeout_sec,
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

            _touch_last_used(self.instance_path)
            return parsed
        finally:
            if acquired_sem:
                _global_job_sem.release()
            _release_lock(job_lock)
            with active_mt5_guard:
                active_mt5_logins.discard(self._login)

    def account_info(self) -> dict:
        return self._run("account_info")

    def positions(self) -> dict:
        return self._run("positions")

    def deal_history(self, days: int = 90) -> dict:
        return self._run("deal_history", history_days=days)

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
