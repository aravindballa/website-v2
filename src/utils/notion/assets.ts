import { createHash } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import type { NotionFile } from './client.ts';
import { safeUrl } from './markdown.ts';

// Notion-hosted files have expiring signed URLs. Copy only assets belonging to
// published pages into the build's public directory, without forwarding tokens.
export async function notionAssets(publicDir: URL, fetcher: typeof fetch = fetch) {
  const directory = new URL('notion-assets/', publicDir);
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });
  const cache = new Map<string, Promise<string>>();
  return async (file: NotionFile): Promise<string> => {
    if (file.type === 'external' && file.external) return safeUrl(file.external.url);
    if (file.type !== 'file' || !file.file) throw new Error('Notion returned an unsupported file source.');
    const source = safeUrl(file.file.url);
    if (!source.startsWith('https://')) throw new Error('Notion-hosted files must use HTTPS.');
    if (!cache.has(source)) cache.set(source, (async () => {
      const response = await fetcher(source, { signal: AbortSignal.timeout(60_000) });
      if (!response.ok) throw new Error(`Could not download a Notion asset (HTTP ${response.status}).`);
      const bytes = Buffer.from(await response.arrayBuffer());
      const mime = (response.headers.get('content-type') ?? '').split(';')[0];
      const extensions: Record<string, string> = {
        'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/avif': 'avif', 'image/svg+xml': 'svg',
        'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/ogg': 'ogg',
        'video/mp4': 'mp4', 'video/webm': 'webm', 'application/pdf': 'pdf',
      };
      // Unknown attachments remain downloadable binary files, never executable HTML.
      const extension = extensions[mime] ?? 'bin';
      const name = `${createHash('sha256').update(bytes).digest('hex')}.${extension}`;
      await writeFile(new URL(name, directory), bytes);
      return `/notion-assets/${name}`;
    })());
    return cache.get(source)!;
  };
}
