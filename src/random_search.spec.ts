import { describe, expect, test } from 'vitest'
import {
  random_pr_sat,
  random_pr_sat_wrapped,
  sample_dirichlet_ones,
  rational_to_model_assignment,
  try_rationalize_and_verify,
} from './random_search'
import {
  TruthTable,
  real_expr_builder,
  constraint_builder,
  sentence_builder,
  variables_in_constraints,
} from './pr_sat'
import { Random } from './random'
import { r_from_fraction, ONE, ZERO } from './rationalize'
import { PrSat } from './types'

type Constraint = PrSat['Constraint']

const { pr, lit, power } = real_expr_builder
const { eq, gt, lt, cand } = constraint_builder
const { letter } = sentence_builder

const A = letter('A')
const B = letter('B')
const Pr_A = pr(A)
const Pr_B = pr(B)

describe('sample_dirichlet_ones', () => {
  test('sums to 1 and is nonneg', () => {
    const r = new Random('dirichlet-test')
    for (let n = 1; n <= 16; n++) {
      const v = sample_dirichlet_ones(r, n)
      expect(v.length).toBe(n)
      for (const x of v) expect(x).toBeGreaterThanOrEqual(0)
      const sum = v.reduce((a, b) => a + b, 0)
      expect(sum).toBeCloseTo(1, 10)
    }
  })

  test('deterministic with seed', () => {
    const v1 = sample_dirichlet_ones(new Random('seed-xyz'), 5)
    const v2 = sample_dirichlet_ones(new Random('seed-xyz'), 5)
    expect(v1).toEqual(v2)
  })

  test('different seeds produce different samples', () => {
    const v1 = sample_dirichlet_ones(new Random('a'), 5)
    const v2 = sample_dirichlet_ones(new Random('b'), 5)
    expect(v1).not.toEqual(v2)
  })
})

describe('rational_to_model_assignment', () => {
  test('zero', () => {
    expect(rational_to_model_assignment(ZERO)).toEqual({ tag: 'literal', value: 0 })
  })
  test('positive integer', () => {
    expect(rational_to_model_assignment(ONE)).toEqual({ tag: 'literal', value: 1 })
  })
  test('negative integer', () => {
    expect(rational_to_model_assignment(r_from_fraction(-5, 1))).toEqual({
      tag: 'negative',
      inner: { tag: 'literal', value: 5 },
    })
  })
  test('positive rational', () => {
    expect(rational_to_model_assignment(r_from_fraction(3, 7))).toEqual({
      tag: 'rational',
      numerator: { tag: 'literal', value: 3 },
      denominator: { tag: 'literal', value: 7 },
    })
  })
  test('negative rational', () => {
    expect(rational_to_model_assignment(r_from_fraction(-3, 7))).toEqual({
      tag: 'negative',
      inner: {
        tag: 'rational',
        numerator: { tag: 'literal', value: 3 },
        denominator: { tag: 'literal', value: 7 },
      },
    })
  })
})

describe('try_rationalize_and_verify', () => {
  test('verifies trivial SAT case', () => {
    // a_0 = 1/2 (2 atoms, sum to 1). Numerical x = [0.5].
    const constraints: Constraint[] = [
      eq(real_expr_builder.svs([0]), lit(0.5)),
      // Probability axioms manually (to mimic what enrich_constraints would add):
      // a_0 >= 0, a_0 <= 1  -- already in [0, 1] by input xs
    ]
    const r = try_rationalize_and_verify([0.5], constraints, 1e-3, 40)
    expect(r).toBeDefined()
    expect(r![0]).toEqual({ n: 1n, d: 2n })
    expect(r![1]).toEqual({ n: 1n, d: 2n })
  })

  test('returns undefined for irrational target', () => {
    // sqrt(1/2)^2 = 1/2 would need a_0 = sqrt(1/2) ≈ 0.7071
    const constraints: Constraint[] = [
      eq(power(real_expr_builder.svs([0]), lit(2)), lit(0.5)),
    ]
    const r = try_rationalize_and_verify([Math.SQRT1_2], constraints, 1e-3, 40)
    expect(r).toBeUndefined()
  })
})

