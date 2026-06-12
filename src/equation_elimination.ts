// Exact equation elimination for the random-search solver.
//
// Mirrors the equation-handling phase of Mathematica's PrSAT (PrSAT.m lines
// ~1015–1060): cross-multiply, extract the equations, solve them symbolically,
// substitute the solution into the rest of the system, and hand the resulting
// (mostly) pure-inequality system in fewer variables to the random search.
//
// Where Mathematica calls the full polynomial `Solve`, we implement successive
// elimination: repeatedly find an equation that is LINEAR IN SOME ONE VARIABLE
// v — i.e. E = A·v + B = 0 with A, B polynomials in the other variables — and
// substitute v = −B/A, multiplying the other equations through by powers of A.
// With A constant this is ordinary linear elimination (covers `Pr(A) = 1/2`,
// cross-multiplied conditional-probability equations, sums/differences, and
// the axiom Σ a_i = 1). With A nonconstant it solves nonlinear systems on the
// generic branch A ≠ 0 (covers independence `Pr(A∧B) = Pr(A)·Pr(B)` and most
// textbook equation systems). Equations linear in NO variable (every variable
// squared or higher, e.g. `Pr(A)^2 = 1/2`) are left in the residual system for
// the numeric cost function.
//
// Soundness:
// - Only TOP-LEVEL conjuncts are treated as equations (constraints joined by
//   the implicit top-level conjunction, flattened through `conjunction` nodes).
//   Equations under disjunction/negation stay in the residual system.
// - Cross-multiplying an equation N/D = 0 to N = 0 is implied by the original
//   system because `enrich_constraints` conjoins a `D ≠ 0`-style guard with
//   every atom that divides by D (and the guards stay in the residual system).
// - SAT answers are always sound: pinned variables are reconstructed exactly
//   (rational arithmetic), so consumed equations hold BY CONSTRUCTION, and the
//   final exact verification still checks the full original system.
// - UNSAT (`inconsistent`) is reported only when a contradiction (0 = c ≠ 0)
//   is derived using exclusively constant-denominator substitutions — pure
//   linear algebra, valid on every branch. A contradiction reached after a
//   generic-branch (nonconstant-denominator) substitution only refutes that
//   branch, so we fall back to constant-denominator-only elimination instead.

import { PrSat } from './types'
import { real_expr_builder } from './pr_sat'
import {
  Rational, ZERO, ONE, r_add, r_mul, r_div, r_neg, r_sign, r_eq,
  rationalize,
} from './rationalize'

type RealExpr = PrSat['RealExpr']
type Constraint = PrSat['Constraint']

const { lit, svs, neg, plus, minus, multiply, divide, power } = real_expr_builder

// ---------- Polynomials over state variables, Rational coefficients ----------

// A monomial is a sorted (ascending, with repetition) list of state indices.
type Term = { mono: number[], coeff: Rational }
type Poly = Map<string, Term>

const mono_key = (m: number[]): string => m.join(',')

const poly_zero = (): Poly => new Map()
const poly_const = (q: Rational): Poly =>
  r_sign(q) === 0 ? poly_zero() : new Map([['', { mono: [], coeff: q }]])
const poly_state = (i: number): Poly => new Map([[String(i), { mono: [i], coeff: ONE }]])

const poly_add_term = (p: Poly, t: Term): void => {
  if (r_sign(t.coeff) === 0) return
  const key = mono_key(t.mono)
  const existing = p.get(key)
  if (existing === undefined) {
    p.set(key, t)
  } else {
    const coeff = r_add(existing.coeff, t.coeff)
    if (r_sign(coeff) === 0) {
      p.delete(key)
    } else {
      p.set(key, { mono: t.mono, coeff })
    }
  }
}

const poly_add = (a: Poly, b: Poly): Poly => {
  const result = new Map(a)
  for (const t of b.values()) poly_add_term(result, t)
  return result
}

const poly_neg = (a: Poly): Poly => {
  const result: Poly = new Map()
  for (const [k, t] of a) result.set(k, { mono: t.mono, coeff: r_neg(t.coeff) })
  return result
}

