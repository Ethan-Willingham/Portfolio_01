# About page data

Refresh and publish from the computer holding the private usage ledger:

```sh
bash tools/update-about-live.sh
```

The wrapper starts from live `main` in a clean temporary worktree. It collects usage,
refreshes the commit timeline, page attribution and search index, checks the
result, then commits and pushes. A failed collector or validator stops publication.

## October 29, 2026 PC refresh and laptop handoff

The total is **39,756,675,304 tokens**, displayed as **39.8B**. This preserves the
38,460,572,594 tokens published October 20 and adds **1,296,102,710 tokens** from
9,003 retained PC Codex responses. GPT-6 Astra accounts for 1,033,916,642 of those
tokens and GPT-6.1 Sol for 262,186,068. Their API-equivalent cost is $1,432.46.

The PC collection is frozen at October 29, 2026, 11:38 AM America/Chicago, before
this refresh began. Its measured responses run from October 21 through October 28
in that timezone. Every added response is later than the canonical Mac collection's
October 20 cutoff. The collector now reads native `token_usage_record` responses.
It verifies their thread counters, deduplicates response identities, excludes
inherited parent history, and uses older cumulative records only for threads with
no native response records. Legacy notifications missed 56 responses worth
14,089,566 tokens in the retained PC logs.

The PC also recovered a September export containing **689,902,927 older tokens**
from July 25 through September 7 absent from the previously imported PC report.
These remain outside the new headline until the laptop's canonical ledger can
deduplicate them. Another **560,915,291 tokens** survive only as database totals
for 50 pruned chats absent from the retained logs and old exports. They have no
response-level category or pricing evidence and are also excluded. Browser chats
and hidden image-generation usage cannot be reconstructed from these sources.

The desktop writes a private `local-usage-export.json` plus an immutable copy named
with its content hash under `~/.local/share/about-usage/`. The handoff file
`pc-usage-2026-10-29.json` is a copy of that export. Copy it privately to the laptop,
pull the latest `main`, and run:

```sh
node tools/update-about.mjs --write --import-ledger=/private/path/pc-usage-2026-10-29.json
node tools/check-about.mjs
```

The private report contains counters and hashed deduplication identities, with no
prompts or conversation text. Keep it outside the public checkout. It includes the
older recovered response records as well as the newly published PC responses.
The separate database audit in the handoff requires manual reconciliation before
any of its totals can be counted.

`tools/about-usage-refresh.mjs` supports this handoff without replacing the Mac's
private ledger identity. Public `nativeDays` retain the canonical October 20 days;
`supplement` records only the newer PC daily aggregates, coverage and private report
hash. `days` is their checked sum. Repeated desktop refreshes replace the same
supplement. A laptop refresh requires the exact matching private report, merges its
identities into the canonical ledger, and removes the supplement after counting each
response once. A missing or different report stops that refresh. This prevents a
laptop update from losing or duplicating the published PC contribution.

