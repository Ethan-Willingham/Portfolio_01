# ARCHIVING.md - how to archive (or un-archive) a post

Archiving moves a finished post off the homepage into `/archive` while keeping it
live at a stable URL, behind the amber "Archived" banner. It is the owner's
curation call (lost interest, better in his head than on the page, or just not
worth finishing). The root URL goes dead on purpose.

This is a **checklist with several easy-to-miss steps**. Run every step. A
half-done archive leaves orphaned thumbs, dead `og:` link previews, a stale
search index, and a missing tile on the About page. Do them in order.

> Convention, set by every existing post in `archive/`: each archived post is
> **self-contained** in `archive/<slug>/` with its own `assets/` subdir. The page
> links the **shared** resources (`/style.css`, `/js/*`, `/assets/fonts/*`) by
> **absolute** path, and its **own** images by **relative** path (`assets/foo.jpg`,
> which resolves inside the post's own folder).

Use `archive/the-number/` or `archive/forty-not-a-hundred/` as a reference; both
are complete and correct.

---

## The checklist

Let `<slug>` be the post's basename (e.g. `seven-habits`).

1. **Move the page.**
   `mkdir -p archive/<slug>` then `git mv <slug>.html archive/<slug>/<slug>.html`.

2. **Move the post's own assets** into `archive/<slug>/assets/`.
   Always includes the homepage thumb `assets/thumbs/<slug>.jpg` and the OG image
   `assets/thumbs/<slug>-og.jpg`, plus any inline images the post kept under
   `assets/`. Leave **no orphans** behind in `assets/thumbs/`.
   `mkdir -p archive/<slug>/assets && git mv assets/thumbs/<slug>*.jpg archive/<slug>/assets/`

3. **Rewrite paths in the moved page** so it resolves from the subdir:
   - Shared resources to **absolute**: `href="style.css"` to `/style.css`,
     `src="js/..."` to `/js/...`, `href="assets/fonts/..."` to `/assets/fonts/...`.
   - The post's **own** inline images stay **relative** (`src="assets/foo.jpg"`),
     because they moved into `archive/<slug>/assets/` alongside the page.

4. **Fix the social tags** (else link previews point at the dead root URL):
   - `og:url` to `https://ethanwillingham.com/archive/<slug>/<slug>.html`
   - `og:image` **and** `twitter:image` to
     `https://ethanwillingham.com/archive/<slug>/assets/<slug>-og.jpg`

5. **Add the archive banner.** Insert as the **first child of `<body>`**:
   `<script src="/js/archive-banner.js"></script>`

6. **Bump the counter** in `js/archive-banner.js`: increment `ARCHIVED`, update the
   dated comment and the `// PCT` note (the percentage recomputes itself). `TOTAL`
   is the all-time post count; only raise it when a brand-new post ships, not when
   archiving.

7. **Remove the homepage card.** Delete the post's whole
   `<li class="article-list-item ...">...</li>` block from `index.html`.

8. **Rebuild the search index.** `node tools/build-search-index.mjs`, then commit the
   regenerated `search-index.json`. The builder auto-discovers `archive/<slug>/`,
   drops the now-dead root entry (the card is gone), and reads the archived page's
   `og:image` as the result thumb, so steps 2, 4, and 7 must be done first.

9. **Refresh the About-page attribution tile** (`js/git-attribution-data.js`, the
   "Which mind built which page" viz). Run `node tools/build-attribution.mjs` (read
   its header first): add the post to the `NEW` config, run once to validate, then
   `--write`. It is **add-only** because old transcripts get pruned, so a full
   re-derive would regress intact tiles. A post built on another machine/account
   (e.g. `star-signs`, `remote-viewing`, `space-age`) has no local transcripts and
   legitimately never appears; the page scopes this, so do **not** fabricate a tile.
   Verify the new tile renders on `about.html` before committing.

10. **Update `AGENTS.md`** only if the post was named in the "Pages" list there
    (rare; `best-photographs` was the precedent).

11. **Commit and push** to `main`. Then verify: the archive URL loads with the
    banner, and the old root URL 404s.

---

## Un-archiving

Reverse the steps: `git mv` the page back to root, restore relative shared paths,
move assets back to `assets/thumbs/`, revert the `og:`/`twitter:` tags, remove the
banner script, decrement `ARCHIVED`, re-add the homepage card to `index.html`, and
rebuild the search index.
