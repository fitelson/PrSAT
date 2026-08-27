import { describe, expect, test } from 'vitest'
import { assert_parse_constraint, assert_parse_sentence } from './parser'
import {
  compute_letk_value_sets,
  evaluate_letk_sentence,
  LETKTruthTable,
  LETKTruthValue,
  LETK_VALUES,
  letk_and,
  letk_imp,
  letk_not,
  letk_or,
  letk_reliability,
  translate_constraints_letk,
} from './letk'
import { constraint_builder, real_expr_builder, sentence_builder, variables_in_constraints } from './pr_sat'
import { letk_sat_wrapped } from './letk_sat'
import { init_z3, WrappedSolver } from './z3_integration'
import { PrSat } from './types'

type Sentence = PrSat['Sentence']

const TABLE_ORDER: LETKTruthValue[] = ['T', 't', 'b', 'f', 'F', 'n']

const expected_and: LETKTruthValue[][] = [
  ['T', 't', 'b', 'f', 'F', 'n'],
  ['t', 't', 'b', 'f', 'F', 'n'],
  ['b', 'b', 'b', 'f', 'F', 'f'],
  ['f', 'f', 'f', 'f', 'F', 'f'],
  ['F', 'F', 'F', 'F', 'F', 'F'],
  ['n', 'n', 'f', 'f', 'F', 'n'],
]

const expected_or: LETKTruthValue[][] = [
  ['T', 'T', 'T', 'T', 'T', 'T'],
  ['T', 't', 't', 't', 't', 't'],
  ['T', 't', 'b', 'b', 'b', 't'],
  ['T', 't', 'b', 'f', 'f', 'n'],
  ['T', 't', 'b', 'f', 'F', 'n'],
  ['T', 't', 't', 'n', 'n', 'n'],
]

const expected_imp: LETKTruthValue[][] = [
  ['T', 't', 'b', 'f', 'F', 'n'],
  ['T', 't', 'b', 'f', 'F', 'n'],
  ['T', 't', 'b', 'f', 'F', 'n'],
  ['T', 't', 't', 't', 't', 't'],
  ['T', 'T', 'T', 'T', 'T', 'T'],
  ['T', 't', 't', 't', 't', 't'],
]

describe('LET_K+ six-valued twist semantics', () => {
  test('has the six legal twist values in canonical state order', () => {
    expect(LETK_VALUES).toEqual(TABLE_ORDER)
  })

  test('matches the published negation and reliability tables', () => {
    expect(TABLE_ORDER.map(letk_not)).toEqual(['F', 'f', 'b', 't', 'T', 'n'])
    expect(TABLE_ORDER.map(letk_reliability)).toEqual(['T', 'F', 'F', 'F', 'T', 'F'])
  })

  test.each([
    ['conjunction', letk_and, expected_and],
    ['disjunction', letk_or, expected_or],
    ['implication', letk_imp, expected_imp],
  ] as const)('matches every published %s table entry', (_name, operation, expected) => {
    expect(TABLE_ORDER.map((left) => TABLE_ORDER.map((right) => operation(left, right)))).toEqual(expected)
  })

  test('parser recognizes reliability and expands classical negation', () => {
    expect(assert_parse_sentence('○A')).toEqual({
      tag: 'reliability',
      sentence: { tag: 'letter', id: 'A', index: 0 },
    })
    expect(assert_parse_sentence('o~A')).toEqual({
      tag: 'reliability',
      sentence: { tag: 'negation', sentence: { tag: 'letter', id: 'A', index: 0 } },
    })
    expect(assert_parse_sentence('∼A')).toEqual({
      tag: 'conditional',
      left: { tag: 'letter', id: 'A', index: 0 },
      right: { tag: 'value', value: false },
    })
  })

  test('one letter induces the six values and six singleton regions', () => {
    const A = sentence_builder.letter('A')
    const table = new LETKTruthTable({ sentence: [A], real: [] })
    expect([...table.state_indices()].map((index) => table.letter_value6_from_index(A, index))).toEqual(TABLE_ORDER)
    const sets = compute_letk_value_sets(table, A)
    expect(sets.positive_indices).toEqual([0, 1, 2])
    expect(sets.negative_indices).toEqual([2, 3, 4])
    expect(sets.reliable_indices).toEqual([0, 4])

    const { and, or, not, reliable, imp, val } = sentence_builder
    const classical_not = (sentence: Sentence) => imp(sentence, val(false))
    const regions = [
      and(A, reliable(A)),
      and(A, classical_not(or(not(A), reliable(A)))),
      and(A, not(A)),
      and(not(A), classical_not(or(A, reliable(A)))),
      and(not(A), reliable(A)),
      classical_not(or(A, not(A))),
    ]
    expect(regions.map((region) => compute_letk_value_sets(table, region).positive_indices)).toEqual([
      [0], [1], [2], [3], [4], [5],
    ])
  })

  test('P1 probability translates to positive-extension mass', () => {
    const constraint = assert_parse_constraint('Pr(A) = 1')
    const table = new LETKTruthTable(variables_in_constraints([constraint]))
    const translated = translate_constraints_letk(table, [constraint])[0]!
    expect(translated).toEqual(constraint_builder.eq(real_expr_builder.svs([0, 1, 2]), real_expr_builder.lit(1)))
  })

  test('formula evaluation returns the expected conflict value', () => {
    const sentence = assert_parse_sentence('A & ~A')
    expect(evaluate_letk_sentence(() => 'b', sentence)).toBe('b')
  })
})

