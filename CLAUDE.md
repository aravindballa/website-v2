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

**Astro v7 SSR site** deployed to **Cloudflare Workers** via `@astrojs/cloudflare`. Uses MDX for content and Tailwind CSS v4 (via Vite plugin, not PostCSS).

### Rendering modes

- **SSR (default)**: `/`, `/writings/`, `/bookshelf/`, `/talks/`, `/rss.xml`
- **Prerendered (static)**: `/writings/[slug]`, `/memos/[slug]` — set via `export const prerender = true`
- **On-demand SSR**: `/bookshelf/[slug]` — reads Readwise highlights from KV

### Content collections

Six collections defined in `src/content.config.ts` with Zod schemas. Content lives in `/content/{collection}/` as `.md`/`.mdx` files. Each schema has a `type` literal discriminator (`'Post'`, `'Memo'`, `'BookNote'`, `'Letter'`, `'Talk'`, `'Note'`) and a `published` boolean for draft filtering.

The homepage and `/writings/` combine `writings` + `memos` collections, sorted by date.

### Bookshelf — hybrid data

- `src/worker.ts` wraps the Astro handler and adds an hourly cron that syncs Readwise books plus every book highlight (export API) into one `READWISE_KV` key, `readwise:library:v1`
- `/bookshelf/` and `/bookshelf/[slug]` read that key via `getReadwiseLibrary()`; an empty KV triggers one inline sync
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

- Node 22.22+ (`.nvmrc`)
- `READWISE_TOKEN` required for the Readwise sync
