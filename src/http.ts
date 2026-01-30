import { createHash } from 'node:crypto'

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'

export interface FetchResult {
  ok: boolean
  status: number
  etag?: string
  lastModified?: string
  contentHash: string
  data: string
}

export async function fetchWithCache(
  url: string,
  etag?: string | null,
  lastModified?: string | null
): Promise<FetchResult | null> {
  const headers: Record<string, string> = {
    'User-Agent': USER_AGENT,
    Accept: 'application/json, text/html, */*',
  }

  if (etag) {
    headers['If-None-Match'] = etag
  }
  if (lastModified) {
    headers['If-Modified-Since'] = lastModified
  }

  const response = await fetch(url, { headers })

  if (response.status === 304) {
    // Not modified
    return null
  }

  const data = await response.text()
  const contentHash = createHash('sha256').update(data).digest('hex')

  return {
    ok: response.ok,
    status: response.status,
    etag: response.headers.get('etag') || undefined,
    lastModified: response.headers.get('last-modified') || undefined,
    contentHash,
    data,
  }
}

export function urlToId(url: string): string {
  return createHash('sha256').update(url).digest('hex').slice(0, 16)
}

export interface BinaryFetchResult {
  ok: boolean
  status: number
  etag?: string
  lastModified?: string
  contentHash: string
  data: Buffer
}

export async function fetchBinary(url: string): Promise<BinaryFetchResult | null> {
  const headers: Record<string, string> = {
    'User-Agent': USER_AGENT,
  }

  const response = await fetch(url, { headers })

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      contentHash: '',
      data: Buffer.alloc(0),
    }
  }

  const arrayBuffer = await response.arrayBuffer()
  const data = Buffer.from(arrayBuffer)
  const contentHash = createHash('sha256').update(data).digest('hex')

  return {
    ok: true,
    status: response.status,
    etag: response.headers.get('etag') || undefined,
    lastModified: response.headers.get('last-modified') || undefined,
    contentHash,
    data,
  }
}
