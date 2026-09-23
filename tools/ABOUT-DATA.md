# About page data

Refresh and publish from the computer holding the private usage ledger:

```sh
bash tools/update-about-live.sh
```

The wrapper starts from live `main` in a clean temporary worktree. It collects usage,
refreshes the commit timeline, page attribution, search index and site size, checks the
result, then commits and pushes. A failed collector or validator stops publication.

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

The default **Total tokens** view now uses the same definition as the headline and model
badges: input, cache writes, cache reads and output. The counters are exact within the
retained records; assignment to a project is an estimate from task evidence. These are
recovered totals, not complete lifetime costs. Cards show their record dates. A page with
no recovered full counter is marked **Unknown**, even when its older edit credit survives.

`tools/build-project-usage.mjs` joins task evidence to the private native counter ledger.
It groups usage by task turn and routes explicit file targets to pages. Page edits take
precedence over files merely read for comparison. When no page edit was recorded, tool
file targets, a dedicated game workspace, or an explicit Sluice request can supply the
project. The PC report's existing event classifications supply its project assignments.
Injected repository instructions and copied parent history are not project evidence.
Background tool notifications do not start new Claude task turns.

A turn targeting multiple pages goes into shared website work. It is not split by output
length, file count or an invented percentage. Each request contributes once. Named shared
groups also appear in the affected page's detail view, separately from its card total.
Other projects, usage with no clear project, and older totals without request records
remain separate coverage buckets. The expandable breakdown reconciles exactly to the
headline, including the incomplete older estimate.

At this snapshot, full counters survive for **3,353,245,625 tokens**, including
**939,220,026** already inside the historical baseline. Recovering them does not increase
the 27.0B headline. There are recovered individual totals for 20 pages. Sluice's card has
**842,126,133 tokens**, including the PC report's 258,798,678. Another **1,025,406,545**
tokens belong to turns targeting both Sluice and the water/smoke/slime demo; those stay in
shared work. Missing records and gaps between the displayed first and last dates mean
these figures cannot establish a complete project cost or a fair lifetime ranking.

The separate **Changes** view preserves the older edit attribution. Claude Edit/Write
operations and successful Codex file-change records supply those counts. The existing
`git-attribution-data.js` and hashed edit ledger still retain output-token credit for
compatibility, but that field is no longer presented as a page's total consumption.
Shell rewrites without file-change records can be absent from edit counts.

Private project assignments persist in `~/.local/share/about-usage/project-ledger.json`,
alongside the native ledger. Back up both files. Surviving transcripts can refine their
assignments; pruned transcripts do not erase saved assignments. `project-audit.json`
holds local audit context and stays private. Only aggregate counters, model labels,
page keys and coverage dates are published in `js/project-usage-data.js`.

Run `node tools/test-about-usage.mjs` for duplicate, overlap, reset, inheritance, cache
pricing, date-boundary and persistence checks, and `node tools/test-project-usage.mjs`
for task attribution, shared usage and baseline reconciliation. `node tools/check-about.mjs` validates the
published totals, models, links, freshness dates and generated datasets without needing
private logs.
