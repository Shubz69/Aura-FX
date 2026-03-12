# Railway build (Aura-FX)

This project is built with **Docker** (Node 20). If Railway still uses Nixpacks and fails with "Node.js 18.x has reached End-Of-Life":

1. **Aura-FX service → Settings**
2. Set **Root Directory** to `.` (or leave blank). If this points to a subfolder, the Dockerfile at repo root is not used.
3. Set **Builder** to **DOCKERFILE** (not Nixpacks/Railpack).
4. Redeploy.

`railway.json` already has `"builder": "DOCKERFILE"` and `"dockerfilePath": "Dockerfile"`; dashboard overrides can still force Nixpacks.
