import { describe, it } from 'node:test'
import assert from 'node:assert'
import { join, extname, basename } from 'node:path'
import AdmZip from 'adm-zip'

// Source file extensions to extract (mirrored from normalize/index.ts)
const SOURCE_EXTENSIONS = new Set([
  '.swift',
  '.m',
  '.mm',
  '.h',
  '.c',
  '.cpp',
  '.metal',
  '.strings',
  '.plist',
  '.json',
  '.xml',
  '.storyboard',
  '.xib',
])

// Extract sample download info from doc JSON (mirrored from fetch/index.ts)
function extractSampleDownload(data: unknown): { identifier: string; url: string } | undefined {
  if (!data || typeof data !== 'object') return undefined
  const obj = data as Record<string, unknown>

  if (obj.sampleCodeDownload && typeof obj.sampleCodeDownload === 'object') {
    const download = obj.sampleCodeDownload as Record<string, unknown>
    if (download.action && typeof download.action === 'object') {
      const action = download.action as Record<string, unknown>
      if (typeof action.identifier === 'string' && action.isActive) {
        const identifier = action.identifier
        return {
          identifier,
          url: `https://docs-assets.developer.apple.com/published/${identifier}`,
        }
      }
    }
  }

  return undefined
}

// Check if file should be extracted from ZIP (mirrored from normalize/index.ts)
function shouldExtractFile(entryName: string): boolean {
  const ext = extname(entryName).toLowerCase()
  if (!SOURCE_EXTENSIONS.has(ext)) return false

  const name = basename(entryName)
  if (name.startsWith('.')) return false
  if (entryName.includes('/.build/')) return false
  if (entryName.includes('/DerivedData/')) return false
  if (entryName.includes('/Pods/')) return false

  return true
}

// Get language from extension (mirrored from normalize/index.ts)
function getLanguageFromExt(ext: string): string {
  const map: Record<string, string> = {
    '.swift': 'swift',
    '.m': 'objc',
    '.mm': 'objc',
    '.h': 'objc',
    '.c': 'c',
    '.cpp': 'cpp',
    '.metal': 'metal',
    '.json': 'json',
    '.xml': 'xml',
    '.plist': 'xml',
  }
  return map[ext.toLowerCase()] || ''
}

describe('Sample download extraction', () => {
  it('extracts download info from valid doc JSON', () => {
    const docJson = {
      sampleCodeDownload: {
        kind: 'sampleDownload',
        action: {
          isActive: true,
          type: 'reference',
          overridingTitle: 'Download',
          identifier: '15035f283d6a/FrutaBuildingAFeatureRichAppWithSwiftUI.zip'
        }
      }
    }

    const result = extractSampleDownload(docJson)
    assert.ok(result)
    assert.strictEqual(result.identifier, '15035f283d6a/FrutaBuildingAFeatureRichAppWithSwiftUI.zip')
    assert.strictEqual(result.url, 'https://docs-assets.developer.apple.com/published/15035f283d6a/FrutaBuildingAFeatureRichAppWithSwiftUI.zip')
  })

  it('returns undefined when isActive is false', () => {
    const docJson = {
      sampleCodeDownload: {
        action: {
          isActive: false,
          identifier: 'some/file.zip'
        }
      }
    }

    const result = extractSampleDownload(docJson)
    assert.strictEqual(result, undefined)
  })

  it('returns undefined when no sampleCodeDownload', () => {
    const docJson = {
      title: 'Some doc',
      abstract: []
    }

    const result = extractSampleDownload(docJson)
    assert.strictEqual(result, undefined)
  })

  it('returns undefined for null/undefined input', () => {
    assert.strictEqual(extractSampleDownload(null), undefined)
    assert.strictEqual(extractSampleDownload(undefined), undefined)
  })
})

