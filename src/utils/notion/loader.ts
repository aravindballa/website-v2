import type { Loader } from 'astro/loaders';
import { NotionClient, plainText, type NotionPage } from './client.ts';
import { notionAssets } from './assets.ts';
import { blocksToMarkdown } from './markdown.ts';

export const collectionTypes = {
  writings: 'Post', memos: 'Memo', bookshelf: 'BookNote', hackletter: 'Letter', talks: 'Talk', notes: 'Note',
} as const;
export type NotionCollection = keyof typeof collectionTypes;

export function pageEntry(page: NotionPage) {
  const properties = page.properties;
  const collection = properties.Collection?.select?.name as NotionCollection;
  if (!Object.hasOwn(collectionTypes, collection)) throw new Error(`Notion page ${page.id} needs a valid Collection.`);
  const slug = plainText(properties.Slug?.rich_text).trim();
  // Preserve existing slugs, including triple hyphens used by Astro for memo filenames.
  if (!/^[a-z0-9_-]+(?:\/[a-z0-9_-]+)*$/.test(slug)) throw new Error(`Notion page ${page.id} needs a lowercase URL Slug (letters, numbers, hyphens, underscores, slashes).`);
  const title = plainText(properties.Name?.title).trim();
  if (!title) throw new Error(`Notion page ${page.id} needs a Name.`);
  const data: Record<string, unknown> = {
    title,
    type: collectionTypes[collection],
    published: properties.Published?.checkbox === true,
    description: plainText(properties.Description?.rich_text),
    tags: properties.Tags?.multi_select?.map(tag => tag.name).join(', ') ?? '',
    bannercaption: plainText(properties['Banner Caption']?.rich_text),
  };
  if (properties.Date?.date?.start) data.date = properties.Date.date.start;
  if (properties.Banner?.url) data.banner = properties.Banner.url;
  const venue = plainText(properties.Venue?.rich_text);
  if (venue) data.venue = venue;
  for (const name of ['Rating', 'Issue']) {
    const value = properties[name]?.number;
    if (value != null) data[name.toLowerCase()] = value;
  }
  for (const name of ['Slides', 'Video']) {
    if (properties[name]?.url) data[name.toLowerCase()] = properties[name].url;
  }
  return { id: slug, collection, data, page };
}

// One shared snapshot per content sync keeps all six collections consistent.
// This module is imported only by Astro's content config, never by browser code.
export function createNotionLoaders(token: string, databaseId: string) {
  const client = new NotionClient(token);
  let snapshot: Promise<ReturnType<typeof pageEntry>[]> | undefined;
  let asset: ReturnType<typeof notionAssets> | undefined;
  return (collection: NotionCollection): Loader => ({
    name: `notion-${collection}`,
    async load({ store, parseData, renderMarkdown, generateDigest, logger, config }) {
      snapshot ??= client.pages(databaseId).then(pages => {
        const entries = pages.map(pageEntry);
        const seen = new Set<string>();
        for (const entry of entries) {
          const key = `${entry.collection}/${entry.id}`;
          if (seen.has(key)) throw new Error(`Duplicate Notion slug: ${key}`);
          seen.add(key);
        }
        return entries;
      });
      const entries = (await snapshot).filter(entry => entry.collection === collection);
      const resolveAsset = await (asset ??= notionAssets(config.publicDir));
      const resolved = [];
      for (const entry of entries) {
        if (!entry.data.banner && entry.page.cover) entry.data.banner = await resolveAsset(entry.page.cover);
        const data = await parseData({ id: entry.id, data: entry.data });
        const blocks = await client.blocks(entry.page.id);
        const body = await blocksToMarkdown(blocks, { children: id => client.blocks(id), asset: resolveAsset });
        const rendered = await renderMarkdown(body);
        resolved.push({ id: entry.id, data, body, rendered, digest: generateDigest({ data, body }) });
      }
      // Clear only after the whole collection succeeds, removing unpublished and
      // deleted entries from Astro's persistent store on every successful sync.
      store.clear();
      for (const entry of resolved) store.set(entry);
      logger.info(`Loaded ${resolved.length} published ${collection} from Notion`);
    },
  });
}
