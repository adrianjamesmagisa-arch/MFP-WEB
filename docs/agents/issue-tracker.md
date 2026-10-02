# Issue Tracker: Local Markdown

Issues and specs for this repo live as Markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The spec is `.scratch/<feature-slug>/spec.md`
- Implementation issues are one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`
- Triage state is a `Status:` line near the top of each issue file
- Comments append to the bottom under a `## Comments` heading

## When a skill says "publish to the issue tracker"

Create a new file under `.scratch/<feature-slug>/` (creating the directory if needed).

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or issue number directly.

## Triage Labels

| Role in mattpocock/skills | Label string    | Meaning                                   |
| ------------------------- | --------------- | ----------------------------------------- |
| `needs-triage`            | `needs-triage`  | Needs evaluation                          |
| `needs-info`              | `needs-info`    | Waiting on reporter for more information  |
| `ready-for-agent`         | `ready-for-agent` | Fully specified, safe for agent to act  |
| `ready-for-human`         | `ready-for-human` | Requires human implementation           |
| `wontfix`                 | `wontfix`       | Will not be actioned                      |
