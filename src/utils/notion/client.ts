export interface RichText {
  type?: string;
  plain_text?: string;
  text?: { content: string; link?: { url: string } | null };
  href?: string | null;
  equation?: { expression: string };
  annotations?: { bold?: boolean; italic?: boolean; strikethrough?: boolean; underline?: boolean; code?: boolean };
}

export interface NotionFile {
  type: string;
  file?: { url: string };
  external?: { url: string };
}

export interface NotionProperty {
  type: string;
  title?: RichText[];
  rich_text?: RichText[];
  select?: { name: string } | null;
  multi_select?: { name: string }[];
  checkbox?: boolean;
  date?: { start: string } | null;
  url?: string | null;
  number?: number | null;
}

export interface NotionPage {
  id: string;
  archived?: boolean;
  in_trash?: boolean;
  cover?: NotionFile | null;
  properties: Record<string, NotionProperty>;
}

export interface NotionBlock {
  id: string;
  type: string;
  has_children?: boolean;
  [key: string]: unknown;
}

interface Paginated<T> {
  results: T[];
  has_more: boolean;
  next_cursor: string | null;
}

export const plainText = (text: RichText[] = []) => text.map(part => part.plain_text ?? part.text?.content ?? part.equation?.expression ?? '').join('');

export function notionId(value: string): string {
  const id = value.trim().replaceAll('-', '');
  if (!/^[a-f0-9]{32}$/i.test(id)) throw new Error('NOTION_DATABASE_ID must be a Notion database UUID, not a page URL.');
  return id;
}

// Build-time only. All collection loaders share this queue to stay below
// Notion's average three requests per second, including pagination and retries.
export class NotionClient {
  private token: string;
  private fetcher: typeof fetch;
  private sleep: (ms: number) => Promise<void>;
  private interval: number;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(token: string, options: { fetcher?: typeof fetch; sleep?: (ms: number) => Promise<void>; interval?: number } = {}) {
    if (!token.trim()) throw new Error('NOTION_TOKEN is required.');
    this.token = token;
    this.fetcher = options.fetcher ?? fetch;
    this.sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
    this.interval = options.interval ?? 350;
  }

  request<T>(path: string, body?: object): Promise<T> {
    const run = async (): Promise<T> => {
      for (let attempt = 0; attempt < 5; attempt++) {
        await this.sleep(this.interval);
        const response = await this.fetcher(`https://api.notion.com/v1/${path}`, {
          method: body ? 'POST' : 'GET',
          headers: { Authorization: `Bearer ${this.token}`, 'Notion-Version': '2026-03-11', 'Content-Type': 'application/json' },
          ...(body ? { body: JSON.stringify(body) } : {}),
          signal: AbortSignal.timeout(30_000),
        });
        if (response.ok) return await response.json() as T;
        if ((response.status === 429 || response.status >= 500) && attempt < 4) {
          const retryAfter = Number(response.headers.get('retry-after'));
          await response.body?.cancel();
          await this.sleep(Math.max(Number.isFinite(retryAfter) ? retryAfter * 1000 : 0, 1000 * 2 ** attempt));
          continue;
        }
        const hint = [401, 403, 404].includes(response.status)
          ? ' Check NOTION_TOKEN, NOTION_DATABASE_ID and the database connection permissions.' : '';
        // Never include response bodies or authorization headers in build logs.
        throw new Error(`Notion ${path} returned HTTP ${response.status}.${hint}`);
      }
      throw new Error('Notion retries exhausted.');
    };
    const result = this.queue.then(run);
    this.queue = result.catch(() => {});
    return result;
  }

  async pages(databaseId: string): Promise<NotionPage[]> {
    const database = await this.request<{ data_sources: { id: string }[] }>(`databases/${notionId(databaseId)}`);
    if (database.data_sources?.length !== 1) throw new Error('Expected exactly one data source in the website Notion database.');
    const pages: NotionPage[] = [];
    let cursor: string | undefined;
    do {
      const response = await this.request<Paginated<NotionPage>>(`data_sources/${database.data_sources[0].id}/query`, {
        page_size: 100,
        filter: { property: 'Published', checkbox: { equals: true } },
        ...(cursor ? { start_cursor: cursor } : {}),
      });
      if (!Array.isArray(response.results)) throw new Error('Invalid Notion query response.');
      pages.push(...response.results.filter(page => !page.archived && !page.in_trash && page.properties.Published?.checkbox === true));
      if (response.has_more && !response.next_cursor) throw new Error('Notion omitted a pagination cursor.');
      cursor = response.has_more ? response.next_cursor! : undefined;
    } while (cursor);
    return pages;
  }

  async blocks(id: string): Promise<NotionBlock[]> {
    const blocks: NotionBlock[] = [];
    let cursor: string | undefined;
    do {
      const query = new URLSearchParams({ page_size: '100', ...(cursor ? { start_cursor: cursor } : {}) });
      const response = await this.request<Paginated<NotionBlock>>(`blocks/${id}/children?${query}`);
      if (!Array.isArray(response.results)) throw new Error(`Invalid Notion blocks response for ${id}.`);
      blocks.push(...response.results);
      if (response.has_more && !response.next_cursor) throw new Error('Notion omitted a block pagination cursor.');
      cursor = response.has_more ? response.next_cursor! : undefined;
    } while (cursor);
    return blocks;
  }
}
