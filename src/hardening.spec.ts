import { describe, expect, test } from 'vitest'

import { assert_parse_constraint, assert_parse_sentence } from './parser'
import {
  MAX_ABS_SOLVER_EXPONENT,
  constraint_builder as C,
  real_expr_builder as R,
  real_expr_to_smtlib,
  sentence_builder as S,
  variables_in_constraints,
} from './pr_sat'
import { LETKTruthTable, MAX_LETK_TRUTH_TABLE_LETTERS } from './letk'
import { letk_sat_wrapped } from './letk_sat'
import { init_z3, run_solve_cancel_logic, WrappedSolver } from './z3_integration'
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

  test('TwistPrSAT rejects a negative power of zero', async () => {
    const cs = [assert_parse_constraint('0^(-1) = 0')]
    const tt = new LETKTruthTable(variables_in_constraints(cs))
    const z3 = await init_z3()
    const result = await letk_sat_wrapped(new WrappedSolver(z3, init_z3), tt, cs)
    expect(result.solver_output.status).toBe('unsat')
  })

  test('TwistPrSAT model evaluator recognizes a declared real variable', async () => {
    const cs = [C.eq(R.vbl('x'), R.lit(1))]
    const tt = new LETKTruthTable(variables_in_constraints(cs))
    const z3 = await init_z3()
    const result = await letk_sat_wrapped(new WrappedSolver(z3, init_z3), tt, cs)
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
    expect(() => new LETKTruthTable({ real: [], sentence: letters(MAX_LETK_TRUTH_TABLE_LETTERS + 1) })).toThrow(/TwistPrSAT supports at most/)
    expect(() => real_expr_to_smtlib(R.power(R.lit(2), R.lit(MAX_ABS_SOLVER_EXPONENT + 1)))).toThrow(/magnitude/)
  })

})
