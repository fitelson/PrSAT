// Tiny static server for the built PrSAT 3.1 app (dist/), with the
// cross-origin-isolation headers Z3's WASM needs (SharedArrayBuffer).
// Used by the LaunchAgent so http://localhost:5317/ is always available.

import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, normalize, extname, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')
const PORT = Number(process.env.PRSAT_31_PORT ?? 5317)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
}

const headers = (type) => ({
  'Content-Type': type,
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cache-Control': 'no-cache',
})

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost')
    let path = normalize(url.pathname).replace(/^(\.\.[/\\])+/, '')
    if (path === '/' || path === '\\') path = '/index.html'
    const file = join(DIST, path)
    if (!file.startsWith(DIST)) throw new Error('forbidden')
    const body = await readFile(file)
    res.writeHead(200, headers(MIME[extname(file)] ?? 'application/octet-stream'))
    res.end(body)
  } catch {
    res.writeHead(404, headers('text/plain'))
    res.end('not found')
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`PrSAT 3.1 (experimental) at http://localhost:${PORT}/`)
})
