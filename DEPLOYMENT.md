# Redlime Bidding – Deployment Guide

Deploy your MERN app using **MongoDB Atlas**, **Render** (backend), and **Vercel** (frontend).

---

## Step 1: MongoDB Atlas (Database)

1. Go to [mongodb.com/atlas](https://www.mongodb.com/atlas) and sign up or log in.
2. Create a new cluster:
   - Choose a cloud provider (e.g. AWS) and region.
   - Select **M0 (Free)**.
   - Click **Create**.
3. Create a database user:
   - **Database Access** → **Add New Database User**
   - Choose **Password** and set username/password (save them).
   - Database User Privileges: **Read and write to any database**.
4. Allow network access:
   - **Network Access** → **Add IP Address**
   - Add **0.0.0.0/0** (allow from anywhere) for cloud deployment.
5. Get your connection string:
   - **Database** → **Connect** → **Connect your application**
   - Copy the URI, e.g. `mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority`
   - Replace `<password>` with your user password.
   - Add a database name before `?`: `mongodb+srv://...mongodb.net/redlime-bidding?retryWrites=true&w=majority`

---

## Step 2: Render (Backend)

1. Go to [render.com](https://render.com) and sign up or log in.
2. Push your code to GitHub (if not already):
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/RedlimeBidding.git
   git push -u origin main
   ```
3. Create a new Web Service:
   - **New** → **Web Service**
   - Connect your GitHub repo and select `RedlimeBidding`.
4. Configure the service:
   - **Name:** `redlime-bidding-api` (or similar)
   - **Region:** Choose closest to your users
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
5. Add environment variables (Environment tab):
   | Key | Value |
   |-----|-------|
   | `MONGODB_URI` | Your Atlas connection string |
   | `JWT_SECRET` | A long random string (e.g. from `openssl rand -hex 32`) |
   | `PORT` | `5000` (Render sets this automatically; optional) |
   | `CORS_ORIGINS` | `https://your-app.vercel.app` (add after Vercel deploy) |
6. Deploy. Render will build and start the backend.
7. Copy your backend URL, e.g. `https://redlime-bidding-api.onrender.com`.

---

## Step 3: Vercel (Frontend)

1. Go to [vercel.com](https://vercel.com) and sign up or log in.
2. Import your GitHub repo:
   - **Add New** → **Project** → Import `RedlimeBidding`.
3. Configure the project:
   - **Framework Preset:** Vite
   - **Root Directory:** `client`
   - **Build Command:** `npm run build` (default)
   - **Output Directory:** `dist` (default)
4. Add environment variable:
   | Key | Value |
   |-----|-------|
   | `VITE_API_URL` | Your Render backend URL, e.g. `https://redlime-bidding-api.onrender.com` |
5. Deploy. Vercel will build and host the frontend.
6. Copy your frontend URL, e.g. `https://redlime-bidding.vercel.app`.

---

## Step 4: Update CORS on Render

1. In Render, open your backend service → **Environment**.
2. Set or update `CORS_ORIGINS` to your Vercel URL:
   ```
   https://redlime-bidding.vercel.app
   ```
   For multiple origins, use commas: `https://app1.vercel.app,https://app2.vercel.app`
3. Save. Render will redeploy with the new env var.

---

## Step 5: Create Admin User

After deployment, create an admin user:

1. Use the sign-up endpoint (or a seed script) to register a user.
2. In MongoDB Atlas:
   - **Database** → **Browse Collections** → `redlime-bidding` → `users`
   - Find the new user and set `role: "admin"` and `status: "approved"`.

Or run a seed script locally once, pointing at your Atlas URI:

```bash
MONGODB_URI="your-atlas-uri" npm run seed
```

---

## Summary

| Service | URL | Purpose |
|---------|-----|---------|
| MongoDB Atlas | Connection string | Database |
| Render | `https://xxx.onrender.com` | Backend API |
| Vercel | `https://xxx.vercel.app` | Frontend |

---

## Troubleshooting

- **CORS errors:** Ensure `CORS_ORIGINS` on Render includes your exact Vercel URL (with `https://`).
- **API not reachable:** Render free tier sleeps after inactivity; first request may take ~30 seconds.
- **MongoDB connection failed:** Check Atlas IP whitelist (0.0.0.0/0) and connection string.
- **401 / auth issues:** Confirm `JWT_SECRET` is the same everywhere and not empty.
