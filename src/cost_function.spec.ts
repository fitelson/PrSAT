import { describe, expect, test } from 'vitest'
import {
  normalize_constraint,
  evaluate_real_expr_number,
  build_cost_function,
  MATHEMATICA_MARGIN,
} from './cost_function'
import { constraint_builder, real_expr_builder } from './pr_sat'

const { lit, svs, plus } = real_expr_builder
const { eq, neq, gt, gte, lt, lte, cand, cor, cnot, cimp, ciff } = constraint_builder

describe('normalize_constraint', () => {
  test('atoms unchanged', () => {
    const c = eq(svs([0]), lit(0.5))
    expect(normalize_constraint(c)).toEqual(c)
  })

  test('negation flips comparator', () => {
    expect(normalize_constraint(cnot(lt(svs([0]), lit(0.5))))).toEqual(
      gte(svs([0]), lit(0.5)),
    )
    expect(normalize_constraint(cnot(eq(svs([0]), lit(0.5))))).toEqual(
      neq(svs([0]), lit(0.5)),
    )
    expect(normalize_constraint(cnot(gt(svs([0]), lit(0.5))))).toEqual(
      lte(svs([0]), lit(0.5)),
    )
  })

  test('double negation', () => {
    const c = gt(svs([0]), lit(0.5))
    expect(normalize_constraint(cnot(cnot(c)))).toEqual(c)
  })

  test('De Morgan — and', () => {
    const a = lt(svs([0]), lit(0.5))
    const b = gt(svs([1]), lit(0.5))
    expect(normalize_constraint(cnot(cand(a, b)))).toEqual(
      cor(gte(svs([0]), lit(0.5)), lte(svs([1]), lit(0.5))),
    )
  })

  test('De Morgan — or', () => {
    const a = lt(svs([0]), lit(0.5))
    const b = gt(svs([1]), lit(0.5))
    expect(normalize_constraint(cnot(cor(a, b)))).toEqual(
      cand(gte(svs([0]), lit(0.5)), lte(svs([1]), lit(0.5))),
    )
  })

  test('conditional expanded to disjunction', () => {
    const a = lt(svs([0]), lit(0.5))
    const b = gt(svs([1]), lit(0.5))
    // a -> b becomes ~a | b = (x>=0.5) | (x>0.5)
    expect(normalize_constraint(cimp(a, b))).toEqual(
      cor(gte(svs([0]), lit(0.5)), b),
    )
  })

  test('biconditional expanded', () => {
    const a = eq(svs([0]), lit(0.5))
    const b = eq(svs([1]), lit(0.5))
    // a <-> b = (a & b) | (~a & ~b) = (a & b) | (~a & ~b)
    //        = cor(cand(a, b), cand(neq(svs0,0.5), neq(svs1,0.5)))
    expect(normalize_constraint(ciff(a, b))).toEqual(
      cor(cand(a, b), cand(neq(svs([0]), lit(0.5)), neq(svs([1]), lit(0.5)))),
    )
  })
})

describe('evaluate_real_expr_number', () => {
  test('literal', () => {
    expect(evaluate_real_expr_number(lit(0.5), [])).toBe(0.5)
  })

  test('svs', () => {
    expect(evaluate_real_expr_number(svs([0, 2]), [0.1, 0.2, 0.3])).toBeCloseTo(0.4)
  })

  test('arithmetic', () => {
    expect(evaluate_real_expr_number(plus(svs([0]), lit(0.1)), [0.4])).toBeCloseTo(0.5)
  })

  test('free var throws', () => {
    expect(() => evaluate_real_expr_number(real_expr_builder.vbl('x'), [])).toThrow()
  })

  test('out-of-range svs throws', () => {
    expect(() => evaluate_real_expr_number(svs([5]), [0.1])).toThrow()
  })
})

