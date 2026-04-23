# Your Writing Site

A minimal, mobile-first site for long-form writing.

## File Structure

```
/
├── index.html          ← Homepage (article list)
├── post.html           ← Example article page (duplicate & rename for each piece)
├── css/
│   └── style.css       ← All styling
├── js/
│   └── main.js         ← Reading progress bar (only runs on post pages)
├── fonts/              ← Put your Century Supra .woff2 files here
│   ├── century-supra-regular.woff2
│   ├── century-supra-italic.woff2
│   ├── century-supra-bold.woff2
│   └── century-supra-bold-italic.woff2
└── README.md
```

## Font Setup

**Century Supra** is a commercial font by Matthew Butterick.

1. Purchase from [https://mbtype.com/fonts/century-supra/](https://mbtype.com/fonts/century-supra/)
2. Download the WOFF2 web font files
3. Rename them to match the filenames in `css/style.css` (or update the `@font-face` `src` paths)
4. Drop them into the `fonts/` directory

Until the font files are in place, headings will fall back to
Century Schoolbook → Palatino → Georgia.

## Adding a New Post

1. Duplicate `post.html`
2. Rename it (e.g. `my-new-essay.html`)
3. Update the `<title>`, `<meta>` description, `.post-title`, `.post-date`, and `.post-body` content
4. Add an entry to the `<ul class="article-list">` in `index.html`

## Colors at a Glance

| Role        | Value     | Where                    |
|-------------|-----------|--------------------------|
| Background  | `#303931` | Page background          |
| Body text   | `#D5CCBC` | Paragraph text           |
| Headings    | `#EDE6DA` | Titles, h2, h3, strong   |
| Dim / meta  | `#8F8978` | Dates, nav, footer       |
| Accent      | `#B8A88A` | Links, code highlights   |
| Rules       | `#4A544B` | Divider lines            |

## AWS Deployment

These are plain static files. On S3 + CloudFront:

1. Upload the entire folder to your S3 bucket
2. Set `index.html` as the default root object
3. Make sure MIME types are correct (`.woff2` → `font/woff2`)
4. Invalidate CloudFront cache after updates

No build step, no dependencies, no framework.
