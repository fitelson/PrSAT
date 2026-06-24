// Exact rational arithmetic + continued-fraction rationalization +
// rational-valued evaluators for RealExpr and Constraint.
//
// Used by the random-search solver (random_search.ts) to verify that a
// numerical candidate is a genuine satisfying assignment under exact arithmetic,
// mirroring Mathematica's `Rationalize` + `Verify` pipeline in
// PrSAT.m (lines 962–990, ~960).

import { PrSat } from './types'

type RealExpr = PrSat['RealExpr']
type Constraint = PrSat['Constraint']

// Normalized: d > 0 and gcd(|n|, d) = 1. Enforced by every constructor/op.
export type Rational = { n: bigint, d: bigint }

const gcd_bigint = (a: bigint, b: bigint): bigint => {
  a = a < 0n ? -a : a
  b = b < 0n ? -b : b
  while (b !== 0n) {
    const t = b
    b = a % b
    a = t
  }
  return a
}

const normalize = (n: bigint, d: bigint): Rational => {
  if (d === 0n) throw new Error('Rational denominator is zero')
  if (d < 0n) { n = -n; d = -d }
  if (n === 0n) return { n: 0n, d: 1n }
  const g = gcd_bigint(n, d)
  return { n: n / g, d: d / g }
}

export const r_from_int = (n: number | bigint): Rational => {
  const bn = typeof n === 'bigint' ? n : BigInt(n)
  return { n: bn, d: 1n }
}

export const r_from_fraction = (n: number | bigint, d: number | bigint): Rational => {
  const bn = typeof n === 'bigint' ? n : BigInt(n)
  const bd = typeof d === 'bigint' ? d : BigInt(d)
  return normalize(bn, bd)
}

export const ZERO: Rational = { n: 0n, d: 1n }
export const ONE: Rational = { n: 1n, d: 1n }

export const r_neg = (r: Rational): Rational => ({ n: -r.n, d: r.d })

export const r_add = (a: Rational, b: Rational): Rational =>
  normalize(a.n * b.d + b.n * a.d, a.d * b.d)

export const r_sub = (a: Rational, b: Rational): Rational =>
  normalize(a.n * b.d - b.n * a.d, a.d * b.d)

export const r_mul = (a: Rational, b: Rational): Rational =>
  normalize(a.n * b.n, a.d * b.d)

export const r_div = (a: Rational, b: Rational): Rational => {
  if (b.n === 0n) throw new Error('Division by zero in rational arithmetic')
  return normalize(a.n * b.d, a.d * b.n)
}

export const r_pow_int = (r: Rational, exp: bigint): Rational => {
  if (exp === 0n) {
    if (r.n === 0n) throw new Error('0^0 is undefined in rational arithmetic')
    return ONE
  }
  if (exp < 0n) {
    if (r.n === 0n) throw new Error('Negative power of zero in rational arithmetic')
    return r_pow_int({ n: r.d * (r.n < 0n ? -1n : 1n), d: r.n < 0n ? -r.n : r.n }, -exp)
  }
  // Exponentiation by squaring on BigInt
  let base_n = r.n, base_d = r.d
  let acc_n = 1n, acc_d = 1n
  let e = exp
  while (e > 0n) {
    if ((e & 1n) === 1n) { acc_n *= base_n; acc_d *= base_d }
    base_n *= base_n
    base_d *= base_d
    e >>= 1n
  }
  return normalize(acc_n, acc_d)
}

export const r_sign = (r: Rational): -1 | 0 | 1 =>
  r.n === 0n ? 0 : r.n > 0n ? 1 : -1

export const r_cmp = (a: Rational, b: Rational): -1 | 0 | 1 => {
  const diff = a.n * b.d - b.n * a.d  // d's are positive so comparison preserved
  return diff === 0n ? 0 : diff > 0n ? 1 : -1
}

export const r_eq = (a: Rational, b: Rational): boolean => r_cmp(a, b) === 0

export const r_to_number = (r: Rational): number => Number(r.n) / Number(r.d)

export const r_to_string = (r: Rational): string =>
  r.d === 1n ? r.n.toString() : `${r.n.toString()}/${r.d.toString()}`