const poly_scale = (a: Poly, q: Rational): Poly => {
  if (r_sign(q) === 0) return poly_zero()
  const result: Poly = new Map()
  for (const [k, t] of a) result.set(k, { mono: t.mono, coeff: r_mul(t.coeff, q) })
  return result
}

const poly_mul = (a: Poly, b: Poly): Poly => {
  const result: Poly = new Map()
  for (const ta of a.values()) {
    for (const tb of b.values()) {
      const mono = [...ta.mono, ...tb.mono].sort((x, y) => x - y)
      poly_add_term(result, { mono, coeff: r_mul(ta.coeff, tb.coeff) })
    }
  }
  return result
}

// The constant value of a constant polynomial, else undefined.
const poly_constant_value = (a: Poly): Rational | undefined => {
  if (a.size === 0) return ZERO
  if (a.size === 1) {
    const t = [...a.values()][0]!
    if (t.mono.length === 0) return t.coeff
  }
  return undefined
}

const poly_eval = (a: Poly, vals: Record<number, Rational>): Rational => {
  let acc: Rational = ZERO
  for (const t of a.values()) {
    let term = t.coeff
    for (const i of t.mono) {
      const v = vals[i]
      if (v === undefined) throw new Error(`poly_eval: no value for state index ${i}`)
      term = r_mul(term, v)
    }
    acc = r_add(acc, term)
  }
  return acc
}

// ---------- RealExpr → rational function of polynomials ----------

type PolyRat = { num: Poly, dens: Poly[] }

const prat_of = (p: Poly): PolyRat => ({ num: p, dens: [] })
const dens_product = (dens: Poly[]): Poly => dens.reduce(poly_mul, poly_const(ONE))

const prat_combine = (negate_b: boolean, a: PolyRat, b: PolyRat): PolyRat => {
  const bn = negate_b ? poly_neg(b.num) : b.num
  return {
    num: poly_add(poly_mul(a.num, dens_product(b.dens)), poly_mul(bn, dens_product(a.dens))),
    dens: [...a.dens, ...b.dens],
  }
}

// Returns undefined for expressions outside the supported fragment (free real
// variables, untranslated probabilities, non-integer exponents) — the caller
// then leaves the conjunct in the residual system.
const real_expr_to_polyrat = (expr: RealExpr): PolyRat | undefined => {
  if (expr.tag === 'literal') {
    return prat_of(poly_const(rationalize(expr.value, 1e-15)))
  } else if (expr.tag === 'state_variable_sum') {
    let p = poly_zero()
    for (const i of expr.indices) p = poly_add(p, poly_state(i))
    return prat_of(p)
  } else if (expr.tag === 'negative') {
    const inner = real_expr_to_polyrat(expr.expr)
    return inner === undefined ? undefined : { num: poly_neg(inner.num), dens: inner.dens }
  } else if (expr.tag === 'plus' || expr.tag === 'minus') {
    const l = real_expr_to_polyrat(expr.left)
    const r = real_expr_to_polyrat(expr.right)
    return l === undefined || r === undefined ? undefined : prat_combine(expr.tag === 'minus', l, r)
  } else if (expr.tag === 'multiply') {
    const l = real_expr_to_polyrat(expr.left)
    const r = real_expr_to_polyrat(expr.right)
    return l === undefined || r === undefined ? undefined
      : { num: poly_mul(l.num, r.num), dens: [...l.dens, ...r.dens] }
  } else if (expr.tag === 'divide') {
    const l = real_expr_to_polyrat(expr.numerator)
    const r = real_expr_to_polyrat(expr.denominator)
    if (l === undefined || r === undefined) return undefined
    return { num: poly_mul(l.num, dens_product(r.dens)), dens: [...l.dens, r.num] }
  } else if (expr.tag === 'power') {
    const base = real_expr_to_polyrat(expr.base)
    if (base === undefined) return undefined
    const e = expr.exponent
    const exp_val =
      e.tag === 'literal' && Number.isSafeInteger(e.value) ? e.value
      : e.tag === 'negative' && e.expr.tag === 'literal' && Number.isSafeInteger(e.expr.value) ? -e.expr.value
      : undefined
    if (exp_val === undefined || exp_val < 0) return undefined  // negative powers: rare, skip
    let num = poly_const(ONE)
    const dens: Poly[] = []
    for (let i = 0; i < exp_val; i++) {
      num = poly_mul(num, base.num)
      dens.push(...base.dens)
    }
    return { num, dens }
  } else {
    return undefined  // variable / probability / given_probability
  }
}

