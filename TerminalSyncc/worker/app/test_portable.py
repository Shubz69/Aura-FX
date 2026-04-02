import MetaTrader5 as mt5
import os
import shutil
from pathlib import Path

# Update these to your actual absolute paths
BASE_DIR = Path(r"C:\Users\anila\OneDrive\Desktop\TerminalSync")
TEMPLATE = BASE_DIR / "worker" / "template" # Verify this path!
TEST_INSTANCE = BASE_DIR / "worker" / "instances" / "test_acc"

def run_diagnostic():
    print("--- Starting MT5 Diagnostic ---")
    
    # 1. Clean up old test
    if TEST_INSTANCE.exists():
        print("Cleaning up old test instance...")
        shutil.rmtree(TEST_INSTANCE)

    # 2. Copy Template
    print(f"Copying template to: {TEST_INSTANCE}")
    shutil.copytree(TEMPLATE, TEST_INSTANCE)

    terminal_path = str(TEST_INSTANCE / "terminal64.exe")
    data_path = str(TEST_INSTANCE)

    print(f"Attempting Initialize...")
    print(f"Path: {terminal_path}")
    
    # 3. Try Initialization
    # We use a 30s timeout here
    success = mt5.initialize(
        path=terminal_path,
        portable=True,
        data_path=data_path,
        timeout=30000
    )

    if not success:
        print(f"❌ FAILED: {mt5.last_error()}")
    else:
        print("✅ SUCCESS: MT5 Linked via IPC!")
        print(f"Terminal Info: {mt5.terminal_info()._asdict()}")
        mt5.shutdown()

    print("--- Diagnostic Complete ---")

if __name__ == "__main__":
    run_diagnostic()