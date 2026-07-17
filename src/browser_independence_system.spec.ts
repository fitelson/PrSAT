import { describe, expect, test } from 'vitest'
import { parse_constraint } from './parser'
import { random_pr_sat } from './random_search'
import { PrSat } from './types'
import { TruthTable, variables_in_constraints } from './pr_sat'
import { pr_sat_wrapped, WrappedSolver } from './z3_integration'

type Constraint = PrSat['Constraint']

const independence_lines = [
  'Pr(X & Y) = Pr(X) * Pr(Y)',
  'Pr(X & Z) = Pr(X) * Pr(Z)',
  'Pr(Y & Z) = Pr(Y) * Pr(Z)',
  'Pr(X & U) = Pr(X) * Pr(U)',
  'Pr(Y & U) = Pr(Y) * Pr(U)',
  'Pr(Z & U) = Pr(Z) * Pr(U)',
  'Pr(X & Y & Z) = Pr(X) * Pr(Y) * Pr(Z)',
  'Pr(X & Y & U) = Pr(X) * Pr(Y) * Pr(U)',
  'Pr(X & Z & U) = Pr(X) * Pr(Z) * Pr(U)',
  'Pr(Y & Z & U) = Pr(Y) * Pr(Z) * Pr(U)',
  'Pr(X & Y & Z & U) != Pr(X) * Pr(Y) * Pr(Z) * Pr(U)',
]

describe('four-variable 3-wise independence system', () => {
  test('browser algebra finds and exactly verifies a non-4-wise-independent model', async () => {
    const constraints = independence_lines.map((line) => parse_constraint(line)[1] as Constraint)
    const started = performance.now()
    const result = await random_pr_sat(constraints, {
      seed: 'browser-independence',
      search_attempts: 3,
    })
    console.log('general browser independence wall ms:', Math.round(performance.now() - started))

    expect(result.solver_output.status).toBe('sat')
    expect(result.used_browser_equation_solver).toBe(true)
    expect(result.used_maple_bridge).not.toBe(true)
    expect(result.rational_model).toBeDefined()

    const max_denominator = Object.values(result.rational_model!)
      .reduce((maximum, value) => value.d > maximum ? value.d : maximum, 1n)
    expect(max_denominator <= 10_000n).toBe(true)
  }, 30_000)

  test('keeps exact equation work in Random Search and sends Z3 the direct problem', async () => {
    const constraints = independence_lines.map((line) => parse_constraint(line)[1] as Constraint)
    const tt = new TruthTable(variables_in_constraints(constraints))
    let sent_to_z3 = ''
    const fake_solver = {
      solve: async (smtlib: string) => {
        sent_to_z3 = smtlib
        return { status: 'unknown' as const }
      },
    } as unknown as WrappedSolver
    await pr_sat_wrapped(fake_solver, tt, constraints)

    expect(sent_to_z3).toContain('(assert')
    expect(sent_to_z3).toContain('(*')
  }, 30_000)
})
