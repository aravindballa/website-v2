# Repository Guidelines

## Project Structure & Module Organization
This is an Astro 5 site with content-driven routes.
- `src/pages/`: route entrypoints (`.astro`, dynamic routes like `writings/[...slug].astro`).
- `src/layouts/`, `src/components/`: shared UI structure and reusable pieces.
- `src/utils/`: utility logic (for example, reading time helpers).
- `src/content/config.ts`: collection schemas and frontmatter validation rules.
- `content/`: markdown/MDX source grouped by domain (`writings`, `memos`, `bookshelf`, `talks`, `hackletter`, `notes`).
- `public/`: static files (fonts, icons, images, robots/sitemap assets).
- `dist/`: generated build output.

## Build, Test, and Development Commands
Run commands from the repository root.
- `npm install`: install dependencies.
- `npm run dev`: start local dev server (`http://localhost:4321`).
- `npm run build`: create a production build in `dist/`.
- `npm run preview`: serve the built site locally for validation.
- `npm run astro -- check`: run Astro/TypeScript project checks.

## Coding Style & Naming Conventions
- Use 2-space indentation across Astro, TypeScript, and CSS.
- Prefer ES modules and small, focused utility functions in `src/utils/`.
- Route/content file names use kebab-case (for example, `advanced-git-tips.md`).
- Keep content frontmatter aligned with collection schemas in `src/content/config.ts`.
- Styling is Tailwind CSS v4 plus global CSS variables in `src/styles/global.css`.

## Testing Guidelines
There is no dedicated test runner configured yet. Use this minimum validation workflow before opening a PR:
1. `npm run astro -- check`
2. `npm run build`
3. `npm run preview` and manually verify key pages (`/`, `/writings`, `/memos`, `/bookshelf`, `/talks`).

For content changes, confirm frontmatter types (for example, `date`, `title`, `type`, `published`) match the target collection schema.

## Commit & Pull Request Guidelines
Recent history follows Conventional Commit-style prefixes: `feat:`, `fix:`, `chore:`. Keep using short, imperative summaries.
- Example: `fix: correct memo route pagination`

PRs should include:
- Clear change summary and motivation.
- Linked issue (if applicable).
- Screenshots/GIFs for UI changes (desktop + mobile when layout is affected).
- Notes on content schema changes or migration steps.