describe('probability theorems and models from the paper', () => {
  const set_equal = (left: number[], right: number[]): boolean =>
    left.length === right.length && left.every((value, index) => value === right[index])
  const complement = (universe_size: number, indices: number[]): number[] => {
    const included = new Set(indices)
    return Array.from({ length: universe_size }, (_, index) => index).filter((index) => !included.has(index))
  }
  const subset = (left: number[], right: number[]): boolean => {
    const right_set = new Set(right)
    return left.every((index) => right_set.has(index))
  }
  const mass = (weights: number[], indices: number[]): number =>
    indices.reduce((sum, index) => sum + weights[index]!, 0)

  test('Propositions 1 and 4 hold statewise for a two-letter formula family', () => {
    const formulas = [
      'A', '~A', '○A', 'A & B', 'A v B', 'A -> B',
      '~(A & B)', '○(A v ~B)', '(A -> B) & (~B -> ~A)',
    ].map(assert_parse_sentence)
    const all_constraints = formulas.map((formula) => constraint_builder.eq(real_expr_builder.pr(formula), real_expr_builder.lit(0)))
    const table = new LETKTruthTable(variables_in_constraints(all_constraints))

    for (const formula of formulas) {
      const positive = compute_letk_value_sets(table, formula).positive_indices
      const negative_formula = sentence_builder.not(formula)
      const negative = compute_letk_value_sets(table, negative_formula).positive_indices
      const reliable_formula = sentence_builder.reliable(formula)
      const reliable = compute_letk_value_sets(table, reliable_formula).positive_indices

      // Proposition 1(1-2): reliability is supported by a settled side and
      // never overlaps a glut.
      expect(subset(reliable, [...new Set([...positive, ...negative])].sort((a, b) => a - b))).toBe(true)
      expect(reliable.filter((index) => positive.includes(index) && negative.includes(index))).toEqual([])

      const excluded_middle = compute_letk_value_sets(
        table,
        sentence_builder.or(formula, sentence_builder.not(formula)),
      ).positive_indices
      // Proposition 4(4): p(○phi) <= p(phi v ~phi) for every measure.
      expect(subset(reliable, excluded_middle)).toBe(true)

      const classical_not = sentence_builder.imp(formula, sentence_builder.val(false))
      const classical_not_positive = compute_letk_value_sets(table, classical_not).positive_indices
      // Proposition 4(5-7): classical negation partitions the state space.
      expect(set_equal(classical_not_positive, complement(table.n_states(), positive))).toBe(true)
      expect(compute_letk_value_sets(table, sentence_builder.or(formula, classical_not)).positive_indices)
        .toEqual([...table.state_indices()])
      expect(compute_letk_value_sets(table, sentence_builder.and(formula, classical_not)).positive_indices)
        .toEqual([])

      // Proposition 4(3): reliable contradiction is a bottom particle.
      expect(compute_letk_value_sets(
        table,
        sentence_builder.and(sentence_builder.and(formula, negative_formula), reliable_formula),
      ).positive_indices).toEqual([])
    }
  })

  test('the inclusion-exclusion axiom holds pointwise for all 36 two-letter states', () => {
    const phi = assert_parse_sentence('A -> ○B')
    const psi = assert_parse_sentence('~A v B')
    const constraints = [phi, psi].map((formula) => constraint_builder.eq(real_expr_builder.pr(formula), real_expr_builder.lit(0)))
    const table = new LETKTruthTable(variables_in_constraints(constraints))
    const sets = [
      phi,
      psi,
      sentence_builder.and(phi, psi),
      sentence_builder.or(phi, psi),
    ].map((formula) => new Set(compute_letk_value_sets(table, formula).positive_indices))

    for (const state of table.state_indices()) {
      const indicator = sets.map((set) => set.has(state) ? 1 : 0)
      expect(indicator[0]! + indicator[1]!).toBe(indicator[2]! + indicator[3]!)
    }
  })

  test('Corollaries 1-3 recover the one-, three-, and six-dimensional probabilities', () => {
    const A = assert_parse_sentence('A')
    const table = new LETKTruthTable({ sentence: [{ tag: 'letter', id: 'A', index: 0 }], real: [] })
    const weights = [0.17, 0.13, 0.19, 0.11, 0.23, 0.17]
    const sets = compute_letk_value_sets(table, A)
    const six = TABLE_ORDER.map((value) => mass(weights, sets[value]))
    const one = mass(weights, sets.positive_indices)
    const three = [
      one,
      mass(weights, sets.negative_indices),
      mass(weights, sets.reliable_indices),
    ]

    expect(six.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1)
    expect(three[0]).toBeCloseTo(six[0]! + six[1]! + six[2]!)
    expect(three[1]).toBeCloseTo(six[4]! + six[3]! + six[2]!)
    expect(three[2]).toBeCloseTo(six[0]! + six[4]!)
    expect(one).toBeCloseTo(0.49)
  })

  test('Example 1 theistic-belief model has the advertised marginals', () => {
    // B°, B, C, D, D°, U population proportions.
    const weights = [0.20, 0.25, 0.10, 0.15, 0.20, 0.10]
    const table = new LETKTruthTable({ sentence: [{ tag: 'letter', id: 'A', index: 0 }], real: [] })
    const sets = compute_letk_value_sets(table, assert_parse_sentence('A'))
    expect(mass(weights, sets.positive_indices)).toBeCloseTo(0.55)
    expect(mass(weights, sets.negative_indices)).toBeCloseTo(0.45)
    expect(mass(weights, sets.reliable_indices)).toBeCloseTo(0.40)
  })

  test('Figure 5 and Proposition 14 form a 36-cell joint partition with correct marginals', () => {
    const A = { tag: 'letter', id: 'A', index: 0 } as const
    const B = { tag: 'letter', id: 'B', index: 0 } as const
    const table = new LETKTruthTable({ sentence: [A, B], real: [] })
    const weights = Array.from({ length: table.n_states() }, (_, index) => (index + 1) / 666)
    const A_sets = compute_letk_value_sets(table, A)
    const B_sets = compute_letk_value_sets(table, B)
    const joint_cells: number[][] = []

    for (const a_value of TABLE_ORDER) {
      for (const b_value of TABLE_ORDER) {
        const b_indices = new Set(B_sets[b_value])
        joint_cells.push(A_sets[a_value].filter((index) => b_indices.has(index)))
      }
    }
    expect(joint_cells).toHaveLength(36)
    expect(joint_cells.every((cell) => cell.length === 1)).toBe(true)
    expect(joint_cells.flat().sort((a, b) => a - b)).toEqual([...table.state_indices()])

    for (const [a_index, a_value] of TABLE_ORDER.entries()) {
      const row_mass = joint_cells.slice(a_index * 6, a_index * 6 + 6)
        .reduce((sum, cell) => sum + mass(weights, cell), 0)
      expect(row_mass).toBeCloseTo(mass(weights, A_sets[a_value]))
    }
    for (const [b_index, b_value] of TABLE_ORDER.entries()) {
      const column_mass = joint_cells.filter((_cell, index) => index % 6 === b_index)
        .reduce((sum, cell) => sum + mass(weights, cell), 0)
      expect(column_mass).toBeCloseTo(mass(weights, B_sets[b_value]))
    }
  })
})

describe('TwistPrSAT solvers', () => {
  test('Z3 finds a glut model and rejects reliable conflict', async () => {
    const z3 = await init_z3()
    if (z3 === undefined) throw new Error('Z3 failed to initialize')
    const solver = new WrappedSolver(z3, init_z3)

    const glut_constraints = [
      assert_parse_constraint('Pr(A) = 1'),
      assert_parse_constraint('Pr(~A) = 1'),
      assert_parse_constraint('Pr(○A) = 0'),
    ]
    const glut_table = new LETKTruthTable(variables_in_constraints(glut_constraints))
    expect((await letk_sat_wrapped(solver, glut_table, glut_constraints)).solver_output.status).toBe('sat')

    const impossible_constraints = [
      assert_parse_constraint('Pr(A & ~A & ○A) = 1'),
    ]
    const impossible_table = new LETKTruthTable(variables_in_constraints(impossible_constraints))
    expect((await letk_sat_wrapped(solver, impossible_table, impossible_constraints)).solver_output.status).toBe('unsat')
  })
})
