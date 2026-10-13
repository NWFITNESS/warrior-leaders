# The Warrior Leaders

Judging and leaderboard system for the Northern Warrior competition (Sat 7 Nov 2026).

- **Public:** `leaders.northernwarrior.co.uk` (home, `/teams`; leaderboard in week 3)
- **Admin:** `/admin` (staff sign-in via Supabase Auth)
- **Judge app:** `/judge` (week 2: pick name + day code)

Plan, mockups and decisions: Obsidian vault `01 - Projects/The Warrior Leaders.md`.

## Stack

Next.js 16 (App Router) · Supabase (shared NW project, `wl_` tables) · plain CSS in `src/app/globals.css` (no Tailwind) · Vercel.

## Setup

1. Tables live in the shared Northern Warrior Supabase project (`llmyrauorwaxleqxcgpc`), all prefixed `wl_`. Migrations in `supabase/migrations/` are already applied.
2. Admin access = an active row in NWHub's `staff_profiles` (checked by `wl_is_staff()`), so NWHub staff logins work here.
3. Copy `.env.example` to `.env.local` and add the anon key. No service-role key is used.
4. `npm install` then `npm run dev`.

## Data access

- Admin pages use the signed-in user's Supabase session; RLS allows active staff only (`wl_is_staff()`), `anon` nothing.
- Public pages call `wl_public_settings()` / `wl_public_teams()` (SECURITY DEFINER, anon-executable, non-sensitive columns only) via `src/lib/public-data.ts`.
- Every admin change writes to `audit_log` via `src/lib/audit.ts`.

## Model

`workouts` → `workout_parts` (score type, lowest/highest wins, cap, scored or buy-in) → `part_movements` (reps, RX/scaled loads, standards).
Each scored part gets its own placing unless the workout has `combine_parts = true`.
Points method (placing / reverse / custom) lives in `competition_settings`; see `src/lib/points.ts`.
