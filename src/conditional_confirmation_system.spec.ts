import { describe, expect, test } from 'vitest'
import { parse_constraint } from './parser'
import {
  TruthTable,
  variables_in_constraints,
} from './pr_sat'
import { random_pr_sat } from './random_search'
import { PrSat } from './types'
import { pr_sat_wrapped, WrappedSolver } from './z3_integration'

type Constraint = PrSat['Constraint']

const conditional_confirmation_lines = [
  'Pr(C | A) > Pr(C)',
  'Pr(B | A) > Pr(B)',
  '(Pr(A | C) - Pr(A | ~C))/(Pr(A | C) + Pr(A | ~C)) ≥ (Pr(A | C & B) - Pr(A | ~C & B))/(Pr(A | C & B) + Pr(A | ~C & B))',
  'Pr(B \\/ C | A) ≤ Pr(B \\/ C)',
]

describe('conditional-confirmation system (research benchmark)', () => {
  test('uses equation preprocessing only in the Random Search path', async () => {
    const constraints = conditional_confirmation_lines.map((line) => parse_constraint(line)[1] as Constraint)
    expect(constraints).toHaveLength(4)
    const tt = new TruthTable(variables_in_constraints(constraints))
    expect(tt.n_states()).toBe(8)

    const random_started = performance.now()
    const random_result = await random_pr_sat(constraints, {
      seed: 'conditional-confirmation',
      search_attempts: 20,
    })
    console.log('conditional confirmation random:', random_result.solver_output.status, Math.round(performance.now() - random_started), 'ms')

    let direct_smtlib = ''
    const direct_solver = {
      solve: async (smtlib: string) => {
        direct_smtlib = smtlib
        return { status: 'unknown' as const }
      },
    } as unknown as WrappedSolver
    const z3_result = await pr_sat_wrapped(direct_solver, tt, constraints, { regular: true })

    expect(random_result.solver_output.status).toBe('sat')
    expect(z3_result.solver_output.status).toBe('unknown')
    expect(direct_smtlib).toContain('(/')
  }, 40_000)
})
