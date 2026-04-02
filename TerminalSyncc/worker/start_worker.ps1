$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

if (-not (Test-Path ".venv")) {
  py -3.11 -m venv .venv
}

& ".\.venv\Scripts\python.exe" -m pip install --upgrade pip
& ".\.venv\Scripts\python.exe" -m pip install -r ".\requirements.txt"

if (-not $env:WORKER_SECRET) {
  throw "WORKER_SECRET is missing. Set it before starting the worker."
}

if (-not $env:PORT) {
  $env:PORT = "8000"
}

& ".\.venv\Scripts\python.exe" -m uvicorn app.main:app --host 0.0.0.0 --port $env:PORT
