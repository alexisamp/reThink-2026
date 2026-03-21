#!/usr/bin/env node
import { build } from 'esbuild'
import { cp, mkdir } from 'fs/promises'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function buildExtension() {
  console.log('🔨 Building reThink Auto-Capture extension...')

  // Clean dist
  await mkdir('dist', { recursive: true })
  await mkdir('dist/src/background', { recursive: true })
  await mkdir('dist/src/content-scripts', { recursive: true })
  await mkdir('dist/src/popup', { recursive: true })

  // Build service worker
  console.log('  📦 Building service worker...')
  await build({
    entryPoints: ['src/background/service-worker.ts'],
    bundle: true,
    outfile: 'dist/src/background/service-worker.js',
    platform: 'browser',
    target: 'es2020',
    format: 'esm',
  })

  // Build WhatsApp content script
  console.log('  📦 Building WhatsApp content script...')
  await build({
    entryPoints: ['src/content-scripts/whatsapp.ts'],
    bundle: true,
    outfile: 'dist/src/content-scripts/whatsapp.js',
    platform: 'browser',
    target: 'es2020',
    format: 'esm',
  })

  // Build LinkedIn content script
  console.log('  📦 Building LinkedIn content script...')
  await build({
    entryPoints: ['src/content-scripts/linkedin.ts'],
    bundle: true,
    outfile: 'dist/src/content-scripts/linkedin.js',
    platform: 'browser',
    target: 'es2020',
    format: 'esm',
  })

  // Build popup
  console.log('  📦 Building popup...')
  await build({
    entryPoints: ['src/popup/main.tsx'],
    bundle: true,
    outfile: 'dist/src/popup/main.js',
    platform: 'browser',
    target: 'es2020',
    format: 'esm',
    jsx: 'automatic',
  })

  // Copy manifest and icons
  console.log('  📋 Copying manifest and assets...')
  await cp('manifest.json', 'dist/manifest.json')
  await cp('icons', 'dist/icons', { recursive: true })

  // Copy and fix index.html (replace .tsx with .js)
  const { readFile, writeFile } = await import('fs/promises')
  let indexHtml = await readFile('src/popup/index.html', 'utf-8')
  indexHtml = indexHtml.replace('/src/popup/main.tsx', './main.js')
  await writeFile('dist/src/popup/index.html', indexHtml)

  console.log('✅ Build complete! Extension ready in dist/')
}

buildExtension().catch(err => {
  console.error('❌ Build failed:', err)
  process.exit(1)
})
