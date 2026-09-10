import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { createNotionLoaders, type NotionCollection } from '../utils/notion/loader';

const contentBase = './content';
const token = process.env.NOTION_TOKEN || import.meta.env.NOTION_TOKEN;
const databaseId = process.env.NOTION_DATABASE_ID || import.meta.env.NOTION_DATABASE_ID;
const source = process.env.CONTENT_SOURCE || import.meta.env.CONTENT_SOURCE || (token || databaseId ? 'notion' : 'local');
if (!['local', 'notion'].includes(source)) throw new Error('CONTENT_SOURCE must be local or notion.');
if (source === 'notion' && (!token || !databaseId)) throw new Error('Set both NOTION_TOKEN and NOTION_DATABASE_ID to load content from Notion.');
const notionLoader = source === 'notion' ? createNotionLoaders(token, databaseId) : undefined;
const loader = (collection: NotionCollection) => notionLoader
  ? notionLoader(collection)
  : glob({ pattern: '**/*.{md,mdx}', base: `${contentBase}/${collection}` });

const writingsCollection = defineCollection({
  loader: loader('writings'),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    type: z.literal('Post'),
    description: z.string().nullable().optional().default(''),
    published: z.boolean().optional().default(true),
    banner: z.string().nullable().optional(),
    bannercaption: z.string().nullable().optional(),
    tags: z.string().nullable().optional(),
  }),
});

const memosCollection = defineCollection({
  loader: loader('memos'),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    type: z.literal('Memo'),
    description: z.string().nullable().optional().default(''),
    published: z.boolean().optional().default(true),
    banner: z.string().nullable().optional(),
    bannercaption: z.string().nullable().optional(),
    tags: z.string().nullable().optional(),
  }),
});

const bookshelfCollection = defineCollection({
  loader: loader('bookshelf'),
  schema: z.object({
    title: z.string(),
    type: z.literal('BookNote'),
    published: z.boolean().optional().default(true),
    date: z.coerce.date().optional(),
    description: z.string().optional(),
    author: z.string().optional(),
    rating: z.number().optional(),
  }),
});

const hackletterCollection = defineCollection({
  loader: loader('hackletter'),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    type: z.literal('Letter'),
    published: z.boolean().optional().default(true),
    description: z.string().optional(),
    issue: z.number().optional(),
  }),
});

const talksCollection = defineCollection({
  loader: loader('talks'),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    type: z.literal('Talk'),
    published: z.boolean().optional().default(true),
    description: z.string().optional(),
    venue: z.string().optional(),
    slides: z.string().optional(),
    video: z.string().optional(),
  }),
});

const notesCollection = defineCollection({
  loader: loader('notes'),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date().optional(),
    type: z.literal('Note'),
    published: z.boolean().optional().default(true),
    description: z.string().optional(),
  }),
});

export const collections = {
  'writings': writingsCollection,
  'memos': memosCollection,
  'bookshelf': bookshelfCollection,
  'hackletter': hackletterCollection,
  'talks': talksCollection,
  'notes': notesCollection,
};
