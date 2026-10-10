# Let me LLM that for you

`let-me-llm-that-for-you.html` makes a link that types someone's question into a
plain chat replica, presses send, and opens ChatGPT with that question. The page
is one unminified HTML file with inline CSS and JavaScript. It loads no external
assets and writes no cookies or browser storage. Its neutral palette and system
fonts are explicit owner exceptions to the portfolio style guide.

The maker, recipient, preview and broken-link states share the same page. Preview
stops at the handoff. A broken fragment returns to the maker with an explanation.
The page has no site shell; its only portfolio link is `@ethanwillingham` at the
bottom. Keep the lab `noindex` and unlinked.

Gate 1 approved natural pace, captions above the composer, the standard pointer
and bars on 2026-10-09. The owner cut the Watch an example link. The lab shows
only the shipped settings, with replay controls, slow motion, viewport, theme
and input-mode controls for verification.

## Link format

Generated addresses use the extensionless path and a base64url fragment:

```text
https://ethanwillingham.com/let-me-llm-that-for-you#<payload>
v1|chatgpt|<UTF-8 byte length>|<question>
```

Encode the whole payload as UTF-8, then base64url without padding. Split the
decoded header at its first three separators, because a question can contain
`|`. Version 1 accepts only `chatgpt`. The cap is `LMLTFY.CAP`, currently 600
UTF-8 bytes. Reject a bad alphabet, noncanonical base64url, invalid UTF-8,
unknown version or destination, incorrect byte length, and oversized payload.
Never play a question recovered from a cut-off link.

Questions in the fragment do not reach this site's server. Base64url only makes
the question unreadable at a glance; anyone can decode it. Do not describe this
as secrecy, encryption or a privacy guarantee. Readable `?q=` and `#q=` forms
are deliberately unsupported.

`sanitize()` runs before encoding and again after decoding. It normalizes to NFC
and trims the result. It removes Cc controls except newline and tab, Cf format
characters except U+200C and U+200D, lone surrogates, and tag characters U+E0000
through U+E007F. Each grapheme keeps at most one text or emoji variation selector
(U+FE0E or U+FE0F); other variation selectors are removed. Each grapheme is capped
at 12 code points. Sanitizing uses `Intl.Segmenter` where available. Its fallback
conservatively groups combining marks, joiners, Indic linkers, Hangul and flags
to keep those safety caps. Typing uses the separate `Array.from` fallback.
The replica and the ChatGPT URL must contain the same sanitized text.
Render question text through `textContent`.

## ChatGPT handoff

The URL builder uses only the fixed base and `encodeURIComponent(question)`:

```text
https://chatgpt.com/?q=<encoded question>
```

Use `location.replace` for automatic handoff, skip and fallback links so Back
does not replay the sequence. If the document remains visible for 2.5 seconds
after the handoff call, show the real `Open ChatGPT` link. A back-forward load or
a persisted `pageshow` displays the finished state with that link. Escape stops
the sequence without navigating and leaves a real send button and fallback link.

On 2026-10-09, logged-out in-app browser checks found that `?q=` and `?prompt=`
filled the question, including Unicode, URL symbols and a 600-byte UTF-8 example.
The `?q=` flow attempted to send, but verification failed. Completion of a real
answer remains UNVERIFIED. On the same date, the owner confirmed that the raw
logged-in q link filled the question. Automatic submission, answer completion
and phone app handoff still require the owner's checks. Detailed results and screenshot paths are in
`research/let-me-llm/DEEPLINKS.md` in the main checkout. Do not bypass a login or
human-verification wall.

Re-verify the raw links while logged out and logged in before launch, recording
the date, browser, exact result, longest working URL and screenshot. Include
ASCII, non-Latin text, newline, ampersand, hash, plus, percent and the byte-cap
case. Record scripted `location.replace` and tapped navigation separately;
phone universal links may open the ChatGPT app and lose the question.

If ChatGPT stops accepting linked questions, change the UI script's one switch:

```js
const USE_PASTE_STEP = true;
```

This adds `Step 3: Paste it into ChatGPT` and the `Copy question and open ChatGPT`
button. Copying happens in that user tap. Test this branch before shipping a
switch change. Keep `false` for the direct handoff while it works.

## Timeline

`LMLTFY.plan()` builds deterministic beats and absolute times from the question,
pointer mode, reduced-motion preference, viewport and payload-derived seed.
Typing takes `clamp(700 + 55 * graphemes, 1200, 4200)` milliseconds. Above 110
graphemes the ghost pastes rather than typing each character. Seeded typing
weights range from 0.6 to 1.5, with a 1.6 multiplier after spaces and 2.2 after
punctuation; the waits add up to the chosen typing duration.

