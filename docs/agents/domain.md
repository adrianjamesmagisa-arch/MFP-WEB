# Domain Docs

How the engineering skills should consume this repo's domain documentation.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root: domain vocabulary, architecture facts, route map, commands, and known gaps.
- **`docs/adr/`**: read any ADR that touches the area you are about to work in.

If a file doesn't exist, proceed silently. Don't suggest creating it up-front.
The `/domain-modeling` and `/grill-with-docs` skills create these lazily.

## File structure (single-context repo)

```
/
├── CONTEXT.md
├── docs/
│   ├── agents/         # This directory — skill configuration
│   └── adr/            # Architectural Decision Records
└── src/
```

## Use the glossary's vocabulary

When naming a domain concept (in an issue, refactor proposal, test name, or PR body), use the term as defined in `CONTEXT.md`.
If a concept is not in the glossary, note it for `/domain-modeling` rather than inventing a synonym.

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly:
> _Contradicts ADR-0001 (…), but worth reopening because…_
