import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createMarkdownProcessor } from '@astrojs/markdown-remark';
import { NotionClient, type NotionPage, type RichText } from '../src/utils/notion/client.ts';
import { blocksToMarkdown, richText, safeUrl } from '../src/utils/notion/markdown.ts';
import { notionAssets } from '../src/utils/notion/assets.ts';
import { createNotionLoaders, pageEntry } from '../src/utils/notion/loader.ts';

const text = (value: string): RichText[] => [{ type: 'text', plain_text: value, text: { content: value } }];
const json = (value: unknown, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers });
const databaseId = '3d7116c5-4027-8039-b31d-ccf190c96b82';
const page = (id = 'first', published = true): NotionPage => ({
  id,
  properties: {
    Name: { type: 'title', title: text('A post') },
    Collection: { type: 'select', select: { name: 'writings' } },
    Slug: { type: 'rich_text', rich_text: text(id) },
    Published: { type: 'checkbox', checkbox: published },
    Date: { type: 'date', date: { start: '2024-09-05' } },
  },
});
const list = (results: unknown[], next: string | null = null) => ({ results, has_more: next !== null, next_cursor: next });

test('queries all database pages and block pages, filters drafts and trash, and respects rate limits', async () => {
  const requests: { url: string; body?: any }[] = [];
  const waits: number[] = [];
  const responses = [
    json({ data_sources: [{ id: 'source-id' }] }),
    json({}, 429, { 'retry-after': '2' }),
    json(list(Array.from({ length: 100 }, (_, index) => page(`post-${index}`)), 'page-cursor')),
    json(list([page('last'), page('draft', false), { ...page('trashed'), in_trash: true }])),
    json(list([{ id: 'one' }], 'block-cursor')),
    json(list([{ id: 'two' }])),
  ];
  const client = new NotionClient('test-token', { interval: 0, sleep: async ms => { waits.push(ms); }, fetcher: async (input, options) => {
    assert.equal(new Headers(options?.headers).get('Authorization'), 'Bearer test-token');
    requests.push({ url: String(input), body: options?.body ? JSON.parse(String(options.body)) : undefined });
    return responses.shift()!;
  } });
  assert.equal((await client.pages(databaseId)).length, 101);
  assert.equal(requests[3].body.start_cursor, 'page-cursor');
  assert.equal(requests[1].body.filter.checkbox.equals, true);
  assert.ok(waits.includes(2000));
  assert.equal((await client.blocks('page-id')).length, 2);
  assert.match(requests[5].url, /start_cursor=block-cursor/);
});

test('authentication and malformed pagination fail without exposing secrets or silently returning partial content', async () => {
  const client = new NotionClient('secret-value', { interval: 0, fetcher: async () => json({ message: 'secret-value' }, 403) });
  await assert.rejects(client.pages(databaseId), error => {
    assert.match(String(error), /HTTP 403/);
    assert.doesNotMatch(String(error), /secret-value/);
    return true;
  });
  const broken = new NotionClient('token', { interval: 0, fetcher: async () => json({ results: [], has_more: true, next_cursor: null }) });
  await assert.rejects(broken.blocks('id'), /pagination cursor/);
});