// Continued-fraction rationalization: return the simplest p/q with |x - p/q| < tol.
// Uses standard convergent recurrence
//     h_{-1}=1, h_{-2}=0, k_{-1}=0, k_{-2}=1
//     a_i = floor(remainder); h_i = a_i*h_{i-1} + h_{i-2}; k_i = a_i*k_{i-1} + k_{i-2}
// and stops at the first convergent within tol.
export const rationalize = (x: number, tol: number): Rational => {
  if (!Number.isFinite(x)) throw new Error(`rationalize: non-finite input ${x}`)
  if (tol <= 0) throw new Error(`rationalize: non-positive tol ${tol}`)

  // Handle exact integers quickly.
  if (Number.isInteger(x)) return r_from_int(BigInt(x))

  const sign = x < 0 ? -1n : 1n
  let rem = Math.abs(x)

  let h_prev = 0n, h_curr = 1n  // numerator convergents
  let k_prev = 1n, k_curr = 0n  // denominator convergents

  // 200 iterations is well beyond what double precision supports.
  for (let i = 0; i < 200; i++) {
    const a_i = Math.floor(rem)
    const a_bi = BigInt(a_i)

    const h_next = a_bi * h_curr + h_prev
    const k_next = a_bi * k_curr + k_prev

    h_prev = h_curr; h_curr = h_next
    k_prev = k_curr; k_curr = k_next

    // Check tolerance
    const approx = Number(h_curr) / Number(k_curr)
    if (Math.abs(Math.abs(x) - approx) < tol) {
      return normalize(sign * h_curr, k_curr)
    }

    const frac = rem - a_i
    if (frac === 0) {
      return normalize(sign * h_curr, k_curr)
    }
    rem = 1 / frac
    if (!Number.isFinite(rem)) {
      return normalize(sign * h_curr, k_curr)
    }
  }
  return normalize(sign * h_curr, k_curr)
}

// Exact rational evaluator for RealExpr.
// Assumes the expression has been translated so all Pr(...) have become
// state_variable_sum. Returns an error for variable / probability /
// given_probability (free real vars or untranslated probability terms), or
// for non-integer power exponents.
export type EvalResult = { tag: 'ok', value: Rational } | { tag: 'error', reason: string }

export const evaluate_real_expr_rational = (
  expr: RealExpr,
  state_values: Record<number, Rational>,
): EvalResult => {
  const sub = (e: RealExpr): EvalResult => evaluate_real_expr_rational(e, state_values)

  if (expr.tag === 'literal') {
    // Literals are non-negative numbers (asserted in real_expr_builder.lit).
    // They may be integer (5) or rational decimal (0.5); rationalize with a
    // very tight tolerance so 0.5 becomes exactly 1/2.
    return { tag: 'ok', value: rationalize(expr.value, 1e-15) }
  }
  if (expr.tag === 'state_variable_sum') {
    let acc: Rational = ZERO
    for (const i of expr.indices) {
      const v = state_values[i]
      if (v === undefined) return { tag: 'error', reason: `no rational value for state index ${i}` }
      acc = r_add(acc, v)
    }
    return { tag: 'ok', value: acc }
  }
  if (expr.tag === 'variable') {
    return { tag: 'error', reason: `free real variable '${expr.id}' not supported by random search` }
  }
  if (expr.tag === 'probability' || expr.tag === 'given_probability') {
    return { tag: 'error', reason: `probability term survived translation — this is a bug` }
  }
  if (expr.tag === 'ite') {
    const condition = evaluate_constraint_rational(expr.condition, state_values)
    if (condition.tag !== 'ok') return condition
    return sub(condition.value ? expr.then_expr : expr.else_expr)
  }
  if (expr.tag === 'negative') {
    const inner = sub(expr.expr)
    if (inner.tag !== 'ok') return inner
    return { tag: 'ok', value: r_neg(inner.value) }
  }
  if (expr.tag === 'plus' || expr.tag === 'minus' || expr.tag === 'multiply' || expr.tag === 'divide') {
    const l = sub(expr.tag === 'divide' ? expr.numerator : expr.left)
    if (l.tag !== 'ok') return l
    const r = sub(expr.tag === 'divide' ? expr.denominator : expr.right)
    if (r.tag !== 'ok') return r
    if (expr.tag === 'plus') return { tag: 'ok', value: r_add(l.value, r.value) }
    if (expr.tag === 'minus') return { tag: 'ok', value: r_sub(l.value, r.value) }
    if (expr.tag === 'multiply') return { tag: 'ok', value: r_mul(l.value, r.value) }
    if (r.value.n === 0n) return { tag: 'error', reason: 'division by zero in rational evaluation' }
    return { tag: 'ok', value: r_div(l.value, r.value) }
  }
  if (expr.tag === 'power') {
    const base = sub(expr.base)
    if (base.tag !== 'ok') return base
    const exp = sub(expr.exponent)
    if (exp.tag !== 'ok') return exp
    if (exp.value.d !== 1n) {
      return { tag: 'error', reason: `non-integer exponent ${r_to_string(exp.value)} not supported by random search` }
    }
    try {
      return { tag: 'ok', value: r_pow_int(base.value, exp.value.n) }
    } catch (e) {
      return { tag: 'error', reason: (e as Error).message }
    }
  }
  return { tag: 'error', reason: `evaluate_real_expr_rational fallthrough` }
}

