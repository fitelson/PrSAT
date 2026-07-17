// Lex Gröbner bases + exact rational root extraction, in pure TypeScript over
// the exact-rational polynomial layer from equation_elimination.ts.
//
// This is the "option 1" engine: the same algorithmic core a CAS `solve` uses
// (lex Gröbner basis → triangular structure → back-substitution), implemented
// directly so the web tool needs no embedded CAS. It is deliberately scoped to
// the ZERO-DIMENSIONAL case (finitely many solutions), which is what the
// snap-then-re-eliminate pass produces after pinning: there a lex GB contains
// a univariate polynomial, whose RATIONAL roots we enumerate exactly via the
// rational root theorem (bigint arithmetic), then substitute and recurse.
// Everything found is exact; everything is re-verified downstream — irrational
// solutions are simply not found (sound incompleteness, same as elsewhere).
//
// Buchberger is capped (pair count / term count) so a blowup degrades to
// "no answer" rather than a hung browser.

import { EqPoly, EqTerm, poly_internals, specialize_poly } from './equation_elimination'
import { Rational, ZERO, ONE, r_add, r_mul, r_div, r_sign, r_from_fraction } from './rationalize'

const P = poly_internals

// ---------- Monomial utilities (mono = ascending multiset of var indices) ----------

const mono_mul = (a: number[], b: number[]): number[] => [...a, ...b].sort((x, y) => x - y)

const mono_exp = (m: number[]): Map<number, number> => {
  const e = new Map<number, number>()
  for (const i of m) e.set(i, (e.get(i) ?? 0) + 1)
  return e
}

// Lex order with HIGHER variable index ranked greater (so a lex GB pushes
// relations down into the low-index variables).
const lex_cmp = (a: number[], b: number[]): number => {
  const ea = mono_exp(a), eb = mono_exp(b)
  const vars = [...new Set([...ea.keys(), ...eb.keys()])].sort((x, y) => y - x)
  for (const v of vars) {
    const d = (ea.get(v) ?? 0) - (eb.get(v) ?? 0)
    if (d !== 0) return d
  }
  return 0
}

const mono_divides = (d: number[], m: number[]): boolean => {
  const ed = mono_exp(d), em = mono_exp(m)
  for (const [v, k] of ed) {
    if ((em.get(v) ?? 0) < k) return false
  }
  return true
}

const mono_quotient = (m: number[], d: number[]): number[] => {
  const em = mono_exp(m)
  for (const i of d) em.set(i, em.get(i)! - 1)
  const out: number[] = []
  for (const [v, k] of em) {
    for (let i = 0; i < k; i++) out.push(v)
  }
  return out.sort((x, y) => x - y)
}

const mono_lcm = (a: number[], b: number[]): number[] => {
  const ea = mono_exp(a), eb = mono_exp(b)
  const out: number[] = []
  for (const v of new Set([...ea.keys(), ...eb.keys()])) {
    const k = Math.max(ea.get(v) ?? 0, eb.get(v) ?? 0)
    for (let i = 0; i < k; i++) out.push(v)
  }
  return out.sort((x, y) => x - y)
}

const mono_equal = (a: number[], b: number[]): boolean =>
  a.length === b.length && a.every((x, i) => x === b[i])

// ---------- Polynomial utilities under lex ----------

const leading_term = (p: EqPoly): EqTerm | undefined => {
  let best: EqTerm | undefined = undefined
  for (const t of p.values()) {
    if (best === undefined || lex_cmp(t.mono, best.mono) > 0) best = t
  }
  return best
}

const poly_monic = (p: EqPoly): EqPoly => {
  const lt = leading_term(p)
  if (lt === undefined) return p
  return P.scale(p, r_div(ONE, lt.coeff))
}

const term_times_poly = (coeff: Rational, mono: number[], p: EqPoly): EqPoly => {
  const out = P.zero()
  for (const t of p.values()) {
    P.add_term(out, { mono: mono_mul(mono, t.mono), coeff: r_mul(coeff, t.coeff) })
  }
  return out
}

// Full normal form of p modulo G (top reduction, then tail reduction by
// moving irreducible leading terms to the remainder).
const normal_form = (p0: EqPoly, G: EqPoly[], should_stop?: () => boolean): EqPoly | undefined => {
  let p = new Map(p0)
  const remainder = P.zero()
  while (p.size > 0) {
    if (should_stop?.()) return undefined
    const lt = leading_term(p)!
    let reduced = false
    for (const g of G) {
      const ltg = leading_term(g)
      if (ltg === undefined) continue
      if (mono_divides(ltg.mono, lt.mono)) {
        const factor_mono = mono_quotient(lt.mono, ltg.mono)
        const factor_coeff = r_div(lt.coeff, ltg.coeff)
        p = P.add(p, P.neg(term_times_poly(factor_coeff, factor_mono, g)))
        reduced = true
        break
      }
    }
    if (!reduced) {
      P.add_term(remainder, lt)
      const key = [...p.entries()].find(([, t]) => t === lt)?.[0]
      if (key !== undefined) p.delete(key)
      else break  // defensive; shouldn't happen
    }
  }
  return remainder
}

