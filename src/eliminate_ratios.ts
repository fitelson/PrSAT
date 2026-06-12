// Ratio elimination: rewrite translated constraints so that every atomic
// comparison has the form `N op 0` where N contains no division anywhere —
// all denominators are cleared by cross-multiplication. Products are NOT
// expanded; the numerator keeps its structural (factored) form so the result
// stays compact.
//
// Soundness notes:
// - This transformation is meant to run on *translated* constraints (after
//   `translate`, so conditional probabilities are `divide` nodes over
//   state-variable sums) and alongside the usual div-0 guards produced by
//   `enrich_constraints`, which assert `den ≠ 0` in conjunction with each
//   atom that divides by `den`.
// - A denominator that is a sum/product of state-variable sums and nonnegative
//   literals is nonnegative under the global probability axioms (each a_i ≥ 0),
//   hence strictly positive under its `≠ 0` guard, so it can be dropped from
//   both sides of an inequality.
// - A denominator of unknown sign (e.g. a free real variable) produces an
//   explicit sign case-split for inequalities. For (in)equations (`=`, `≠`)
//   denominator signs are irrelevant given the `≠ 0` guards.

import { PrSat } from "./types"
import { real_expr_builder, real_expr_to_string } from "./pr_sat"
import { fallthrough } from "./utils"

type RealExpr = PrSat['RealExpr']
type Constraint = PrSat['Constraint']

const { lit, neg, plus, minus, multiply, power } = real_expr_builder

// ---------- Smart constructors (avoid trivial 1-factors) ----------

const is_literal_one = (e: RealExpr): boolean => e.tag === 'literal' && e.value === 1
const is_literal_zero = (e: RealExpr): boolean => e.tag === 'literal' && e.value === 0

const mult = (a: RealExpr, b: RealExpr): RealExpr =>
  is_literal_one(a) ? b
  : is_literal_one(b) ? a
  : multiply(a, b)

const product = (es: RealExpr[]): RealExpr => es.reduce(mult, lit(1))

const add = (a: RealExpr, b: RealExpr): RealExpr =>
  is_literal_zero(a) ? b
  : is_literal_zero(b) ? a
  : plus(a, b)

const sub = (a: RealExpr, b: RealExpr): RealExpr =>
  is_literal_zero(b) ? a
  : is_literal_zero(a) ? neg(b)
  : minus(a, b)

// ---------- Sign analysis of denominator factors ----------

// The signed value of a constant expression (literals, possibly negated), or
// undefined if the expression isn't a constant.
const constant_value = (e: RealExpr): number | undefined => {
  if (e.tag === 'literal') {
    return e.value
  }
  if (e.tag === 'negative') {
    const inner = constant_value(e.expr)
    return inner === undefined ? undefined : -inner
  }
  return undefined
}

// True only when nonnegativity is *provable* from the probability axioms:
// sums/products of state-variable sums and nonnegative literals (state
// variables each satisfy a_i ≥ 0), plus even powers.
const known_nonneg = (e: RealExpr): boolean => {
  if (e.tag === 'literal') {
    return e.value >= 0
  } else if (e.tag === 'state_variable_sum') {
    return true
  } else if (e.tag === 'plus' || e.tag === 'multiply') {
    return known_nonneg(e.left) && known_nonneg(e.right)
  } else if (e.tag === 'power') {
    const c = constant_value(e.exponent)
    if (c !== undefined && Number.isInteger(c) && c % 2 === 0) {
      return true
    }
    return known_nonneg(e.base)
  } else {
    return false
  }
}

// ---------- RealExpr → symbolic rational function ----------

// num / (dens[0] * dens[1] * ...), all division-free RealExprs.
type Rat = { num: RealExpr, dens: RealExpr[] }

const rat_of = (e: RealExpr): Rat => ({ num: e, dens: [] })

// Splits two denominator factor lists into (common, a-only, b-only), treating
// them as multisets keyed by canonical string form. Sharing common factors
// instead of blindly cross-multiplying keeps numerators small when both sides
// have the same denominator (e.g. two conditional probabilities on the same
// condition).
const dens_align = (a: RealExpr[], b: RealExpr[]): { common: RealExpr[], a_only: RealExpr[], b_only: RealExpr[] } => {
  const b_remaining = b.map((e) => ({ e, key: real_expr_to_string(e), used: false }))
  const common: RealExpr[] = []
  const a_only: RealExpr[] = []
  for (const e of a) {
    const key = real_expr_to_string(e)
    const match = b_remaining.find((entry) => !entry.used && entry.key === key)
    if (match !== undefined) {
      match.used = true
      common.push(e)
    } else {
      a_only.push(e)
    }
  }
  const b_only = b_remaining.filter((entry) => !entry.used).map((entry) => entry.e)
  return { common, a_only, b_only }
}

const rat_combine = (op: (l: RealExpr, r: RealExpr) => RealExpr, a: Rat, b: Rat): Rat => {
  const { common, a_only, b_only } = dens_align(a.dens, b.dens)
  return {
    num: op(mult(a.num, product(b_only)), mult(b.num, product(a_only))),
    dens: [...common, ...a_only, ...b_only],
  }
}

const rat_neg = (a: Rat): Rat => ({ num: neg(a.num), dens: a.dens })
const rat_mul = (a: Rat, b: Rat): Rat => ({ num: mult(a.num, b.num), dens: [...a.dens, ...b.dens] })

const rat_div = (a: Rat, b: Rat): Rat => ({
  num: mult(a.num, product(b.dens)),
  dens: [...a.dens, ...(is_literal_one(b.num) ? [] : [b.num])],
})

const integer_literal_exponent = (e: RealExpr): number | undefined => {
  const c = constant_value(e)
  return c !== undefined && Number.isSafeInteger(c) ? c : undefined
}

