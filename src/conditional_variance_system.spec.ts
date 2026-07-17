import { describe, expect, test } from 'vitest'
import { parse_constraint } from './parser'
import { enrich_constraints, translate, TruthTable, variables_in_constraints } from './pr_sat'
import { PrSat } from './types'
import { pr_sat_wrapped, WrappedSolver } from './z3_integration'
import { random_pr_sat } from './random_search'
import { ping_maple_bridge, solve_equations_via_maple } from './maple_bridge_client'
import { eliminate_equations, extract_equation_system } from './equation_elimination'

type Constraint = PrSat['Constraint']

const conditional_variance_lines = [
  'Pr(B | H & R) = 1',
  'Pr(H | R) = Pr(H | ~R)',
  'Pr(H | B) = Pr(H | ~B)',
  'Pr(~B) > Pr(B)',
  'Pr(B) > Pr(R)',
  'Pr(H & R & B) > 0',
  'Pr(H & ~R & B) > 0',
  'Pr(H & ~R & ~B) > 0',
  'Pr(~H & R & B) > 0',
  'Pr(~H & R & ~B) > 0',
  'Pr(~H & ~R & ~B) > 0',
  'Pr(~H & ~R & B) > 0',
  'Pr(R | B) <= Pr(R | ~B)',
  'Pr(R | B) * (Pr(H | R & B) - Pr(H | B)) * (Pr(H | R & B) - Pr(H | B)) + Pr(~R | B) * (Pr(H | ~R & B) - Pr(H | B)) * (Pr(H | ~R & B) - Pr(H | B)) <= Pr(R | ~B) * (Pr(H | R & ~B) - Pr(H | ~B)) * (Pr(H | R & ~B) - Pr(H | ~B)) + Pr(~R | ~B) * (Pr(H | ~R & ~B) - Pr(H | ~B)) * (Pr(H | ~R & ~B) - Pr(H | ~B))',
]

describe('conditional-variance system (research benchmark)', () => {
  // Known expected result: UNSAT. Random/Maple branch search is a SAT witness
  // procedure, so UNKNOWN is an acceptable incomplete result; SAT never is.
  test('reduces to four variables but protects Z3 from an expanding substitution', async () => {
    const constraints = conditional_variance_lines.map((line) => parse_constraint(line)[1] as Constraint)
    const tt = new TruthTable(variables_in_constraints(constraints))
    const translated = translate(tt, constraints)

    const preprocessing_started = performance.now()
    const elimination = eliminate_equations(
      tt.n_states(), enrich_constraints(tt, undefined, false, translated))
    console.log('conditional variance preprocessing:', elimination.tag, Math.round(performance.now() - preprocessing_started), 'ms')
    expect(elimination.tag).toBe('eliminated')
    if (elimination.tag === 'eliminated') {
      expect(elimination.free_indices).toHaveLength(4)
      expect(elimination.leftover_equations).toHaveLength(0)
    }

    const random_started = performance.now()
    const random_result = await random_pr_sat(constraints, {
      seed: 'conditional-variance',
      search_attempts: 10,
    })
    console.log('conditional variance random wall ms:', Math.round(performance.now() - random_started))
    expect(['unsat', 'unknown']).toContain(random_result.solver_output.status)

    let reduced_smtlib = ''
    let fallback_smtlib = ''
    const fake_z3 = {
      solve_with_evaluator: async (smtlib: string) => {
        reduced_smtlib = smtlib
        return { status: 'unknown' as const }
      },
      solve: async (smtlib: string) => {
        fallback_smtlib = smtlib
        return { status: 'unknown' as const }
      },
    } as unknown as WrappedSolver
    await pr_sat_wrapped(fake_z3, tt, constraints, { timeout_ms: 5_000 })
    expect(reduced_smtlib).toBe('')
    expect(fallback_smtlib).toContain('(declare-const a_7 Real)')
  }, 40_000)

  test('Maple 2024 equation branches plus random branch search', async () => {
    if (!await ping_maple_bridge()) return
    const constraints = conditional_variance_lines.map((line) => parse_constraint(line)[1] as Constraint)
    const tt = new TruthTable(variables_in_constraints(constraints))
    const extracted = extract_equation_system(enrich_constraints(tt, undefined, false, translate(tt, constraints)))
    const branches = await solve_equations_via_maple(
      extracted.equation_polys, tt.n_states(), 'http://127.0.0.1:31415')
    console.log('conditional variance Maple branches:', branches?.map((branch) => ({
      solved: branch.solved.size,
      free: branch.free.size,
    })))
    expect(branches?.map((branch) => branch.free.size)).toEqual([4, 3, 3])
    const started = performance.now()
    const result = await random_pr_sat(constraints, {
      seed: 'conditional-variance-maple',
      search_attempts: 10,
      browser_equation_solver: false,
      maple_bridge_url: 'http://127.0.0.1:31415',
    })
    console.log('conditional variance Maple pipeline wall ms:', Math.round(performance.now() - started))
    expect(['unsat', 'unknown']).toContain(result.solver_output.status)
  }, 120_000)

})
