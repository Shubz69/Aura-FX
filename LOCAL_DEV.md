# Local development (before deploying to Vercel)

Run the app and API on your machine so you can test everything and see changes instantly.

## One-command setup (recommended)

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

3. **Start local dev**:
   ```bash
   npm run dev
   ```
   (or `vercel dev`)

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

| Goal                         | Command       | Hot reload | API        |
|-----------------------------|---------------|------------|------------|
| Full local (recommended)    | `npm run dev` | Yes        | Local      |
| UI only, API on Vercel      | `npm start`   | Yes        | Production |
