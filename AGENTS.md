<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project Context

See **`CONTEXT.md`** at the repo root for:
- Project purpose, domain vocabulary (MFP, SBFP, DSWD, Center, Beneficiary, Drop-off, etc.)
- Framework and dependency versions
- Route structure and entry points
- Development commands (`npm run dev`, `npm run build`, `npm run lint`)
- Current uncommitted work and known uncertainties

## Agent Skills

The following skills are available globally (installed in `~/.gemini/config/skills/`).
Read a skill's `SKILL.md` before using it.

| Skill | When to use |
|-------|-------------|
| `ask-matt` | Unsure which skill fits — ask it to route |
| `code-review` | Review a branch, PR, or work-in-progress |
| `to-spec` | Turn a conversation into a spec |
| `to-tickets` | Break a plan into bounded tickets |
| `implement` | Implement from a spec or set of tickets |
| `tdd` | Test-driven development |
| `diagnosing-bugs` | Debug hard bugs or performance regressions |
| `handoff` | Compact session into a handoff document |
| `grill-with-docs` | Interview to sharpen a plan and create ADRs |
| `grilling` | Relentless interview to stress-test thinking |
| `domain-modeling` | Build or refine the project glossary / ADRs |
| `codebase-design` | Deep module design and interface work |
| `writing-for-agents` | Write or edit skills and AGENTS.md |
| `setup-matt-pocock-skills` | Re-run initial setup (manual: `disable-model-invocation: true`) |
| `decisions` | List uncertain decisions made (manual: `/decisions`) |
| `setup-help` | Step-by-step setup walkthrough (manual: `/setup-help`) |

## Issue Tracker

Local Markdown — see `docs/agents/issue-tracker.md`.
Issues live in `.scratch/<feature-slug>/issues/<NN>-<slug>.md`.

## Constraints

- **Never commit, push, merge, or deploy without explicit user authorization.**
- Read `CONTEXT.md` before exploring unfamiliar areas of the codebase.
- Run `npm run lint` and `npx tsc --noEmit` before declaring implementation complete.
- Do not read or echo secrets from `.env.local`.
