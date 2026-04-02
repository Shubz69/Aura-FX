"""
Startup + idle maintenance for portable MT5 instance directories.

Safe-only: removes stale build temps, dead PID locks, broken instance trees,
and idle account folders past TTL when not actively in use.
"""

from __future__ import annotations

import logging
import shutil
import threading
import time
from pathlib import Path
from typing import Optional, Set

import psutil

from .config import (
    BUILD_TMP_SUFFIX,
    INSTANCES_DIR,
    INSTANCE_MARKER_NAME,
    LAST_USED_NAME,
    MT5_INSTANCE_IDLE_TTL_MINUTES,
    TEMPLATE_PATH,
)

logger = logging.getLogger("terminalsync.lifecycle")

_sweep_thread: Optional[threading.Thread] = None
_sweep_stop = threading.Event()


def _lock_stale(lock_path: Path) -> bool:
    try:
        pid_s = lock_path.read_text(encoding="utf-8", errors="replace").strip()
        pid = int(pid_s)
        return not psutil.pid_exists(pid)
    except (OSError, ValueError):
        return True


def _instance_dir_healthy(path: Path) -> bool:
    exe = path / "terminal64.exe"
    marker = path / INSTANCE_MARKER_NAME
    return path.is_dir() and exe.is_file() and marker.is_file()


def startup_cleanup() -> None:
    """Remove stale build dirs, stale locks, and clearly broken instance folders."""
    INSTANCES_DIR.mkdir(parents=True, exist_ok=True)
    now = time.time()
    max_build_age_sec = 3600.0

    try:
        entries = list(INSTANCES_DIR.iterdir())
    except OSError:
        return

    for child in entries:
        name = child.name
        try:
            if child.is_file() and (name.endswith(".instancelock") or name.endswith(".joblock")):
                if _lock_stale(child):
                    child.unlink(missing_ok=True)
                    logger.info("Removed stale lock file: %s", child.name)

            if child.is_dir() and name.endswith(BUILD_TMP_SUFFIX):
                try:
                    st = child.stat()
                except OSError:
                    continue
                if now - st.st_mtime > max_build_age_sec:
                    shutil.rmtree(child, ignore_errors=True)
                    logger.info("Removed stale build temp: %s", name)

            if child.is_dir() and name.startswith("acc_") and not name.endswith(BUILD_TMP_SUFFIX):
                if child.resolve() == TEMPLATE_PATH.resolve():
                    continue
                if not _instance_dir_healthy(child):
                    shutil.rmtree(child, ignore_errors=True)
                    logger.warning("Removed corrupted instance folder: %s", name)
        except OSError as e:
            logger.debug("lifecycle startup skip %s: %s", name, e)


def idle_sweep(active_logins: Set[int], active_lock: threading.Lock) -> None:
    """Delete instance dirs unused for TTL when not actively in use."""
    cutoff = time.time() - (MT5_INSTANCE_IDLE_TTL_MINUTES * 60)
    with active_lock:
        busy = set(active_logins)

    try:
        entries = list(INSTANCES_DIR.iterdir())
    except OSError:
        return

    for child in entries:
        name = child.name
        if not child.is_dir() or not name.startswith("acc_") or name.endswith(BUILD_TMP_SUFFIX):
            continue
        try:
            login = int(name.replace("acc_", "", 1))
        except ValueError:
            continue

        if login in busy:
            continue

        last_used = child / LAST_USED_NAME
        ref = last_used if last_used.is_file() else (child / "terminal64.exe")
        try:
            st = ref.stat()
        except OSError:
            continue

        if st.st_mtime >= cutoff:
            continue

        with active_lock:
            if login in active_logins:
                continue
        try:
            shutil.rmtree(child, ignore_errors=False)
            logger.info(
                "Idle cleanup removed instance acc_%s (unused > %s min)",
                login,
                MT5_INSTANCE_IDLE_TTL_MINUTES,
            )
        except OSError as e:
            logger.warning("Idle cleanup skipped acc_%s: %s", login, e)


def _sweep_loop(active_logins: Set[int], active_lock: threading.Lock) -> None:
    # Between 5–60 minutes; shorter when TTL is modest, without tying to TTL*30 (which would be huge).
    ttl_sec = float(MT5_INSTANCE_IDLE_TTL_MINUTES) * 60.0
    interval_sec = int(max(300.0, min(3600.0, ttl_sec / 4.0)))
    while not _sweep_stop.wait(timeout=interval_sec):
        try:
            idle_sweep(active_logins, active_lock)
            startup_cleanup()
        except Exception:
            logger.exception("Idle sweep iteration failed")


def start_background_sweep(active_logins: Set[int], active_lock: threading.Lock) -> None:
    global _sweep_thread
    if _sweep_thread and _sweep_thread.is_alive():
        return
    _sweep_stop.clear()
    _sweep_thread = threading.Thread(
        target=_sweep_loop,
        args=(active_logins, active_lock),
        name="mt5-instance-sweep",
        daemon=True,
    )
    _sweep_thread.start()


def stop_background_sweep() -> None:
    _sweep_stop.set()
    global _sweep_thread
    t = _sweep_thread
    if t and t.is_alive():
        t.join(timeout=5.0)
