import { describe, expect, test } from 'vitest'
import {
  Rational, ONE, ZERO,
  r_from_int, r_from_fraction, r_add, r_sub, r_mul, r_div, r_neg,
  r_pow_int, r_sign, r_cmp, r_eq, r_to_number, r_to_string,
  rationalize,
  evaluate_real_expr_rational,
  evaluate_constraint_rational,
  verify_rational_model,
} from './rationalize'
import { constraint_builder, real_expr_builder } from './pr_sat'

const { lit, svs, plus, divide, power, neg } = real_expr_builder
const { eq, neq, gt, gte, lt, lte, cand, cor, cnot, cimp, ciff } = constraint_builder

const R = r_from_fraction

describe('Rational arithmetic', () => {
  test('constructors normalize', () => {
    expect(R(2, 4)).toEqual({ n: 1n, d: 2n })
    expect(R(-2, 4)).toEqual({ n: -1n, d: 2n })
    expect(R(2, -4)).toEqual({ n: -1n, d: 2n })  // denom sign flipped
    expect(R(-2, -4)).toEqual({ n: 1n, d: 2n })
    expect(R(0, 5)).toEqual({ n: 0n, d: 1n })
  })

  test('zero-denominator throws', () => {
    expect(() => R(1, 0)).toThrow()
  })

  test('arithmetic basics', () => {
    expect(r_add(R(1, 2), R(1, 3))).toEqual(R(5, 6))
    expect(r_sub(R(1, 2), R(1, 3))).toEqual(R(1, 6))
    expect(r_mul(R(2, 3), R(3, 4))).toEqual(R(1, 2))
    expect(r_div(R(1, 2), R(3, 4))).toEqual(R(2, 3))
    expect(r_neg(R(3, 4))).toEqual(R(-3, 4))
  })

  test('divide by zero throws', () => {
    expect(() => r_div(ONE, ZERO)).toThrow()
  })

  test('integer powers', () => {
    expect(r_pow_int(R(2, 3), 3n)).toEqual(R(8, 27))
    expect(r_pow_int(R(2, 3), 0n)).toEqual(ONE)
    expect(r_pow_int(R(2, 3), -2n)).toEqual(R(9, 4))
    expect(r_pow_int(R(-2, 3), 2n)).toEqual(R(4, 9))
    expect(r_pow_int(R(-2, 3), 3n)).toEqual(R(-8, 27))
  })

  test('power edge cases', () => {
    expect(() => r_pow_int(ZERO, 0n)).toThrow()
    expect(() => r_pow_int(ZERO, -1n)).toThrow()
    expect(r_pow_int(ZERO, 3n)).toEqual(ZERO)
  })

  test('sign / compare / equal', () => {
    expect(r_sign(R(3, 4))).toBe(1)
    expect(r_sign(R(-3, 4))).toBe(-1)
    expect(r_sign(ZERO)).toBe(0)
    expect(r_cmp(R(1, 2), R(1, 3))).toBe(1)
    expect(r_cmp(R(1, 3), R(1, 2))).toBe(-1)
    expect(r_cmp(R(2, 4), R(1, 2))).toBe(0)
    expect(r_eq(R(2, 4), R(1, 2))).toBe(true)
  })

  test('conversion helpers', () => {
    expect(r_to_number(R(1, 4))).toBe(0.25)
    expect(r_to_string(R(1, 4))).toBe('1/4')
    expect(r_to_string(r_from_int(7))).toBe('7')
  })
})

describe('rationalize() — continued-fraction', () => {
  test('exact quarter', () => {
    expect(rationalize(0.25, 1e-9)).toEqual(R(1, 4))
  })

  test('one third (non-terminating decimal)', () => {
    expect(rationalize(1 / 3, 1e-9)).toEqual(R(1, 3))
  })

  test('one sixth', () => {
    expect(rationalize(1 / 6, 1e-9)).toEqual(R(1, 6))
  })

  test('seven eighths', () => {
    expect(rationalize(7 / 8, 1e-9)).toEqual(R(7, 8))
  })

  test('negative fraction', () => {
    expect(rationalize(-3 / 7, 1e-9)).toEqual(R(-3, 7))
  })

  test('integer rationalization', () => {
    expect(rationalize(5, 1e-9)).toEqual(R(5, 1))
    expect(rationalize(-5, 1e-9)).toEqual(R(-5, 1))
    expect(rationalize(0, 1e-9)).toEqual(R(0, 1))
  })

  test('sqrt(2)/2 is close but not exact', () => {
    const target = Math.SQRT1_2  // = sqrt(2)/2 ≈ 0.7071067811865476
    const r = rationalize(target, 1e-10)
    // Should be within tol of target
    expect(Math.abs(r_to_number(r) - target)).toBeLessThan(1e-10)
    // And definitely not 1/2 or 3/4 — must use a large denominator
    expect(r.d).toBeGreaterThan(1000n)
  })

  test('looser tolerance produces simpler fraction', () => {
    const target = Math.SQRT1_2
    const r_loose = rationalize(target, 1e-2)
    const r_tight = rationalize(target, 1e-10)
    expect(r_loose.d).toBeLessThan(r_tight.d)
  })

  test('non-finite input throws', () => {
    expect(() => rationalize(NaN, 1e-9)).toThrow()
    expect(() => rationalize(Infinity, 1e-9)).toThrow()
  })
})

