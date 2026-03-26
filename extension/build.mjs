#!/usr/bin/env node
import { build } from 'esbuild'
import { cp, mkdir } from 'fs/promises'
import { dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function buildExtension() {
  console.log('🔨 Building reThink People extension...')

  // Clean dist
  await mkdir('dist', { recursive: true })
  await mkdir('dist/src/background', { recursive: true })
  await mkdir('dist/src/content-scripts', { recursive: true })
  await mkdir('dist/src/sidebar', { recursive: true })

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

  // Build floating trigger content script
  console.log('  📦 Building floating trigger content script...')
  await build({
    entryPoints: ['src/content-scripts/floating-trigger.ts'],
    bundle: true,
    outfile: 'dist/src/content-scripts/floating-trigger.js',
    platform: 'browser',
    target: 'es2020',
    format: 'esm',
  })

  // Build LinkedIn profile content script
  console.log('  📦 Building LinkedIn profile content script...')
  await build({
    entryPoints: ['src/content-scripts/linkedin-profile.ts'],
    bundle: true,
    outfile: 'dist/src/content-scripts/linkedin-profile.js',
    platform: 'browser',
    target: 'es2020',
    format: 'esm',
  })

  // Build LinkedIn DM content script
  console.log('  📦 Building LinkedIn DM content script...')
  await build({
    entryPoints: ['src/content-scripts/linkedin-dm.ts'],
    bundle: true,
    outfile: 'dist/src/content-scripts/linkedin-dm.js',
    platform: 'browser',
    target: 'es2020',
    format: 'esm',
  })

  // Build sidebar
  console.log('  📦 Building sidebar...')
  await build({
    entryPoints: ['src/sidebar/main.tsx'],
    bundle: true,
    outfile: 'dist/src/sidebar/main.js',
    platform: 'browser',
    target: 'es2020',
    format: 'esm',
    jsx: 'automatic',
  })

  // Copy manifest and icons
  console.log('  📋 Copying manifest and assets...')
  await cp('manifest.json', 'dist/manifest.json')
  await cp('icons', 'dist/icons', { recursive: true })

  // Copy public images to dist root (accessible as /whatsapp.png etc. in the extension)
  const { readdir } = await import('fs/promises')
  const publicFiles = await readdir('public').catch(() => [])
  for (const file of publicFiles) {
    await cp(`public/${file}`, `dist/${file}`).catch(() => {})
  }

  // Copy and fix sidebar index.html (replace .tsx with .js)
  const { readFile, writeFile } = await import('fs/promises')
  let indexHtml = await readFile('src/sidebar/index.html', 'utf-8')
  indexHtml = indexHtml.replace('/src/sidebar/main.tsx', './main.js')
  await writeFile('dist/src/sidebar/index.html', indexHtml)

  // Inject secrets into built JS (kept out of source code / git)
  const googleSecret = process.env.GOOGLE_CLIENT_SECRET || ''
  if (googleSecret) {
    const sidebarJs = await readFile('dist/src/sidebar/main.js', 'utf-8')
    await writeFile('dist/src/sidebar/main.js', sidebarJs.replaceAll('__GOOGLE_CLIENT_SECRET__', googleSecret))
    console.log('  🔑 Injected Google client secret')
  } else {
    console.warn('  ⚠️  GOOGLE_CLIENT_SECRET not set — token auto-refresh will not work')
  }

  console.log('✅ Build complete! Extension ready in dist/')
}

buildExtension().catch(err => {
  console.error('❌ Build failed:', err)
  process.exit(1)
})
