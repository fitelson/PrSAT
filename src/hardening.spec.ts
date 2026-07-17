import { describe, expect, test } from 'vitest'

import { assert_parse_constraint, assert_parse_sentence } from './parser'
import {
  MAX_ABS_SOLVER_EXPONENT,
  MAX_TRUTH_TABLE_LETTERS,
  constraint_builder as C,
  real_expr_builder as R,
  real_expr_to_smtlib,
  sentence_builder as S,
  TruthTable,
  variables_in_constraints,
} from './pr_sat'
import { CCKTruthTable, MAX_CCK_TRUTH_TABLE_LETTERS } from './cck'
import { cck_sat_wrapped } from './cck_sat'
import { pr3_sat_wrapped } from './pr3_sat'
import {
  build_rational_cck_evaluator,
  build_rational_cooper_evaluator,
  build_rational_evaluator,
  MAX_RANDOM_SEARCH_ATTEMPTS,
  random_pr_sat,
} from './random_search'
import { ONE } from './rationalize'
import { init_z3, pr_sat_wrapped, run_solve_cancel_logic, WrappedSolver } from './z3_integration'
import { sleep } from './utils'

describe('solver hardening', () => {
  test('mixed logical connectives use conventional precedence', () => {
    const A = S.letter('A'), B = S.letter('B'), D = S.letter('C')
    expect(assert_parse_sentence('A & B ∨ C')).toEqual(S.or(S.and(A, B), D))
    const a = C.eq(R.lit(1), R.lit(1))
    const b = C.eq(R.lit(2), R.lit(2))
    const c = C.eq(R.lit(3), R.lit(3))
    expect(assert_parse_constraint('1 = 1 & 2 = 2 ∨ 3 = 3')).toEqual(C.cor(C.cand(a, b), c))
  })

  test.each([
    ['classical', (s: WrappedSolver, tt: TruthTable, cs: ReturnType<typeof assert_parse_constraint>[]) => pr_sat_wrapped(s, tt, cs)],
    ['ERS', (s: WrappedSolver, tt: TruthTable, cs: ReturnType<typeof assert_parse_constraint>[]) => pr3_sat_wrapped(s, tt, cs)],
    ['CCK', (s: WrappedSolver, tt: TruthTable, cs: ReturnType<typeof assert_parse_constraint>[]) => cck_sat_wrapped(s, tt, cs)],
  ])('%s rejects a negative power of zero', async (name, solve) => {
    const cs = [assert_parse_constraint('0^(-1) = 0')]
    const tt = name === 'CCK' ? new CCKTruthTable(variables_in_constraints(cs)) : new TruthTable(variables_in_constraints(cs))
    const z3 = await init_z3()
    const result = await solve(new WrappedSolver(z3, init_z3), tt, cs)
    expect(result.solver_output.status).toBe('unsat')
  })

  test.each([
    ['classical', build_rational_evaluator],
    ['ERS', build_rational_cooper_evaluator],
    ['CCK', build_rational_cck_evaluator],
  ])('Random Search %s evaluator preserves branch-local definedness', async (name, factory) => {
    const constraint = assert_parse_constraint('(1 = 1) ∨ (1 / 0 = 0)')
    const tt = name === 'CCK'
      ? new CCKTruthTable(variables_in_constraints([constraint]))
      : new TruthTable(variables_in_constraints([constraint]))
    await expect(factory({ 0: ONE })(tt, { tag: 'constraint', constraint }))
      .resolves.toEqual({ tag: 'bool-result', result: true })
  })

  test('Random Search certifies a valid disjunction without evaluating its undefined branch', async () => {
    const result = await random_pr_sat([assert_parse_constraint('(1 = 1) ∨ (1 / 0 = 0)')], { seed: 'branch-local' })
    expect(result.solver_output.status).toBe('sat')
  })

  test.each([
    ['ERS', (s: WrappedSolver, tt: TruthTable, cs: ReturnType<typeof assert_parse_constraint>[]) => pr3_sat_wrapped(s, tt, cs)],
    ['CCK', (s: WrappedSolver, tt: TruthTable, cs: ReturnType<typeof assert_parse_constraint>[]) => cck_sat_wrapped(s, tt, cs)],
  ])('%s model evaluator recognizes a declared real variable', async (name, solve) => {
    const cs = [C.eq(R.vbl('x'), R.lit(1))]
    const tt = name === 'CCK' ? new CCKTruthTable(variables_in_constraints(cs)) : new TruthTable(variables_in_constraints(cs))
    const z3 = await init_z3()
    const result = await solve(new WrappedSolver(z3, init_z3), tt, cs)
    expect(result.solver_output.status).toBe('sat')
    if (result.solver_output.status === 'sat') {
      await expect(result.solver_output.evaluate(tt, { tag: 'real_expr', real_expr: R.vbl('x') }))
        .resolves.toEqual({ tag: 'result', result: { tag: 'literal', value: 1 } })
    }
  })

  test('cancel timeout includes cancellation cleanup', async () => {
    const ac = new AbortController()
    const start = performance.now()
    const result = run_solve_cancel_logic(
      async () => await new Promise<'finished'>(() => {}),
      async () => { await sleep(200); return 'cancelled' as const },
      async () => 'slow-cancelled' as const,
      20,
      ac.signal,
    )
    ac.abort()
    expect(await result).toBe('slow-cancelled')
    expect(performance.now() - start).toBeLessThan(100)
  })

  test('truth tables and powers reject resource-exhausting inputs', () => {
    const letters = (count: number) => Array.from({ length: count }, (_, index) => S.letter('A', index))
    expect(() => new TruthTable({ real: [], sentence: letters(MAX_TRUTH_TABLE_LETTERS + 1) })).toThrow(/at most/)
    expect(() => new CCKTruthTable({ real: [], sentence: letters(MAX_CCK_TRUTH_TABLE_LETTERS + 1) })).toThrow(/CCK mode supports at most/)
    expect(() => real_expr_to_smtlib(R.power(R.lit(2), R.lit(MAX_ABS_SOLVER_EXPONENT + 1)))).toThrow(/magnitude/)
  })

  test('Random Search rejects excessive attempt counts', async () => {
    await expect(random_pr_sat([C.eq(R.lit(1), R.lit(1))], { search_attempts: MAX_RANDOM_SEARCH_ATTEMPTS + 1 }))
      .rejects.toThrow(/attempts/)
  })

  test('Random Search rejects excessive exponents before optimization', async () => {
    const constraint = C.eq(R.power(R.lit(2), R.lit(MAX_ABS_SOLVER_EXPONENT + 1)), R.lit(0))
    await expect(random_pr_sat([constraint])).rejects.toThrow(/magnitude/)
  })
})