// ---------- Equation extraction ----------

// Flatten the implicit top-level conjunction (and explicit `conjunction`
// nodes) into a list of conjuncts.
export const flatten_conjuncts = (constraints: Constraint[]): Constraint[] => {
  const out: Constraint[] = []
  const walk = (c: Constraint): void => {
    if (c.tag === 'conjunction') {
      walk(c.left)
      walk(c.right)
    } else {
      out.push(c)
    }
  }
  for (const c of constraints) walk(c)
  return out
}

// Cross-multiplied polynomial form of the equation left = right, or undefined
// if outside the supported fragment.
const equation_to_poly = (left: RealExpr, right: RealExpr): Poly | undefined => {
  const l = real_expr_to_polyrat(left)
  const r = real_expr_to_polyrat(right)
  if (l === undefined || r === undefined) return undefined
  return prat_combine(true, l, r).num
}

// ---------- Successive elimination ----------

// One solved variable: v = num / den, where num and den are polynomials over
// the variables still remaining at the time of this elimination (which may
// include variables eliminated LATER in the chain — reconstruction therefore
// processes the chain in reverse).
export type ChainEntry = { v: number, num: Poly, den: Poly, den_is_const: boolean }

export type EquationElimination =
  | { tag: 'inconsistent' }   // sound: derived with constant-denominator steps only
  | {
    tag: 'eliminated'
    free_indices: number[]            // original state indices, ascending
    chain: ChainEntry[]               // in elimination order
    residual_conjuncts: Constraint[]  // non-equation conjuncts + unconsumable equations (original indices)
    leftover_equations: Poly[]        // unconsumed equations, as polynomials over the free variables
    equation_polys: Poly[]            // ALL extracted equation polys (original indices, pre-elimination)
    consumed_equations: number
    sound: boolean                    // true iff every chain step has a constant denominator
  }

// Decompose E = A·v + B where E is linear in v: A = coefficient polynomial
// (v removed), B = terms without v. Undefined if v occurs with degree ≥ 2 or
// not at all.
const linear_in = (e: Poly, v: number): { a: Poly, b: Poly } | undefined => {
  const a: Poly = new Map()
  const b: Poly = new Map()
  for (const t of e.values()) {
    const count = t.mono.filter((i) => i === v).length
    if (count === 0) {
      poly_add_term(b, t)
    } else if (count === 1) {
      poly_add_term(a, { mono: t.mono.filter((i) => i !== v), coeff: t.coeff })
    } else {
      return undefined
    }
  }
  if (a.size === 0) return undefined  // v does not occur
  return { a, b }
}

const vars_in_poly = (p: Poly): Set<number> => {
  const out = new Set<number>()
  for (const t of p.values()) {
    for (const i of t.mono) out.add(i)
  }
  return out
}

// Substitute v = num/den into p (den ≠ 0 generic branch): with p = Σ_k C_k·v^k
// of v-degree d, the result is Σ_k C_k·num^k·den^(d−k) (p·den^d, same zero set
// on the branch).
const substitute_in_poly = (p: Poly, v: number, num: Poly, den: Poly): Poly => {
  // Decompose by v-degree.
  const by_degree = new Map<number, Poly>()
  let max_degree = 0
  for (const t of p.values()) {
    const k = t.mono.filter((i) => i === v).length
    max_degree = Math.max(max_degree, k)
    const c = by_degree.get(k) ?? new Map()
    poly_add_term(c, { mono: t.mono.filter((i) => i !== v), coeff: t.coeff })
    by_degree.set(k, c)
  }
  if (max_degree === 0) return p

  // Precompute powers.
  const num_pows: Poly[] = [poly_const(ONE)]
  const den_pows: Poly[] = [poly_const(ONE)]
  for (let k = 1; k <= max_degree; k++) {
    num_pows.push(poly_mul(num_pows[k - 1]!, num))
    den_pows.push(poly_mul(den_pows[k - 1]!, den))
  }

  let result = poly_zero()
  for (const [k, c] of by_degree) {
    result = poly_add(result, poly_mul(c, poly_mul(num_pows[k]!, den_pows[max_degree - k]!)))
  }
  return result
}