describe('Source file filtering', () => {
  it('accepts Swift files', () => {
    assert.ok(shouldExtractFile('Shared/MyApp.swift'))
    assert.ok(shouldExtractFile('Sources/Model.swift'))
  })

  it('accepts Objective-C files', () => {
    assert.ok(shouldExtractFile('Classes/AppDelegate.m'))
    assert.ok(shouldExtractFile('Classes/ViewController.mm'))
    assert.ok(shouldExtractFile('Headers/MyClass.h'))
  })

  it('accepts other source files', () => {
    assert.ok(shouldExtractFile('Shaders/Default.metal'))
    assert.ok(shouldExtractFile('Resources/Info.plist'))
    assert.ok(shouldExtractFile('Config/settings.json'))
  })

  it('rejects non-source files', () => {
    assert.ok(!shouldExtractFile('README.md'))
    assert.ok(!shouldExtractFile('image.png'))
    assert.ok(!shouldExtractFile('archive.zip'))
    assert.ok(!shouldExtractFile('document.pdf'))
  })

  it('rejects hidden files', () => {
    assert.ok(!shouldExtractFile('.gitignore'))
    assert.ok(!shouldExtractFile('path/to/.DS_Store'))
    assert.ok(!shouldExtractFile('.swiftlint.yml'))
  })

  it('rejects build artifacts', () => {
    assert.ok(!shouldExtractFile('Project/.build/debug/App.swift'))
    assert.ok(!shouldExtractFile('Project/DerivedData/Build/App.swift'))
    assert.ok(!shouldExtractFile('Project/Pods/AFNetworking/Source.m'))
  })
})

describe('Language detection', () => {
  it('detects Swift', () => {
    assert.strictEqual(getLanguageFromExt('.swift'), 'swift')
  })

  it('detects Objective-C', () => {
    assert.strictEqual(getLanguageFromExt('.m'), 'objc')
    assert.strictEqual(getLanguageFromExt('.mm'), 'objc')
    assert.strictEqual(getLanguageFromExt('.h'), 'objc')
  })

  it('detects C/C++', () => {
    assert.strictEqual(getLanguageFromExt('.c'), 'c')
    assert.strictEqual(getLanguageFromExt('.cpp'), 'cpp')
  })

  it('detects Metal', () => {
    assert.strictEqual(getLanguageFromExt('.metal'), 'metal')
  })

  it('detects data formats', () => {
    assert.strictEqual(getLanguageFromExt('.json'), 'json')
    assert.strictEqual(getLanguageFromExt('.xml'), 'xml')
    assert.strictEqual(getLanguageFromExt('.plist'), 'xml')
  })

  it('returns empty for unknown extensions', () => {
    assert.strictEqual(getLanguageFromExt('.txt'), '')
    assert.strictEqual(getLanguageFromExt('.md'), '')
  })

  it('is case insensitive', () => {
    assert.strictEqual(getLanguageFromExt('.SWIFT'), 'swift')
    assert.strictEqual(getLanguageFromExt('.Swift'), 'swift')
  })
})

describe('ZIP extraction', () => {
  it('creates and reads a test ZIP', () => {
    // Create a test ZIP in memory
    const zip = new AdmZip()
    zip.addFile('TestApp/Sources/App.swift', Buffer.from('import SwiftUI\n@main struct App {}'))
    zip.addFile('TestApp/Sources/Model.swift', Buffer.from('struct Model {}'))
    zip.addFile('TestApp/README.md', Buffer.from('# Test App'))
    zip.addFile('TestApp/.gitignore', Buffer.from('*.xcuserstate'))

    const zipBuffer = zip.toBuffer()
    assert.ok(zipBuffer.length > 0)

    // Read it back
    const readZip = new AdmZip(zipBuffer)
    const entries = readZip.getEntries()

    // Filter to source files only
    const sourceFiles = entries.filter(e => !e.isDirectory && shouldExtractFile(e.entryName))

    assert.strictEqual(sourceFiles.length, 2)
    assert.ok(sourceFiles.some(e => e.entryName.endsWith('App.swift')))
    assert.ok(sourceFiles.some(e => e.entryName.endsWith('Model.swift')))
  })

  it('extracts Swift content correctly', () => {
    const zip = new AdmZip()
    const swiftCode = `import SwiftUI

struct ContentView: View {
    var body: some View {
        Text("Hello, World!")
    }
}`
    zip.addFile('App/ContentView.swift', Buffer.from(swiftCode))

    const readZip = new AdmZip(zip.toBuffer())
    const entry = readZip.getEntry('App/ContentView.swift')
    assert.ok(entry)

    const content = entry.getData().toString('utf-8')
    assert.ok(content.includes('import SwiftUI'))
    assert.ok(content.includes('struct ContentView'))
    assert.ok(content.includes('Hello, World!'))
  })
})
