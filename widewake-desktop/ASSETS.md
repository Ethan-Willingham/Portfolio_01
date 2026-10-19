# Widewake desktop asset inventory

This inventory accompanies local testing packages. It is not release clearance.
Builds stay local until the distribution requirements below are resolved.

| Material | Source | Packaged status |
| --- | --- | --- |
| Game code, vessel/harbor/title art and synthesized sound | This repository's Widewake modules | Included directly from the web game; no downloaded music or third-party game art |
| Desktop cutter icon | `icons.mjs`, original 64-pixel drawing | Generated as PNG, ICO and ICNS; no deferred generated port studies included |
| Earth coastline | [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/), 1:110m land | Public-domain source, retained game credit |
| Commit Mono regular and bold | Existing portfolio WOFF2 files; [author's font license](https://github.com/eigilnikolajsen/commit-mono/blob/main/LICENSE-FONT) | SIL Open Font License included in `licenses/Commit-Mono-OFL.txt` |
| Segoe UI regular and bold | Existing portfolio WOFF2 files; [Microsoft font redistribution FAQ](https://learn.microsoft.com/en-us/typography/fonts/font-faq) | App/game redistribution rights need confirmation before distribution |
| Electron and Chromium | Pinned Electron 44.9.0 runtime | Runtime license and Chromium notices remain with each packaged executable |

The staging manifest lists every served game file, byte size and SHA-256 digest.
It excludes the rest of the portfolio, source art studies, test fixtures, local
profiles and development dependencies. Node dependencies used for packaging and
testing are development tools; they are not copied into the game's ASAR archive.

Before any public binary or Steam depot: resolve Segoe UI redistribution rights,
review the final asset set, retain all applicable notices, and record any approved
replacements. Do not infer redistribution rights from the ability to load a font
on the existing website. Image generation remains deferred by the owner.
