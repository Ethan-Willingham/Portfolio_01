# AGENTS.md - Portfolio site (public)

This is the **public** portfolio site, served from GitHub Pages on every push to `main`.
`CLAUDE.md` imports this file via `@AGENTS.md`, so the same doc serves every AI assistant.

---

## Important: the Sluice game moved to a private repo

The 2D mining game **Sluice** (formerly "Grand Motherload") is **no longer developed here.**
This repo keeps only a **frozen v15.2 browser demo** of it (`grand-motherload.html` +
`js/grand-motherload.js`, plus `js/liquid-wgpu.js` / `js/smoke-wgpu.js` / `manifest.json`),
linked from the homepage with a "coming to Steam" notice.

**Active game development happens in a separate PRIVATE repo: `sluice-alpha`**
(https://github.com/Ethan-Willingham/sluice-alpha).

> If you were asked to work on Sluice, **stop and switch to a checkout of `sluice-alpha`.**
> Do not develop the game in this repo, and do not restore the alpha game files here.
> The full alpha history (through v24.x) also remains in this repo's git history under the
> tag `alpha-v24.13-public-final`, but that is reference only.

---

## What lives here

The portfolio pages and their assets:

- Pages: `index.html`, `about.html`, `gallery.html`, `particle-life.html`, `particles.html`,
  `daylight-globe.html`, `weather.html`, `optional-body.html`, `random-galaxy.html`,
  and the frozen `grand-motherload.html`
  game demo. `about.html` is the site's meta page (how it's made, and what it's
  made of); it absorbed the former `colophon.html` and `git-history.html` posts
  and is powered by the `js/git-history*` and `js/git-attribution*` scripts.
- Shared: `style.css`, the site scripts in `js/` (`main.js`, `globe.js`, `particle-life.js`,
  `particles.js`, `git-history*.js`, `git-attribution*.js`, `optional-body.js`, `random-galaxy.js`, `backtotop.js`),
  and `assets/` (fonts, images, thumbs, etc.).

## Conventions

- Static HTML/CSS/JS, served as-is. To test, open the relevant `.html` in a browser.
- Site pages use the three self-hosted typefaces (Century Supra, Segoe UI, Commit Mono);
  keep new text on one of those and avoid font CDNs. (The frozen game demo is historical and
  may reference an old CDN font; leave it as-is.)
- Color: the whole site runs on one warm, OKLCH-tuned palette on a locked dark-green background (`--bg: #303931`). **Read `STYLE.md` before adding or changing any color, type, or component** (it folds in the old PALETTE.md and documents the component kit in `kit.css`). The source of truth is the `:root` block in `style.css`; prefer `var(--token)` over a raw hex. Never recolor photographs, `--img-bg` mattes, `@media print` blocks, or the `best-photographs` gallery.
- Prose: every post is written in one calibrated voice. **Read `VOICE.md` before writing or editing post prose** (the Warm base voice, how to open a post and how to deliver a fact, the LLM-tell kill-list, and the credibility rules that keep posts off the wrong end of a Hacker News thread). It was calibrated with the owner via `voice-lab.html`; the no-em-dash rule below is part of it.
- Archiving: moving a finished post off the homepage into `/archive` (owner's curation call) is a multi-step checklist that is easy to half-do. **Read `ARCHIVING.md` before archiving or un-archiving any post** (move the page, move its thumbs, fix shared paths to absolute, fix the `og:`/`twitter:` tags to the archive URL, add the banner, bump the counter, drop the homepage card, rebuild the search index, refresh the About-page attribution tile).
- Commit and push every change to `main`; GitHub Pages auto-deploys. No manual deploy step.
- No em dashes in any content or commit messages (use commas, periods, parentheses, or "to").
- A git pre-commit linter (`tools/voice-lint.sh`, wired via `tools/githooks/`) hard-blocks em dashes and the formulaic LLM tells listed in `VOICE.md` from any staged `.html`/`.md` post content. Enable it once per checkout with `git config core.hooksPath tools/githooks`. It skips the frozen game demo, the throwaway `*-lab.html` choosers, and the meta-docs; bypass in a real exception with `git commit --no-verify`.
