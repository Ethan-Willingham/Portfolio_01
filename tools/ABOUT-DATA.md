# About page data

The About page is refreshed from one local command:

```sh
bash tools/update-about-live.sh
```

The wrapper fetches the live `main` branch into a clean temporary worktree, runs every
collector, validates the result, commits it, and pushes it to GitHub Pages. A failed
collector or failed check stops before the commit.

## What is automatic

- `ccusage` supplies token categories by model and day.
- GPT-5.6 Codex responses are priced one request at a time so the 272K long-context
  threshold is applied correctly.
- Claude Code and Codex transcripts are routed to the post files they edited.
- Git supplies the commit river and its per-topic counts.
- The publishable checkout supplies the current site size.
- The search index is rebuilt.
- `tools/check-about.mjs` checks every cross-file total, page link, model ID, generated
  timestamp, and pricing-review date.

## What is durable

`tools/about-stats.json` has two parts. `legacy` is the published estimate through its
cutoff. Old logs were already pruned, so that part cannot be reconstructed more precisely.
`days` keeps the full input, cache-write, cache-read, and output categories from the cutoff
forward. Stored days remain after local logs disappear and can be audited against the
price registry. Each day uses the published API rate that applied to that model on that
date. The result is an API-equivalent estimate, not a subscription or API invoice.

`tools/about-attribution-ledger.json` stores provider-prefixed hashes instead of raw
session IDs or paths. Each session keeps its last known per-model, per-post counters.
Missing transcripts do not lower a post's published credit. The one-time residual records
work that was already public when its source transcript had been pruned.

## What remains manual

API pricing is deliberately reviewed, not scraped. Vendor pricing pages change structure,
and a scraper that silently reads the wrong number is worse than an expired price. Current
rates and official source URLs live in `tools/about-models.json`. The validator refuses to
publish when `verified` is more than 45 days old.

The sources are [Anthropic's Claude Platform pricing](https://platform.claude.com/docs/en/about-claude/pricing)
and [OpenAI's GPT-5.6 Sol model page](https://developers.openai.com/api/docs/models/gpt-5.6-sol).

At that point:

1. Open the official Anthropic and OpenAI URLs in the registry.
2. Check every active model, cache rate, effective date, and threshold.
3. Add a dated price row when a rate changes. Do not overwrite an older row.
4. Set `verified` to the review date.
5. Run `node tools/update-about.mjs --write`, then `node tools/check-about.mjs`.

The full refresh must run on a machine that has the local Claude Code and Codex logs.
GitHub Actions can validate committed data, but it cannot collect private local usage.
