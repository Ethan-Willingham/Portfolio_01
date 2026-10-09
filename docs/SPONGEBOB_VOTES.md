# SpongeBob shared votes

The standalone fight comparer uses `js/spongebob-votes.js`. It calls a separate Sites Worker backed by persistent Cloudflare D1. GitHub Pages serves the picker, comparer and images.

Service URL: `https://spongebob-votes-ethan.snugbay4.chatgpt.site`.

Version 3 was published on October 9, 2026, with 1,371 allowed IDs: the 1,370-character original-TV catalog and the separately preserved Bare-Knuckles selection. The health check confirmed the database binding and allowlist size. Updating the catalog preserves recorded votes. No test votes were inserted into production.

Sites project: `appgprj_6ac94fd85c608191bac6cf13f1a46571`. Its source files are in `services/spongebob-votes/`. The manifest declares the logical `DB` binding; Sites provisions the database and applies the tracked SQL migration during publication.

## Browser API

```js
const result = await window.SpongeBobVotes.get(['spongebob-squarepants', 'patrick-star']);
const resultAfterVote = await window.SpongeBobVotes.vote({
  pair: ['spongebob-squarepants', 'patrick-star'],
  winner: 'patrick-star'
});
```

Both calls return a sorted `pair`, `counts` and `percentages` keyed by character ID, `total`, the current browser's `winner` (or null), and `alreadyVoted`. POST also returns `accepted`, true only for the first response from that browser to this pair. No responses are prefilled or simulated. A zero-vote pair has two zero percentages until its first vote.

The first response sticks. Swapping the displayed left and right character leaves the same pair and totals. Reloading the page retrieves this browser's recorded response. Sending the same response again after a lost connection is safe.

The client stores a random UUID in localStorage, with sessionStorage as a fallback, and sends it to the service. The database stores only its SHA-256 hash, two character IDs, the chosen ID and a timestamp. The application does not collect names, accounts, IP addresses or browser fingerprints. Anonymous browser identity prevents accidental duplicate votes; clearing storage or using another browser can create another identity. This is a casual poll, without account-level voter verification.

Requests that fail must show an unavailable/retry state. The frontend must not claim a vote was saved or show visitor percentages from local guesses. The client throws when the service is unreachable or returns invalid totals.

## HTTP API

`GET /v1/votes?a=<id>&b=<id>&voterId=<uuid>` retrieves current counts and this browser's response.

`POST /v1/votes` accepts JSON `{ "pair": ["id-a", "id-b"], "winner": "id-a", "voterId": "uuid" }` and returns updated counts in the same atomic D1 batch as the insertion. Its compound primary key allows one vote per browser and unordered pair.

Only registered character IDs are accepted. JSON request size is limited to 2 KiB. POST requires an approved Origin. CORS allows `https://ethanwillingham.com`, its `www` variant, the repository's GitHub Pages hostname, the service itself, and localhost HTTP ports for development. CORS limits browser origins; it does not authenticate arbitrary HTTP clients.

`GET /health` reports the configured database binding and number of allowed character IDs. A valid `GET /v1/votes` additionally checks that the schema is usable.

## Updating and testing

When the researched character catalog or retained public cast changes, run `node services/spongebob-votes/scripts/sync-roster.mjs` from the portfolio root and publish a new backend version. It includes catalog IDs and `lineup.retainedCharacters`. The tracked `roster.json` contains only character IDs, so the Sites source repository can build independently of the portfolio's image files.

The picker pairing editor saves ordered disjoint pairs. A shared fight link carries both the selected cast and its `matchups` JSON in the URL fragment; downloaded lineup files contain the same `matchups` array. The comparer preserves these pairs and their left/right order. Each character can appear only once in a round, and a skipped pair consumes both characters. A cast without configured matchups is shuffled into disjoint pairs, with one character sitting out when its size is odd. The owner's 34-character public cast therefore produces 17 matchups until specific pairs are configured.

Run from `services/spongebob-votes/`:

```sh
node --test tests/votes.test.mjs
bash scripts/build.sh
node scripts/validate-artifact.mjs
```

The tests run the actual Worker against SQLite and cover duplicate votes, reversed pairs, concurrent retries, separate identities, retrieved choices, invalid input, CORS and database outages. Test votes never enter the hosted database.

Publish with the Sites skill using the retained project ID and a separate source checkout outside this Git repository. Keep credentials in tool memory and pass them only through the source helper's hidden stdin. Package the exact pushed commit, save the version, then deploy that saved version. Preserve public access so GitHub Pages visitors can reach the API. Never overwrite an applied migration; append a new migration for future schema changes.

D1's [Worker binding API](https://developers.cloudflare.com/d1/worker-api/d1-database/) documents transactional batches and the `first-primary` session used here for current reads.
