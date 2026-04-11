# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**CourseTrack** (repo: PlaySite) is a full-stack web app for college students to manage coursework — courses, assignments, and semesters. It has a React + Vite frontend and a Node.js/Express backend with SQLite.

## Running the App

Two terminals required:

```bash
# Terminal 1 — Backend (port 5001)
cd backend
node server.js

# Terminal 2 — Frontend (port 5173)
cd frontend
npm run dev
```

Other frontend commands:
```bash
npm run build    # Production build
npm run lint     # ESLint
npm run preview  # Preview production build
```

The frontend proxies `/api/*` requests to `http://localhost:5001` via Vite config.

## Architecture

### Frontend (`frontend/src/`)

**Provider hierarchy** (outermost → innermost in `App.jsx`):
```
AuthProvider → ToastProvider → SemesterProvider → Routes
```

**Context roles:**
- `AuthContext` — JWT token (stored in `localStorage` as `coursetrack_token`), user state, `login()`/`logout()`. Validates token on load via `GET /api/auth/me`.
- `SemesterContext` — Semester list + selected semester (persisted in `localStorage` as `coursetrack_semester`). All data is scoped by selected semester.
- `ToastContext` — Ephemeral notifications, auto-dismiss after 3s.

**API layer** (`src/api/index.js`): Single axios instance with a request interceptor that attaches the JWT as `Authorization: Bearer <token>`. All API functions are defined here.

**Pages:** `Dashboard` (calendar with draggable assignment spans), `Courses`, `CourseDetail`, `Assignments`, `Login`. No caching layer — pages fetch fresh data on load and semester change.

**Routing:** React Router v7. `/login` is public; all other routes are wrapped in `ProtectedRoute`. Unknown routes redirect to `/`.

**Styling:** CSS custom properties (design tokens) defined in `index.css`. Dark theme. No CSS-in-JS or utility framework.

### Backend (`backend/`)

**Entry:** `server.js` — Express app on port 5001. CORS restricted to `localhost:5173`.

**Auth:** JWT via `jsonwebtoken`. `middleware/auth.js` validates the `Authorization` header and attaches `req.user`. All protected routes scope DB queries by `req.user.id`.

**Database:** SQLite via `better-sqlite3`. File: `backend/coursework.db`. Schema is created/migrated automatically on startup in `db.js` (adds missing columns if they don't exist).

**Schema relationships:**
```
users
├── semesters (user_id FK)
└── courses (user_id FK)
    └── assignments (course_id FK)
        └── notes (course_id, assignment_id FK — not yet used in UI)
```

**Routes:**
| Path | File | Auth |
|------|------|------|
| `/api/auth/*` | `routes/auth.js` | Public |
| `/api/courses/*` | `routes/courses.js` | Required |
| `/api/assignments/*` | `routes/assignments.js` | Required |
| `/api/semesters/*` | `routes/semesters.js` | Required |
| `/api/ics-feed/*` | `routes/ics-feed.js` | Required |
| `/api/ics/*` | `routes/ics-sync.js` | Required |
| `/api/stats` | `routes/stats.js` | Required |

## Key Details

- **Assignment types:** `homework`, `exam`, `quiz`, `project`, `lab`, `reading`, `other` — each has a color in the CSS design system.
- **Assignment dates:** Three date fields — `start_date`, `end_date` (for calendar display span), and `due_date`.
- **Dashboard calendar:** Complex drag-to-resize logic in `pages/Dashboard.jsx` using `dragPreview` state for optimistic UI while resizing assignment date spans.
- **Semester filtering:** Frontend passes `?semester=Fall&year=2025` query params; backend filters accordingly.
- **bcrypt salt rounds:** 12.
- **JWT expiry:** 7 days.
