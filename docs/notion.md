# Notion content

The [Website Content database](https://app.notion.com/p/3d7116c540278039b31dccf190c96b82) lives inside [Blog](https://app.notion.com/p/3d7116c54027802a8fa4c12b110f54a8).

## Setup

Use Node 22. The integration runs when Astro syncs content during development or a build. It never sends the Notion token to visitors.

1. Create a Notion integration with **Read content** capability and add it as a connection to the Blog database.
2. Copy `.env.example` to `.env`, then set `NOTION_TOKEN` to the integration's API key. Keep the key private; do not use a `PUBLIC_` prefix.
3. Keep these values:

   ```dotenv
   NOTION_DATABASE_ID=3d7116c5-4027-8039-b31d-ccf190c96b82
   CONTENT_SOURCE=notion
   ```

4. Run `npm run build`. It queries the database, validates the entries, fetches their page blocks, and builds the existing website routes.
5. Set the same variables in your hosting provider's **build environment**. Cloudflare runtime secrets and `.dev.vars` alone do not configure this build-time loader.

The value above is the database ID. The data source ID is `3d7116c5-4027-80db-af0e-000bd3812d3e`; the loader discovers that automatically. See Notion's [database API](https://developers.notion.com/reference/retrieve-database).

If your local credentials are in `.dev.vars`, run `node --env-file=.dev.vars node_modules/astro/astro.js dev` so Astro's content sync can read them.

## Writing and publishing

Create a row and write the article in its page body. Set:

| Property | Purpose |
| --- | --- |
| Name | Article title |
| Collection | `writings`, `memos`, `bookshelf`, `hackletter`, `talks`, or `notes` |
| Slug | Existing URL path segment; keep it unchanged for existing entries |
| Published | Check to include the entry in the website's next build |
| Date | Required for writings, memos, hackletter, and talks; optional for books and notes |
| Description | Summary and SEO description |
| Banner / Banner Caption | Optional banner URL and credit; a page cover is used when Banner is empty |
| Tags | Tags used by the writings filters and RSS feed |
| Rating | Optional book rating |
| Issue | Optional newsletter issue number |
| Venue / Slides / Video | Optional talk metadata |

Collection maps to the existing frontmatter type automatically (`Post`, `Memo`, `BookNote`, `Letter`, `Talk`, `Note`). Retain the property names above.

**Rebuild and deploy after publishing, editing, unpublishing, or deleting content.** The live site serves the last deployed snapshot; it does not request Notion on every visit. Restart `npm run dev` to refresh remote content during development. A failed Notion request fails the build; it does not silently fall back to old local posts.

Unpublished rows and their bodies are excluded from the Notion content store, detail pages, feeds, and search. The existing site exposes writings, memos, book notes and the talks list; migrating newsletters and notes does not introduce new public routes for those collections.

Headings, rich text, code, lists (including nested lists), quotes, callouts, toggles, tables, images, audio, files, bookmarks and links are supported. External video/embed blocks render as links. Unsupported blocks produce a build error identifying the block so they can be converted to a supported form without silently losing content. Notion-hosted uploads and page covers are copied to generated `public/notion-assets/` files during builds, since their signed URLs expire. External image URLs keep their existing hosts.

## Migration record

The September 10, 2026 migration imported **93 files** using Notion MCP: 49 writings, 16 memos, 23 newsletters, 1 book note, 1 talk, and 3 notes. There are 81 published entries and 12 drafts. The three notes include the loose Stackblocks story and the empty `.haptic` daily note, both unpublished. Obsidian settings/plugins and macOS metadata are tooling, so they remain local.

`docs/notion-migration.json` maps each original file to its Notion page and retains the migration checksums. Local `content/` files retain the original frontmatter as a migration backup; with the Notion variables configured, the site reads Notion instead of those files.

Two legacy articles contain literal HTML script examples that Notion's inline import rejected:

- `manage-react-components-outside`
- `preact-ssr`

Their complete Markdown bodies were initially uploaded as attachments, then pasted directly into their Notion page bodies. The integration renders every article from its native Notion page blocks.

Presentation-only HTML wrappers were removed, the Gumroad widget became a normal link, the audio player became a Notion audio block, and relative links were made absolute so they continue pointing to the website. Existing text, code examples, media links, dates, tags, publication state and slugs were retained.

## Offline development and checks

`CONTENT_SOURCE=local npm run dev` uses the retained files for offline work. With neither Notion variable set, the repository also uses local content, preserving setup before credentials are available. With either variable set, both are required unless local mode is explicitly selected. Production should set `CONTENT_SOURCE=notion` so missing credentials are an error.

```sh
npm run test:notion
npm run astro -- check
npm run build
npm run preview
```

Preview uses Wrangler's local Worker runtime on `http://localhost:8787`, because the Cloudflare adapter does not implement `astro preview`.

The focused tests cover database/block pagination, rate-limit retries, metadata and slug validation, draft filtering, content rendering, expired-file handling, shared database queries, and stale-entry removal. They use simulated API responses. A live token is required to validate access through your particular integration.

`npm run notion:prepare-import` prepares MCP payloads in ignored `.notion-migration/`. It performs no network writes. The migration has already run: **do not blindly reimport those payloads**. Match Collection and Slug against existing rows, using the migration manifest to find their page IDs, before retrying an entry to prevent duplicates.