test('converts nested lists, literal code, links, toggles, tables and media into renderable content', async () => {
  const markdown = await blocksToMarkdown([
    { id: 'heading', type: 'heading_2', heading_2: { rich_text: text('Hello') } },
    { id: 'parent', type: 'numbered_list_item', has_children: true, numbered_list_item: { rich_text: text('Parent') } },
    { id: 'code', type: 'code', code: { language: 'javascript', rich_text: text('const html = `<script>alert("example")</script>`;\n// ``` stays literal') } },
    { id: 'toggle', type: 'toggle', has_children: true, toggle: { rich_text: text('Details') } },
    { id: 'table', type: 'table', table: { has_column_header: true } },
    { id: 'audio', type: 'audio', audio: { type: 'external', external: { url: 'https://example.com/audio.mp3' } } },
  ], {
    children: async id => id === 'table' ? [
      { id: 'r1', type: 'table_row', table_row: { cells: [text('Name'), text('Value')] } },
      { id: 'r2', type: 'table_row', table_row: { cells: [text('A | B'), text('C')] } },
    ] : [{ id: `${id}-child`, type: 'paragraph', paragraph: { rich_text: text('Child <b>literal</b>') } }],
    asset: async file => file.external!.url,
  });
  const renderer = await createMarkdownProcessor();
  const { code } = await renderer.render(markdown);
  assert.match(code, /<ol>/);
  assert.match(code, /<details>/);
  assert.match(code, /<table>/);
  assert.match(code, /<audio controls/);
  assert.match(code, /Child (?:&lt;|&#x3C;)b(?:&gt;|>)literal/);
  assert.doesNotMatch(code, /<script>/);
  assert.match(markdown, /const html = `<script>alert\("example"\)<\/script>`;/);
  await assert.rejects(blocksToMarkdown([{ id: 'bad', type: 'unsupported' }], { children: async () => [], asset: async () => '' }), /Unsupported Notion block/);
  assert.throws(() => safeUrl('javascript:alert(1)'), /Unsupported URL protocol/);
  assert.equal(richText([{ ...text('label')[0], href: 'https://example.com/a(b)' }]), '[label](https://example.com/a%28b%29)');
  assert.equal(richText([{ ...text(' bold ')[0], annotations: { bold: true } }]), ' **bold** ');
});

test('preserves route IDs and metadata; rejects missing collection and invalid slugs', () => {
  const entry = page('owning-your-platforms---why-and-the-good-parts');
  assert.equal(pageEntry(entry).id, 'owning-your-platforms---why-and-the-good-parts');
  assert.equal(pageEntry(entry).data.date, '2024-09-05');
  entry.properties.Collection.select = null;
  assert.throws(() => pageEntry(entry), /valid Collection/);
  assert.throws(() => pageEntry(page('../escape')), /URL Slug/);
});

test('copies expiring Notion assets locally, clears stale files and never forwards API credentials', async () => {
  const directory = await mkdtemp(`${tmpdir()}/notion-assets-test-`);
  try {
    await mkdir(`${directory}/notion-assets`);
    await writeFile(`${directory}/notion-assets/previously-published.png`, 'old');
    let calls = 0;
    const asset = await notionAssets(pathToFileURL(`${directory}/`), async (_input, options) => {
      calls++;
      assert.equal(options?.headers, undefined);
      return new Response('image bytes', { headers: { 'content-type': 'image/png' } });
    });
    const file = { type: 'file', file: { url: 'https://example.com/image?signature=expires' } };
    const local = await asset(file);
    assert.match(local, /^\/notion-assets\/[a-f0-9]+\.png$/);
    assert.equal(await readFile(`${directory}${local}`, 'utf8'), 'image bytes');
    assert.deepEqual(await readdir(`${directory}/notion-assets`), [local.split('/').at(-1)]);
    assert.equal(await asset(file), local);
    assert.equal(calls, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('Astro loader shares queries, renders bodies, removes stale entries and rejects duplicate slugs', async () => {
  const directory = await mkdtemp(`${tmpdir()}/notion-loader-test-`);
  const previousFetch = globalThis.fetch;
  let queries = 0;
  let duplicate = false;
  globalThis.fetch = async input => {
    const url = String(input);
    if (url.includes('/databases/')) return json({ data_sources: [{ id: 'data-source' }] });
    if (url.includes('/query')) { queries++; return json(list(duplicate ? [page(), page()] : [page()])); }
    return json(list([{ id: 'body', type: 'paragraph', paragraph: { rich_text: text('From Notion') } }]));
  };
  try {
    const renderer = await createMarkdownProcessor();
    const store = new Map<string, any>([['stale', { id: 'stale' }]]);
    const context = {
      store: { clear: () => store.clear(), set: (entry: any) => store.set(entry.id, entry) },
      config: { publicDir: pathToFileURL(`${directory}/`) },
      parseData: async ({ data }: any) => data,
      renderMarkdown: async (markdown: string) => ({ html: (await renderer.render(markdown)).code }),
      generateDigest: () => 'digest',
      logger: { info() {} },
    };
    const loader = createNotionLoaders('token', databaseId);
    await loader('writings').load(context as any);
    assert.equal(store.has('stale'), false);
    assert.match(store.get('first').rendered.html, /<p>From Notion<\/p>/);
    const memos = new Map([['old-memo', {}]]);
    await loader('memos').load({ ...context, store: memos } as any);
    assert.equal(memos.size, 0);
    assert.equal(queries, 1);
    duplicate = true;
    await assert.rejects(createNotionLoaders('token', databaseId)('writings').load(context as any), /Duplicate Notion slug/);
  } finally {
    globalThis.fetch = previousFetch;
    await rm(directory, { recursive: true, force: true });
  }
});
