<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## AI_WANTED task workflow

Read `docs/WORKFLOW.md` before working in this repository. For every task:

1. Inspect the current code and write a concrete task preview: user behavior, frontend, backend, DB, files, exclusions, decisions, and verification.
2. Discuss the preview with the user and wait for explicit agreement before product implementation. An explicit user instruction approving that concrete task counts as agreement; do not ask again.
3. Pull the latest `main`, create a new `feature/<name>-<task>` branch, and keep one task on one branch. Never commit to `main` directly.
4. Create or update that task's `docs/task-logs/*.md` journal. Record the agreed scope, actual edits, verification, and branch/PR status.
5. Run `node scripts/check-repo-files.mjs` before commit and push. Salesforce CLI/cache/source files must not be tracked here. The PR check enforces this rule and requires a task log.
6. Show the result and Git diff to the user. Push the task branch and open a PR for review; do not merge without review.

Preserve existing uncommitted work when changing branches. Do not mix another task's code into the current branch.
