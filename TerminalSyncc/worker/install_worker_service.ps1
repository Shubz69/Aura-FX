$ErrorActionPreference = "Stop"

param(
  [Parameter(Mandatory = $true)]
  [string]$WorkerSecret,
  [string]$ServiceName = "TerminalSyncWorker",
  [string]$Port = "8000"
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$nssmPath = Join-Path $scriptDir "nssm.exe"

if (-not (Test-Path $nssmPath)) {
  throw "nssm.exe not found in worker folder. Download NSSM and place nssm.exe here."
}

Set-Location $scriptDir

if (-not (Test-Path ".venv")) {
  py -3.11 -m venv .venv
}

& ".\.venv\Scripts\python.exe" -m pip install --upgrade pip
& ".\.venv\Scripts\python.exe" -m pip install -r ".\requirements.txt"

$pythonExe = (Resolve-Path ".\.venv\Scripts\python.exe").Path
$appArgs = "-m uvicorn app.main:app --host 0.0.0.0 --port $Port"

& $nssmPath install $ServiceName $pythonExe $appArgs
& $nssmPath set $ServiceName AppDirectory $scriptDir
& $nssmPath set $ServiceName AppEnvironmentExtra "WORKER_SECRET=$WorkerSecret" "PORT=$Port"
& $nssmPath set $ServiceName Start SERVICE_AUTO_START
& $nssmPath start $ServiceName

Write-Host "Installed and started service '$ServiceName' on port $Port."
