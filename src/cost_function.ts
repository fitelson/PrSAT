// Numeric cost function for random-search solver.
//
// Given a list of (translated, eliminated) constraints over state variables
// a_0..a_{n-2} (last state variable eliminated as 1 - sum), produces
//     f: number[] -> number
// such that f(x) < 0 iff all constraints are satisfied at x (within `margin`
// for strict comparisons and equalities). Adapted from Mathematica's PrSAT.m
// lines 904–914:
//
//   x == y   ->  (x - y)^2 - margin^2           [ diverged: relaxed to a margin ]
//   x != y   ->  margin^2 - (x - y)^2
//   x > y    ->  margin + y - x
//   x < y    ->  margin + x - y
//   x >= y   ->  y - x
//   x <= y   ->  x - y
//   a & b    ->  Math.max(f_a, f_b)
//   a | b    ->  Math.min(f_a, f_b)
//
// Divergence from Mathematica: Mathematica uses `ZeroJump[(x-y)^2, 0]` for
// equality (returning -1000 only at exact zero, else (x-y)^2). That relies on
// NMinimize achieving exact zero, which our Nelder-Mead cannot. We substitute a
// symmetric margin so that `x == y` behaves like `|x - y| <= margin` — the
// exact-arithmetic verification in random_search.ts then certifies the
// rationalized point.
//
// Negation / conditional / biconditional are rewritten away first via
// normalize_constraint (De Morgan + iff/imp expansion + atom flips).

import { PrSat } from './types'

type RealExpr = PrSat['RealExpr']
type Constraint = PrSat['Constraint']

export const MATHEMATICA_MARGIN = 1e-6

// ---------- Normalization ----------

// Flip an atomic comparison under negation: ~(x<y) becomes x>=y, etc.
const negate_atom = (c: Constraint): Constraint => {
  if (c.tag === 'equal') return { tag: 'not_equal', left: c.left, right: c.right }
  if (c.tag === 'not_equal') return { tag: 'equal', left: c.left, right: c.right }
  if (c.tag === 'less_than') return { tag: 'greater_than_or_equal', left: c.left, right: c.right }
  if (c.tag === 'less_than_or_equal') return { tag: 'greater_than', left: c.left, right: c.right }
  if (c.tag === 'greater_than') return { tag: 'less_than_or_equal', left: c.left, right: c.right }
  if (c.tag === 'greater_than_or_equal') return { tag: 'less_than', left: c.left, right: c.right }
  throw new Error(`negate_atom: not an atomic comparison: ${c.tag}`)
}

// Push negation inward; eliminate conditional/biconditional. Result contains
// only atomic comparisons (equal/not_equal/less_than/.../greater_than_or_equal)
// joined by conjunction and disjunction.
export const normalize_constraint = (c: Constraint): Constraint => {
  // Rewrite conditional and biconditional first, recursively.
  if (c.tag === 'conditional') {
    // a -> b  =  ~a | b
    return normalize_constraint({ tag: 'disjunction', left: { tag: 'negation', constraint: c.left }, right: c.right })
  }
  if (c.tag === 'biconditional') {
    // a <-> b  =  (a & b) | (~a & ~b)
    return normalize_constraint({
      tag: 'disjunction',
      left: { tag: 'conjunction', left: c.left, right: c.right },
      right: { tag: 'conjunction',
        left: { tag: 'negation', constraint: c.left },
        right: { tag: 'negation', constraint: c.right },
      },
    })
  }
  if (c.tag === 'conjunction' || c.tag === 'disjunction') {
    return { tag: c.tag, left: normalize_constraint(c.left), right: normalize_constraint(c.right) }
  }
  if (c.tag === 'negation') {
    const inner = c.constraint
    if (inner.tag === 'negation') {
      return normalize_constraint(inner.constraint)
    }
    if (inner.tag === 'conjunction') {
      // De Morgan: ~(a & b) = ~a | ~b
      return normalize_constraint({
        tag: 'disjunction',
        left: { tag: 'negation', constraint: inner.left },
        right: { tag: 'negation', constraint: inner.right },
      })
    }
    if (inner.tag === 'disjunction') {
      // De Morgan: ~(a | b) = ~a & ~b
      return normalize_constraint({
        tag: 'conjunction',
        left: { tag: 'negation', constraint: inner.left },
        right: { tag: 'negation', constraint: inner.right },
      })
    }
    if (inner.tag === 'conditional' || inner.tag === 'biconditional') {
      return normalize_constraint({ tag: 'negation', constraint: normalize_constraint(inner) })
    }
    // Atomic: flip the comparator.
    return negate_atom(inner)
  }
  // Atomic comparison — already normalized.
  return c
}

// ---------- Numeric RealExpr evaluation ----------

const NUMERIC_BOOL_TOLERANCE = 1e-12

const evaluate_constraint_bool_number = (c: Constraint, x: number[]): boolean => {
  const sub = (cc: Constraint) => evaluate_constraint_bool_number(cc, x)
  const cmp = (left: RealExpr, right: RealExpr) => evaluate_real_expr_number(left, x) - evaluate_real_expr_number(right, x)

  if (c.tag === 'equal') return Math.abs(cmp(c.left, c.right)) <= NUMERIC_BOOL_TOLERANCE
  if (c.tag === 'not_equal') return Math.abs(cmp(c.left, c.right)) > NUMERIC_BOOL_TOLERANCE
  if (c.tag === 'greater_than') return cmp(c.left, c.right) > 0
  if (c.tag === 'greater_than_or_equal') return cmp(c.left, c.right) >= 0
  if (c.tag === 'less_than') return cmp(c.left, c.right) < 0
  if (c.tag === 'less_than_or_equal') return cmp(c.left, c.right) <= 0
  if (c.tag === 'negation') return !sub(c.constraint)
  if (c.tag === 'conjunction') return sub(c.left) && sub(c.right)
  if (c.tag === 'disjunction') return sub(c.left) || sub(c.right)
  if (c.tag === 'conditional') return !sub(c.left) || sub(c.right)
  if (c.tag === 'biconditional') return sub(c.left) === sub(c.right)
  throw new Error(`evaluate_constraint_bool_number: fallthrough`)
}