The recovered July 25 to 26 records include GPT-5.6 Terra and Luna. Their historical
price rows are explicitly marked as estimates: the earlier rates are calculated by
reversing the official July 30 reductions (20% for Terra, 80% for Luna), rather than
applying today's rates backward. The current model pages and reductions were checked
October 29 against the official [Terra page](https://developers.openai.com/api/docs/models/gpt-5.6-terra),
[Luna page](https://developers.openai.com/api/docs/models/gpt-5.6-luna), and
[changelog](https://developers.openai.com/api/docs/changelog). These older records
do not affect this refresh's displayed cost.

Run `node tools/test-about-usage-refresh.mjs` for native-response completeness,
missing notifications, copied history, repeated desktop refreshes, lost ledgers and
exact laptop report imports.

## September 23, 2026 refresh

The total is **26,995,093,658 tokens**, displayed as **27.0B**. It combines the published
estimate through July 22 with 2,414,025,599 recoverable tokens after that date:

| Source | Tokens after July 22 |
|---|---:|
| Mac, retained Claude Code logs | 1,338,666,526 |
| Mac, retained Codex logs | 805,049,807 |
| PC, September 9 to 23 report | 270,309,266 |

The Mac snapshot ends September 23 at 3:15:12 PM America/Chicago and excludes this
refresh's own task. The PC report ends at 2:24:55 PM the same day. No PC session or
Claude message in the report overlapped the retained Mac logs. An independent Python
calculation matched all 39 daily totals and all model totals.

The PC report includes 258,798,678 Sluice tokens. That is a subset of its 270,309,266
total, not another contribution. The headline includes usage across other projects and
personal tasks too. Cached context counts as processing, not as unique text written.

These are retained local counters, not a complete account export. PC usage between
July 23 and September 8 was not supplied. Pruned logs, browser chats and unexported cloud
work cannot be recovered from this collection. The lifetime total still includes the
older estimate. Its per-model breakdown is incomplete and is preserved as published.

## Counting and deduplication

`tools/about-usage.mjs` reads native Claude Code and Codex logs. It does not rely on
`ccusage` totals or its cached prices.

- Claude messages are matched globally by message ID, with request IDs checked when
  present. Streaming and copied snapshots contribute the final, largest output count
  once. Input, cache writes, cache reads and output are separate categories.
- Codex snapshots are merged within the original task's cumulative stream. Unchanged
  notifications are discarded and deltas are recalculated in timestamp order. Counter
  resets start a new segment. The first session metadata identifies a child task;
  inherited parent history before its recorded boundary is excluded.
- Cached input is already included in Codex input. Reasoning is already included in
  output. Neither is added twice.
- Daily grouping uses America/Chicago, including daylight saving time. The daily fuel
  line uses the same durable totals as the headline. The old timeline remains intact.

The collector checks each Codex delta against the response counter before pricing it.
A gap that prevents per-response pricing stops the refresh rather than inventing a cost.

## What is stored

`tools/about-stats.json` holds the public legacy estimate, daily token categories, costs,
collection cutoff and content hashes of imported reports. Its `retainedDays` preserve the
pre-native snapshot if original logs disappear. All of that snapshot's token totals were
recoverable in this refresh.

The private counter ledger lives at `~/.local/share/about-usage/native-ledger.json`.
It retains deduplication identities and counters across imports and log pruning. It is
not committed or served by the website. Back it up and transfer it privately when moving
the updater to another computer. The public ledger records its hashed identity; a missing
or mismatched private ledger stops the next refresh.

To import a new canonical event file, extract the report outside the repository and run:

```sh
node tools/update-about.mjs --write --import-usage=/private/path/usage-events.jsonl
node tools/check-about.mjs
```

Only `usage-events.jsonl` is imported. Daily summaries, native evidence and the Sluice
subset are alternate views, not additional usage. Reimporting the same data is harmless.
The September archive's present payloads passed their SHA-256 checks. Its manifest also
listed two scripts absent from the zip; neither script was needed or executed.

## API-equivalent cost

The displayed **~$27,700** is a standard API list-price estimate, not an invoice or a
subscription charge. It excludes service-tier premiums, tool fees, taxes and discounts.
Claude cache writes use their recorded five-minute or one-hour duration; missing durations
use the five-minute rate. Codex responses receive the model's long-context multiplier
when their input crosses its threshold.

One Claude snapshot reported zero cache writes with a stale one-hour breakdown of 1,689
tokens. The top-level zero is retained; that duration breakdown contributes no charge.
The public collection metadata records the discrepancy count.

Rates and effective dates live in `tools/about-models.json`. They were checked September
23 against [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing),
[OpenAI pricing](https://developers.openai.com/api/docs/pricing), the official
[GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra) and
[GPT-5.6 Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna) model pages, and
the [OpenAI changelog](https://developers.openai.com/api/docs/changelog). GPT-5.6 Sol's
August 21 price reduction is a new dated row. Claude Sonnet 5's introductory rate became
its standard rate, so the previously scheduled September increase was corrected.

The validator refuses publication when the pricing review is more than 45 days old.
Review the official sources and add dated rows before advancing `verified`.

## Per-page attribution

The About page counts every known post and project, including unlisted and removed
pages. The homepage, collection pages, archive index and archive folders supply new
entries. Existing timeline topics and cards preserve the older entries. A moved page
keeps its original identity; deleting a page changes its status to `removed` and clears
its active link. Its title, recorded changes, model credit and commit history remain.
Historical page text in Git supplies a word count when the file has been removed.
Posts without a surviving edit transcript still have a card, labeled "No edit log."
The October refresh also recovered five removed posts absent from the original
topic list: The Quran: A Guided Reading, The Worst Pain in Medicine, Colophon,
Every Push and Every Token, and Nobody Has Ever Explained Gravity. Their own file
histories supply the build facts without changing the old timeline's commit rows.

The change count is **commits**, not push events. One push can carry several commits.
The append-only timeline retains its published snapshot from before the May history
rewrite. It is not regenerated from only the commits that still exist in Git.

The headline and model badges show total consumption across all projects: input,
cache writes, cache reads and output. The page cards show **recorded file changes**,
with each model's share. Their detail panels retain commit counts, build dates,
word counts and the existing prompt archive.

Claude Edit/Write operations and successful Codex file-change records supply the edit
counts. The durable hashed edit ledger preserves older credit after transcripts disappear.
A refresh skips new credit from its own session while retaining any previously
published credit from that session. Shell rewrites without file-change records
can be absent. These counts describe recorded
activity, not a complete measure of effort or authorship.

Full token consumption cannot be reliably reconstructed for most individual pages, so
page cards do not display token totals or token-based rankings. The existing output-token
fields remain in the attribution ledger for compatibility and are not rendered as usage.

The optional `tools/build-project-usage.mjs` recovery tool is a private audit, separate
from the normal update and publication flow. It preserves assignments in
`~/.local/share/about-usage/project-ledger.json` and writes its summary to
`project-summary.json` in the same private directory. No project usage dataset is served
by the site. Back up these files alongside the native ledger to retain the recovered work.

Run `node tools/test-about-usage.mjs` for duplicate, overlap, reset, inheritance, cache
pricing, date-boundary and persistence checks. `node tools/test-project-usage.mjs` covers
the optional private audit. `node tools/check-about.mjs` validates the published totals,
models, links, freshness dates and generated datasets without needing private logs.

Run `node tools/test-about-post-history.mjs` for deletion, repeated refreshes, archive
moves, unlisting, restoration and retained credit. The publication check also requires
every historical post topic to have a card with the same status.

GPT-6 Sol and GPT-6.1 Sol rates were checked October 4 against their official
[GPT-6 Sol](https://developers.openai.com/api/docs/models/gpt-6-sol) and
[GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol) pages. Each
registry entry records its source and review date. The earlier models keep their
September 23 review date.
