import { describe, it, mock } from 'node:test'
import assert from 'node:assert'
import { urlToId, fetchWithCache, fetchBinary } from '../http.js'

describe('fetchWithCache', () => {
  it('returns failed result for redirect loop errors instead of throwing', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = mock.fn(() => {
      const error = new TypeError('fetch failed')
      ;(error as { cause?: Error }).cause = new Error('redirect count exceeded')
      throw error
    }) as typeof fetch

    try {
      const result = await fetchWithCache('https://example.com/test')
      assert.strictEqual(result?.ok, false)
      assert.strictEqual(result?.status, 0)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('retries on network errors', async () => {
    const originalFetch = globalThis.fetch
    let attempts = 0
    globalThis.fetch = mock.fn(() => {
      attempts++
      if (attempts < 2) {
        const error = new TypeError('fetch failed')
        ;(error as { cause?: Error }).cause = new Error('ECONNRESET')
        throw error
      }
      return Promise.resolve(new Response('success', { status: 200 }))
    }) as typeof fetch

    try {
      const result = await fetchWithCache('https://example.com/test', null, null, 3)
      assert.strictEqual(result?.ok, true)
      assert.strictEqual(attempts, 2)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('returns null for 304 Not Modified', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = mock.fn(() => {
      return Promise.resolve(new Response(null, { status: 304 }))
    }) as typeof fetch

    try {
      const result = await fetchWithCache('https://example.com/test', 'etag123')
      assert.strictEqual(result, null)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

describe('fetchBinary', () => {
  it('returns failed result for network errors instead of throwing', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = mock.fn(() => {
      const error = new TypeError('fetch failed')
      ;(error as { cause?: Error }).cause = new Error('redirect count exceeded')
      throw error
    }) as typeof fetch

    try {
      const result = await fetchBinary('https://example.com/test.zip')
      assert.strictEqual(result.ok, false)
      assert.strictEqual(result.status, 0)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

describe('urlToId', () => {
  it('generates deterministic IDs for the same URL', () => {
    const url = 'https://developer.apple.com/documentation/swiftui'
    const id1 = urlToId(url)
    const id2 = urlToId(url)
    assert.strictEqual(id1, id2)
  })

  it('generates different IDs for different URLs', () => {
    const id1 = urlToId('https://developer.apple.com/documentation/swiftui')
    const id2 = urlToId('https://developer.apple.com/documentation/uikit')
    assert.notStrictEqual(id1, id2)
  })

  it('generates 16-character hex IDs', () => {
    const id = urlToId('https://example.com')
    assert.strictEqual(id.length, 16)
    assert.match(id, /^[a-f0-9]+$/)
  })

  it('handles URLs with query strings', () => {
    const id1 = urlToId('https://example.com/path?foo=bar')
    const id2 = urlToId('https://example.com/path?foo=baz')
    assert.notStrictEqual(id1, id2)
  })
})