const s_polynomial = (f: EqPoly, g: EqPoly): EqPoly => {
  const ltf = leading_term(f)!, ltg = leading_term(g)!
  const lcm = mono_lcm(ltf.mono, ltg.mono)
  const a = term_times_poly(r_div(ONE, ltf.coeff), mono_quotient(lcm, ltf.mono), f)
  const b = term_times_poly(r_div(ONE, ltg.coeff), mono_quotient(lcm, ltg.mono), g)
  return P.add(a, P.neg(b))
}

export type GroebnerCaps = {
  max_pairs: number
  max_basis: number
  max_terms: number
  should_stop?: () => boolean
}
export const DEFAULT_GROEBNER_CAPS: GroebnerCaps = { max_pairs: 3000, max_basis: 64, max_terms: 3000 }

// Buchberger with the product (coprime-LT) criterion. Returns the reduced
// lex Gröbner basis, or undefined if a cap is hit.
export const groebner_basis = (F: EqPoly[], caps: GroebnerCaps = DEFAULT_GROEBNER_CAPS): EqPoly[] | undefined => {
  let G = F.filter((p) => p.size > 0).map(poly_monic)
  const pairs: Array<[number, number]> = []
  for (let i = 0; i < G.length; i++) {
    for (let j = i + 1; j < G.length; j++) pairs.push([i, j])
  }
  let processed = 0
  while (pairs.length > 0) {
    if (caps.should_stop?.()) return undefined
    if (++processed > caps.max_pairs) return undefined
    const [i, j] = pairs.shift()!
    const lti = leading_term(G[i]!)!, ltj = leading_term(G[j]!)!
    // Product criterion: coprime leading monomials reduce to zero.
    if (mono_equal(mono_lcm(lti.mono, ltj.mono), mono_mul(lti.mono, ltj.mono))) continue
    const s = normal_form(s_polynomial(G[i]!, G[j]!), G, caps.should_stop)
    if (s === undefined) return undefined
    if (s.size === 0) continue
    if (s.size > caps.max_terms || G.length >= caps.max_basis) return undefined
    const s_monic = poly_monic(s)
    for (let k = 0; k < G.length; k++) pairs.push([k, G.length])
    G.push(s_monic)
  }
  // Interreduce: drop polys whose LT is divisible by another's; fully reduce the rest.
  const kept: EqPoly[] = []
  for (let i = 0; i < G.length; i++) {
    const lti = leading_term(G[i]!)!
    const dominated = G.some((g, j) => j !== i && g.size > 0
      && mono_divides(leading_term(g)!.mono, lti.mono)
      && !(j > i && mono_equal(leading_term(g)!.mono, lti.mono)))
    if (!dominated) kept.push(G[i]!)
  }
  const reduced: EqPoly[] = []
  for (const g of kept) {
    const normal = normal_form(g, kept.filter((h) => h !== g), caps.should_stop)
    if (normal === undefined) return undefined
    if (normal.size > 0) reduced.push(poly_monic(normal))
  }
  return reduced
}

// ---------- Rational roots of a univariate polynomial ----------

const babs = (x: bigint): bigint => x < 0n ? -x : x

// Divisors of |n| (best effort: trial division to 10^5, then the remaining
// cofactor is treated as a single prime). Capped to avoid explosion.
const divisors = (n: bigint, cap: number = 4000): bigint[] => {
  n = babs(n)
  if (n === 0n) return [1n]
  const primes: Array<[bigint, number]> = []
  let rest = n
  for (let d = 2n; d * d <= rest && d <= 100000n; d++) {
    if (rest % d === 0n) {
      let k = 0
      while (rest % d === 0n) { rest /= d; k++ }
      primes.push([d, k])
    }
  }
  if (rest > 1n) primes.push([rest, 1])
  let divs: bigint[] = [1n]
  for (const [pr, k] of primes) {
    const next: bigint[] = []
    let pw = 1n
    for (let e = 0; e <= k; e++) {
      for (const d of divs) {
        next.push(d * pw)
        if (next.length > cap) return divs  // truncated, best effort
      }
      pw *= pr
    }
    divs = next
  }
  return divs
}

