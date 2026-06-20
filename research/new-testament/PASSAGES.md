# New Testament post: canonical passage + translation spec

This is the SHARED spec for every sourcing sub-agent. Use these exact passage
`id`s and verse ranges so the files merge cleanly. Do not invent ids or shift
ranges.

## The 16 keystone passages (in display order)

| n | id | reference | section |
|---|----|-----------|---------|
| 1 | `greatest-commandment` | Matthew 22:37-40 | I. The teaching of Jesus |
| 2 | `beatitudes` | Matthew 5:3-10 | I. The teaching of Jesus |
| 3 | `other-cheek` | Matthew 5:38-48 | I. The teaching of Jesus |
| 4 | `lords-prayer` | Matthew 6:9-13 | I. The teaching of Jesus |
| 5 | `judge-not` | Matthew 7:1-5 | I. The teaching of Jesus |
| 6 | `good-samaritan` | Luke 10:25-37 | I. The teaching of Jesus |
| 7 | `prodigal-son` | Luke 15:11-32 | I. The teaching of Jesus |
| 8 | `logos` | John 1:1-5, 14 | II. Who Jesus is |
| 9 | `john-316` | John 3:16-17 | II. Who Jesus is |
| 10 | `virgin` | Matthew 1:22-23 (quoting Isaiah 7:14) | II. Who Jesus is |
| 11 | `forgive-them` | Luke 23:33-38 | III. Passion and Resurrection |
| 12 | `empty-tomb` | Mark 16:1-8 | III. Passion and Resurrection |
| 13 | `love-chapter` | 1 Corinthians 13:1-13 | IV. Paul and the letters |
| 14 | `justified-by-faith` | Romans 3:21-26 | IV. Paul and the letters |
| 15 | `grace` | Ephesians 2:8-10 | IV. Paul and the letters |
| 16 | `faith-works` | James 2:14-26 | IV. Paul and the letters |

Notes on ranges:
- `logos`: provide John 1:1-5 AND verse 14 ("the Word became flesh"). Join with
  a blank line so I can show 1-5 then 14.
- `virgin`: provide Matthew 1:22-23 (Matthew's text, which quotes Isaiah). The
  Hebrew of Isaiah 7:14 is handled separately by the Greek/Hebrew agent.
- For long passages (`prodigal-son`, `good-samaritan`, `love-chapter`,
  `faith-works`), give the FULL passage verbatim. I will curate the displayed
  excerpt myself; I need the whole thing to do that accurately.

## The 9 translators (exact keys + metadata)

| key | name | year | era | tradition |
|-----|------|------|-----|-----------|
| `tyndale` | William Tyndale | 1526 | early | the first printed English NT from Greek |
| `kjv` | King James Version | 1611 | early | the Authorized Version |
| `drb` | Douay-Rheims | 1582 | early | Catholic (Rheims NT; Challoner revision is fine) |
| `rsv` | Revised Standard Version | 1952 | mid | scholarly |
| `nrsv` | New Revised Standard Version | 1989 | mid | scholarly, ecumenical |
| `niv` | New International Version | 2011 | modern | evangelical standard |
| `esv` | English Standard Version | 2016 | modern | evangelical, formal |
| `wright` | N.T. Wright, The Kingdom New Testament | 2011 | modern | scholar's readable |
| `hart` | David Bentley Hart, The New Testament | 2017 | modern | deliberately literal/strange |

## Output format

Write a JSON file to `research/new-testament/sources/<yourfile>.json`. Key by
translator, then by passage id. Example:

```json
{
  "kjv": {
    "name": "King James Version",
    "year": 1611,
    "passages": {
      "greatest-commandment": "Jesus said unto him, Thou shalt love the Lord thy God with all thy heart, and with all thy soul, and with all thy mind.\nThis is the first and great commandment.\nAnd the second is like unto it, Thou shalt love thy neighbour as thyself.\nOn these two commandments hang all the law and the prophets.",
      "beatitudes": "..."
    }
  }
}
```

## Hard rules (this is the most-scrutinized post in the series)

1. **VERBATIM ONLY.** Copy the exact published wording, punctuation, and
   capitalization. Never paraphrase, smooth, modernize (except Tyndale spelling,
   see below), or reconstruct from memory. If you cannot find a passage in a real
   source, set its value to `null` and list it under a `"_missing"` array. A null
   is fine; an invented verse is a disaster.
2. **Line breaks.** Use `\n` for hard line breaks the edition intends (the
   Beatitudes list, the Lord's Prayer lines, 1 Corinthians 13:4-7 if set as a
   list). Use `\n\n` for paragraph/stanza breaks. For ordinary prose, let it
   flow with normal spaces. Do NOT put verse numbers inside the text.
3. **Cite your source per translator** in a `"src"` field (the site/edition URL
   you pulled each from), so I can attribute it.
4. **Cross-check** every passage against a second source where you can. Bible
   Gateway, StepBible, BibleHub, studylight.org, biblia.com, ccel.org,
   drbo.org, and Wikisource are good. For the Lord's Prayer, note whether the
   edition includes the doxology ("For thine is the kingdom...") since the older
   manuscripts omit it.
