# MFP-Web — DA-PCC National Milk Feeding Program

Web application for the Operations Department of the Philippine Carabao Center (DA-PCC). Tracks delivery, participation, and monitoring data for two government milk feeding programs across university research centers and DSWD beneficiaries.

## Language

**MFP (Milk Feeding Program)**:
The umbrella term for the two government programs tracked by this system.
_Avoid_: milk program, feeding system

**SBFP (School-Based Feeding Program)**:
The DepEd-administered program feeding school-aged children. Data is tracked per SDO (Schools Division Office) and per school.
_Avoid_: school program, DepEd program

**DSWD Program**:
The DSWD-administered program feeding beneficiaries through PCC centers. Tracked separately from SBFP.
_Avoid_: social welfare program

**Center**:
A DA-PCC university research center (e.g., UPLB, CLSU, CMU) that delivers milk under both programs. Centers are the primary data-entry actors.
_Avoid_: location, branch, hub

**Beneficiary**:
An individual receiving milk under a program. Enrolled via a masterlist per center.
_Avoid_: recipient, client, student (use "student" only in SBFP school context)

**SDO (Schools Division Office)**:
The DepEd organizational unit above individual schools for SBFP data aggregation.
_Avoid_: district office

**Drop-off**:
A single delivery event of milk to a beneficiary group. Recorded with quantity, date, and program type.
_Avoid_: delivery, distribution (use "drop-off" in code and UI)

**Monitoring**:
Aggregated view of program KPIs (commitment vs. accomplishment ratios) across centers and periods.
_Avoid_: dashboard stats, overview

**Program Period / Month**:
The calendar month or program cycle for which monitoring data is grouped.

**Commitment**:
The planned quantity of milk promised under a program for a period.

**Accomplishment**:
The actual quantity of milk delivered in a period.

**Encoder**:
A center-level data-entry user role. Restricted to data entry for their assigned center.
_Avoid_: data entry user, operator

**PIMD**:
PCC Internal Monitoring Division — the head-office role with read/write access across all centers.

## Architecture

- **Framework**: Next.js 16.3 (App Router), React 19, TypeScript 5 — `@/*` resolves to `src/*`
- **Database/Auth**: Supabase (PostgreSQL + `@supabase/ssr`). Auth via middleware; all app routes require login; `/login` is public.
- **Styling**: Tailwind CSS 4 (PostCSS plugin), `tailwind-merge`, `clsx`
- **Charts**: Recharts 3
- **PDF/Excel export**: `html2pdf.js`, `html-to-image`, `xlsx`
- **Date handling**: `date-fns`
- **Icons**: `lucide-react`

## Route Structure

```
src/app/
  page.tsx                      — root redirect to /dashboard or /login
  login/page.tsx                — public login page
  (app)/                        — authenticated layout group
    layout.tsx                  — shared nav/shell
    dashboard/page.tsx          — summary dashboard
    centers/                    — center list + per-center detail
    data/                       — beneficiary masterlist CRUD
    monitoring/[program]/       — SBFP / DSWD monitoring views
    reports/                    — report generation
    sbfp/                       — SBFP drop-off entry
    sbfp-data/                  — SBFP masterlist
    users/                      — user management (PIMD only)
  api/                          — server-side API routes
```

## Entry Points

- `src/app/layout.tsx` — root HTML shell, metadata title: "DA-PCC Milk Feeding Program"
- `src/middleware.ts` — Supabase auth guard; redirects unauthenticated users to `/login`
- `src/lib/` — shared Supabase client helpers and utilities
- `src/components/` — shared UI components

## Development Commands

```bash
npm run dev     # Next.js dev server (localhost:3000)
npm run build   # Production build (includes type-check)
npm run lint    # ESLint (eslint-config-next)
```
> Type-check only: `npx tsc --noEmit`

## Uncommitted Work (as of 2026-09-22)

Untracked new files — not yet integrated or tested:
- `.github/` — GitHub Actions config
- `pdf_data.json`, `pdf_*.txt` — scratch PDF extraction artifacts  
- `scripts/append_b64.js`, `scripts/build_sbfp_report.py`, `scripts/gen_report.py`, `scripts/try_apply_dropoff_pg.js`, `scripts/write_b64.py` — scratch/utility scripts
- `src/components/MfpProgramMonthHub.tsx`, `src/components/ProgramCreateMonthButton.tsx` — new components not yet merged
- `supabase/.temp/` — Supabase CLI temp files

## Known Uncertainties

- No test suite detected (`npm test` likely fails or is absent).
- No pre-commit hooks or lint-staged configuration found.
- `next dev` injects its own block into `AGENTS.md` — this is auto-managed; do not delete it.
- The SBFP and DSWD programs share some data structures; the exact Supabase table schema is not in the repo.
- User roles (Encoder vs. PIMD) are enforced in the UI; confirm server-side enforcement in API routes before relying on it.
