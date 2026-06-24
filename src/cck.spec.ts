import { describe, expect, test } from 'vitest'

import {
  CCKTruthTable,
  compute_cck_value_sets,
  evaluate_cck_sentence,
  translate_constraints_cck,
  translate_real_expr_cck,
} from './cck'
import { cck_sat_wrapped } from './cck_sat'
import {
  real_expr_builder,
  sentence_builder,
  TruthTable,
  variables_in_constraints,
} from './pr_sat'
import { parse_constraint } from './parser'
import { pr3_sat_wrapped } from './pr3_sat'
import { assert_result } from './utils'
import { init_z3, WrappedSolver } from './z3_integration'

const S = sentence_builder
const R = real_expr_builder

const make_cck_tt = (...letters: ReturnType<typeof S.letter>[]): CCKTruthTable =>
  new CCKTruthTable({ real: [], sentence: letters })

const parse = (s: string) => assert_result(parse_constraint(s))

describe('Cantwell-Cooper-Kleene trivalent semantics', () => {
  test('enumerates genuinely gappy atomic rows', () => {
    const A = S.letter('A')
    const B = S.letter('B')
    const tt = make_cck_tt(A, B)

    expect(tt.n_states()).toBe(9)
    expect([...tt.state_indices()]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
    expect(tt.letter_value3_from_index(A, 0)).toBe(1)
    expect(tt.letter_value3_from_index(B, 1)).toBe(0.5)
    expect(tt.letter_value3_from_index(B, 2)).toBe(0)
    expect(tt.letter_value3_from_index(A, 3)).toBe(0.5)
    expect(tt.letter_value3_from_index(A, 6)).toBe(0)
  })

  test('ordinary connectives use strong Kleene tables', () => {
    const A = S.letter('A')
    const B = S.letter('B')
    const tt = make_cck_tt(A, B)

    // A is true and B is neither true nor false on row 1.
    const eval_row_1 = (l: ReturnType<typeof S.letter>) => tt.letter_value3_from_index(l, 1)
    expect(evaluate_cck_sentence(eval_row_1, S.and(A, B))).toBe(0.5)
    expect(evaluate_cck_sentence(eval_row_1, S.or(S.not(A), B))).toBe(0.5)
  })

  test('Cooper conditional conditions on antecedent non-falsity and truth-valued consequent rows', () => {
    const A = S.letter('A')
    const B = S.letter('B')
    const tt = make_cck_tt(A, B)

    expect(compute_cck_value_sets(tt, S.imp(A, B))).toEqual({
      true_indices: [0, 3],
      false_indices: [2, 5],
      void_indices: [1, 4, 6, 7, 8],
      classical_indices: [0, 2, 3, 5],
    })
  })

  test('Cantwell probability omits atomic gaps from the denominator', () => {
    const A = S.letter('A')
    const B = S.letter('B')
    const tt = make_cck_tt(A, B)

    expect(translate_real_expr_cck(tt, R.pr(A)))
      .toEqual(R.ite(
        { tag: 'equal', left: R.svs([0, 1, 2, 6, 7, 8]), right: R.lit(0) },
        R.lit(1),
        R.divide(R.svs([0, 1, 2]), R.svs([0, 1, 2, 6, 7, 8])),
      ))
  })

  test('Pr(B | A) is CCK conditional probability Pr(A -> B)', () => {
    const A = S.letter('A')
    const B = S.letter('B')
    const tt = make_cck_tt(A, B)

    expect(translate_real_expr_cck(tt, R.cpr(B, A)))
      .toEqual(translate_real_expr_cck(tt, R.pr(S.imp(A, B))))
    expect(translate_real_expr_cck(tt, R.cpr(B, A)))
      .toEqual(R.ite(
        { tag: 'equal', left: R.svs([0, 2, 3, 5]), right: R.lit(0) },
        R.lit(1),
        R.divide(R.svs([0, 3]), R.svs([0, 2, 3, 5])),
      ))
  })

  test('non-one totalized probability equations translate with residual totalization constraints', () => {
    const constraints = [
      parse('Pr(P -> Q) = 1/4'),
      parse('Pr(Q) = 1/6'),
      parse('Pr(Q -> P) = 1'),
      parse('Pr(P) = 2/3'),
    ]
    const tt = new CCKTruthTable(variables_in_constraints(constraints))
    const translated = translate_constraints_cck(tt, constraints)
    expect(translated).toHaveLength(4)
    expect(translated.every((constraint) => constraint.tag === 'equal')).toBe(true)
  })
})

describe('CCK PrSAT wrapper', () => {
  test('allows both A and ~A to have totalized probability 1 on all-gappy A mass', async () => {
    const constraints = [parse('Pr(A) = 1'), parse('Pr(~A) = 1')]
    const z3 = await init_z3()
    const cck_solver = new WrappedSolver(z3, init_z3)
    const ers_solver = new WrappedSolver(z3, init_z3)
    const cck_tt = new CCKTruthTable(variables_in_constraints(constraints))
    const ers_tt = new TruthTable(variables_in_constraints(constraints))

    const cck = await cck_sat_wrapped(cck_solver, cck_tt, constraints)
    const ers = await pr3_sat_wrapped(ers_solver, ers_tt, constraints)

    expect(cck.solver_output.status).toBe('sat')
    expect(ers.solver_output.status).toBe('unsat')
  })
})
