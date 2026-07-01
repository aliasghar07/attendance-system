# The Attendance Register

A modern Flask + SQLite rebuild of an original 8086 assembly console program
(`proj.asm`) that recorded attendance and calculated the percentage. Same
core rules — same validation, same 4 status bands (Short / Satisfactory /
Good / Excellent) — now wrapped in a clean, ledger-styled web interface with
a saved history, live stats, and a "how many classes can I miss / need to
attend" advisory.

## Tech stack

- **Backend:** Python, Flask, SQLite (no setup needed — file-based DB)
- **Frontend:** HTML, CSS, vanilla JS (no build step, no frameworks)
- **Deployment:** Gunicorn + Render / Railway / PythonAnywhere (see below)

## Project structure

```
attendance-tracker/
├── app.py                 # Flask app + API routes + calculation logic
├── requirements.txt       # Python dependencies
├── Procfile                # tells hosting platforms how to start the app
├── templates/
│   └── index.html
├── static/
│   ├── css/style.css
│   └── js/app.js
└── attendance.db           # created automatically on first run (not in git)
```

---

## 1. Run it locally

You need **Python 3.9+** installed.

```bash
# 1. Go into the project folder
cd attendance-tracker

# 2. (Recommended) create a virtual environment
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Run the app
python app.py
```

Open **http://127.0.0.1:5000** in your browser. That's it — the SQLite
database file (`attendance.db`) is created automatically the first time you
run it.

To stop the server, press `Ctrl+C`.

---

## 2. Push it to GitHub

```bash
cd attendance-tracker
git init
git add .
git commit -m "Initial commit: Attendance Register app"

# Create a new repo on github.com first (don't initialize it with a README),
# then connect it:
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo-name>.git
git push -u origin main
```

Your code, including the README, is now safely on GitHub. This alone gives
you a backup and version history, but **GitHub itself only hosts files —
it can't run a live Python server.** For a link you can open on your phone
in an emergency, deploy it (step 3) using the same GitHub repo.

---

## 3. Get a live link (for emergency / anywhere access)

> **Important:** GitHub Pages only serves static files (HTML/CSS/JS) — it
> **cannot run Flask/Python**. To get a real live URL for this app, deploy
> it to a small free Python host that connects directly to your GitHub repo.
> **Render** is the easiest, free option.

### Option A — Render.com (recommended, free tier)

1. Go to **https://render.com** and sign up / log in with your GitHub account.
2. Click **New +** → **Web Service**.
3. Select your `attendance-tracker` GitHub repo (grant Render access if asked).
4. Fill in the settings:
   - **Name:** `attendance-register` (or anything you like — this becomes part of the URL)
   - **Environment / Runtime:** `Python 3`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `gunicorn app:app`
   - **Instance Type:** `Free`
5. Click **Create Web Service**. Render will build and deploy automatically.
6. After a minute or two, you'll get a live URL like:
   `https://attendance-register.onrender.com`

That URL works from any device, anywhere — save it to your phone's home
screen for instant access. Every time you `git push` to `main`, Render
redeploys automatically.

**Free-tier note:** the free instance sleeps after ~15 minutes of no
traffic and takes ~30–60 seconds to wake up on the next visit. This is a
Render limitation, not a bug — fine for occasional/emergency use.

### Option B — Railway.app (also free-tier friendly)

1. Go to **https://railway.app**, sign in with GitHub.
2. **New Project → Deploy from GitHub repo** → pick `attendance-tracker`.
3. Railway auto-detects Python and uses the `Procfile` (`gunicorn app:app`).
4. Under **Settings → Networking**, click **Generate Domain** to get your
   public live URL.

### Option C — PythonAnywhere (good for very small/free hosting)

1. Sign up at **https://www.pythonanywhere.com**.
2. Upload your project (or `git clone` your GitHub repo from a Bash console
   they provide).
3. Create a new **Web App → Flask**, point it at `app.py`.
4. Install dependencies in their console: `pip install -r requirements.txt --user`.
5. Reload the web app — your live URL will be `https://<your-username>.pythonanywhere.com`.

---

## 4. A note on the database in production

SQLite is perfect for local use and demos. On free hosts like Render's free
tier, the filesystem can reset on redeploy, which would clear
`attendance.db`. For a **college project or personal use this is totally
fine** — the calculator still works, only the saved history resets on
redeploy. If you later want history to persist permanently, swap SQLite for
a free hosted Postgres database (Render offers one) — the `app.py` code is
small enough to adapt in a few lines if that's ever needed.

---

## 5. How the calculation works (matches the original program)

- **Percentage** = `(attended × 100) / total` — same formula as the
  assembly `CALC_PCT` routine.
- **Status bands** — identical thresholds to the original:
  - `< 75%` → **SHORT** (At Risk)
  - `75–80%` → **SATISFACTORY**
  - `80–90%` → **GOOD**
  - `90–100%` → **EXCELLENT**
- **Validation** mirrors the original error handling: total can't be zero,
  attended can't exceed total, and only whole numbers are accepted.
- **Bonus (new):** the app also tells you how many classes you need to
  attend in a row to reach 75%, or how many you can safely skip and stay
  above it.

---

## 6. Credits

Rebuilt from an original x86 assembly (`proj.asm`) console-mode attendance
calculator into a full web application with a persistent history log.