describe('evaluate_real_expr_rational', () => {
  const state: Record<number, Rational> = {
    0: R(1, 4),  // a_1 = 1/4
    1: R(1, 3),  // a_2 = 1/3
    2: R(5, 12), // a_3 = 5/12
  }

  test('literal', () => {
    const r = evaluate_real_expr_rational(lit(0.5), state)
    expect(r).toEqual({ tag: 'ok', value: R(1, 2) })
  })

  test('state_variable_sum', () => {
    const r = evaluate_real_expr_rational(svs([0, 1]), state)
    expect(r).toEqual({ tag: 'ok', value: R(7, 12) })
  })

  test('state_variable_sum (all three → 1)', () => {
    const r = evaluate_real_expr_rational(svs([0, 1, 2]), state)
    expect(r).toEqual({ tag: 'ok', value: ONE })
  })

  test('arithmetic', () => {
    const r = evaluate_real_expr_rational(plus(lit(0.5), lit(0.25)), state)
    expect(r).toEqual({ tag: 'ok', value: R(3, 4) })
  })

  test('nested', () => {
    // (a_1 + a_2) / a_3 = (7/12) / (5/12) = 7/5
    const expr = divide(plus(svs([0]), svs([1])), svs([2]))
    const r = evaluate_real_expr_rational(expr, state)
    expect(r).toEqual({ tag: 'ok', value: R(7, 5) })
  })

  test('integer power', () => {
    const expr = power(lit(0.5), lit(3))
    const r = evaluate_real_expr_rational(expr, state)
    expect(r).toEqual({ tag: 'ok', value: R(1, 8) })
  })

  test('non-integer power → error', () => {
    const expr = power(lit(0.5), divide(lit(1), lit(2)))
    const r = evaluate_real_expr_rational(expr, state)
    expect(r.tag).toBe('error')
  })

  test('free variable → error', () => {
    const r = evaluate_real_expr_rational(real_expr_builder.vbl('x'), state)
    expect(r.tag).toBe('error')
  })

  test('untranslated probability → error', () => {
    const r = evaluate_real_expr_rational(real_expr_builder.pr({ tag: 'letter', id: 'A', index: 0 }), state)
    expect(r.tag).toBe('error')
  })

  test('negation', () => {
    const r = evaluate_real_expr_rational(neg(svs([0])), state)
    expect(r).toEqual({ tag: 'ok', value: R(-1, 4) })
  })
})

describe('evaluate_constraint_rational', () => {
  const state: Record<number, Rational> = {
    0: R(1, 3),
    1: R(2, 3),
  }

  test('equality true', () => {
    const c = eq(svs([0]), divide(lit(1), lit(3)))
    expect(evaluate_constraint_rational(c, state)).toEqual({ tag: 'ok', value: true })
  })

  test('equality false', () => {
    const c = eq(svs([0]), lit(0.5))
    expect(evaluate_constraint_rational(c, state)).toEqual({ tag: 'ok', value: false })
  })

  test('comparisons', () => {
    expect(evaluate_constraint_rational(lt(svs([0]), svs([1])), state)).toEqual({ tag: 'ok', value: true })
    expect(evaluate_constraint_rational(gt(svs([0]), svs([1])), state)).toEqual({ tag: 'ok', value: false })
    expect(evaluate_constraint_rational(gte(plus(svs([0]), svs([1])), lit(1)), state)).toEqual({ tag: 'ok', value: true })
    expect(evaluate_constraint_rational(lte(svs([0]), svs([1])), state)).toEqual({ tag: 'ok', value: true })
    expect(evaluate_constraint_rational(neq(svs([0]), svs([1])), state)).toEqual({ tag: 'ok', value: true })
  })

  test('logical connectives', () => {
    const c_true = eq(svs([0]), divide(lit(1), lit(3)))
    const c_false = eq(svs([0]), lit(0.5))
    expect(evaluate_constraint_rational(cand(c_true, c_false), state)).toEqual({ tag: 'ok', value: false })
    expect(evaluate_constraint_rational(cor(c_true, c_false), state)).toEqual({ tag: 'ok', value: true })
    expect(evaluate_constraint_rational(cnot(c_false), state)).toEqual({ tag: 'ok', value: true })
    expect(evaluate_constraint_rational(cimp(c_false, c_true), state)).toEqual({ tag: 'ok', value: true })  // false → anything
    expect(evaluate_constraint_rational(ciff(c_true, c_true), state)).toEqual({ tag: 'ok', value: true })
  })

  test('error propagation', () => {
    const c = eq(real_expr_builder.vbl('x'), lit(0))  // free variable
    const r = evaluate_constraint_rational(c, state)
    expect(r.tag).toBe('error')
  })
})

describe('verify_rational_model', () => {
  test('all true → ok(true)', () => {
    // a_1 + a_2 = 1, a_1 = 1/3
    const state = { 0: R(1, 3), 1: R(2, 3) }
    const constraints = [
      eq(svs([0]), divide(lit(1), lit(3))),
      eq(plus(svs([0]), svs([1])), lit(1)),
      gte(svs([0]), lit(0)),
      gte(svs([1]), lit(0)),
    ]
    expect(verify_rational_model(constraints, state)).toEqual({ tag: 'ok', value: true })
  })

  test('any false → ok(false)', () => {
    const state = { 0: R(1, 2), 1: R(1, 2) }
    const constraints = [
      eq(svs([0]), divide(lit(1), lit(3))),  // fails
      eq(plus(svs([0]), svs([1])), lit(1)),
    ]
    expect(verify_rational_model(constraints, state)).toEqual({ tag: 'ok', value: false })
  })

  test('error short-circuits', () => {
    const state = { 0: R(1, 2) }
    const constraints = [
      eq(real_expr_builder.vbl('x'), lit(0)),  // free var → error
      eq(svs([0]), lit(0.5)),
    ]
    const r = verify_rational_model(constraints, state)
    expect(r.tag).toBe('error')
  })
})
