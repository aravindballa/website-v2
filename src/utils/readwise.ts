export interface ReadwiseBook {
  id: number;
  title: string;
  author: string;
  category: string;
  num_highlights: number;
  last_highlight_at: string;
  updated: string;
  cover_image_url: string;
  highlights_url: string;
  source_url: null;
  asin: string;
  tags: string[];
}

export interface ReadwiseHighlight {
  id: number;
  text: string;
  note: string;
  location: number | null;
  highlighted_at: string | null;
}

export interface ReadwiseLibrary {
  syncedAt: string;
  books: ReadwiseBook[];
  highlightsByBook: Record<number, ReadwiseHighlight[]>;
}

interface ExportedSource {
  user_book_id: number;
  highlights: (ReadwiseHighlight & { is_deleted: boolean })[];
}

const LIBRARY_KEY = 'readwise:library:v1';

async function readwiseGet<T>(url: string, token: string): Promise<T> {
  const response = await fetch(url, { headers: { Authorization: `TOKEN ${token}` } });
  if (!response.ok) {
    throw new Error(`Readwise ${url} failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
}

async function fetchBooks(token: string): Promise<ReadwiseBook[]> {
  const books: ReadwiseBook[] = [];
  let url: string | null = 'https://readwise.io/api/v2/books/?category=books&page_size=1000';
  while (url) {
    const page: { results: ReadwiseBook[]; next: string | null } = await readwiseGet(url, token);
    books.push(...page.results);
    url = page.next;
  }
  return books;
}

async function fetchHighlightsByBook(
  token: string,
  bookIds: number[],
): Promise<Record<number, ReadwiseHighlight[]>> {
  const highlightsByBook: Record<number, ReadwiseHighlight[]> = {};
  let cursor: string | null = null;
  do {
    const query = new URLSearchParams({ ids: bookIds.join(',') });
    if (cursor) query.set('pageCursor', cursor);
    const page: { results: ExportedSource[]; nextPageCursor: string | null } = await readwiseGet(
      `https://readwise.io/api/v2/export/?${query}`,
      token,
    );
    for (const source of page.results) {
      highlightsByBook[source.user_book_id] = source.highlights
        .filter((highlight) => !highlight.is_deleted)
        .map(({ id, text, note, location, highlighted_at }) => ({ id, text, note, location, highlighted_at }));
    }
    cursor = page.nextPageCursor;
  } while (cursor);
  return highlightsByBook;
}

export async function syncReadwiseLibrary(env: Env): Promise<ReadwiseLibrary> {
  const books = await fetchBooks(env.READWISE_TOKEN);
  const highlightsByBook = await fetchHighlightsByBook(
    env.READWISE_TOKEN,
    books.map((book) => book.id),
  );
  const library: ReadwiseLibrary = { syncedAt: new Date().toISOString(), books, highlightsByBook };
  await env.READWISE_KV.put(LIBRARY_KEY, JSON.stringify(library));
  return library;
}

export async function getReadwiseLibrary(env: Env): Promise<ReadwiseLibrary | null> {
  const cached = await env.READWISE_KV.get<ReadwiseLibrary>(LIBRARY_KEY, 'json');
  if (cached) return cached;
  try {
    return await syncReadwiseLibrary(env);
  } catch (error) {
    console.error('Error syncing Readwise library:', error);
    return null;
  }
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/[\s_-]+/g, '-') // Replace spaces, underscores, and dashes with single dash
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing dashes
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long'
  }).format(date);
}