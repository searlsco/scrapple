import { describe, it } from 'node:test'
import assert from 'node:assert'
import { urlToId } from '../http.js'

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
