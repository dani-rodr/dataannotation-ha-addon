---
description: Bump the DataAnnotation add-on version across its release metadata and verify the project.
agent: build
---

Bump this project version without committing or pushing anything.

User arguments: `$ARGUMENTS`

Arguments are optional:

- No argument or `patch`: increment the current patch version.
- `minor`: increment the minor version and reset patch to zero.
- `major`: increment the major version and reset minor and patch to zero.
- An explicit semantic version such as `0.8.0`: use that exact version.
- Text after the version selector is an optional release note. For example, `/bump patch --note "Fix Wallet reconciliation"` adds that note to `CHANGELOG.md`.

Follow this workflow:

1. Read `AGENTS.md`, `config.yaml`, `package.json`, `package-lock.json`, and `CHANGELOG.md`.
2. Check the current git status and preserve all existing user changes. Do not reset, checkout, commit, or push.
3. Confirm that the project versions agree before editing. The version must be updated in exactly these locations:
   - top-level `version` in `config.yaml`
   - top-level `version` in `package.json`
   - root `version` in `package-lock.json`
   - `packages[""].version` in `package-lock.json`
4. Validate the requested version as `MAJOR.MINOR.PATCH`. Reject invalid versions and reject a downgrade unless the user explicitly requested that exact version.
5. Update only those version fields. Do not use `npm version`, because it can create a commit or tag.
6. If a release note was supplied, add a new `## <version>` section immediately below `# Changelog`, preserving the existing entries. Do not invent release notes when none were supplied.
7. Run `npm test`, `npm run typecheck`, `npm run build`, and `git diff --check`.
8. Report the old and new versions, changed files, verification results, and any pre-existing unrelated worktree changes. Do not commit or push.

If any verification fails, report the failure clearly and leave the version changes in place for review. Do not revert unrelated user changes.
