# Redlime Bidding - Financial System

A MERN stack financial dashboard for bid management with three roles: **Bid Manager**, **Investigation Manager**, and **Admin**.

## Setup

1. **Install dependencies**
   ```bash
   npm run install-all
   ```

2. **Start MongoDB** (ensure MongoDB is running locally)

3. **Seed the database** (creates demo users)
   ```bash
   npm run seed
   ```

4. **Create `.env`** (copy from `.env.example`)
   ```bash
   cp .env.example .env
   ```

5. **Run the app**
   ```bash
   npm run dev
   ```

- Backend: http://localhost:5000
- Frontend: http://localhost:5173

## Demo Users

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@redlime.com | admin123 |
| Bid Manager | bid1@redlime.com | bid123 |
| Investigation Manager | inv1@redlime.com | inv123 |

## Workflow

- **Bid Manager**: Reports bidder work every Monday (selects Investigation Manager, enters bidder name, profile, bid count, bonus)
- **Investigation Manager**: Reviews and approves reports assigned to them
- **Admin**: Views all reports, sets salary config ($/profile, $/bid), sees calculated totals

## Tech Stack

- **Backend**: Node.js, Express, MongoDB, JWT
- **Frontend**: React, Vite, React Router, Axios
