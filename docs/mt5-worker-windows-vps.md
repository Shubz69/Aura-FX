# MT5 Worker on Windows VPS

This project's `TerminalSyncc/worker` requires:

- `MetaTrader5` Python package
- A local MT terminal runtime (`terminal64.exe`)
- Windows IPC for terminal login and session handling

It will not run on Linux-only hosts like Render web services.

## Recommended production architecture

1. Host `TerminalSyncc/worker` on a Windows VPS.
2. Expose it behind HTTPS (Cloudflare Tunnel, Caddy, or IIS reverse proxy).
3. Set the same strong secret in:
   - Worker env: `WORKER_SECRET`
   - API env: `TERMINALSYNC_WORKER_SECRET`
4. Point API env `TERMINALSYNC_WORKER_URL` to worker HTTPS URL.

## Minimum VPS spec

- Windows Server 2022
- 4 vCPU
- 8 GB RAM
- 120+ GB SSD/NVMe
- Static public IP

## Setup steps on VPS

1. Install Python 3.11 x64.
2. Install MT terminal template files so `worker/MT5_TEMPLATE/terminal64.exe` exists.
3. Clone repo and open PowerShell as admin.
4. Run one-time service install:

```powershell
cd "C:\path\to\Aura FX\TerminalSyncc\worker"
.\install_worker_service.ps1 -WorkerSecret "<strong-secret>" -Port "8000"
```

5. Validate health:

```powershell
curl.exe http://127.0.0.1:8000/health
```

6. Expose HTTPS URL and confirm from external client.

## Vercel API env wiring

Set in Production:

- `TERMINALSYNC_WORKER_URL=https://<your-worker-host>`
- `TERMINALSYNC_WORKER_SECRET=<same-strong-secret>`

After setting env vars, redeploy and test MT5 connect.
