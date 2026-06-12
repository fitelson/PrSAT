// Browser client for the local Maple bridge (maple_bridge/server.mjs).
//
// Sends the cross-multiplied equation polynomials to desktop Maple's `solve`
// and parses the returned solution branches into substitution maps
// (state index → RealExpr over the branch's free variables). Branches with
// non-rational content (RootOf, floats) are discarded — sound incompleteness,
// the exact verifier never sees them.

import { PrSat } from './types'
import { EqPoly, poly_to_maple_string, vars_in_polys } from './equation_elimination'
import { parse_maple_expr, default_var_to_index } from './maple_expr'

type RealExpr = PrSat['RealExpr']

export const DEFAULT_MAPLE_BRIDGE_URL = 'http://127.0.0.1:31415'

export type MapleBranch = {
  // Solved variables: state index → expression over free variables.
  solved: Map<number, RealExpr>
  // Free variables of this branch (those Maple returned as `a_i = a_i`,
  // plus any state variable not mentioned at all).
  free: Set<number>
}

export const ping_maple_bridge = async (url: string = DEFAULT_MAPLE_BRIDGE_URL): Promise<boolean> => {
  try {
    const res = await fetch(`${url}/ping`, { signal: AbortSignal.timeout(1500) })
    const body = await res.json()
    return body?.ok === true
  } catch {
    return false
  }
}

const is_identity = (name: string, expr: string): boolean => expr.trim() === name

export const solve_equations_via_maple = async (
  equation_polys: EqPoly[],
  n_states: number,
  url: string = DEFAULT_MAPLE_BRIDGE_URL,
  abort_signal?: AbortSignal,
): Promise<MapleBranch[] | undefined> => {
  const vars = vars_in_polys(equation_polys).map((i) => `a${i + 1}`)
  if (vars.length === 0) return undefined
  let body: any
  try {
    const res = await fetch(`${url}/solve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vars, equations: equation_polys.map(poly_to_maple_string) }),
      signal: abort_signal,
    })
    body = await res.json()
  } catch {
    return undefined  // bridge unreachable / aborted
  }
  if (body?.error !== undefined || !Array.isArray(body?.branches)) return undefined

  const to_index = default_var_to_index(n_states)
  const branches: MapleBranch[] = []
  for (const raw of body.branches) {
    const solved = new Map<number, RealExpr>()
    const free = new Set<number>()
    let ok = true
    for (const [name, expr_str] of Object.entries(raw as Record<string, string>)) {
      const index = to_index(name)
      if (index === undefined) { ok = false; break }
      if (is_identity(name, expr_str)) {
        free.add(index)
        continue
      }
      const expr = parse_maple_expr(expr_str, to_index)
      if (expr === undefined) { ok = false; break }  // RootOf / float / unsupported
      solved.set(index, expr)
    }
    if (!ok) continue
    // State variables Maple never mentioned are unconstrained by the equations.
    for (let i = 0; i < n_states; i++) {
      if (!solved.has(i) && !free.has(i)) free.add(i)
    }
    branches.push({ solved, free })
  }
  return branches
}