describe('build_cost_function — atoms', () => {
  test('greater_than: Pr(A) > 1/2 — sign flips correctly', () => {
    // svs([0]) > 0.5, with margin = 1e-6
    const f = build_cost_function([gt(svs([0]), lit(0.5))])
    expect(f([0.4])).toBeGreaterThan(0)      // 0.4 < 0.5 violates
    expect(f([0.5])).toBeCloseTo(MATHEMATICA_MARGIN, 9) // boundary
    expect(f([0.6])).toBeLessThan(0)         // satisfies
    expect(f([0.6])).toBeCloseTo(-0.1 + MATHEMATICA_MARGIN, 5)
  })

  test('less_than', () => {
    const f = build_cost_function([lt(svs([0]), lit(0.5))])
    expect(f([0.4])).toBeLessThan(0)
    expect(f([0.6])).toBeGreaterThan(0)
  })

  test('greater_than_or_equal (no margin)', () => {
    const f = build_cost_function([gte(svs([0]), lit(0.5))])
    expect(f([0.5])).toBeCloseTo(0, 15)  // boundary exactly satisfies
    expect(f([0.6])).toBeCloseTo(-0.1)
    expect(f([0.4])).toBeCloseTo(0.1)
  })

  test('equal — negative within margin, positive outside', () => {
    const f = build_cost_function([eq(svs([0]), lit(0.5))])
    const m2 = MATHEMATICA_MARGIN * MATHEMATICA_MARGIN
    expect(f([0.5])).toBeCloseTo(-m2, 15)  // exactly satisfied
    expect(f([0.5 + MATHEMATICA_MARGIN / 2])).toBeLessThan(0) // within margin
    expect(f([0.6])).toBeCloseTo(0.01 - m2, 4) // (0.6-0.5)^2 = 0.01; minus m2 negligible
    expect(f([0.6])).toBeGreaterThan(0)
  })

  test('not_equal', () => {
    const f = build_cost_function([neq(svs([0]), lit(0.5))])
    expect(f([0.5])).toBeCloseTo(MATHEMATICA_MARGIN * MATHEMATICA_MARGIN, 15)  // d=0 → m^2 positive (violation)
    expect(f([0.6])).toBeLessThan(0)  // m^2 - 0.01 < 0
  })
})

describe('build_cost_function — compounds', () => {
  test('conjunction = max', () => {
    // Pr(A) > 0.5 AND Pr(A) < 0.8
    const f = build_cost_function([
      gt(svs([0]), lit(0.5)),
      lt(svs([0]), lit(0.8)),
    ])
    expect(f([0.7])).toBeLessThan(0)   // both satisfied
    expect(f([0.4])).toBeGreaterThan(0) // first violated
    expect(f([0.9])).toBeGreaterThan(0) // second violated
  })

  test('disjunction = min', () => {
    // (Pr(A) = 1/2) OR (Pr(A) = 1/4)
    const f = build_cost_function([cor(eq(svs([0]), lit(0.5)), eq(svs([0]), lit(0.25)))])
    expect(f([0.5])).toBeLessThan(0)    // first branch satisfies
    expect(f([0.25])).toBeLessThan(0)   // second branch satisfies
    expect(f([0.3])).toBeGreaterThan(0) // neither close enough
  })

  test('normalization handles ~(Pr(A) < 1/2) as ≥', () => {
    // ~(Pr(A) < 1/2) is equivalent to Pr(A) >= 1/2
    const f1 = build_cost_function([cnot(lt(svs([0]), lit(0.5)))])
    const f2 = build_cost_function([gte(svs([0]), lit(0.5))])
    for (const x of [0.3, 0.5, 0.7]) {
      expect(f1([x])).toBe(f2([x]))
    }
  })

  test('empty constraint list is trivially satisfied', () => {
    const f = build_cost_function([])
    expect(f([0.1, 0.2])).toBeLessThan(0)
  })

  test('custom margin', () => {
    const f = build_cost_function([gt(svs([0]), lit(0.5))], { margin: 0.1 })
    // cost = 0.1 + (0.5 - x)
    expect(f([0.5])).toBeCloseTo(0.1)
    expect(f([0.61])).toBeCloseTo(-0.01)
  })
})
