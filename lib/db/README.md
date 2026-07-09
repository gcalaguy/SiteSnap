# @workspace/db

## Schema changes: `push` is canonical

Run `pnpm --filter @workspace/db run push` against a `DATABASE_URL` to apply schema
changes. It diffs the live database against `src/schema/index.ts` (plus the
split-out files it re-exports) and reconciles the difference. This is the only
provisioning path actually wired up anywhere (see `.github/workflows/ci.yml`)
and the one every environment has been provisioned through since early in the
project.

**If you add or change a table, it must be declared in `src/schema/*.ts`.**
`push` only sees the TypeScript schema — it has no knowledge of
`migrations/*.sql`.

## `migrations/*.sql` is a historical changelog, not an executable pipeline

The `migrations/` folder and its `meta/_journal.json` look like a standard
drizzle-kit migration history, but only migrations `0000`–`0002` were ever
actually applied via `drizzle-kit migrate` — check `drizzle.__drizzle_migrations`
in any live DB and you'll find exactly those three rows. Every schema change
since has gone through `push` instead, and several later `.sql` files
(e.g. `0052_scalability_state_tables.sql`) were hand-written straight into the
folder without a matching entry in `_journal.json` or a corresponding
`src/schema` declaration — so `drizzle-kit migrate` doesn't know about them,
and `push` won't create the tables they describe unless someone *also* adds
them to `src/schema`.

Treat these `.sql` files as a human-readable record of what changed and when,
not as something any tooling replays. There is no supported way to provision a
fresh database by running through this folder — use `push` against the
target `DATABASE_URL` instead.

**`generate` is unreliable for the same reason.** `drizzle-kit generate` diffs
`src/schema` against the last snapshot in `migrations/meta/` — but the newest
snapshot on disk is `0036_snapshot.json`, from long before most of the current
schema existed. Running `generate` today would compute a diff against that
stale baseline, not against current reality, and could emit a migration file
full of `CREATE`/`ALTER` statements for things that already exist in every
real database. If you want a new `.sql` changelog entry, hand-write it in the
style of `0037` onward rather than trusting `generate`'s output.
