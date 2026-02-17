# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # dev server at localhost:4321
npm run build     # production build to ./dist/
npm run preview   # preview production build
```

No lint or test scripts configured.

## Architecture

**Astro v5 SSR site** deployed to **Cloudflare Workers/Pages** via `@astrojs/cloudflare`. Uses MDX for content and Tailwind CSS v4 (via Vite plugin, not PostCSS).

### Rendering modes

- **SSR (default)**: `/`, `/writings/`, `/bookshelf/`, `/talks/`, `/rss.xml`
- **Prerendered (static)**: `/writings/[slug]`, `/memos/[slug]` — set via `export const prerender = true`
- **On-demand SSR**: `/bookshelf/[slug]` — fetches Readwise highlights at request time

### Content collections

Six collections defined in `src/content/config.ts` with Zod schemas. Content lives in `/content/{collection}/` as `.md`/`.mdx` files. Each schema has a `type` literal discriminator (`'Post'`, `'Memo'`, `'BookNote'`, `'Letter'`, `'Talk'`, `'Note'`) and a `published` boolean for draft filtering.

The homepage and `/writings/` combine `writings` + `memos` collections, sorted by date.

### Bookshelf — hybrid data

- `/bookshelf/` index fetches book list from a Cloudflare Worker (`readwise-kv.aravindballa.workers.dev`)
- `/bookshelf/[slug]` fetches highlights from `readwise.io/api/v2` using `READWISE_TOKEN` env var
- Some books also have local content notes in `/content/bookshelf/`

### Styling

- Tailwind v4 via `@tailwindcss/vite` plugin (configured in `astro.config.mjs`, not `postcss.config`)
- Theme uses CSS custom properties in `src/styles/global.css`: `--background`, `--foreground`, `--headings`, `--muted`, `--accent`, `--border`, `--surface`
- Dark mode: class-based (`.dark` on `<html>`), toggled via localStorage in `public/noflash.js`
- Font: self-hosted **Rethink Sans Variable** (`public/fonts/`). The `font-poppins`/`font-work-sans` references in `tailwind.config.mjs` are stale — ignore them
- Warm stone/amber color palette. Prose content uses `prose prose-lg dark:prose-invert`
- Accent colors applied via `text-[var(--accent)]` pattern, not Tailwind theme tokens

### Layout

Single layout at `src/layouts/Layout.astro` handles SEO meta, dark mode script, header/footer. All pages wrap in this layout.

### Environment

- Node v20.5.0 (`.nvmrc`)
- `READWISE_TOKEN` required for bookshelf highlight fetching
