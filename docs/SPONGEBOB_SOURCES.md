# SpongeBob character image roster

The character picker currently contains 1,021 locally stored images, researched
on October 9, 2026. The discovery index was the
[Characters category on Encyclopedia SpongeBobia](https://spongebob.fandom.com/wiki/Category:Characters),
which listed 2,856 character pages at import time.

Each entry in `assets/spongebob/characters.json` records the character's article
URL and original image URL. The picker exposes those source links for each card.
Images include stock art, model sheets, screenshots, comic art, game models and
live-action appearances. Article prose is not reproduced. SpongeBob characters
and underlying artwork belong to their respective rights holders, including
Nickelodeon and Paramount; the wiki's text license does not establish a license
for every image.

The roster favors individual named characters and identifiable creatures.
Crowds, numbered anonymous incidental lists, image placeholders and many alternate
forms of the same character were omitted. Distinct relatives, ancestors,
villains, movie characters, spinoff characters and video-game characters remain.
The catalog covers the main cast and a long tail of minor appearances; it is
not a claim that every character in the franchise has been collected.

Some familiar names are wiki redirects. Nat Peterson and Dr. Gill Gilliam are
linked to their numbered character pages. Suzy can also be found by searching
Debbie Rechid or Nancy Suzy Fish, Judy by searching Shubie, and Officer Murphy by
searching Officer John. These aliases share one image and one selector entry.

## Refreshing the roster

Run `tools/import-spongebob-characters.py` with Python 3 and Pillow. The importer
queries the public MediaWiki API, requests bounded copies from the image CDN,
preserves transparency, and stores WebP files with a maximum dimension of 640
pixels. Cached discovery and API responses live in `/tmp/spongebob-import-cache`.
Use a fresh `--cache-dir` to discover newly added wiki pages; use `--force` to
replace existing local images with current source copies.

All 1,021 delivered WebP files were decoded successfully. The main cast and a
64-image sample across the catalog were visually inspected. The WebP images
total about 33 MiB.

The 53 clearly photographic portraits also have lossless PNG fallback siblings.
These include live-action performers, animal photographs and photographed props.
Each record names its fallback with `fallbackImage`; both formats retain the
same image content. The PNG fallbacks total about 14 MiB. Illustrated and
animated portraits keep their WebP files.

## Data shape

The manifest contains `version`, `generatedAt`, `sourceName`, `sourceUrl`,
`discoveredCharacterPages`, and a `characters` array. Each character has:

- `id`: stable selector and voting identifier.
- `name`: display name.
- `group`: Main cast, Recurring, Villains, Movies, Spinoffs, Family, or Minor characters.
- `image`: site-relative path to the local WebP.
- `fallbackImage`, when present: matching PNG for a photographic image.
- `width` and `height`: actual dimensions of the delivered image.
- `sourcePage`: wiki character article.
- `sourceImage`: original source image URL.
- `aliases`, when present: additional names accepted by search.

The current groups contain 10 main characters, 38 recurring characters, 37
villains, 30 movie characters, 27 spinoff characters, 52 family members and 827
minor characters. These are browsing labels rather than mutually exclusive
claims about where a character appears.
