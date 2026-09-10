import { plainText, type NotionBlock, type NotionFile, type RichText } from './client.ts';

const html = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const escapeMarkdown = (text: string) => html(text).replace(/([\\`*_[\]{}#|~!])/g, '\\$1').replace(/^(\s*\d+)\./gm, '$1\\.').replace(/^([+-]) /gm, '\\$1 ');

export function safeUrl(value: string): string {
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  if (value.startsWith('#')) return value;
  const url = new URL(value);
  if (!['https:', 'http:', 'mailto:'].includes(url.protocol)) throw new Error(`Unsupported URL protocol: ${url.protocol}`);
  return url.href;
}

export function richText(text: RichText[] = []): string {
  return text.map(part => {
    const raw = plainText([part]);
    if (!raw.trim()) return raw;
    const marks = part.annotations ?? {};
    const leading = raw.match(/^\s*/)?.[0] ?? '';
    const trailing = raw.trim() ? raw.match(/\s*$/)?.[0] ?? '' : '';
    let value = escapeMarkdown(raw.trim());
    if (marks.code) {
      const fence = '`'.repeat(Math.max(0, ...(raw.match(/`+/g) ?? []).map(run => run.length)) + 1);
      value = `${fence} ${raw.trim().replaceAll('\n', ' ')} ${fence}`;
    }
    if (marks.bold) value = `**${value}**`;
    if (marks.italic) value = `*${value}*`;
    if (marks.strikethrough) value = `~~${value}~~`;
    if (marks.underline) value = `<u>${value}</u>`;
    const href = part.href ?? part.text?.link?.url;
    if (href) value = `[${value}](${safeUrl(href).replace(/[()\s]/g, char => encodeURIComponent(char).replace('(', '%28').replace(')', '%29'))})`;
    return leading + value + trailing;
  }).join('');
}

interface BlockData extends Partial<NotionFile> {
  rich_text?: RichText[];
  caption?: RichText[];
  language?: string;
  checked?: boolean;
  url?: string;
  expression?: string;
  cells?: RichText[][];
  has_column_header?: boolean;
  is_toggleable?: boolean;
  synced_from?: { block_id: string } | null;
}

export interface RenderOptions {
  children: (id: string) => Promise<NotionBlock[]>;
  asset: (file: NotionFile) => Promise<string>;
}

// Use the block API so bookmarks, nested lists and code never depend on a lossy
// Markdown export. Unknown blocks fail the build instead of silently disappearing.
export async function blocksToMarkdown(blocks: NotionBlock[], options: RenderOptions, ancestors: string[] = []): Promise<string> {
  const output: string[] = [];
  for (const block of blocks) {
    if (ancestors.includes(block.id) || ancestors.length > 50) throw new Error(`Recursive Notion block: ${block.id}`);
    const data = (block[block.type] ?? {}) as BlockData;
    const text = richText(data.rich_text);
    const descend = async () => blocksToMarkdown(await options.children(block.id), options, [...ancestors, block.id]);
    let content: string;
    let handlesChildren = false;
    switch (block.type) {
      case 'paragraph': content = text; break;
      case 'heading_1': case 'heading_2': case 'heading_3': case 'heading_4':
        content = `${'#'.repeat(Number(block.type.slice(-1)))} ${text}`;
        break;
      case 'bulleted_list_item': case 'numbered_list_item': case 'to_do': {
        const prefix = block.type === 'numbered_list_item' ? '1. ' : block.type === 'to_do' ? `- [${data.checked ? 'x' : ' '}] ` : '- ';
        content = prefix + text.replaceAll('\n', `\n${' '.repeat(prefix.length)}`);
        if (block.has_children) content += '\n\n' + (await descend()).split('\n').map(line => ' '.repeat(prefix.length) + line).join('\n');
        handlesChildren = true;
        break;
      }
      case 'quote': case 'callout': {
        content = text + (block.has_children ? `\n\n${await descend()}` : '');
        content = content.split('\n').map(line => `> ${line}`).join('\n');
        handlesChildren = true;
        break;
      }
      case 'code': {
        const raw = plainText(data.rich_text);
        const fence = '`'.repeat(Math.max(2, ...(raw.match(/`+/g) ?? []).map(run => run.length)) + 1);
        const languages: Record<string, string> = { 'plain text': 'text', 'java/c/c++/c#': 'text', shell: 'bash' };
        const language = languages[data.language ?? ''] ?? data.language ?? 'text';
        content = `${fence}${language.replace(/[^a-zA-Z0-9+#-]/g, '')}\n${raw}\n${fence}`;
        if (data.caption?.length) content += `\n\n${richText(data.caption)}`;
        break;
      }
      case 'divider': content = '---'; break;
      case 'toggle':
        content = `<details>\n<summary>${text}</summary>\n\n${block.has_children ? await descend() : ''}\n\n</details>`;
        handlesChildren = true;
        break;
      case 'image': case 'audio': case 'video': case 'file': case 'pdf': {
        const source = safeUrl(await options.asset(data as NotionFile));
        const caption = richText(data.caption);
        if (block.type === 'image') content = `![${escapeMarkdown(plainText(data.caption))}](<${source}>)`;
        else if (block.type === 'audio') content = `<audio controls preload="none" src="${html(source)}"></audio>`;
        else if (block.type === 'video' && data.type === 'file') content = `<video controls preload="metadata" src="${html(source)}"></video>`;
        else content = `[${caption || `Open ${block.type}`}](<${source}>)`;
        if (caption && ['image', 'audio', 'video'].includes(block.type)) content += `\n\n${caption}`;
        break;
      }
      case 'bookmark': case 'embed': case 'link_preview':
        content = `[${richText(data.caption) || escapeMarkdown(data.url ?? '')}](<${safeUrl(data.url ?? '')}>)`;
        break;
      case 'table': {
        const rows = await options.children(block.id);
        const cells = rows.map(row => ((row.table_row as BlockData).cells ?? []).map(cell => richText(cell).replaceAll('\n', '<br>')));
        if (!cells.length) { content = ''; break; }
        const width = Math.max(...cells.map(row => row.length));
        if (!data.has_column_header) cells.unshift(Array(width).fill(''));
        const lines = cells.map(row => `| ${Array.from({ length: width }, (_, index) => row[index] ?? '').join(' | ')} |`);
        lines.splice(1, 0, `| ${Array(width).fill('---').join(' | ')} |`);
        content = lines.join('\n');
        handlesChildren = true;
        break;
      }
      case 'column_list': case 'column':
        content = block.has_children ? await descend() : '';
        handlesChildren = true;
        break;
      case 'synced_block':
        content = data.synced_from ? await blocksToMarkdown(await options.children(data.synced_from.block_id), options, [...ancestors, block.id]) : await descend();
        handlesChildren = true;
        break;
      default:
        throw new Error(`Unsupported Notion block ${block.type} (${block.id}). Convert it to a paragraph, list, image, code, or link in Notion before publishing.`);
    }
    if (block.has_children && !handlesChildren) content += `\n\n${await descend()}`;
    output.push(content);
  }
  return output.join('\n\n');
}