// All rational roots of Σ coeffs[k]·x^k (coeffs ascending, Rational).
export const rational_roots = (coeffs: Rational[]): Rational[] => {
  // Trim trailing zeros; factor out x^k roots at 0.
  let cs = [...coeffs]
  while (cs.length > 0 && r_sign(cs[cs.length - 1]!) === 0) cs.pop()
  if (cs.length === 0) return []  // zero polynomial: every value is a root — caller handles
  const roots: Rational[] = []
  let low = 0
  while (low < cs.length && r_sign(cs[low]!) === 0) low++
  if (low > 0) {
    roots.push(ZERO)
    cs = cs.slice(low)
  }
  if (cs.length <= 1) return roots
  // Clear denominators to integer coefficients.
  let lcm = 1n
  for (const c of cs) {
    const g = (a: bigint, b: bigint): bigint => { a = babs(a); b = babs(b); while (b) { const t = a % b; a = b; b = t } return a }
    lcm = (lcm / g(lcm, c.d)) * c.d
  }
  const ints = cs.map((c) => (c.n * lcm) / c.d)
  const a0 = ints[0]!, alead = ints[ints.length - 1]!
  const eval_at = (x: Rational): Rational => {
    let acc: Rational = ZERO
    for (let k = cs.length - 1; k >= 0; k--) acc = r_add(r_mul(acc, x), cs[k]!)
    return acc
  }
  for (const pdiv of divisors(a0)) {
    for (const qdiv of divisors(alead)) {
      for (const sign of [1n, -1n]) {
        const cand = r_from_fraction(sign * pdiv, qdiv)
        if (roots.some((r) => r.n === cand.n && r.d === cand.d)) continue
        if (r_sign(eval_at(cand)) === 0) roots.push(cand)
      }
    }
  }
  return roots
}

// ---------- Zero-dimensional solving ----------

// A poly univariate in v? Return ascending coefficient list if so.
const as_univariate = (p: EqPoly, v: number): Rational[] | undefined => {
  let deg = 0
  for (const t of p.values()) {
    for (const i of t.mono) {
      if (i !== v) return undefined
    }
    deg = Math.max(deg, t.mono.length)
  }
  const coeffs: Rational[] = Array.from({ length: deg + 1 }, () => ZERO)
  for (const t of p.values()) coeffs[t.mono.length] = r_add(coeffs[t.mono.length]!, t.coeff)
  return coeffs
}

export type ZeroDimCaps = { max_solutions: number, max_unknowns: number, groebner: GroebnerCaps }
export const DEFAULT_ZERO_DIM_CAPS: ZeroDimCaps = { max_solutions: 8, max_unknowns: 6, groebner: DEFAULT_GROEBNER_CAPS }

// Enumerate the RATIONAL solutions of a (presumed zero-dimensional) system.
// Strategy: find an equation univariate in some unknown (computing a lex
// Gröbner basis when none is in sight — for 0-dim ideals the lex GB contains
// a univariate polynomial in the lex-smallest variable), take its rational
// roots, substitute, recurse. Sound but incomplete: irrational solutions are
// not enumerated, and caps may truncate.
export const solve_zero_dimensional = (
  eqs: EqPoly[],
  caps: ZeroDimCaps = DEFAULT_ZERO_DIM_CAPS,
): Array<Record<number, Rational>> => {
  const live = eqs.filter((p) => p.size > 0)
  // Contradiction?
  for (const p of live) {
    const c = P.constant_value(p)
    if (c !== undefined && r_sign(c) !== 0) return []
  }
  const nontrivial = live.filter((p) => P.constant_value(p) === undefined)
  if (nontrivial.length === 0) return [{}]

  const unknowns = new Set<number>()
  for (const p of nontrivial) {
    for (const t of p.values()) {
      for (const i of t.mono) unknowns.add(i)
    }
  }
  if (unknowns.size > caps.max_unknowns) return []

  const find_univariate = (ps: EqPoly[]): { v: number, coeffs: Rational[] } | undefined => {
    for (const p of ps) {
      for (const v of unknowns) {
        const coeffs = as_univariate(p, v)
        if (coeffs !== undefined) return { v, coeffs }
      }
    }
    return undefined
  }

  let uni = find_univariate(nontrivial)
  if (uni === undefined) {
    const G = groebner_basis(nontrivial, caps.groebner)
    if (G === undefined) return []
    // Re-check contradiction (GB of (1) is [1]).
    for (const p of G) {
      const c = P.constant_value(p)
      if (c !== undefined && r_sign(c) !== 0) return []
    }
    uni = find_univariate(G)
    if (uni === undefined) return []  // not zero-dimensional (or too hard)
    // Continue with the GB (it generates the same ideal).
    return branch_on(uni, G, caps)
  }
  return branch_on(uni, nontrivial, caps)
}

const branch_on = (
  uni: { v: number, coeffs: Rational[] },
  system: EqPoly[],
  caps: ZeroDimCaps,
): Array<Record<number, Rational>> => {
  const out: Array<Record<number, Rational>> = []
  for (const root of rational_roots(uni.coeffs)) {
    if (out.length >= caps.max_solutions) break
    const pin: Record<number, Rational> = { [uni.v]: root }
    const specialized = system.map((p) => specialize_poly(p, pin))
    for (const sub of solve_zero_dimensional(specialized, caps)) {
      if (out.length >= caps.max_solutions) break
      out.push({ ...sub, [uni.v]: root })
    }
  }
  return out
}
