# DAYMARK

**A focused, single-user productivity workspace built with React, Vite, Node.js, Express, and MySQL.**

DAYMARK combines quick task capture with project planning, flexible task views, a weekly review, habit and goal tracking, a focus timer, and exportable backups. The visual system is intentionally restrained: strong hierarchy, calm surfaces, compact task rows, and responsive layouts rather than a generic dashboard aesthetic.

## Features

### Tasks and projects
- Quick task capture with project, due date/time, priority, estimate, recurrence, tags, and description.
- Editable task detail side panel with status, subtasks, links, activity history, and time tracking.
- Priorities, due dates, completion/reopening, recurring task generation, undo for supported changes, and recovery storage for deleted tasks.
- Projects with independent colors, sections, and project-specific task views.

### Planning and review
- My Day, Inbox, Upcoming, Completed, and All Tasks.
- List, Kanban board, and monthly calendar views.
- Search, priority/status filters, sorting, and command palette.
- Focus/break timer with logged focus sessions.
- Habit tracking, manually updated goals, workspace insights, and weekly review.

### Personalization and data safety
- Dark, light, and system theme preference.
- Responsive desktop, tablet, and mobile layouts.
- Keyboard shortcuts: `⌘/Ctrl + K` command palette, `⌘/Ctrl + N` new task, `/` search, `Esc` close, and `⌘/Ctrl + Z` undo where supported.
- JSON full-workspace export and restore; CSV task export.
- Local browser cache for quick startup and fallback.
- Optional local MySQL persistence through an Express API. The sidebar indicates whether the current session is connected to MySQL or using browser storage.

## Architecture

```text
React + Vite UI
   ├── localStorage cache/fallback
   └── /api/workspace (development proxy)
          └── Node.js + Express API
                 └── Local MySQL Server
                        └── daymark_db.workspace_state (JSON)
```

The workspace is stored as a single validated JSON document in a MySQL `JSON` column. This deliberately preserves the complete client-side workspace shape—including tasks, projects, subtasks, habits, goals, settings, and history—without lossy translation during backup/restore. The table is inspectable from MySQL Workbench. It is a single-user local setup, not a multi-user/cloud-sync architecture.

## Requirements

- Node.js 20 LTS recommended (Node.js 18+ supported)
- npm
- MySQL Server 8.0+ installed and running locally
- MySQL Workbench (used to run the schema and inspect the database)

> MySQL Workbench is the database client. The actual database engine is MySQL Server, which must be running on your Mac.

## macOS setup: local MySQL persistence

### 1. Create the database and table

1. Open MySQL Workbench and connect to your local MySQL Server.
2. Open `database/schema.sql` from this project.
3. Execute the script. It creates `daymark_db` and the `workspace_state` table.

### 2. Configure local credentials

From Terminal, in the project folder:

```bash
cp .env.example .env
```

Edit `.env` to match the credentials of your local MySQL Server:

```dotenv
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=YOUR_LOCAL_MYSQL_PASSWORD
DB_NAME=daymark_db
PORT=3001
API_HOST=127.0.0.1
```

If your local MySQL account has an empty password, leave `DB_PASSWORD=` empty. For improved security, a dedicated MySQL user with access only to `daymark_db` is preferable to using `root`.

### 3. Install dependencies and run

```bash
npm install
npm run dev
```

This starts both the Express API and Vite frontend. Open the local URL printed by Vite, normally `http://127.0.0.1:5173/`. The API listens on `127.0.0.1:3001` and is intentionally bound to the local machine by default.

Check database/API health at `http://127.0.0.1:3001/api/health`. When connected, the DAYMARK sidebar says **MySQL connected**. If MySQL is unavailable or the credentials are incorrect, the app continues in browser storage mode; correct the MySQL setup and reload to use database persistence.

### 4. Inspect stored data in Workbench

After making changes in DAYMARK, run:

```sql
USE daymark_db;
SELECT id, JSON_PRETTY(workspace_json) AS workspace, updated_at
FROM workspace_state;
```

The table will be populated when DAYMARK first connects. Subsequent workspace changes are saved automatically after a short debounce. The browser localStorage copy remains as a fallback and cache; use **Settings → Data & backups → Export full backup** regularly as an additional safety measure. The Settings navigation tabs are interactive: Preferences, Data & backups, and Shortcuts each open their own panel.

## Production build and checks

```bash
npm run check
npm run build
npm run preview
```

The build creates `dist/`. `npm run check` validates the server JavaScript syntax and runs the Vite production build.

## GitHub setup

Create a new GitHub repository, then from the project directory:

```bash
git init
git add .
git commit -m "Build DAYMARK productivity workspace"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
git push -u origin main
```

Before pushing, confirm `.env` is ignored and never commit database passwords or personal workspace exports. The `.gitignore` excludes `.env`, `node_modules`, `dist`, and local backup files.

## Netlify portfolio deployment

The included `netlify.toml` configures the static frontend build. Connect the GitHub repository to Netlify and use:

- Build command: `npm run build`
- Publish directory: `dist`

**Important data distinction:** a public Netlify static site cannot reach a MySQL Server running only on your Mac. The deployed portfolio/demo therefore uses browser storage. Use the local app (`npm run dev`) for your personal workspace backed by MySQL Workbench. If you later need your online site to sync to a database, you must separately deploy a secured API and a reachable hosted database; never expose your home MySQL server or commit credentials to GitHub.

## Data and limitations

- This is a single-user personal project; it does not implement accounts, authentication, collaboration, cloud sync, or remote database deployment.
- Browser storage is scoped to the browser profile and site origin. Local development and Netlify have separate browser data.
- Browser notifications require permission and the app to be open; there is no background notification service.
- Monthly recurrence uses a 30-day interval in this version.
- The focus timer runs while the app tab is open; background tab throttling may affect timing.
- Goal progress is manually adjusted.
- This release starts with a clean, empty workspace instead of demo tasks. On the first launch after upgrading to this release, DAYMARK clears the old sample workspace from browser storage and replaces the local MySQL workspace record with an empty workspace. After that one-time clean start, your data is preserved normally. Export a backup before future resets.
- The 150-day challenge is intentionally not hard-coded into DAYMARK; the project owner can add their own challenge content and workflow separately.

## Project structure

```text
DAYMARK/
├── database/schema.sql
├── server/index.js
├── src/App.jsx
├── src/main.jsx
├── src/styles.css
├── .env.example
├── netlify.toml
├── package.json
├── vite.config.js
└── README.md
```

## Privacy and licensing

In local development, the API binds to `127.0.0.1`; workspace data is sent to the local MySQL Server and cached in the same browser. Google Fonts may be requested for typography when internet access is available. Add your preferred license before public redistribution.
