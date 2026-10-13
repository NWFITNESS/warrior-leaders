# The Warrior Leaders

Judging and leaderboard system for the Northern Warrior competition (Sat 7 Nov 2026).

- **Public:** `leaders.northernwarrior.co.uk` (home, `/teams`; leaderboard in week 3)
- **Admin:** `/admin` (staff sign-in via Supabase Auth)
- **Judge app:** `/judge` (week 2: pick name + day code)

Plan, mockups and decisions: Obsidian vault `01 - Projects/The Warrior Leaders.md`.

## Stack

Next.js 16 (App Router) · Supabase (own project) · plain CSS in `src/app/globals.css` (no Tailwind) · Vercel.

## Setup

1. Create a Supabase project and run `supabase/migrations/*.sql` in the SQL editor, in order.
2. In Supabase → Authentication → Sign In / Providers, turn **off** "Allow new users to sign up". Add staff under Authentication → Users → Add user.
3. Copy `.env.example` to `.env.local` and fill in the URL, anon key and service role key.
4. `npm install` then `npm run dev`.

## Data access

- Admin pages use the signed-in user's Supabase session; RLS allows `authenticated` full access, `anon` nothing.
- Public pages read through `src/lib/public-data.ts` with the service role, server-side only, selecting non-sensitive columns (no emails/phones).
- Every admin change writes to `audit_log` via `src/lib/audit.ts`.

## Model

`workouts` → `workout_parts` (score type, lowest/highest wins, cap, scored or buy-in) → `part_movements` (reps, RX/scaled loads, standards).
Each scored part gets its own placing unless the workout has `combine_parts = true`.
Points method (placing / reverse / custom) lives in `competition_settings`; see `src/lib/points.ts`.