type CoreOutcome =
  | { tag: 'done', chain: ChainEntry[], leftover: Poly[], consumed: number }
  | { tag: 'contradiction', sound: boolean }

// Hard cap on substituted-polynomial size: an elimination step that would blow
// a remaining equation past this many terms is rejected (the equation system
// is left partially solved instead of freezing the page — see the 4-letter
// 3-wise-independence system, where unrestricted substitution explodes).
const MAX_SUBSTITUTED_TERMS = 1200

// allow_nonconstant_den=false restricts to ordinary linear elimination (every
// derivation then valid on all branches, so contradictions are sound).
const eliminate_core = (equations: Poly[], allow_nonconstant_den: boolean): CoreOutcome => {
  let eqs = equations.map((e) => new Map(e))
  const chain: ChainEntry[] = []
  let sound = true
  let consumed = 0

  for (;;) {
    // Drop trivial equations; detect contradictions.
    const remaining: Poly[] = []
    for (const e of eqs) {
      const c = poly_constant_value(e)
      if (c === undefined) {
        remaining.push(e)
      } else if (r_sign(c) !== 0) {
        return { tag: 'contradiction', sound }
      } else {
        consumed++  // 0 = 0: trivially absorbed
      }
    }
    eqs = remaining
    if (eqs.length === 0) {
      return { tag: 'done', chain, leftover: [], consumed }
    }

    // Find the best (equation, variable) elimination candidates:
    // prefer constant denominators, then small denominators, then high indices.
    type Candidate = { ei: number, v: number, a: Poly, b: Poly, a_const: Rational | undefined }
    const candidates: Candidate[] = []
    for (let ei = 0; ei < eqs.length; ei++) {
      for (const v of vars_in_poly(eqs[ei]!)) {
        const decomp = linear_in(eqs[ei]!, v)
        if (decomp === undefined) continue
        const a_const = poly_constant_value(decomp.a)
        if (a_const === undefined && !allow_nonconstant_den) continue
        candidates.push({ ei, v, ...decomp, a_const })
      }
    }
    candidates.sort((c1, c2) =>
      (c1.a_const !== undefined) !== (c2.a_const !== undefined) ? (c1.a_const !== undefined ? -1 : 1)
      : c1.a.size !== c2.a.size ? c1.a.size - c2.a.size
      : c2.v - c1.v)

    // Try candidates in order; reject any whose substitution blows past the
    // term cap. If every candidate blows up, stop with the rest as leftover.
    let advanced = false
    for (const best of candidates) {
      let entry: ChainEntry
      if (best.a_const !== undefined) {
        // v = −B/c: fold the constant into the numerator.
        entry = { v: best.v, num: poly_scale(poly_neg(best.b), r_div(ONE, best.a_const)), den: poly_const(ONE), den_is_const: true }
      } else {
        entry = { v: best.v, num: poly_neg(best.b), den: best.a, den_is_const: false }
      }

      // Substitute into the other equations, watching for blowup.
      const next: Poly[] = []
      let blew_up = false
      for (let ei = 0; ei < eqs.length; ei++) {
        if (ei === best.ei) continue
        const substituted = substitute_in_poly(eqs[ei]!, entry.v, entry.num, entry.den)
        if (substituted.size > MAX_SUBSTITUTED_TERMS) { blew_up = true; break }
        next.push(substituted)
      }
      if (blew_up) continue

      if (!entry.den_is_const) sound = false
      chain.push(entry)
      consumed++
      eqs = next
      advanced = true
      break
    }
    if (!advanced) {
      return { tag: 'done', chain, leftover: eqs, consumed }
    }
  }
}