export type ConstraintEvalResult = { tag: 'ok', value: boolean } | { tag: 'error', reason: string }

export const evaluate_constraint_rational = (
  c: Constraint,
  state_values: Record<number, Rational>,
): ConstraintEvalResult => {
  const sub = (cc: Constraint): ConstraintEvalResult => evaluate_constraint_rational(cc, state_values)
  const re = (e: RealExpr): EvalResult => evaluate_real_expr_rational(e, state_values)

  if (c.tag === 'equal' || c.tag === 'not_equal' || c.tag === 'less_than'
    || c.tag === 'less_than_or_equal' || c.tag === 'greater_than' || c.tag === 'greater_than_or_equal') {
    const l = re(c.left)
    if (l.tag !== 'ok') return l
    const r = re(c.right)
    if (r.tag !== 'ok') return r
    const cmp = r_cmp(l.value, r.value)
    if (c.tag === 'equal') return { tag: 'ok', value: cmp === 0 }
    if (c.tag === 'not_equal') return { tag: 'ok', value: cmp !== 0 }
    if (c.tag === 'less_than') return { tag: 'ok', value: cmp < 0 }
    if (c.tag === 'less_than_or_equal') return { tag: 'ok', value: cmp <= 0 }
    if (c.tag === 'greater_than') return { tag: 'ok', value: cmp > 0 }
    return { tag: 'ok', value: cmp >= 0 }
  }
  if (c.tag === 'negation') {
    const inner = sub(c.constraint)
    if (inner.tag !== 'ok') return inner
    return { tag: 'ok', value: !inner.value }
  }
  if (c.tag === 'conjunction') {
    const l = sub(c.left); if (l.tag !== 'ok') return l
    const r = sub(c.right); if (r.tag !== 'ok') return r
    return { tag: 'ok', value: l.value && r.value }
  }
  if (c.tag === 'disjunction') {
    const l = sub(c.left); if (l.tag !== 'ok') return l
    const r = sub(c.right); if (r.tag !== 'ok') return r
    return { tag: 'ok', value: l.value || r.value }
  }
  if (c.tag === 'conditional') {
    const l = sub(c.left); if (l.tag !== 'ok') return l
    const r = sub(c.right); if (r.tag !== 'ok') return r
    return { tag: 'ok', value: !l.value || r.value }
  }
  if (c.tag === 'biconditional') {
    const l = sub(c.left); if (l.tag !== 'ok') return l
    const r = sub(c.right); if (r.tag !== 'ok') return r
    return { tag: 'ok', value: l.value === r.value }
  }
  return { tag: 'error', reason: 'evaluate_constraint_rational fallthrough' }
}

// Verify a rational assignment satisfies every (translated) constraint.
// Returns:
//   - { tag: 'ok', value: true }   if every constraint evaluates to true
//   - { tag: 'ok', value: false }  if any constraint evaluates to false
//   - { tag: 'error', reason }     if evaluation failed on any constraint
//                                  (e.g. non-integer power, free var)
export const verify_rational_model = (
  translated_constraints: Constraint[],
  state_values: Record<number, Rational>,
): ConstraintEvalResult => {
  for (const c of translated_constraints) {
    const r = evaluate_constraint_rational(c, state_values)
    if (r.tag !== 'ok') return r
    if (!r.value) return { tag: 'ok', value: false }
  }
  return { tag: 'ok', value: true }
}
