# Engineering Workflow Router

When I start a new coding task, inspect before acting:

1. Read `CONTEXT.md` at the repo root if present.
2. Read `docs/agents/domain.md` and any `docs/adr/` files relevant to the area.
3. Check existing uncommitted work with `git status` and `git diff` before assuming the working tree is clean.
4. Load only the skill instructions relevant to this task — do not load all skills.
5. Prefer an available installed skill over recreating its capability manually.

## Task sizing

**Trivial fix / clear task**: inspect → implement smallest correct change → focused validation → review.  
Do not generate specs and tickets for a one-line fix.

**Unclear or substantial feature**: clarify only material unanswered requirements (check repo docs first). Then produce a spec, acceptance criteria, and bounded tickets with dependency information. Each ticket must be self-contained enough for a fresh session.

## Development constraints

- Run `npm run lint` and `npx tsc --noEmit` before declaring implementation complete.
- If tests exist, run them. Do not skip or disable tests to satisfy a goal.
- **Never commit, push, merge, or deploy without explicit user authorization.**
- Do not read or echo secrets from `.env.local`.
- After repeated failed attempts without new evidence, report the blocker instead of repeating the same approach.

## Skills available (load on demand)

| Situation | Skill to load |
|-----------|---------------|
| Route this task | `ask-matt` |
| Feature spec + tickets | `to-spec`, `to-tickets` |
| Implementation | `implement` |
| Test-first development | `tdd` |
| Bug / regression | `diagnosing-bugs` |
| Branch / PR review | `code-review` |
| Session handoff | `handoff` |
| Stress-test a design | `grill-with-docs`, `grilling` |
| Module/API design | `codebase-design` |
| Domain glossary / ADR | `domain-modeling` |
| Unknown decisions made | `/decisions` (manual, type it) |
| Setup walkthrough | `/setup-help` (manual, type it) |

`decisions` and `setup-help` are **manual-only** — invoke them by typing `/decisions` or `/setup-help` explicitly.

## Review checklist

When reviewing, always check:
1. Does the implementation match the requested behavior?
2. Does it meet project standards and avoid regressions?
3. Scope: committed changes + staged + unstaged + new untracked files. Do not review only HEAD.

## Handoff

At a useful phase boundary, use the `handoff` skill to record:
- Completed work
- Remaining work and next steps
- Important files touched
- Validation results
- Unresolved decisions
