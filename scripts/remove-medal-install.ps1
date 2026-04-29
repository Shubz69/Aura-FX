# Removes Medal's Squirrel install folder so a fresh installer can run.
# Run in an elevated PowerShell (Run as administrator) if normal delete fails.

$ErrorActionPreference = 'Continue'
$MedalRoot = Join-Path $env:LOCALAPPDATA 'Medal'
$IsAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class MedalCleanup {
  [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
  public static extern bool MoveFileEx(string lpExistingFileName, string lpNewFileName, int dwFlags);
  public const int MOVEFILE_DELAY_UNTIL_REBOOT = 4;
}
"@

function Stop-MedalProcesses {
  @('Medal', 'Medal TV') | ForEach-Object {
    Get-Process -Name $_ -ErrorAction SilentlyContinue | ForEach-Object {
      Write-Host "Stopping $($_.Name) PID $($_.Id)"
      Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }
  }
  Start-Sleep -Seconds 2
  cmd /c "taskkill /F /IM Medal.exe /T 2>nul & taskkill /F /IM Medal.exe /T 2>nul"
  Start-Sleep -Seconds 1
  Get-CimInstance Win32_Process -Filter "Name = 'Medal.exe'" -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Host "taskkill /F /PID $($_.ProcessId)"
    cmd /c "taskkill /F /PID $($_.ProcessId) /T 2>nul"
  }
  Start-Sleep -Seconds 1
  $still = Get-Process -Name 'Medal' -ErrorAction SilentlyContinue
  if ($still) {
    Write-Warning "Medal.exe is still running (PIDs: $($still.Id -join ', ')). The hook DLL stays locked until it exits or you reboot."
  }
}

function Remove-MedalFolder {
  if (-not (Test-Path -LiteralPath $MedalRoot)) {
    Write-Host "Nothing to remove: $MedalRoot does not exist."
    return $true
  }
  try {
    Remove-Item -LiteralPath $MedalRoot -Recurse -Force -ErrorAction Stop
    Write-Host "Removed: $MedalRoot"
    return $true
  }
  catch {
    Write-Warning $_.Exception.Message
    return $false
  }
}

function Remove-MedalFolder-Cmd {
  if (-not (Test-Path -LiteralPath $MedalRoot)) { return $true }
  $p = $MedalRoot -replace '/', '\'
  $user = "$env:USERDOMAIN\$env:USERNAME"
  $o = cmd /c "takeown /f `"$p`" /r /d y 2>&1 & icacls `"$p`" /grant *S-1-5-32-544:F /grant `"$user`":F /t /c /q 2>&1 & rmdir /s /q `"$p`" 2>&1"
  if (-not (Test-Path -LiteralPath $MedalRoot)) {
    Write-Host "Removed via takeown/icacls/rmdir: $MedalRoot"
    return $true
  }
  Write-Warning "takeown/rmdir output (last lines):"
  ($o | Select-Object -Last 8) | ForEach-Object { Write-Warning $_ }
  return $false
}

function Schedule-DeleteOnReboot {
  if (-not (Test-Path -LiteralPath $MedalRoot)) { return 0 }
  $paths = @(cmd /c "dir /s /b /a:-d `"$MedalRoot`" 2>nul" | Where-Object { $_ -and (Test-Path -LiteralPath $_) })
  $n = 0
  foreach ($full in $paths) {
    $candidates = New-Object System.Collections.Generic.List[string]
    $candidates.Add($full)
    try {
      $long = '\\?\' + [System.IO.Path]::GetFullPath($full)
      if ($long -ne $full) { $candidates.Add($long) }
    }
    catch { }
    $ok = $false
    foreach ($c in $candidates) {
      if ([MedalCleanup]::MoveFileEx($c, $null, [MedalCleanup]::MOVEFILE_DELAY_UNTIL_REBOOT)) {
        $ok = $true
        break
      }
    }
    if ($ok) {
      $n++
    }
    else {
      $err = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
      $hint = switch ($err) {
        2 { ' (file not found)' }
        3 { ' (path not found — try reboot then run script again)' }
        5 { ' (access denied)' }
        32 { ' (file in use)' }
        default { '' }
      }
      Write-Warning "MoveFileEx failed for: $full (Win32 $err)$hint"
    }
  }
  Write-Host "Scheduled $n file(s) for deletion on next restart (Windows removes them before logon)."
  return $n
}

Write-Host "Medal install path: $MedalRoot"
Stop-MedalProcesses

if (Remove-MedalFolder) {
  Write-Host "Done. You can run the Medal installer now."
  exit 0
}

if ($IsAdmin) {
  Write-Host "Retrying removal with takeown/icacls (admin)..."
  if (Remove-MedalFolder-Cmd) {
    Write-Host "Done. You can run the Medal installer now."
    exit 0
  }
}

Write-Host "Delete failed (files still locked). Scheduling delete-on-reboot for all files under Medal..."
$queued = Schedule-DeleteOnReboot
Write-Host ""
Write-Host "Next steps:"
if ($queued -gt 0) {
  Write-Host "  1. Restart your PC (Windows will delete the queued files at startup)."
  Write-Host "  2. After reboot, remove any empty Medal folder if needed, then run the Medal installer."
}
else {
  Write-Host "  1. Restart the PC (this clears the stuck Medal.exe / hook DLL locks)."
  Write-Host "  2. Before launching Medal, run this script again in an elevated PowerShell, or delete:"
  Write-Host "     $MedalRoot"
  Write-Host "  If it still fails: Settings - Recovery - Advanced startup - Restart now, then Troubleshoot - Advanced options - Startup Settings - Restart, choose Safe Mode, delete that folder, reboot."
}
Write-Host "  3. Run the Medal installer (use Run as administrator on the installer if errors persist)."
Write-Host ""
Write-Host "Elevated one-liner (copy into Admin PowerShell if needed):"
Write-Host "  Set-ExecutionPolicy -Scope Process Bypass -Force; & '$PSCommandPath'"