// Split the top-level conjuncts into cross-multiplied equation polynomials
// and everything else (inequalities, guards, disjunctions, unsupported
// equations).
export const extract_equation_system = (
  constraints: Constraint[],
): { equation_polys: Poly[], other_conjuncts: Constraint[] } => {
  const conjuncts = flatten_conjuncts(constraints)
  const equation_polys: Poly[] = []
  const other_conjuncts: Constraint[] = []
  for (const c of conjuncts) {
    if (c.tag === 'equal') {
      const p = equation_to_poly(c.left, c.right)
      if (p !== undefined) {
        equation_polys.push(p)
        continue
      }
    }
    other_conjuncts.push(c)
  }
  return { equation_polys, other_conjuncts }
}

// Maple-syntax rendering of a polynomial (variables a1..an, 1-indexed).
export const poly_to_maple_string = (p: Poly): string => {
  if (p.size === 0) return '0'
  const parts: string[] = []
  for (const t of p.values()) {
    const factors: string[] = []
    const coeff = t.coeff.d === 1n ? `${t.coeff.n}` : `${t.coeff.n}/${t.coeff.d}`
    factors.push(coeff.startsWith('-') ? `(${coeff})` : coeff)
    let i = 0
    while (i < t.mono.length) {
      let j = i
      while (j < t.mono.length && t.mono[j] === t.mono[i]) j++
      factors.push(j - i === 1 ? `a${t.mono[i]! + 1}` : `a${t.mono[i]! + 1}^${j - i}`)
      i = j
    }
    parts.push(factors.join('*'))
  }
  return parts.join(' + ')
}

export const eliminate_equations = (
  n_states: number,
  constraints: Constraint[],
): EquationElimination => {
  const { equation_polys, other_conjuncts: residual_conjuncts } = extract_equation_system(constraints)

  let outcome = eliminate_core(equation_polys, true)
  if (outcome.tag === 'contradiction') {
    if (outcome.sound) return { tag: 'inconsistent' }
    // The contradiction only refutes a generic branch — retry with pure
    // linear (constant-denominator) elimination, leaving the rest residual.
    outcome = eliminate_core(equation_polys, false)
    if (outcome.tag === 'contradiction') return { tag: 'inconsistent' }
  }

  const eliminated = new Set(outcome.chain.map((e) => e.v))
  const free_indices: number[] = []
  for (let i = 0; i < n_states; i++) {
    if (!eliminated.has(i)) free_indices.push(i)
  }

  // Leftover equations (linear in no variable) go back into the residual
  // system as `poly = 0` constraints in ORIGINAL indices so the numeric cost
  // function still steers toward them. (They are generic-branch transforms of
  // original equations — fine as a numeric guide; exact verification always
  // re-checks the original system.)
  const residual = [...residual_conjuncts]
  for (const p of outcome.leftover) {
    residual.push({ tag: 'equal', left: poly_to_real_expr(p, (i) => svs([i])), right: lit(0) })
  }

  return {
    tag: 'eliminated',
    free_indices,
    chain: outcome.chain,
    residual_conjuncts: residual,
    leftover_equations: outcome.leftover,
    equation_polys,
    consumed_equations: outcome.consumed,
    sound: outcome.chain.every((e) => e.den_is_const),
  }
}

// ---------- Snap-then-re-eliminate support ----------
//
// When the symbolic elimination leaves equations that are linear in no single
// variable, they often BECOME linear-in-one-variable once a subset of the free
// variables is pinned to concrete rationals (their symbolic coefficients
// collapse to constants). These helpers let the random-search certification
// pass pin snapped values, re-run the elimination on the specialized system,
// and solve the remaining variables exactly.

export type EqPoly = Poly
export type EqTerm = Term

// Low-level polynomial primitives shared with the Gröbner module.
export const poly_internals = {
  zero: poly_zero,
  constant: poly_const,
  add_term: poly_add_term,
  add: poly_add,
  neg: poly_neg,
  scale: poly_scale,
  mul: poly_mul,
  constant_value: poly_constant_value,
  eval: poly_eval,
}

