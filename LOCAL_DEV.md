# Local development — see updates before you commit

**Workflow:** Run the app on localhost → edit code → see changes instantly in the browser → keep editing until it’s perfect → then commit and push.

---

## Quick start (see changes as you edit)

**Option A – Full stack (app + API on your machine)**  
1. One-time: `npm i -g vercel` and create `.env.local` (see below).  
2. From the project folder, run: **`vercel dev`** (run this directly; do not use `npm run dev` or Vercel will recurse).  
3. Open [http://localhost:3000](http://localhost:3000). Edit any file in `src/` or `api/` — the browser updates automatically. Commit only when you’re happy.

**Option B – UI only (fastest, uses live API)**  
1. In `.env.local`: `REACT_APP_API_URL=https://aura-fx-ten.vercel.app` (or your Vercel URL).  
2. Run: **`npm start`**  
3. Open [http://localhost:3000](http://localhost:3000). Edit `src/` or styles — changes show immediately. Commit when ready.

---

## One-command setup (recommended for full stack)

1. **Install Vercel CLI** (one-time):
   ```bash
   npm i -g vercel
   ```

2. **Environment variables**  
   Create `.env.local` in the project root with the same variables you use on Vercel (e.g. MySQL, Stripe, JWT secret). You can pull them from Vercel:
   ```bash
   vercel link
   vercel env pull .env.local
   ```
   Or copy from Vercel Dashboard → Project → Settings → Environment Variables and paste into `.env.local`.

3. **Start local dev** (from project root, e.g. `C:\Users\1230s\OneDrive\Documents\Samy\Aura FX`):
   ```bash
   vercel dev
   ```
   Use `vercel dev` directly. Do **not** use `npm run dev` here, or Vercel will try to run itself again and error.

4. **Open** [http://localhost:3000](http://localhost:3000).  
   - The React app runs with **hot reload**: edits to `src/` (JS, CSS) update in the browser without a full refresh.  
   - `/api/*` requests are handled by Vercel’s local serverless runtime, so your API runs locally too.

You can test login, community, subscriptions, and roles against your local DB/Stripe test keys before pushing to Vercel.

---

## Alternative: frontend only (API on Vercel)

If you only want to work on the UI and use the live API:

1. In `.env.local` set:
   ```env
   REACT_APP_API_URL=https://your-app.vercel.app
   ```
2. Run:
   ```bash
   npm start
   ```
   React runs at [http://localhost:3000](http://localhost:3000) with hot reload; API calls go to your Vercel deployment.

---

## Summary

| Goal                         | Command        | Hot reload | API        |
|-----------------------------|----------------|------------|------------|
| Full local (recommended)    | `vercel dev`   | Yes        | Local      |
| UI only, API on Vercel      | `npm start`    | Yes        | Production |

---

## Daily workflow

1. **Start:** From project folder run `vercel dev` (full stack) or `npm start` (UI only) → open http://localhost:3000  
2. **Edit:** Change any file in `src/` or `api/` (or styles). Save.  
3. **See:** The app reloads automatically — no manual refresh.  
4. **Repeat:** Keep editing until everything looks and works the way you want.  
5. **Commit:** When it’s perfect, `git add`, `git commit`, `git push` — then Vercel deploys.
