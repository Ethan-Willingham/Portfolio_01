# SpongeBob original-series character roster

The character picker contains 1,370 locally stored portraits from the original
SpongeBob SquarePants TV series, researched on October 9, 2026. The discovery
index was the [Characters category on Encyclopedia SpongeBobia](https://spongebob.fandom.com/wiki/Category:Characters),
which listed 2,856 character pages at import time.

Every catalog entry records a specific original-series episode, its episode
article, the character article and the original image URL. The picker shows
the episode and links to the character article. The image is that article's portrait,
which can be stock art, a model sheet, a screenshot, a game render or a
live-action photograph. The portrait's format does not determine whether the
character belongs to the TV series. Article prose is not reproduced. SpongeBob
characters and artwork belong to their respective rights holders, including
Nickelodeon and Paramount; the wiki's text license does not establish a license
for every image.

## Original-series scope

The audit read all 2,856 character articles and 673 entries in the wiki's
[Episodes category](https://spongebob.fandom.com/wiki/Category:Episodes).
Only the 658 pages using the regular original-series episode template establish
scope. Spinoff episodes, films, games, books, separate shorts, livestreams and
clip compilations do not qualify on their own.

An appearance is established by a character's appearance infobox, an original
episode's character list or a specific original-series role section. References
marked mentioned, deleted, unused or cut are excluded. The final catalog has
1,270 infobox matches, 99 episode-character-list matches and one original-series
role-section match. The recorded episode is a verified appearance, not a claim
to identify the earliest appearance when sources disagree.

Characters introduced elsewhere remain eligible when an original-series episode
confirms an appearance. Examples include Squidina in Goons on the Moon, Prawn
in Captain Pipsqueak, and Rube Goldfish in No Pictures Please. Movie or spinoff
origin does not create a separate browsing group in this TV catalog.

The roster favors individual named characters and recognizable creatures.
Crowds, clubs, bands, anonymous numbered character lists, placeholders and many
alternate forms of the same character are omitted. Five qualifying articles did
not provide usable portraits. This is a broad sourced catalog, not a claim that
every original-series character has been collected.

The prior franchise catalog had 1,021 entries. This audit retained 716 stable
IDs, added 654 original-series entries and removed 305 entries that did not
qualify under this scope or represented alternate forms. Unused portrait and
fallback files were removed.

The owner's selected fight lineup is maintained separately in
`assets/spongebob/lineup.json`. Its saved Bare-Knuckles the Sea Bear entry remains
available for that lineup through `retainedCharacters` and
`assets/spongebob/selected-cast/`. Bare-Knuckles is not included in this
original-series catalog because its sourced appearance is in The Patrick Star
Show. The remaining 18 selected characters have original-series episode
evidence in the catalog.

## Familiar names and search

[Fred](https://spongebob.fandom.com/wiki/Fred) is the "My leg!" fish. Search also
accepts My leg, My leg guy and Fred the Fish. Tom can be found as Chocolate guy
or Chocolate man. These aliases share one image and one selector entry.

The expanded roster includes 47 additional named incidental fish, including
Tina, Evelyn, Steven, Nurse Rechid and several distinct fish called Frank.
The Franks have descriptive names so they can be chosen separately. Frank
(Neptune's advisor) is also included, with The Clash of Triton as evidence.
Nat Peterson and Dr. Gill Gilliam retain their existing IDs and links to their
numbered source articles.

Some familiar names are wiki redirects. Suzy can also be found as Debbie Rechid
or Nancy Suzy Fish, Judy as Shubie, and Officer Murphy as Officer John.

## Refreshing the roster

Run `tools/import-spongebob-characters.py` with Python 3 and Pillow. The importer
queries the public MediaWiki API, checks the original-series episode evidence,
requests bounded copies from the image CDN, preserves transparency and stores
WebP files with a maximum dimension of 640 pixels. Cached discovery and image
API responses live in `/tmp/spongebob-import-cache`; article and episode audit
responses live in `/tmp/spongebob-original-audit`.

Use fresh `--cache-dir` and `--audit-cache-dir` directories to refresh discovery
and source evidence. Use `--force` to replace existing portraits with current
source copies. The importer validates IDs and images before atomically replacing
the manifest, then removes unused local catalog images.

All 1,370 delivered WebP files decoded successfully. The main cast and portrait
contact sheets were visually inspected. The WebP files total about 43 MiB.
There are 71 PNG fallback siblings, covering photographic portraits and retained
fallbacks from the previous catalog. Their pixels match the decoded WebP exactly,
and they total about 19 MiB. Each record names its fallback with `fallbackImage`.

## Data shape

The manifest contains `version` (2), `scope` (`original-series`), `scopeName`,
`generatedAt`, `sourceName`, `sourceUrl`, `discoveredCharacterPages` and a
`characters` array. Each character has:

- `id`: stable selector and voting identifier.
- `name`: display name.
- `group`: Main cast, Recurring, Villains, Family or Minor characters.
- `image`: site-relative path to the local WebP.
- `fallbackImage`, when present: matching PNG for a photographic image.
- `width` and `height`: actual dimensions of the delivered image.
- `sourcePage`: wiki character article.
- `sourceImage`: original source image URL.
- `seriesEpisode`: a verified original-series episode title.
- `seriesSource`: the corresponding episode article.
- `seriesEvidence`: the source method establishing the appearance.
- `aliases`, when present: additional names accepted by search.

The browsing groups contain 10 main characters, 84 recurring characters, 32
villains, 61 family members and 1,183 minor characters.