// Highest power of v occurring in p.
export const poly_max_degree_of_var = (p: Poly, v: number): number => {
  let d = 0
  for (const t of p.values()) {
    let count = 0
    for (const i of t.mono) {
      if (i === v) count++
    }
    if (count > d) d = count
  }
  return d
}

export const vars_in_polys = (ps: Poly[]): number[] => {
  const out = new Set<number>()
  for (const p of ps) {
    for (const t of p.values()) {
      for (const i of t.mono) out.add(i)
    }
  }
  return [...out].sort((a, b) => a - b)
}

// Substitute concrete rational values for a subset of the variables.
export const specialize_poly = (p: Poly, pinned: Record<number, Rational>): Poly => {
  const out = poly_zero()
  for (const t of p.values()) {
    let coeff = t.coeff
    const rest: number[] = []
    for (const i of t.mono) {
      const val = pinned[i]
      if (val === undefined) {
        rest.push(i)
      } else {
        coeff = r_mul(coeff, val)
      }
    }
    poly_add_term(out, { mono: rest, coeff })
  }
  return out
}

// Specialize the equations at the pinned values and try to absorb ALL of them
// with the successive elimination. Returns the solution chain, or undefined if
// a contradiction arises or some equation still resists.
export const eliminate_specialized = (
  eqs: Poly[],
  pinned: Record<number, Rational>,
): ChainEntry[] | undefined => {
  const r = eliminate_specialized_partial(eqs, pinned)
  return r === 'contradiction' || r.leftover.length > 0 ? undefined : r.chain
}

// As above, but report the partial result: the chain of solved variables plus
// the equations the successive elimination could not absorb.
export const eliminate_specialized_partial = (
  eqs: Poly[],
  pinned: Record<number, Rational>,
): { chain: ChainEntry[], leftover: Poly[] } | 'contradiction' => {
  const specialized = eqs.map((p) => specialize_poly(p, pinned))
  const outcome = eliminate_core(specialized, true)
  if (outcome.tag !== 'done') return 'contradiction'
  return { chain: outcome.chain, leftover: outcome.leftover }
}

// Exact evaluation of a polynomial at a (complete) rational assignment.
export const evaluate_poly_exact = (p: Poly, vals: Record<number, Rational>): Rational =>
  poly_eval(p, vals)

// Float evaluation; missing variables throw (caller must supply all).
export const evaluate_poly_float = (p: Poly, vals: Record<number, number>): number => {
  let acc = 0
  for (const t of p.values()) {
    let term = r_to_number_local(t.coeff)
    for (const i of t.mono) {
      const v = vals[i]
      if (v === undefined) throw new Error(`evaluate_poly_float: no value for state index ${i}`)
      term *= v
    }
    acc += term
  }
  return acc
}

const r_to_number_local = (q: Rational): number => Number(q.n) / Number(q.d)

// ∂p/∂v.
export const poly_derivative = (p: Poly, v: number): Poly => {
  const out = poly_zero()
  for (const t of p.values()) {
    const k = t.mono.filter((i) => i === v).length
    if (k === 0) continue
    const mono = [...t.mono]
    mono.splice(mono.indexOf(v), 1)
    poly_add_term(out, { mono, coeff: r_mul(t.coeff, { n: BigInt(k), d: 1n }) })
  }
  return out
}

// Float evaluation of a chain (reverse order), extending `known`.
export const evaluate_chain_float = (
  chain: ChainEntry[],
  known: Record<number, number>,
): Record<number, number> | undefined => {
  const vals: Record<number, number> = { ...known }
  try {
    for (let ci = chain.length - 1; ci >= 0; ci--) {
      const entry = chain[ci]!
      const den = evaluate_poly_float(entry.den, vals)
      if (den === 0 || !Number.isFinite(den)) return undefined
      vals[entry.v] = evaluate_poly_float(entry.num, vals) / den
    }
  } catch {
    return undefined
  }
  return vals
}

