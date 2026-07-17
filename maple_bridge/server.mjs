// Local Maple bridge for PrSAT 3.1 (experimental).
//
// A tiny zero-dependency HTTP server that lets the browser frontend hand the
// equational part of a constraint system to desktop Maple (`solve`) and get
// back the solution branches as rational-function substitution strings. The
// deployed PrSAT remains 100% in-browser; this bridge is an optional local
// enhancement (run `npm run maple-bridge` alongside `npm run dev`).
//
// API:
//   GET  /ping   -> { ok: true, maple: "<path>" }
//   POST /solve  -> body { vars: ["a1", ...], equations: ["a1+a2-1", ...] }
//                   (each equation is a Maple-syntax polynomial, "= 0" implied)
//                -> { branches: [ { "a1": "1/2", "a2": "a3", ... }, ... ] }
//                   or { error: "..." }

import { createServer } from 'node:http'
import { execFile } from 'node:child_process'
import { writeFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const MAPLE = process.env.MAPLE_PATH ?? '/Applications/Maple 2024/maple'
const PORT = Number(process.env.MAPLE_BRIDGE_PORT ?? 31415)
const SOLVE_TIMEOUT_MS = Number(process.env.MAPLE_BRIDGE_TIMEOUT_MS ?? 120_000)
const MAX_BODY_BYTES = Number(process.env.MAPLE_BRIDGE_MAX_BODY_BYTES ?? 2 * 1024 * 1024)
const MAX_VARIABLES = Number(process.env.MAPLE_BRIDGE_MAX_VARIABLES ?? 4096)
const MAX_EQUATIONS = Number(process.env.MAPLE_BRIDGE_MAX_EQUATIONS ?? 512)
const ALLOWED_ORIGINS = new Set((process.env.MAPLE_BRIDGE_ALLOWED_ORIGINS ?? [
  'http://localhost:5317',
  'http://127.0.0.1:5317',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
].join(',')).split(',').map((origin) => origin.trim()).filter(Boolean))

const cors = (origin) => ({
  ...(origin === undefined ? {} : { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }),
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
})

const allowed_origin = (origin) => origin === undefined || ALLOWED_ORIGINS.has(origin)

const valid_name = (s) => /^[a-zA-Z][a-zA-Z0-9_]*$/.test(s)
// Maple-syntax polynomial: names, integers, + - * / ^ ( ) and whitespace only.
const valid_poly = (s) => /^[a-zA-Z0-9_+\-*/^() \t]+$/.test(s) && s.length < 100_000

const run_maple = (script_path, signal) => new Promise((resolve, reject) => {
  execFile(MAPLE, ['-q', script_path], {
    timeout: SOLVE_TIMEOUT_MS,
    maxBuffer: 8 * 1024 * 1024,
    signal,
  }, (err, stdout, stderr) => {
    if (err) reject(new Error(`maple failed: ${err.message}\n${stderr ?? ''}`))
    else resolve(stdout)
  })
})

// Split a string on commas at paren/brace depth 0.
const split_top_level = (s) => {
  const parts = []
  let depth = 0, cur = ''
  for (const ch of s) {
    if (ch === '(' || ch === '{' || ch === '[') depth++
    if (ch === ')' || ch === '}' || ch === ']') depth--
    if (ch === ',' && depth === 0) { parts.push(cur); cur = '' } else cur += ch
  }
  if (cur.trim() !== '') parts.push(cur)
  return parts
}

const solve = async ({ vars, equations }, signal) => {
  if (!Array.isArray(vars) || vars.length > MAX_VARIABLES || !vars.every(valid_name)) throw new Error('bad vars')
  if (!Array.isArray(equations) || equations.length > MAX_EQUATIONS || !equations.every(valid_poly)) throw new Error('bad equations')
  if (new Set(vars).size !== vars.length) throw new Error('duplicate vars')

  const dir = await mkdtemp(join(tmpdir(), 'prsat-maple-'))
  const script = join(dir, 'solve.mpl')
  const lines = [
    'interface(prettyprint=0):',
    `eqs := { ${equations.map((e) => `(${e}) = 0`).join(', ')} }:`,
    `vs := { ${vars.join(', ')} }:`,
    'sols := [solve(eqs, vs)]:',
    'printf("NBRANCHES %d\\n", nops(sols)):',
    'for k to nops(sols) do printf("BRANCH\\n"); lprint(sols[k]); od:',
  ]
  await writeFile(script, lines.join('\n'))
  try {
    const out = await run_maple(script, signal)
    const chunks = out.split(/^BRANCH$/m).map((c) => c.trim())
    const branches = []
    for (const chunk of chunks.slice(1)) {
      // lprint output: {a1 = expr, a2 = expr, ...} possibly wrapped over lines.
      const flat = chunk.replace(/\\\n/g, '').replace(/\n/g, '').trim()
      const m = flat.match(/^\{(.*)\}$/s)
      if (m === null) continue
      const branch = {}
      for (const part of split_top_level(m[1])) {
        const eq = part.split(/=(.*)/s)
        if (eq.length < 2) continue
        branch[eq[0].trim()] = eq[1].trim()
      }
      branches.push(branch)
    }
    return { branches }
  } finally {
    rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

let active_solves = 0

const server = createServer(async (req, res) => {
  const origin = req.headers.origin
  if (!allowed_origin(origin)) {
    res.writeHead(403, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'origin not allowed' }))
    return
  }
  const headers = cors(origin)
  if (req.method === 'OPTIONS') {
    res.writeHead(204, headers)
    res.end()
    return
  }
  if (req.method === 'GET' && req.url === '/ping') {
    res.writeHead(200, { ...headers, 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, maple: MAPLE }))
    return
  }
  if (req.method === 'POST' && req.url === '/solve') {
    if (active_solves >= 1) {
      res.writeHead(429, { ...headers, 'Content-Type': 'application/json', 'Retry-After': '1' })
      res.end(JSON.stringify({ error: 'Maple bridge is busy' }))
      return
    }
    let body = ''
    let body_bytes = 0
    let rejected = false
    req.on('data', (d) => {
      if (rejected) return
      body_bytes += d.length
      if (body_bytes > MAX_BODY_BYTES) {
        rejected = true
        res.writeHead(413, { ...headers, 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'request body too large' }))
        req.destroy()
        return
      }
      body += d
    })
    req.on('end', async () => {
      if (rejected) return
      if (active_solves >= 1) {
        res.writeHead(429, { ...headers, 'Content-Type': 'application/json', 'Retry-After': '1' })
        res.end(JSON.stringify({ error: 'Maple bridge is busy' }))
        return
      }
      active_solves++
      const solve_controller = new AbortController()
      const cancel_solve = () => {
        if (!res.writableEnded) solve_controller.abort()
      }
      req.once('aborted', cancel_solve)
      res.once('close', cancel_solve)
      try {
        const result = await solve(JSON.parse(body), solve_controller.signal)
        if (!res.destroyed && !res.writableEnded) {
          res.writeHead(200, { ...headers, 'Content-Type': 'application/json' })
          res.end(JSON.stringify(result))
        }
      } catch (e) {
        if (!res.destroyed && !res.writableEnded) {
          res.writeHead(400, { ...headers, 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: String(e.message ?? e) }))
        }
      } finally {
        req.removeListener('aborted', cancel_solve)
        res.removeListener('close', cancel_solve)
        active_solves--
      }
    })
    return
  }
  res.writeHead(404, headers)
  res.end()
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`PrSAT Maple bridge listening on http://127.0.0.1:${PORT} (maple: ${MAPLE})`)
})
