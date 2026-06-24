import { describe, expect, test } from "vitest"
import { random_pr_sat } from "./random_search"
import { ping_maple_bridge } from "./maple_bridge_client"
import { parse_constraint } from "./parser"

const fmt = (v: any): string => v.tag === 'literal' ? String(v.value) : v.tag === 'rational' ? `${v.numerator.value}/${v.denominator.value}` : '?'

const lr_lines = [
  "(Pr(H | E1 & E2) - Pr(H | ~E1 & E2)) = (Pr(H | E1) - Pr(H | ~E1))",
  "(Pr(H | E2 & E1) - Pr(H | ~E2 & E1)) = (Pr(H | E2) - Pr(H | ~E2))",
  "Pr(H | E1) - Pr(H | ~E1) = 1/2",
  "Pr(H | E2) - Pr(H | ~E2) = -1/2",
  "Pr(H | E1 & E2) - Pr(H | ~(E1 & E2)) != 0",
]
const indep_lines = [
  "Pr(X & Y) = Pr(X) * Pr(Y)", "Pr(X & Z) = Pr(X) * Pr(Z)", "Pr(Y & Z) = Pr(Y) * Pr(Z)",
  "Pr(X & U) = Pr(X) * Pr(U)", "Pr(Y & U) = Pr(Y) * Pr(U)", "Pr(Z & U) = Pr(Z) * Pr(U)",
  "Pr(X & Y & Z) = Pr(X) * Pr(Y) * Pr(Z)", "Pr(X & Y & U) = Pr(X) * Pr(Y) * Pr(U)",
  "Pr(X & Z & U) = Pr(X) * Pr(Z) * Pr(U)", "Pr(Y & Z & U) = Pr(Y) * Pr(Z) * Pr(U)",
  "Pr(X & Y & Z & U) != Pr(X) * Pr(Y) * Pr(Z) * Pr(U)",
]
const trivalent_branch_lines = [
  "Pr(P -> Q) = 1/4",
  "Pr(Q) = 1/6",
  "Pr(Q -> P) = 1",
  "Pr(P) = 2/3",
]

// These tests exercise the LOCAL Maple bridge (npm run maple-bridge). They
// self-skip when the bridge is not running, so CI / bridge-less runs pass.
describe('maple bridge end-to-end', () => {
  let bridge_up = false
  test('bridge reachable (skips the rest when off)', async () => {
    bridge_up = await ping_maple_bridge()
    console.log('bridge up:', bridge_up)
  })
  test('likelihood-ratio system via bridge', async () => {
    if (!bridge_up) return
    const constraints = lr_lines.map((l) => (parse_constraint(l) as any)[1])
    const t0 = Date.now()
    const result = await random_pr_sat(constraints, { seed: 'bridge-lr', search_attempts: 10, maple_bridge_url: 'http://127.0.0.1:31415' })
    console.log('LR: status', result.solver_output.status, 'bridge:', result.used_maple_bridge, 'wall ms:', Date.now() - t0)
    if (result.solver_output.status === 'sat') {
      const sa = result.solver_output.state_assignments as any
      console.log('LR MODEL:', Object.entries(sa).map(([k,v]) => `a_${Number(k)+1}=${fmt(v)}`).join(' '))
    }
    expect(result.solver_output.status).toBe('sat')
  }, 300_000)
  test('3-wise independence via bridge', async () => {
    if (!bridge_up) return
    const constraints = indep_lines.map((l) => (parse_constraint(l) as any)[1])
    const t0 = Date.now()
    const result = await random_pr_sat(constraints, { seed: 'bridge-indep', search_attempts: 10, maple_bridge_url: 'http://127.0.0.1:31415' })
    console.log('INDEP: status', result.solver_output.status, 'bridge:', result.used_maple_bridge, 'wall ms:', Date.now() - t0)
    if (result.solver_output.status === 'sat') {
      const sa = result.solver_output.state_assignments as any
      console.log('INDEP MODEL:', Object.entries(sa).map(([k,v]) => `a_${Number(k)+1}=${fmt(v)}`).join(' '))
      // Pretty witnesses only: every denominator within the prettiness bound.
      const max_den = Object.values(result.rational_model!).reduce((m, v) => v.d > m ? v.d : m, 1n)
      expect(max_den <= 10_000n).toBe(true)
    }
    expect(result.solver_output.status).toBe('sat')
  }, 600_000)
  test('3-wise independence, Regular mode (strictly positive pretty witness): pretty positive witness', async () => {
    if (!bridge_up) return
    const constraints = indep_lines.map((l) => (parse_constraint(l) as any)[1])
    const t0 = Date.now()
    const result = await random_pr_sat(constraints, { seed: 'regular-1', search_attempts: 15, regular: true, maple_bridge_url: 'http://127.0.0.1:31415' })
    console.log('status:', result.solver_output.status, 'bridge:', result.used_maple_bridge, 'wall ms:', Date.now() - t0)
    if (result.solver_output.status === 'sat') {
      const rm = result.rational_model!
      const max_den = Object.values(rm).reduce((m, v) => v.d > m ? v.d : m, 1n)
      const min_val = Object.values(rm).every((v) => v.n > 0n)
      console.log('MODEL:', Object.entries(rm).map(([k, v]) => `a_${Number(k)+1}=${v.n}/${v.d}`).join(' '))
      console.log('max denominator:', max_den.toString(), 'all positive:', min_val)
      expect(min_val).toBe(true)
      expect(max_den <= 10_000n).toBe(true)
    }
  }, 600_000)
  test('trivalent branch search substitutes state indices inside zero-denominator cases', async () => {
    if (!bridge_up) return
    const constraints = trivalent_branch_lines.map((l) => (parse_constraint(l) as any)[1])
    const result = await random_pr_sat(constraints, {
      seed: 'tri-branch',
      semantics: 'trivalent',
      search_attempts: 3,
      maple_bridge_url: 'http://127.0.0.1:31415',
    })
    expect(result.solver_output.status).toBe('sat')
    expect(result.used_maple_bridge).toBe(true)
    expect(result.rational_model).toBeDefined()
  }, 120_000)
})