// Evaluate a chain (in reverse) starting from known values; returns the known
// values extended with every chain variable, or undefined if a denominator
// vanishes.
export const evaluate_chain = (
  chain: ChainEntry[],
  known: Record<number, Rational>,
): Record<number, Rational> | undefined => {
  const vals: Record<number, Rational> = { ...known }
  try {
    for (let ci = chain.length - 1; ci >= 0; ci--) {
      const entry = chain[ci]!
      const den = poly_eval(entry.den, vals)
      if (r_sign(den) === 0) return undefined
      vals[entry.v] = r_div(poly_eval(entry.num, vals), den)
    }
  } catch {
    return undefined  // chain references a variable with no value
  }
  return vals
}

// ---------- Reconstruction (exact) ----------

// Given exact values for the free variables (keyed by ORIGINAL index), compute
// the full assignment for all state variables by evaluating the chain in
// reverse. Returns undefined if a generic-branch denominator vanishes at this
// point (the candidate must be rejected).
export const reconstruct_full_assignment = (
  elimination: Extract<EquationElimination, { tag: 'eliminated' }>,
  free_values: Record<number, Rational>,
): Record<number, Rational> | undefined => {
  const full: Record<number, Rational> = {}
  for (const i of elimination.free_indices) {
    const v = free_values[i]
    if (v === undefined) throw new Error(`reconstruct_full_assignment: missing value for free index ${i}`)
    full[i] = v
  }
  for (let ci = elimination.chain.length - 1; ci >= 0; ci--) {
    const entry = elimination.chain[ci]!
    const den = poly_eval(entry.den, full)
    if (r_sign(den) === 0) return undefined
    full[entry.v] = r_div(poly_eval(entry.num, full), den)
  }
  return full
}

// ---------- Substitution into residual constraints ----------

const rational_to_real_expr = (q: Rational): RealExpr => {
  const abs: RealExpr = q.d === 1n
    ? lit(Number(q.n < 0n ? -q.n : q.n))
    : divide(lit(Number(q.n < 0n ? -q.n : q.n)), lit(Number(q.d)))
  return q.n < 0n ? neg(abs) : abs
}

const poly_to_real_expr = (p: Poly, var_expr: (i: number) => RealExpr): RealExpr => {
  let result: RealExpr | undefined = undefined
  for (const t of p.values()) {
    // Group repeated indices into powers.
    const factors: RealExpr[] = []
    if (!r_eq(t.coeff, ONE) || t.mono.length === 0) {
      factors.push(rational_to_real_expr(t.coeff))
    }
    let i = 0
    while (i < t.mono.length) {
      let j = i
      while (j < t.mono.length && t.mono[j] === t.mono[i]) j++
      const base = var_expr(t.mono[i]!)
      factors.push(j - i === 1 ? base : power(base, lit(j - i)))
      i = j
    }
    const term = factors.reduce((acc, f) => multiply(acc, f))
    result = result === undefined ? term : plus(result, term)
  }
  return result ?? lit(0)
}

// Generic substitution: replace every state-variable index in a constraint
// via `replace_index`.
export const substitute_constraint_indices = (
  c: Constraint,
  replace_index: (i: number) => RealExpr,
): Constraint => {
  const sub_expr = (e: RealExpr): RealExpr => {
    if (e.tag === 'literal' || e.tag === 'variable') {
      return e
    } else if (e.tag === 'state_variable_sum') {
      if (e.indices.length === 0) return lit(0)
      return e.indices.map(replace_index).reduce((acc, t) => plus(acc, t))
    } else if (e.tag === 'negative') {
      return neg(sub_expr(e.expr))
    } else if (e.tag === 'plus') {
      return plus(sub_expr(e.left), sub_expr(e.right))
    } else if (e.tag === 'minus') {
      return minus(sub_expr(e.left), sub_expr(e.right))
    } else if (e.tag === 'multiply') {
      return multiply(sub_expr(e.left), sub_expr(e.right))
    } else if (e.tag === 'divide') {
      return divide(sub_expr(e.numerator), sub_expr(e.denominator))
    } else if (e.tag === 'power') {
      return { tag: 'power', base: sub_expr(e.base), exponent: sub_expr(e.exponent) }
    } else {
      return e
    }
  }
  const sub_c = (cc: Constraint): Constraint => {
    if (
      cc.tag === 'equal' || cc.tag === 'not_equal' || cc.tag === 'less_than'
      || cc.tag === 'less_than_or_equal' || cc.tag === 'greater_than' || cc.tag === 'greater_than_or_equal'
    ) {
      return { tag: cc.tag, left: sub_expr(cc.left), right: sub_expr(cc.right) }
    } else if (cc.tag === 'negation') {
      return { tag: 'negation', constraint: sub_c(cc.constraint) }
    } else {
      return { tag: cc.tag, left: sub_c(cc.left), right: sub_c(cc.right) }
    }
  }
  return sub_c(c)
}

