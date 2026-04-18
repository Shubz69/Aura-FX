# Copies TradingView Charting Library (and optional datafeeds/) into public/.
# UDF is bundled in the app (src/utils/udfCompatibleDatafeed.js); datafeeds/ is only needed if you revert to script-tag loading.
# DevTools "MIME type text/html" for a mangled bundle.js URL is usually extensions or stale console — see docs/trader-deck-verification.md Pass E.
# Prerequisite: Git access to https://github.com/tradingview/charting_library (private; request access from TradingView).
# Usage (from repo root):  powershell -ExecutionPolicy Bypass -File scripts/copy-tradingview-charting-library.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$publicDir = Join-Path $root "public"
$repo = "https://github.com/tradingview/charting_library.git"
$branch = "master"
$tmp = Join-Path $env:TEMP ("tv-charting-lib-" + [Guid]::NewGuid().ToString())

try {
  git clone -q --depth 1 -b $branch $repo $tmp
  Remove-Item -Recurse -Force (Join-Path $publicDir "charting_library") -ErrorAction SilentlyContinue
  Remove-Item -Recurse -Force (Join-Path $publicDir "datafeeds") -ErrorAction SilentlyContinue
  Copy-Item -Recurse (Join-Path $tmp "charting_library") (Join-Path $publicDir "charting_library")
  Copy-Item -Recurse (Join-Path $tmp "datafeeds") (Join-Path $publicDir "datafeeds")
  Write-Host "OK: charting_library and datafeeds copied to public/"
}
finally {
  if (Test-Path $tmp) {
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
  }
}
