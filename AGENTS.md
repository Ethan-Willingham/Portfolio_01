# AGENTS.md — Portfolio site (public)

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

- Pages: `index.html`, `gallery.html`, `particle-life.html`, `particles.html`,
  `daylight-globe.html`, `weather.html`, `optional-body.html`, `random-galaxy.html`,
  `git-history.html`, `best-photographs.html`, and the frozen `grand-motherload.html`
  game demo.
- Shared: `style.css`, the site scripts in `js/` (`main.js`, `globe.js`, `particle-life.js`,
  `particles.js`, `git-history*.js`, `optional-body.js`, `random-galaxy.js`, `backtotop.js`),
  and `assets/` (fonts, images, thumbs, etc.).

## Conventions

- Static HTML/CSS/JS, served as-is. To test, open the relevant `.html` in a browser.
- Site pages use the three self-hosted typefaces (Century Supra, Segoe UI, Commit Mono);
  keep new text on one of those and avoid font CDNs. (The frozen game demo is historical and
  may reference an old CDN font; leave it as-is.)
- Commit and push every change to `main`; Amplify auto-deploys. No manual deploy step.
- No em dashes in any content or commit messages (use commas, periods, parentheses, or "to").