// Substitute state variables in a constraint: eliminated variables become
// their chain expressions (rational functions of later/free variables, fully
// composed down to free variables), free variables are renumbered to compact
// coordinates 0..k-1.
export const substitute_constraint = (
  c: Constraint,
  elimination: Extract<EquationElimination, { tag: 'eliminated' }>,
): Constraint => {
  const compact = new Map(elimination.free_indices.map((f, j) => [f, j] as const))

  // Composed RealExpr (over compact free coordinates) for every variable.
  // Built by walking the chain in reverse, so each entry's num/den only
  // reference variables whose expressions are already known.
  const expr_for = new Map<number, RealExpr>()
  for (const [f, j] of compact) expr_for.set(f, svs([j]))
  for (let ci = elimination.chain.length - 1; ci >= 0; ci--) {
    const entry = elimination.chain[ci]!
    const lookup = (i: number): RealExpr => {
      const e = expr_for.get(i)
      if (e === undefined) throw new Error(`substitute_constraint: chain entry for a_${i + 1} not yet composed`)
      return e
    }
    const num_expr = poly_to_real_expr(entry.num, lookup)
    expr_for.set(entry.v, entry.den_is_const ? num_expr : divide(num_expr, poly_to_real_expr(entry.den, lookup)))
  }

  const replace_index = (i: number): RealExpr => {
    const e = expr_for.get(i)
    if (e === undefined) throw new Error(`substitute_constraint: index ${i} neither free nor eliminated`)
    return e
  }

  const sub_expr = (e: RealExpr): RealExpr => {
    if (e.tag === 'literal' || e.tag === 'variable') {
      return e
    } else if (e.tag === 'state_variable_sum') {
      if (e.indices.length === 0) return lit(0)
      return e.indices.map(replace_index).reduce((acc, t) => plus(acc, t))
    } else if (e.tag === 'negative') {
      return neg(sub_expr(e.expr))
    } else if (e.tag === 'plus') {
      return plus(sub_expr(e.left), sub_expr(e.right))
    } else if (e.tag === 'minus') {
      return minus(sub_expr(e.left), sub_expr(e.right))
    } else if (e.tag === 'multiply') {
      return multiply(sub_expr(e.left), sub_expr(e.right))
    } else if (e.tag === 'divide') {
      return divide(sub_expr(e.numerator), sub_expr(e.denominator))
    } else if (e.tag === 'power') {
      return { tag: 'power', base: sub_expr(e.base), exponent: sub_expr(e.exponent) }
    } else {
      return e  // probability / given_probability: untranslated, shouldn't appear
    }
  }

  const sub_c = (cc: Constraint): Constraint => {
    if (
      cc.tag === 'equal' || cc.tag === 'not_equal' || cc.tag === 'less_than'
      || cc.tag === 'less_than_or_equal' || cc.tag === 'greater_than' || cc.tag === 'greater_than_or_equal'
    ) {
      return { tag: cc.tag, left: sub_expr(cc.left), right: sub_expr(cc.right) }
    } else if (cc.tag === 'negation') {
      return { tag: 'negation', constraint: sub_c(cc.constraint) }
    } else {
      return { tag: cc.tag, left: sub_c(cc.left), right: sub_c(cc.right) }
    }
  }

  return sub_c(c)
}
