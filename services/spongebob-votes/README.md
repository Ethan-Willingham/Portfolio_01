# SpongeBob matchup votes

Shared, anonymous matchup votes for the portfolio's SpongeBob fight post. The GitHub Pages frontend stays in this repository. This standalone Cloudflare Worker is hosted through Sites, with a persistent D1 database bound as `DB`.

Edit `worker/index.js`, then publish through the Sites skill. No dependency installation is needed. The character ID allowlist is synced from `assets/spongebob/characters.json` and embedded in the built Worker.

Run from this directory:

```sh
node scripts/sync-roster.mjs
node --test tests/votes.test.mjs
bash scripts/build.sh
node scripts/validate-artifact.mjs
```

Tests use Node's built-in SQLite module and require Node 22.13 or newer. All test votes stay in an in-memory test database.

Pass these argument arrays as `commands`:

```json
[
  ["node", "--test", "tests/votes.test.mjs"],
  ["bash", "scripts/build.sh"],
  ["node", "scripts/validate-artifact.mjs"]
]
```

The deterministic build produces:

```text
dist/
├── .openai/
│   ├── hosting.json
│   └── drizzle/
└── server/
    └── index.js
```

`dist/server/index.js` is an ES module with a default export containing `fetch(request, env, ctx)`. Edit `worker/index.js`, not the generated file under `dist/`.

Keep source synchronization in a separate checkout outside the portfolio repository, so the Sites source helper does not create an embedded Git repository here. Preserve the project ID in `.openai/hosting.json`. See `docs/SPONGEBOB_VOTES.md` at the portfolio root for the API and operational notes.