// Evaluate a RealExpr to a Number given state variable assignments.
// Assumes the expression has been translated (no probability / given_probability)
// and eliminated (so state_variable_sum indices only refer to free variables,
// 0..n-2 in the eliminated-last convention). For indices outside x's range we
// throw — caller bug.
export const evaluate_real_expr_number = (expr: RealExpr, x: number[]): number => {
  const sub = (e: RealExpr) => evaluate_real_expr_number(e, x)

  if (expr.tag === 'literal') return expr.value
  if (expr.tag === 'state_variable_sum') {
    let acc = 0
    for (const i of expr.indices) {
      if (i < 0 || i >= x.length) {
        throw new Error(`evaluate_real_expr_number: state index ${i} out of bounds [0, ${x.length})`)
      }
      acc += x[i]!
    }
    return acc
  }
  if (expr.tag === 'variable') {
    throw new Error(`evaluate_real_expr_number: free real variable '${expr.id}' not supported by random search`)
  }
  if (expr.tag === 'probability' || expr.tag === 'given_probability') {
    throw new Error('evaluate_real_expr_number: untranslated probability term (should have been translate()d)')
  }
  if (expr.tag === 'negative') return -sub(expr.expr)
  if (expr.tag === 'plus') return sub(expr.left) + sub(expr.right)
  if (expr.tag === 'minus') return sub(expr.left) - sub(expr.right)
  if (expr.tag === 'multiply') return sub(expr.left) * sub(expr.right)
  if (expr.tag === 'ite') return sub(evaluate_constraint_bool_number(expr.condition, x) ? expr.then_expr : expr.else_expr)
  if (expr.tag === 'divide') return sub(expr.numerator) / sub(expr.denominator)
  if (expr.tag === 'power') return Math.pow(sub(expr.base), sub(expr.exponent))
  throw new Error(`evaluate_real_expr_number: fallthrough`)
}

// ---------- Cost function builder ----------

export type NumericFn = (x: number[]) => number

export type CostOptions = {
  margin: number  // default MATHEMATICA_MARGIN (1e-6)
}

const DEFAULT_COST_OPTIONS: CostOptions = { margin: MATHEMATICA_MARGIN }

// Build cost term for a single atomic comparison.
const atom_cost = (c: Constraint, margin: number): NumericFn => {
  if (c.tag === 'equal') {
    const { left, right } = c
    const m2 = margin * margin
    return (x) => {
      const d = evaluate_real_expr_number(left, x) - evaluate_real_expr_number(right, x)
      return d * d - m2
    }
  }
  if (c.tag === 'not_equal') {
    const { left, right } = c
    const m2 = margin * margin
    return (x) => {
      const d = evaluate_real_expr_number(left, x) - evaluate_real_expr_number(right, x)
      return m2 - d * d
    }
  }
  if (c.tag === 'greater_than') {
    const { left, right } = c
    return (x) => margin + evaluate_real_expr_number(right, x) - evaluate_real_expr_number(left, x)
  }
  if (c.tag === 'less_than') {
    const { left, right } = c
    return (x) => margin + evaluate_real_expr_number(left, x) - evaluate_real_expr_number(right, x)
  }
  if (c.tag === 'greater_than_or_equal') {
    const { left, right } = c
    return (x) => evaluate_real_expr_number(right, x) - evaluate_real_expr_number(left, x)
  }
  if (c.tag === 'less_than_or_equal') {
    const { left, right } = c
    return (x) => evaluate_real_expr_number(left, x) - evaluate_real_expr_number(right, x)
  }
  throw new Error(`atom_cost: not an atomic comparison: ${c.tag}`)
}

// Build a NumericFn for a normalized Constraint AST.
const constraint_cost = (c: Constraint, margin: number): NumericFn => {
  if (c.tag === 'conjunction') {
    const l = constraint_cost(c.left, margin)
    const r = constraint_cost(c.right, margin)
    return (x) => Math.max(l(x), r(x))
  }
  if (c.tag === 'disjunction') {
    const l = constraint_cost(c.left, margin)
    const r = constraint_cost(c.right, margin)
    return (x) => Math.min(l(x), r(x))
  }
  if (c.tag === 'negation' || c.tag === 'conditional' || c.tag === 'biconditional') {
    throw new Error(`constraint_cost: non-normalized connective '${c.tag}' — call normalize_constraint first`)
  }
  return atom_cost(c, margin)
}

// Build a single NumericFn whose value is < 0 iff every constraint is satisfied.
// Top-level is implicit conjunction -> Math.max over all constraint costs.
// Constraints are normalized first to remove neg/cond/bicond.
export const build_cost_function = (
  constraints: Constraint[],
  options?: Partial<CostOptions>,
): NumericFn => {
  const { margin } = { ...DEFAULT_COST_OPTIONS, ...(options ?? {}) }
  const costs = constraints.map((c) => constraint_cost(normalize_constraint(c), margin))
  if (costs.length === 0) return () => -1  // no constraints => trivially satisfied
  if (costs.length === 1) return costs[0]!
  return (x) => {
    let m = costs[0]!(x)
    for (let i = 1; i < costs.length; i++) {
      const v = costs[i]!(x)
      if (v > m) m = v
    }
    return m
  }
}
