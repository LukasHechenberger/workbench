---
name: add-migration
description: Create a Payload CMS database migration for a schema change (Postgres adapters, e.g. Neon on Vercel), including the usual manual fixes. Use after changing collections, globals or blocks.
disable-model-invocation: true
---

Run from the app directory that contains the Payload config (`payload.config.ts`). Use the project's own scripts (check `package.json` and `AGENTS.md`); the names below are the common ones.

1. Make sure collections/globals/blocks are changed, then regenerate types and the import map (`build:payload`).
2. Create the migration (`migration:create <name>`). It writes `<migrations dir>/<ts>_<name>.ts` and `.json` and registers it in `index.ts`. When it asks whether a table or column was created or renamed, answer "create" unless you really renamed it. The prompt can't be answered non-interactively; use `expect` if needed.
3. Fix the import in the `.ts` if `verbatimModuleSyntax` is on (TS1484): `import { type MigrateDownArgs, type MigrateUpArgs, sql } from '<the project's db adapter package>';`
4. Review the SQL: it must only touch what you changed. With the Vercel Blob storage plugin, the generated migration may drop its `media` columns (`_objectkey`, `prefix`) when the Blob token isn't set while generating: remove such statements, or generate with a placeholder token as the project's script does.
5. Add a changeset if the project uses them and schema changes need one (see `AGENTS.md`), unless it only fixes an unreleased change.
6. Type-check the project.
7. Apply the migration to the local database (`migration:deploy`) and check the app with it. Schema push is usually disabled, so the dev server won't do it.

Commit the `.ts`, the `.json` snapshot and `index.ts` together. For data-only changes, hand-write a migration without a snapshot instead.
