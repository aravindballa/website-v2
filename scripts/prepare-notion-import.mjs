// Prepare reviewed MCP create-pages payloads; this script makes no network writes.
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { slug as githubSlug } from 'github-slugger';
import yaml from 'js-yaml';

const collections = ['writings', 'memos', 'bookshelf', 'hackletter', 'talks', 'notes'];
const destination = process.argv[2] || '.notion-migration';

// Preserve code literally. Convert the handful of legacy HTML widgets to editable
// Notion blocks/links; presentation-only wrappers and the Gumroad script go away.
export function toNotionMarkdown(markdown) {
  const literals = [];
  let text = markdown.replace(/```[^\n]*\n[\s\S]*?```|`[^`\n]+`/g, (code) => {
    literals.push(code);
    return `NOTIONLITERAL${literals.length - 1}TOKEN`;
  });
  text = text
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '')
    .replace(/<\/?div\b[^>]*>/g, '')
    .replace(/<audio\b[^>]*>\s*<source src="([^"]+)"\s*\/>\s*<\/audio>/g, '<audio src="$1"></audio>')
    .replace(/^[ \t]*<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gm, (_, href, label) => `[${label.trim()}](${href})`)
    .replace(/<details>\s*<summary>(.*?)<\/summary>([\s\S]*?)<\/details>/g, (_, label, body) => `<details>\n<summary>${label}</summary>\n${body.trim().split('\n').map(line => `\t${line}`).join('\n')}\n</details>`)
    .replace(/<br\s*\/>/g, '<br>')
    .replace(/\]\((\/[^)]*)\)/g, '](https://aravindballa.com$1)')
    .replace(/^((?: {2})+)(?=\S)/gm, spaces => '\t'.repeat(spaces.length / 2));
  // Notion uses dollar signs and braces as formatting delimiters.
  text = text.replace(/[${}]/g, '\\$&');
  return text.replace(/NOTIONLITERAL(\d+)TOKEN/g, (_, index) => literals[Number(index)]).trim();
}

async function files(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '.obsidian') found.push(...await files(filename));
    } else if (/\.mdx?$/.test(entry.name)) found.push(filename);
  }
  return found.sort();
}

const entries = [];
for (const filename of await files('content')) {
  const raw = await readFile(filename, 'utf8');
  const header = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  const data = header ? yaml.load(header[1]) : {};
  const body = header ? raw.slice(header[0].length) : raw;
  const folder = filename.split('/')[1];
  const collection = collections.includes(folder) ? folder : 'notes';
  const relative = collections.includes(folder) ? filename.split('/').slice(2).join('/') : path.basename(filename);
  const slug = relative.replace(/\.mdx?$/, '').split('/').map(githubSlug).join('/').replace(/\/index$/, '');
  const banner = data.banner?.trim() ? (/^https?:\/\//.test(data.banner) ? data.banner : `https://ik.imagekit.io/aravindballa/website/${slug}-${data.banner}`) : null;
  const properties = {
    Name: data.title || path.basename(filename).replace(/\.mdx?$/, ''),
    Collection: collection,
    Slug: slug,
    Published: data.title && data.published !== false ? '__YES__' : '__NO__',
    Description: data.description || '',
    Banner: banner,
    'Banner Caption': data.bannercaption || '',
    Tags: JSON.stringify(data.tags?.split(',').map(tag => tag.trim()).filter(Boolean) || []),
  };
  if (data.date) {
    properties['date:Date:start'] = new Date(data.date).toISOString().slice(0, 10);
    properties['date:Date:is_datetime'] = 0;
  }
  for (const key of ['rating', 'issue', 'venue', 'slides', 'video']) {
    if (data[key] != null) properties[key[0].toUpperCase() + key.slice(1)] = data[key];
  }
  entries.push({ properties, content: toNotionMarkdown(body), ...(banner ? { cover: banner } : {}) });
}
await mkdir(destination, { recursive: true });
await writeFile(path.join(destination, 'pages.json'), JSON.stringify(entries, null, 2));
for (let offset = 0; offset < entries.length; offset += 10) {
  await writeFile(path.join(destination, `batch-${offset / 10}.json`), JSON.stringify(entries.slice(offset, offset + 10)));
}
console.log(`Prepared ${entries.length} pages in ${destination}. Import through Notion MCP, matching Collection and Slug before any retry.`);