const real_expr_to_rat = (expr: RealExpr): Rat => {
  if (expr.tag === 'literal' || expr.tag === 'variable' || expr.tag === 'state_variable_sum') {
    return rat_of(expr)
  } else if (expr.tag === 'negative') {
    return rat_neg(real_expr_to_rat(expr.expr))
  } else if (expr.tag === 'plus') {
    return rat_combine(add, real_expr_to_rat(expr.left), real_expr_to_rat(expr.right))
  } else if (expr.tag === 'minus') {
    return rat_combine(sub, real_expr_to_rat(expr.left), real_expr_to_rat(expr.right))
  } else if (expr.tag === 'multiply') {
    return rat_mul(real_expr_to_rat(expr.left), real_expr_to_rat(expr.right))
  } else if (expr.tag === 'divide') {
    return rat_div(real_expr_to_rat(expr.numerator), real_expr_to_rat(expr.denominator))
  } else if (expr.tag === 'power') {
    const e = integer_literal_exponent(expr.exponent)
    if (e === undefined) {
      // Non-integer-literal exponent: leave the whole power alone (the SMT-LIB
      // emitter rejects it later anyway).
      return rat_of(expr)
    }
    const base = real_expr_to_rat(expr.base)
    if (base.dens.length === 0 && e >= 0) {
      return rat_of(e === 0 ? lit(1) : power(base.num, lit(e)))
    }
    const k = Math.abs(e)
    const repeat = (es: RealExpr[]): RealExpr[] => es.flatMap((f) => Array(k).fill(f))
    const num_k = k === 0 ? lit(1) : is_literal_one(base.num) ? lit(1) : power(base.num, lit(k))
    const dens_k = repeat(base.dens)
    if (e >= 0) {
      return { num: num_k, dens: dens_k }
    } else {
      return { num: product(dens_k), dens: is_literal_one(num_k) ? [] : [num_k] }
    }
  } else if (expr.tag === 'probability' || expr.tag === 'given_probability') {
    // Should only happen pre-translation; treat as indivisible.
    return rat_of(expr)
  } else {
    return fallthrough('real_expr_to_rat', expr)
  }
}

// ---------- Constraint transformation ----------

type ComparisonTag = 'equal' | 'not_equal' | 'less_than' | 'less_than_or_equal' | 'greater_than' | 'greater_than_or_equal'

const flip_comparison = (tag: ComparisonTag): ComparisonTag =>
  tag === 'less_than' ? 'greater_than'
  : tag === 'greater_than' ? 'less_than'
  : tag === 'less_than_or_equal' ? 'greater_than_or_equal'
  : tag === 'greater_than_or_equal' ? 'less_than_or_equal'
  : tag

const comparison_with_zero = (tag: ComparisonTag, n: RealExpr): Constraint => {
  // All six comparison variants share the { left, right } shape.
  return { tag, left: n, right: lit(0) } as Constraint
}

const transform_comparison = (tag: ComparisonTag, left: RealExpr, right: RealExpr): Constraint => {
  const r = rat_combine(sub, real_expr_to_rat(left), real_expr_to_rat(right))

  if (tag === 'equal' || tag === 'not_equal') {
    // Denominators are guarded ≠ 0 (by the div-0 definedness guards), so
    // N/D = 0 iff N = 0 regardless of D's sign.
    return comparison_with_zero(tag, r.num)
  }

  // Inequalities: drop denominator factors of known sign, case-split on the rest.
  let effective_tag: ComparisonTag = tag
  const unknown: RealExpr[] = []
  for (const d of r.dens) {
    const c = constant_value(d)
    if (c !== undefined) {
      if (c < 0) {
        effective_tag = flip_comparison(effective_tag)
      } else if (c === 0) {
        // Division by the constant 0: the atom is everywhere undefined and its
        // definedness guard is unsatisfiable; any sound output works, and the
        // case-split below yields `false`.
        unknown.push(d)
      }
      // Positive constant: drop.
    } else if (known_nonneg(d)) {
      // Nonnegative by the probability axioms and nonzero by its guard ⇒ positive: drop.
    } else {
      unknown.push(d)
    }
  }

  if (unknown.length === 0) {
    return comparison_with_zero(effective_tag, r.num)
  }

  const u_expr = product(unknown)
  return {
    tag: 'disjunction',
    left: {
      tag: 'conjunction',
      left: { tag: 'greater_than', left: u_expr, right: lit(0) },
      right: comparison_with_zero(effective_tag, r.num),
    },
    right: {
      tag: 'conjunction',
      left: { tag: 'less_than', left: u_expr, right: lit(0) },
      right: comparison_with_zero(flip_comparison(effective_tag), r.num),
    },
  }
}

export const eliminate_ratios_in_constraint = (c: Constraint): Constraint => {
  if (
    c.tag === 'equal' ||
    c.tag === 'not_equal' ||
    c.tag === 'less_than' ||
    c.tag === 'less_than_or_equal' ||
    c.tag === 'greater_than' ||
    c.tag === 'greater_than_or_equal'
  ) {
    return transform_comparison(c.tag, c.left, c.right)
  } else if (c.tag === 'negation') {
    return { tag: 'negation', constraint: eliminate_ratios_in_constraint(c.constraint) }
  } else if (c.tag === 'conjunction' || c.tag === 'disjunction' || c.tag === 'conditional' || c.tag === 'biconditional') {
    return { tag: c.tag, left: eliminate_ratios_in_constraint(c.left), right: eliminate_ratios_in_constraint(c.right) }
  } else {
    return fallthrough('eliminate_ratios_in_constraint', c)
  }
}

export const eliminate_ratios_in_constraints = (constraints: Constraint[]): Constraint[] =>
  constraints.map(eliminate_ratios_in_constraint)
