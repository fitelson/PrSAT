import { describe, expect, test } from 'vitest'

import {
  constraint_builder,
  div0_conditions_in_constraint_or_real_expr,
  evaluate_constraint_2,
  evaluate_real_expr_2,
  real_expr_builder,
  sentence_builder,
  TruthTable,
  variables_in_constraints,
} from './pr_sat'
import { parse_constraint } from './parser'
import {
  compute_cooper_value_sets,
  evaluate_cooper_sentence,
  pr3_sat_wrapped,
  translate_real_expr_cooper,
} from './pr3_sat'
import { assert_result } from './utils'
import { init_z3, pr_sat_wrapped, WrappedSolver } from './z3_integration'

const S = sentence_builder
const R = real_expr_builder
const C = constraint_builder

const make_tt = (...letters: ReturnType<typeof S.letter>[]): TruthTable =>
  new TruthTable({ real: [], sentence: letters })

const parse = (s: string) => assert_result(parse_constraint(s))

describe('Cooper trivalent semantics', () => {
  test('simple indicative conditional is true, false, or void as in Adams Thesis', () => {
    const A = S.letter('A')
    const B = S.letter('B')
    const tt = make_tt(A, B)

    expect(compute_cooper_value_sets(tt, S.imp(A, B))).toEqual({
      true_indices: [0],
      false_indices: [1],
      void_indices: [2, 3],
      classical_indices: [0, 1],
    })
  })

  test('void antecedents in Cooper conditionals are grouped with true antecedents', () => {
    const A = S.letter('A')
    const B = S.letter('B')
    const C = S.letter('C')
    const tt = make_tt(A, B, C)
    const left_nested = S.imp(S.imp(A, B), C)

    // State 4 is ~A & B & C. So A -> B is void, and (A -> B) -> C is true.
    expect(evaluate_cooper_sentence((l) => tt.letter_value_from_index(l, 4), left_nested)).toBe(1)
  })

  test('chameleon conjunction makes true-and-void conjunctions true', () => {
    const A = S.letter('A')
    const B = S.letter('B')
    const C = S.letter('C')
    const tt = make_tt(A, B, C)
    const conjunction = S.and(S.imp(A, B), C)

    // State 4 is ~A & B & C. So A -> B is void, but C is true.
    expect(evaluate_cooper_sentence((l) => tt.letter_value_from_index(l, 4), conjunction)).toBe(1)
  })

  test('Import-Export holds', () => {
    const A = S.letter('A')
    const B = S.letter('B')
    const C = S.letter('C')
    const tt = make_tt(A, B, C)

    expect(compute_cooper_value_sets(tt, S.imp(A, S.imp(B, C))))
      .toEqual(compute_cooper_value_sets(tt, S.imp(S.and(A, B), C)))
  })

  test('Left-Nesting reduces to material antecedent for conditional-free consequent', () => {
    const A = S.letter('A')
    const B = S.letter('B')
    const C = S.letter('C')
    const tt = make_tt(A, B, C)
    const material = S.or(S.not(A), B)

    expect(compute_cooper_value_sets(tt, S.imp(S.imp(A, B), C)))
      .toEqual(compute_cooper_value_sets(tt, S.imp(material, C)))
  })
})

describe('Pr3 probability translation', () => {
  test('Pr(A -> B) translates to true mass divided by true-or-false mass', () => {
    const A = S.letter('A')
    const B = S.letter('B')
    const tt = make_tt(A, B)

    expect(translate_real_expr_cooper(tt, R.pr(S.imp(A, B))))
      .toEqual(R.ite(C.eq(R.svs([0, 1]), R.lit(0)), R.lit(1), R.divide(R.svs([0]), R.svs([0, 1]))))
  })

  test('Pr(B | A) is trivalent conditional probability Pr(A -> B)', () => {
    const A = S.letter('A')
    const B = S.letter('B')
    const tt = make_tt(A, B)

    expect(translate_real_expr_cooper(tt, R.cpr(B, A)))
      .toEqual(translate_real_expr_cooper(tt, R.pr(S.imp(A, B))))
  })

  test('all-void formulas receive probability 1 by convention', () => {
    const A = S.letter('A')
    const tt = make_tt(A)

    expect(translate_real_expr_cooper(tt, R.pr(S.imp(S.val(false), A))))
      .toEqual(R.lit(1))
  })

  test('dynamically zero true-or-false mass evaluates to probability 1', () => {
    const A = S.letter('A')
    const B = S.letter('B')
    const tt = make_tt(A, B)
    const translated = translate_real_expr_cooper(tt, R.pr(S.imp(A, B)))
    const state_values = { 0: 0, 1: 0, 2: 0.4, 3: 0.6 }

    expect(evaluate_real_expr_2(tt, state_values, translated)).toEqual([true, 1])
    for (const div0 of div0_conditions_in_constraint_or_real_expr({ tag: 'real_expr', real_expr: translated })) {
      expect(evaluate_constraint_2(tt, state_values, div0)).toEqual([true, true])
    }
  })
})

describe('Pr3SAT wrapper', () => {
  test('solves a chameleon conjunction constraint with Cooper semantics', async () => {
    const constraints = [parse('Pr((A -> B) & C) > Pr(A -> B)')]
    const tt = new TruthTable(variables_in_constraints(constraints))
    const z3 = await init_z3()
    const solver = new WrappedSolver(z3, init_z3)

    const result = await pr3_sat_wrapped(solver, tt, constraints)

    expect(result.method).toBe('pr3')
    expect(result.solver_output.status).toBe('sat')
  })

  test('does not exclude models where a trivalent conditional denominator is zero', async () => {
    const constraints = [parse('Pr(A -> B) = 1'), parse('Pr(A) = 0')]
    const tt = new TruthTable(variables_in_constraints(constraints))
    const z3 = await init_z3()
    const solver = new WrappedSolver(z3, init_z3)

    const result = await pr3_sat_wrapped(solver, tt, constraints)

    expect(result.solver_output.status).toBe('sat')
    if (result.solver_output.status === 'sat') {
      await expect(result.solver_output.evaluate(tt, { tag: 'real_expr', real_expr: R.pr(S.imp(S.letter('A'), S.letter('B'))) }))
        .resolves.toEqual({ tag: 'result', result: { tag: 'literal', value: 1 } })
    }
  })

  test('chameleon conjunction separates classical SMT from trivalent SMT', async () => {
    const constraints = [parse('Pr((A -> B) & C) > Pr(A -> B)')]
    const tt = new TruthTable(variables_in_constraints(constraints))
    const z3 = await init_z3()
    const classical_solver = new WrappedSolver(z3, init_z3)
    const trivalent_solver = new WrappedSolver(z3, init_z3)

    const classical = await pr_sat_wrapped(classical_solver, tt, constraints)
    const trivalent = await pr3_sat_wrapped(trivalent_solver, tt, constraints)

    expect(classical.solver_output.status).toBe('unsat')
    expect(trivalent.solver_output.status).toBe('sat')
  })
})