| Beat | Base duration |
| --- | --- |
| Settle | 600 ms |
| Reach the text row | Fitts timing, 350 to 1,000 ms |
| Click in | 290 ms |
| Type or paste | 1,200 to 4,200 ms |
| Pause after typing | 350 ms |
| Reach and press send | Fitts timing, 350 to 1,000 ms |
| Move to sent state | 350 ms |
| Think before handoff | 700 ms |

Fitts timing is `250 + 150 * log2(distance / target width + 1)`, clamped to
350 through 1,000 ms. Minimum-jerk easing drives travel with a seeded gentle
arc. The planner scales non-typing beats to keep a 30-grapheme question within
5 to 8 seconds and every supported question below 10 seconds. The clock starts
on the first visible frame, pauses while hidden and advances by at most 50 ms
per frame. Resolve element anchors on each frame so resize does not restart it.
Touch and reduced motion retain typing and handoff with target-local taps.

## Checks and evidence

Run the page checks from this worktree's root. The unit suite extracts the pure
core script into `node:vm`; it covers link round trips, malformed payloads,
sanitizing, exact destination URLs, grapheme typing, deterministic timing, CSP
hashes and prohibited characters.

```sh
node tools/test-let-me-llm.mjs
node tools/test-let-me-llm-browser.cjs
node tools/let-me-llm-csp.mjs --check
gzip -9 -c let-me-llm-that-for-you.html | wc -c
wc -c let-me-llm-that-for-you.html
```

After editing inline CSS or JavaScript, run `node tools/let-me-llm-csp.mjs`
before checking its hashes. The meta policy immediately follows charset and
uses script/style hashes, `default-src 'none'`, data images only, no base URL
and no form action. Do not add `frame-ancestors`, `report-uri` or `sandbox` to a
meta policy. Do not add markup style attributes. Keep the page at most 40 KB raw
and 14,000 bytes after `gzip -9`; log both sizes at every commit.

The browser suite owns its local HTTP server and closes its browser in
`finally`. Chromium must use
`/Users/ethan/.local/bin/agent-chrome-for-testing`, never the personal Chrome
application. Run WebKit too, and Firefox if installed. It checks the maker,
preview, recipient, fallback, paste branch, Back, Escape, IME, touch, reduced
motion, hidden-tab clock, network and console. Save screenshots, recordings and
reports in `research/let-me-llm/evidence/` in the main checkout. Test results are
recorded in `PROGRESS.md`; commands here do not imply that a run passed.

Audit the maker with pinned Lighthouse, mobile, the median of three runs. Set
both `CHROME_PATH` and `--chrome-path` to the testing wrapper. Real iOS, Android,
in-app browsers and cached share previews remain owner checks. Mark an
unavailable environment UNVERIFIED with its reason.

## Thumbnails and site integration

The homepage thumbnail shows the tool just before send, with its exact title,
the caption `Step 2: Press send`, the sample question `How many ounces are in
a cup?` and the pointer on send. The owner requested actual words on 2026-10-09,
superseding the original wordless homepage rule. Type is enlarged and spacing
adjusted to stay legible as a thumbnail. Its source is
`tools/let-me-llm/homepage-thumbnail.html`; the maker's original light OG source
is `tools/let-me-llm/thumbnail-lab.html`.

```sh
node tools/let-me-llm/render-thumbnails.cjs
node tools/let-me-llm/render-thumbnails.cjs /path/to/evidence --homepage-only
```

This owns Chrome for Testing and writes the 600x400 homepage JPG/WebP pair
(`let-me-llm-that-for-you-text`) and the 1200x630 OG JPG under `assets/thumbs/`.
Use `--homepage-only` to rebuild the card without changing the OG image.
Its report and PNG evidence go to
`research/let-me-llm/evidence/integration/`. The page never requests these
images. Homepage revision evidence is in `evidence/thumbnail-text-v3/`, with
desktop and phone screenshots at the displayed card size.

Before adding a homepage entry, `node tools/gen-hubs.mjs --homepage` must leave
the current `index.html` byte-identical. The generator accepts either an
explicit `image` path or a thumbnail filename, optional image dimensions and
optional provenance. Slop's explicit image is 1254x1254; its entry matches its
live description and has no rendered provenance comment. The integration
evidence records the zero-diff result.

Prepare the new card on the local `lmltfy-card` branch and hold it until the
owner passes Gate 3. Its entry takes `createdCommit` and `createdAt` from the
page's first commit. Adding it should change one card plus the former first
image's eager loading. Regenerate search after adding the page; regenerate the
sitemap after the page is committed because it uses git dates. This page has no
`.post-back` and receives no generated endcap. Do not run `gen-post-nav.mjs`
over the real tree to prove that.

## Never add

Keep settings, a theme toggle, link history, a shortener, accounts, sound, a
backend, additional AI destinations, a picker, a punchline and readable
question links out of this page. It follows the visitor's theme, stores
nothing, and does one handoff. Changes to these locked choices require the
owner's instruction.
