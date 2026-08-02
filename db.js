# Lobo Dustoff G 1-168 — Flight Operations Scheduler

Multi-user version of the unit flight scheduling tool.

- **Shared database** (all users see the same schedule)
- **Encrypted passwords** (bcrypt)
- **Role-based access** (User / Admin)
- **Pending approval** for new accounts
- Supports 80+ users easily

---

## Quick Start (local)

```bash
# 1. Install dependencies
npm install

# 2. Create environment file
cp .env.example .env
# Edit .env and set a strong SESSION_SECRET

# 3. Start the server
npm start
```

Open http://localhost:3000

### Default admin accounts (created on first run)

| Username   | Password     | Role  |
|------------|--------------|-------|
| RECOVERY   | RECOVER2026  | admin |
| testuser   | test123      | admin |

**Change these passwords immediately after first login in production.**

---

## Deploy to the web (recommended paid options)

You said you’re willing to pay for a better product — here are the best options:

### 1. Railway (Recommended — easiest + solid)

1. Go to https://railway.app and sign up
2. Click **New Project → Deploy from GitHub** (or upload the folder)
3. Add a **Volume** for persistent data (mount path `/app/data`)
4. Set environment variables:
   - `SESSION_SECRET` = long random string
   - `NODE_ENV` = `production`
   - `DATABASE_PATH` = `/app/data/lobo.db`
5. Railway gives you a public HTTPS URL automatically

Cost: usually $5–15/month for this size of app.

### 2. Render

1. https://render.com → New → Web Service
2. Connect the repo or upload
3. Build command: `npm install`
4. Start command: `npm start`
5. Add a **Persistent Disk** mounted at `/opt/render/project/src/data`
6. Set the same environment variables as above

### 3. DigitalOcean App Platform or a small Droplet

Best long-term if you want full control. A $6–12/month droplet is more than enough.

---

## Security notes

- Passwords are hashed with **bcrypt** (cost 12)
- Sessions are HTTP-only cookies
- New self-signups are always created as **User** with status **pending**
- Only approved admins can approve accounts or change roles
- Always use HTTPS in production (Railway/Render provide this automatically)

---

## API overview

| Method | Path                    | Auth     | Description                |
|--------|-------------------------|----------|----------------------------|
| POST   | /api/auth/signup        | Public   | Create account (pending)   |
| POST   | /api/auth/login         | Public   | Login                      |
| POST   | /api/auth/logout        | Session  | Logout                     |
| GET    | /api/auth/me            | Session  | Current user               |
| GET    | /api/users              | Admin    | List all users             |
| GET    | /api/users/pending      | Admin    | Pending approvals          |
| PATCH  | /api/users/:id/status   | Admin    | Approve / reject           |
| PATCH  | /api/users/:id/role     | Admin    | Change role                |
| GET    | /api/flights            | Session  | All flights                |
| POST   | /api/flights            | Session  | Create flight              |
| PUT    | /api/flights/:id        | Session  | Update flight              |
| DELETE | /api/flights/:id        | Session  | Delete flight              |
| GET    | /api/aircraft           | Session  | Aircraft list              |

---

## Project structure

```
lobo-dustoff-app/
├── server.js          # Express API + static hosting
├── db.js              # SQLite setup + seeding
├── public/
│   ├── index.html     # Full frontend (updated for API)
│   └── lobo-dustoff.png
├── data/              # SQLite database (created automatically)
├── package.json
├── .env.example
└── README.md
```

---

Built for **Lobo Dustoff • G 1-168**.
