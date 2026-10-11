# Changelog

## 1.2.0 — Clean personal workspace

- Removed all bundled demo tasks, projects, habits, and goals; first launch performs a one-time clean reset of old sample browser/MySQL workspace data.
- Made Settings navigation functional for Preferences, Data & backups, and Shortcuts.
- Added storage connection status and backup guidance in the Data & backups panel.
- Added a confirmed clear-workspace action that syncs the empty workspace to MySQL.
- New tasks can be created directly in Inbox before any project exists.

## 1.1.0 — Local database release

- Added a local Express API and MySQL persistence through a single workspace JSON record.
- Added a MySQL Workbench schema script and `.env.example` configuration.
- Added debounced autosave to MySQL with localStorage cache/fallback and visible storage status.
- Fixed recurring-task history so a completed occurrence retains its original due date.
- Improved backup restore so merge includes projects, tasks, habits, goals, sessions, settings, and workspace history.
- Made file downloads safer by removing the temporary anchor and revoking object URLs after download begins.
- Added a Netlify build configuration for a public portfolio/demo deployment.
- Kept the 150-day challenge out of the app so the owner can add their own personal workflow later.