describe('random_pr_sat — integration', () => {
  test('SAT: Pr(A) = 1/2', async () => {
    const constraints = [eq(Pr_A, lit(0.5))]
    const result = await random_pr_sat(constraints, { seed: 'sat-test-1' })
    expect(result.method).toBe('random')
    expect(result.solver_output.status).toBe('sat')
    if (result.solver_output.status === 'sat') {
      // Two atoms, both should sum to 1, and the dnf(A) atom = 1/2.
      const sa = result.solver_output.state_assignments
      expect(Object.keys(sa).length).toBe(2)
    }
  })

  test('SAT: Pr(A) > 1/2 & Pr(A) < 0.9', async () => {
    const constraints = [
      gt(Pr_A, lit(0.5)),
      lt(Pr_A, lit(0.9)),
    ]
    const result = await random_pr_sat(constraints, { seed: 'sat-range' })
    expect(result.solver_output.status).toBe('sat')
  })

  test('SAT with two letters: Pr(A) = 1/3, Pr(B) = 1/2', async () => {
    const constraints = [
      eq(Pr_A, r_to_div_lit(1, 3)),
      eq(Pr_B, lit(0.5)),
    ]
    const result = await random_pr_sat(constraints, { seed: 'two-letters', search_attempts: 5 })
    // Depending on how random search goes, this may succeed or return unknown.
    // We just want to make sure it doesn't crash.
    expect(['sat', 'unknown']).toContain(result.solver_output.status)
  })

  test('UNKNOWN for irrational: Pr(A)^2 = 1/2', async () => {
    // a_0^2 = 1/2 → a_0 = sqrt(1/2) irrational; rational verification will fail.
    const constraints = [eq(power(Pr_A, lit(2)), lit(0.5))]
    const result = await random_pr_sat(constraints, { seed: 'irrational' })
    expect(result.solver_output.status).toBe('unknown')
  })

  test('UNSAT for linear contradiction: Pr(A) = 1/2 & Pr(A) = 1/3', async () => {
    // Equation elimination derives the contradiction with constant-denominator
    // (pure linear) steps only, so UNSAT is sound here.
    const constraints = [cand(eq(Pr_A, lit(0.5)), eq(Pr_A, r_to_div_lit(1, 3)))]
    const result = await random_pr_sat([eq(Pr_A, lit(0.5)), eq(Pr_A, r_to_div_lit(1, 3))], { seed: 'unsat' })
    expect(result.solver_output.status).toBe('unsat')
    // Suppress unused-var warning
    void constraints
  })

  test('deterministic with fixed seed', async () => {
    const constraints = [gt(Pr_A, lit(0.5))]
    const r1 = await random_pr_sat(constraints, { seed: 'deterministic' })
    const r2 = await random_pr_sat(constraints, { seed: 'deterministic' })
    expect(r1.solver_output.status).toBe(r2.solver_output.status)
    if (r1.solver_output.status === 'sat' && r2.solver_output.status === 'sat') {
      expect(r1.solver_output.state_assignments).toEqual(r2.solver_output.state_assignments)
    }
    expect(r1.seed).toBe(r2.seed)
  })

  test('seed is included in result even when auto-generated', async () => {
    const constraints = [eq(Pr_A, lit(0.5))]
    const result = await random_pr_sat(constraints)
    expect(typeof result.seed).toBe('string')
    expect(result.seed.length).toBeGreaterThan(0)
  })

  test('0 letters — constraint list of empties', async () => {
    // Pr(T) = 1 should be satisfiable with no atoms at all.
    const trueSent = sentence_builder.val(true)
    const constraints = [eq(pr(trueSent), lit(1))]
    const result = await random_pr_sat(constraints, { seed: 'zero-letter' })
    expect(result.solver_output.status).toBe('sat')
  })

  test('cancel before any attempt — cancelled', async () => {
    const ac = new AbortController()
    ac.abort()
    const result = await random_pr_sat([gt(Pr_A, lit(0.5))], {
      seed: 'cancel',
      abort_signal: ac.signal,
    })
    expect(result.solver_output.status).toBe('cancelled')
  })

  test('onTranslated callback is invoked', async () => {
    let translated_arg: Constraint[] | undefined
    await random_pr_sat([gt(Pr_A, lit(0.5))], {
      seed: 'cb',
      onTranslated: (t) => { translated_arg = t },
    })
    expect(translated_arg).toBeDefined()
    expect(translated_arg!.length).toBe(1)
  })

  test('free real variable is rejected', async () => {
    const x = real_expr_builder.vbl('x')
    await expect(random_pr_sat([eq(Pr_A, x)], { seed: 'no-free' })).rejects.toThrow(/free real variable/)
  })
})

describe('random_pr_sat_wrapped with explicit TruthTable', () => {
  test('direct invocation matches variable list', async () => {
    const constraints = [eq(Pr_A, lit(0.5))]
    const tt = new TruthTable(variables_in_constraints(constraints))
    const result = await random_pr_sat_wrapped(tt, constraints, { seed: 'wrapped' })
    expect(result.constraints.original).toEqual(constraints)
    expect(result.constraints.translated.length).toBe(1)
    // enriched (no pre-elimination) = prob axioms (3: a_0 >= 0, a_1 >= 0, sum = 1) + div0 (0) + translated (1) = 4
    expect(result.constraints.extra.length).toBe(4)
  })
})

// Helper: build a "1/3" style literal via divide (since lit() won't accept 0.333...
// as exact). Using divide(lit(1), lit(3)) ensures exact rational translation.
function r_to_div_lit(n: number, d: number) {
  return real_expr_builder.divide(real_expr_builder.lit(n), real_expr_builder.lit(d))
}
