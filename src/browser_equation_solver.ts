// Bounded, zero-dependency polynomial branch solving for the browser worker.
//
// The output deliberately matches the optional Maple bridge. Generic
// elimination records the leading coefficient as a nonzero chart condition;
// its coefficient-zero complement is explored as a separate branch.

import { PrSat } from './types'
import {
  ChainEntry,
  EqPoly,
  EqRationalRow,
  linear_in,
  poly_internals,
  poly_max_degree_of_var,
  poly_to_real_expr,
  substitute_in_poly,
  vars_in_poly,
  vars_in_polys,
} from './equation_elimination'
import { MapleBranch } from './maple_bridge_client'
import { groebner_basis } from './groebner'
import {
  ONE,
  ZERO,
  Rational,
  r_add,
  r_div,
  r_from_fraction,
  r_from_int,
  r_mul,
  r_neg,
  r_sign,
  verify_rational_model,
} from './rationalize'

type Constraint = PrSat['Constraint']
type RealExpr = PrSat['RealExpr']
const P = poly_internals

export type BrowserEquationSolverCaps = {
  max_nodes: number
  max_depth: number
  max_branches: number
  max_terms: number
  max_pseudo_steps: number
  max_preprocess_steps: number
  max_preprocess_terms: number
  max_factor_candidates: number
  max_linear_factor_bound: number
  max_groebner_steps: number
  max_groebner_pairs: number
  max_groebner_basis: number
  max_milliseconds: number
}

export type BrowserEquationSolverDiagnostics = {
  reason?: string
  elapsed_ms?: number
  nodes?: number
  branches?: number
  groebner_steps?: number
}

export const DEFAULT_BROWSER_EQUATION_SOLVER_CAPS: BrowserEquationSolverCaps = {
  max_nodes: 600,
  max_depth: 80,
  max_branches: 64,
  max_terms: 1200,
  max_pseudo_steps: 80,
  max_preprocess_steps: 32,
  max_preprocess_terms: 20_000,
  max_factor_candidates: 100_000,
  max_linear_factor_bound: 3,
  max_groebner_steps: 1,
  max_groebner_pairs: 800,
  max_groebner_basis: 32,
  max_milliseconds: 1500,
}

type State = {
  equations: EqPoly[]
  nonzero: EqPoly[]
  remaining: number[]
  chain: ChainEntry[]
  depth: number
  pseudo_steps: number
  groebner_steps: number
}

const poly_signature = (p: EqPoly): string => [...p.values()]
  .map((t) => `${t.mono.join(',')}:${t.coeff.n}/${t.coeff.d}`)
  .sort()
  .join(';')

const mono_compare = (left: number[], right: number[]): number => {
  if (left.length !== right.length) return left.length - right.length
  for (let i = Math.max(left[left.length - 1] ?? -1, right[right.length - 1] ?? -1); i >= 0; i--) {
    const lc = left.filter((v) => v === i).length
    const rc = right.filter((v) => v === i).length
    if (lc !== rc) return lc - rc
  }
  return 0
}

const leading_term = (p: EqPoly) => {
  let best: { mono: number[], coeff: Rational } | undefined
  for (const term of p.values()) {
    if (best === undefined || mono_compare(term.mono, best.mono) > 0) best = term
  }
  return best
}

const mono_quotient = (numerator: number[], denominator: number[]): number[] | undefined => {
  const remaining = [...numerator]
  for (const variable of denominator) {
    const index = remaining.indexOf(variable)
    if (index < 0) return undefined
    remaining.splice(index, 1)
  }
  return remaining
}

const term_times_poly = (mono: number[], coeff: Rational, p: EqPoly): EqPoly => {
  const out = P.zero()
  for (const term of p.values()) {
    P.add_term(out, { mono: [...mono, ...term.mono].sort((a, b) => a - b), coeff: r_mul(coeff, term.coeff) })
  }
  return out
}

const exact_divide = (dividend: EqPoly, divisor: EqPoly, max_terms: number): EqPoly | undefined => {
  if (divisor.size === 0) return undefined
  if (dividend.size === 0) return P.zero()
  const divisor_lead = leading_term(divisor)!
  let remainder = dividend
  let quotient = P.zero()
  let guard = 0
  while (remainder.size > 0) {
    if (++guard > 20_000) return undefined
    const lead = leading_term(remainder)!
    const mono = mono_quotient(lead.mono, divisor_lead.mono)
    if (mono === undefined) return undefined
    const coeff = r_div(lead.coeff, divisor_lead.coeff)
    const term = P.zero()
    P.add_term(term, { mono, coeff })
    quotient = P.add(quotient, term)
    remainder = P.add(remainder, P.neg(term_times_poly(mono, coeff, divisor)))
    if (remainder.size > max_terms || quotient.size > max_terms) return undefined
  }
  return quotient
}

const total_degree = (p: EqPoly): number => {
  let degree = 0
  for (const term of p.values()) degree = Math.max(degree, term.mono.length)
  return degree
}

const integer_gcd = (left: number, right: number): number => {
  let a = Math.abs(left)
  let b = Math.abs(right)
  while (b !== 0) [a, b] = [b, a % b]
  return a
}

const bigint_square_root = (value: bigint): bigint | undefined => {
  if (value < 0n) return undefined
  if (value < 2n) return value
  let x = 1n << (BigInt(value.toString(2).length) + 1n >> 1n)
  while (true) {
    const next = (x + value / x) >> 1n
    if (next >= x) return x * x === value ? x : undefined
    x = next
  }
}

const polynomial_square_root = (p: EqPoly, max_terms: number): EqPoly | undefined => {
  if (p.size === 0) return P.zero()
  let root = P.zero()
  let remainder = p
  for (let guard = 0; guard < 10_000 && remainder.size > 0; guard++) {
    const lead = leading_term(remainder)!
    let mono: number[]
    let coeff: Rational
    if (root.size === 0) {
      const counts = new Map<number, number>()
      for (const variable of lead.mono) counts.set(variable, (counts.get(variable) ?? 0) + 1)
      if ([...counts.values()].some((count) => count % 2 !== 0)) return undefined
      mono = []
      for (const [variable, count] of counts) {
        for (let i = 0; i < count / 2; i++) mono.push(variable)
      }
      const numerator = bigint_square_root(lead.coeff.n)
      const denominator = bigint_square_root(lead.coeff.d)
      if (numerator === undefined || denominator === undefined) return undefined
      coeff = r_from_fraction(numerator, denominator)
    } else {
      const root_lead = leading_term(root)!
      const quotient = mono_quotient(lead.mono, root_lead.mono)
      if (quotient === undefined) return undefined
      mono = quotient
      coeff = r_div(lead.coeff, r_mul(r_from_int(2), root_lead.coeff))
    }
    const term = P.zero()
    P.add_term(term, { mono, coeff })
    root = P.add(root, term)
    if (root.size > max_terms) return undefined
    remainder = P.add(p, P.neg(P.mul(root, root)))
    if (remainder.size > max_terms) return undefined
  }
  return remainder.size === 0 ? root : undefined
}

const find_quadratic_split = (p: EqPoly, max_terms: number): { factor: EqPoly, quotient: EqPoly } | undefined => {
  for (const variable of vars_in_poly(p)) {
    if (poly_max_degree_of_var(p, variable) !== 2) continue
    const c0 = coefficient(p, variable, 0)
    const c1 = coefficient(p, variable, 1)
    const c2 = coefficient(p, variable, 2)
    const discriminant = P.add(P.mul(c1, c1), P.neg(P.scale(P.mul(c2, c0), r_from_int(4))))
    const square_root = polynomial_square_root(discriminant, max_terms)
    if (square_root === undefined) continue
    const variable_term = P.zero()
    P.add_term(variable_term, { mono: [variable], coeff: r_from_int(2) })
    for (const signed_root of [square_root, P.neg(square_root)]) {
      const factor = P.add(P.add(P.mul(c2, variable_term), c1), signed_root)
      const quotient = exact_divide(p, factor, max_terms)
      if (quotient !== undefined && P.constant_value(factor) === undefined && P.constant_value(quotient) === undefined) {
        return { factor, quotient }
      }
    }
  }
  return undefined
}

const factor_sample_passes = (p: EqPoly, variables: number[], coefficients: number[]): boolean => {
  const pivot = coefficients.findIndex((value, index) => index > 0 && value !== 0)
  if (pivot < 1) return false
  for (let sample = 0; sample < 3; sample++) {
    const values: Record<number, Rational> = {}
    let constant = coefficients[0]!
    for (let i = 0; i < variables.length; i++) {
      if (i === pivot - 1) continue
      const value = ((sample + 2) * (i + 2)) % 5 - 2
      values[variables[i]!] = r_from_int(value)
      constant += coefficients[i + 1]! * value
    }
    values[variables[pivot - 1]!] = r_from_fraction(BigInt(-constant), BigInt(coefficients[pivot]!))
    if (r_sign(P.eval(p, values)) !== 0) return false
  }
  return true
}

const find_linear_factor = (
  p: EqPoly,
  bound: number,
  budget: { remaining: number },
  max_terms: number,
): { factor: EqPoly, quotient: EqPoly } | undefined => {
  if (total_degree(p) < 2) return undefined
  const variables = [...vars_in_poly(p)].sort((a, b) => a - b)
  const coefficients = Array.from({ length: variables.length + 1 }, () => 0)
  const search_values = [0]
  for (let value = 1; value <= bound; value++) search_values.push(value, -value)
  let answer: { factor: EqPoly, quotient: EqPoly } | undefined
  const visit = (position: number): void => {
    if (answer !== undefined || budget.remaining <= 0) return
    if (position < coefficients.length) {
      for (const value of search_values) {
        coefficients[position] = value
        visit(position + 1)
        if (answer !== undefined || budget.remaining <= 0) return
      }
      return
    }
    budget.remaining--
    if (coefficients.slice(1).every((value) => value === 0)) return
    let gcd = 0
    for (const value of coefficients) gcd = integer_gcd(gcd, value)
    if (gcd !== 1 || coefficients.find((value) => value !== 0)! < 0) return
    if (!factor_sample_passes(p, variables, coefficients)) return
    let factor = P.constant(r_from_int(coefficients[0]!))
    for (let i = 0; i < variables.length; i++) {
      if (coefficients[i + 1] === 0) continue
      const term = P.zero()
      P.add_term(term, { mono: [variables[i]!], coeff: r_from_int(coefficients[i + 1]!) })
      factor = P.add(factor, term)
    }
    const quotient = exact_divide(p, factor, max_terms)
    if (quotient !== undefined && P.constant_value(quotient) === undefined) answer = { factor, quotient }
  }
  visit(0)
  return answer
}

const choose_factor_split = (
  equations: EqPoly[],
  caps: BrowserEquationSolverCaps,
): { equation_index: number, factor: EqPoly, quotient: EqPoly } | undefined => {
  for (let bound = 1; bound <= caps.max_linear_factor_bound; bound++) {
    const budget = { remaining: caps.max_factor_candidates }
    for (let equation_index = 0; equation_index < equations.length; equation_index++) {
      const split = find_linear_factor(equations[equation_index]!, bound, budget, caps.max_terms)
      if (split !== undefined) return { equation_index, ...split }
      if (budget.remaining <= 0) break
    }
  }
  for (let equation_index = 0; equation_index < equations.length; equation_index++) {
    const split = find_quadratic_split(equations[equation_index]!, caps.max_terms)
    if (split !== undefined) return { equation_index, ...split }
  }
  return undefined
}

const row_score = (row: EqRationalRow): number[] => [row.num.size === 0 ? -1 : total_degree(row.num), row.num.size, row.den.size]

const lex_compare = (left: number[], right: number[]): number => {
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const difference = (left[i] ?? 0) - (right[i] ?? 0)
    if (difference !== 0) return difference
  }
  return 0
}

const cancel_known_factors = (row: EqRationalRow, factors: EqPoly[], max_terms: number): EqRationalRow => {
  if (row.num.size === 0) return { num: row.num, den: P.constant(ONE), denominator_factors: [] }
  let num = row.num
  let den = row.den
  for (const factor of factors) {
    if (P.constant_value(factor) !== undefined) continue
    while (true) {
      const next_num = exact_divide(num, factor, max_terms)
      if (next_num === undefined) break
      const next_den = exact_divide(den, factor, max_terms)
      if (next_den === undefined) break
      num = next_num
      den = next_den
    }
  }
  return { num, den, denominator_factors: [] }
}

export const preprocess_rational_rows = (
  input: EqRationalRow[],
  caps: BrowserEquationSolverCaps = DEFAULT_BROWSER_EQUATION_SOLVER_CAPS,
): EqPoly[] => {
  const factors = input.flatMap((row) => row.denominator_factors)
  const rows = input.map((row) => ({ ...row }))
  let changed = true
  let steps = 0
  while (changed && steps++ < caps.max_preprocess_steps) {
    changed = false
    outer: for (let i = 0; i < rows.length; i++) {
      const current = rows[i]!
      const current_score = row_score(current)
      for (let j = 0; j < rows.length; j++) {
        if (i === j) continue
        const other = rows[j]!
        for (const sign of [1, -1]) {
          const raw: EqRationalRow = {
            num: P.add(P.mul(current.num, other.den), sign === 1 ? P.mul(other.num, current.den) : P.neg(P.mul(other.num, current.den))),
            den: P.mul(current.den, other.den),
            denominator_factors: [],
          }
          if (raw.num.size > caps.max_preprocess_terms || raw.den.size > caps.max_preprocess_terms) continue
          const candidate = cancel_known_factors(raw, factors, caps.max_preprocess_terms)
          if (lex_compare(row_score(candidate), current_score) < 0) {
            rows[i] = candidate
            changed = true
            break outer
          }
        }
      }
    }
  }
  const reduced = rows.map((row) => row.num)
  const before = input.reduce((sum, row) => sum + row.num.size, 0)
  const after = reduced.reduce((sum, p) => sum + p.size, 0)
  return after < before ? reduced : input.map((row) => row.num)
}

// Exact local exploration of an underdetermined polynomial component. When a
// simple rational point lies on every equation, compute the rational Jacobian
// there, derive its nullspace by RREF, and test rational points on each tangent
// line. This is entirely syntax-agnostic: it is useful for any system whose
// solution component contains a straight rational direction. Full exact
// constraint verification is the sole acceptance criterion.
export const find_exact_tangent_model = (
  equations: EqPoly[],
  constraints: Constraint[],
  n_variables: number,
  max_denominator: number = 256,
  max_milliseconds: number = 250,
): Record<number, Rational> | undefined => {
  const started = performance.now()
  if (n_variables < 1) return undefined
  const base_value = r_from_fraction(1n, BigInt(n_variables))
  const base: Record<number, Rational> = {}
  for (let variable = 0; variable < n_variables; variable++) base[variable] = base_value
  if (equations.some((equation) => r_sign(P.eval(equation, base)) !== 0)) return undefined

  const derivative_at_base = (polynomial: EqPoly, variable: number): Rational => {
    let result = ZERO
    for (const term of polynomial.values()) {
      const occurrence = term.mono.indexOf(variable)
      if (occurrence < 0) continue
      let value = r_mul(term.coeff, r_from_int(term.mono.filter((v) => v === variable).length))
      let skipped = false
      for (const factor of term.mono) {
        if (factor === variable && !skipped) {
          skipped = true
        } else {
          value = r_mul(value, base[factor]!)
        }
      }
      result = r_add(result, value)
    }
    return result
  }

  const matrix = equations.map((equation) =>
    Array.from({ length: n_variables }, (_, variable) => derivative_at_base(equation, variable)))
  const pivot_columns: number[] = []
  let pivot_row = 0
  for (let column = 0; column < n_variables && pivot_row < matrix.length; column++) {
    const source = matrix.findIndex((row, index) => index >= pivot_row && r_sign(row[column]!) !== 0)
    if (source < 0) continue
    ;[matrix[pivot_row], matrix[source]] = [matrix[source]!, matrix[pivot_row]!]
    const pivot = matrix[pivot_row]![column]!
    matrix[pivot_row] = matrix[pivot_row]!.map((value) => r_div(value, pivot))
    for (let row = 0; row < matrix.length; row++) {
      if (row === pivot_row) continue
      const factor = matrix[row]![column]!
      if (r_sign(factor) === 0) continue
      matrix[row] = matrix[row]!.map((value, index) =>
        r_add(value, r_neg(r_mul(factor, matrix[pivot_row]![index]!))))
    }
    pivot_columns.push(column)
    pivot_row++
  }

  const pivot_set = new Set(pivot_columns)
  const free_columns = Array.from({ length: n_variables }, (_, index) => index)
    .filter((index) => !pivot_set.has(index))
  const basis: Rational[][] = []
  for (const free of free_columns) {
    const direction = Array.from({ length: n_variables }, () => ZERO)
    direction[free] = ONE
    for (let row = 0; row < pivot_columns.length; row++) {
      direction[pivot_columns[row]!] = r_neg(matrix[row]![free]!)
    }
    basis.push(direction)
  }

  // RREF chooses an arbitrary nullspace basis; a straight component direction
  // can therefore be a small linear combination rather than a basis vector.
  // Enumerate primitive {-1,0,1} combinations, sparse combinations first.
  const combinations: number[][] = []
  const MAX_COMBINATIONS = 4096
  const coefficients = Array.from({ length: basis.length }, () => 0)
  const choose_support = (start: number, remaining: number, selected: number[]): void => {
    if (combinations.length >= MAX_COMBINATIONS) return
    if (remaining === 0) {
      // Fix the first selected coefficient positive; negating every coefficient
      // is already covered by the signed line step below.
      coefficients.fill(0)
      coefficients[selected[0]!] = 1
      const assign_signs = (position: number): void => {
        if (combinations.length >= MAX_COMBINATIONS) return
        if (position === selected.length) {
          combinations.push([...coefficients])
          return
        }
        const index = selected[position]!
        for (const sign of [1, -1]) {
          coefficients[index] = sign
          assign_signs(position + 1)
        }
      }
      assign_signs(1)
      return
    }
    for (let index = start; index <= basis.length - remaining; index++) {
      selected.push(index)
      choose_support(index + 1, remaining - 1, selected)
      selected.pop()
      if (combinations.length >= MAX_COMBINATIONS) return
    }
  }
  for (let support_size = 1; support_size <= basis.length && combinations.length < MAX_COMBINATIONS; support_size++) {
    choose_support(0, support_size, [])
  }

  const directions = combinations.map((combination) =>
    Array.from({ length: n_variables }, (_, variable) =>
      combination.reduce((sum, coefficient, index) => coefficient === 0
        ? sum
        : r_add(sum, r_mul(r_from_int(coefficient), basis[index]![variable]!)), ZERO)))
  // Small denominators first across the whole tangent space. Besides preferring
  // simpler models, this avoids exhausting the denominator range on an early
  // basis direction before trying the combination that follows the component.
  for (let denominator = 1; denominator <= max_denominator; denominator++) {
    for (const direction of directions) {
      if (performance.now() - started > max_milliseconds) return undefined
      for (const sign of [1n, -1n]) {
        const step = r_from_fraction(sign, BigInt(denominator))
        const candidate: Record<number, Rational> = {}
        let inside_simplex = true
        for (let variable = 0; variable < n_variables; variable++) {
          const value = r_add(base[variable]!, r_mul(step, direction[variable]!))
          if (r_sign(value) < 0) {
            inside_simplex = false
            break
          }
          candidate[variable] = value
        }
        if (!inside_simplex) continue
        if (equations.some((equation) => r_sign(P.eval(equation, candidate)) !== 0)) continue
        const verified = verify_rational_model(constraints, candidate)
        if (verified.tag === 'ok' && verified.value) return candidate
      }
    }
  }
  return undefined
}

const normalize_polys = (ps: EqPoly[]): EqPoly[] => {
  const unique = new Map<string, EqPoly>()
  for (const p of ps) {
    if (p.size > 0) unique.set(poly_signature(p), p)
  }
  return [...unique.values()]
}

const constant_nonzero = (p: EqPoly): boolean => {
  const c = P.constant_value(p)
  return c !== undefined && r_sign(c) !== 0
}

const coefficient = (p: EqPoly, variable: number, degree: number): EqPoly => {
  const out = P.zero()
  for (const t of p.values()) {
    let count = 0
    for (const v of t.mono) if (v === variable) count++
    if (count !== degree) continue
    P.add_term(out, { mono: t.mono.filter((v) => v !== variable), coeff: t.coeff })
  }
  return out
}

const variable_power = (variable: number, degree: number): EqPoly => {
  const out = P.zero()
  P.add_term(out, { mono: Array.from({ length: degree }, () => variable), coeff: ONE })
  return out
}

const checked = (p: EqPoly, caps: BrowserEquationSolverCaps): EqPoly => {
  if (p.size > caps.max_terms) throw new Error('browser equation solver term cap')
  return p
}

const pseudo_remainder = (
  dividend: EqPoly,
  divisor: EqPoly,
  variable: number,
  caps: BrowserEquationSolverCaps,
): EqPoly => {
  const divisor_degree = poly_max_degree_of_var(divisor, variable)
  const divisor_lead = coefficient(divisor, variable, divisor_degree)
  let remainder = dividend
  let guard = 0
  while (remainder.size > 0 && poly_max_degree_of_var(remainder, variable) >= divisor_degree) {
    if (++guard > caps.max_pseudo_steps) throw new Error('browser equation solver pseudo-remainder cap')
    const degree = poly_max_degree_of_var(remainder, variable)
    const lead = coefficient(remainder, variable, degree)
    const shifted_divisor = P.mul(variable_power(variable, degree - divisor_degree), divisor)
    remainder = checked(P.add(P.mul(divisor_lead, remainder), P.neg(P.mul(lead, shifted_divisor))), caps)
  }
  return remainder
}

const substitute_all = (
  ps: EqPoly[],
  variable: number,
  num: EqPoly,
  den: EqPoly,
  caps: BrowserEquationSolverCaps,
): EqPoly[] => ps.map((p) => checked(substitute_in_poly(p, variable, num, den), caps))

const branch_output = (state: State, n_states: number): MapleBranch => {
  const solved_indices = new Set(state.chain.map((entry) => entry.v))
  const free = new Set<number>()
  for (let i = 0; i < n_states; i++) if (!solved_indices.has(i)) free.add(i)

  const variable_expr = (i: number): RealExpr => ({ tag: 'state_variable_sum', indices: [i] })
  const solved = new Map<number, RealExpr>()
  for (const entry of state.chain) {
    const numerator = poly_to_real_expr(entry.num, variable_expr)
    solved.set(entry.v, entry.den_is_const ? numerator : {
      tag: 'divide',
      numerator,
      denominator: poly_to_real_expr(entry.den, variable_expr),
    })
  }
  const conditions: Constraint[] = state.nonzero.map((p) => ({
    tag: 'not_equal',
    left: poly_to_real_expr(p, variable_expr),
    right: { tag: 'literal', value: 0 },
  }))
  return { solved, free, conditions }
}

// `undefined` means unsupported or capped, so the caller should fall through.
// An empty array means all fully explored branches contradicted.
export const solve_equations_in_browser = (
  equation_polys: EqPoly[],
  n_states: number,
  abort_signal?: AbortSignal,
  caps: BrowserEquationSolverCaps = DEFAULT_BROWSER_EQUATION_SOLVER_CAPS,
  diagnostics?: BrowserEquationSolverDiagnostics,
): MapleBranch[] | undefined => {
  const started = performance.now()
  const agenda: State[] = [{
    equations: normalize_polys(equation_polys),
    nonzero: [],
    remaining: vars_in_polys(equation_polys),
    chain: [],
    depth: 0,
    pseudo_steps: 0,
    groebner_steps: 0,
  }]
  const branches: MapleBranch[] = []
  const seen = new Set<string>()
  let nodes = 0
  let groebner_steps = 0
  let unresolved = false
  // A cap makes the decomposition incomplete, but any branches already
  // completed remain sound and useful. Preserve them instead of discarding
  // exact work merely because unexplored agenda entries remain.
  const decline = (reason: string): MapleBranch[] | undefined => {
    if (diagnostics !== undefined) {
      diagnostics.reason = reason
      diagnostics.elapsed_ms = performance.now() - started
      diagnostics.nodes = nodes
      diagnostics.branches = branches.length
      diagnostics.groebner_steps = groebner_steps
    }
    return branches.length > 0 ? branches : undefined
  }

  try {
    while (agenda.length > 0) {
      if (abort_signal?.aborted) return decline('aborted')
      if (performance.now() - started > caps.max_milliseconds) return decline('time cap')
      if (++nodes > caps.max_nodes) return decline('node cap')
      const raw = agenda.pop()!
      if (raw.depth > caps.max_depth) return decline('depth cap')
      if (raw.equations.some((p) => p.size > caps.max_terms)) return decline('term cap')

      const equations = normalize_polys(raw.equations)
      if (equations.some(constant_nonzero)) continue
      const nonzero = normalize_polys(raw.nonzero)
      if (raw.nonzero.some((p) => p.size === 0)) continue
      const nonzero_signatures = new Set(nonzero.map(poly_signature))
      if (equations.some((p) => nonzero_signatures.has(poly_signature(p)))) continue

      const state: State = { ...raw, equations, nonzero }
      const chain_signature = state.chain.map((entry) =>
        `${entry.v}=${poly_signature(entry.num)}/${poly_signature(entry.den)}`).join('|')
      const signature = `${state.remaining.join(',')}::${equations.map(poly_signature).sort().join('|')}::${nonzero.map(poly_signature).sort().join('|')}::${chain_signature}`
      if (seen.has(signature)) continue
      seen.add(signature)

      if (equations.length === 0) {
        branches.push(branch_output(state, n_states))
        if (branches.length >= caps.max_branches) return decline('branch cap')
        continue
      }

      const linear: Array<{ equation_index: number, variable: number, a: EqPoly, b: EqPoly, score: number[] }> = []
      equations.forEach((equation, equation_index) => {
        for (const variable of state.remaining) {
          const split = linear_in(equation, variable)
          if (split !== undefined) {
            let estimated_terms = 0
            for (let i = 0; i < equations.length; i++) {
              if (i === equation_index) continue
              const other = equations[i]!
              estimated_terms += poly_max_degree_of_var(other, variable) > 0
                ? split.a.size * Math.max(1, other.size) + split.b.size
                : other.size
            }
            linear.push({
              equation_index,
              variable,
              ...split,
              score: [
                P.constant_value(split.a) !== undefined ? 0 : 1,
                equations.filter((candidate) => poly_max_degree_of_var(candidate, variable) > 1).length,
                estimated_terms,
                equations.filter((candidate) => poly_max_degree_of_var(candidate, variable) > 0).length,
                split.a.size + split.b.size,
                -variable,
              ],
            })
          }
        }
      })
      linear.sort((x, y) => lex_compare(x.score, y.score))
      const pivot = linear[0]
      if (pivot !== undefined) {
        const numerator = P.neg(pivot.b)
        const a_constant = P.constant_value(pivot.a)
        const entry: ChainEntry = a_constant === undefined
          ? { v: pivot.variable, num: numerator, den: pivot.a, den_is_const: false }
          : { v: pivot.variable, num: P.scale(numerator, r_div(ONE, a_constant)), den: P.constant(ONE), den_is_const: true }
        const rest = equations.filter((_, i) => i !== pivot.equation_index)
        agenda.push({
          equations: substitute_all(rest, pivot.variable, entry.num, entry.den, caps),
          nonzero: a_constant === undefined
            ? [...substitute_all(nonzero, pivot.variable, entry.num, entry.den, caps), pivot.a]
            : substitute_all(nonzero, pivot.variable, entry.num, entry.den, caps),
          remaining: state.remaining.filter((v) => v !== pivot.variable),
          chain: [...state.chain, entry],
          depth: state.depth + 1,
          pseudo_steps: state.pseudo_steps,
          groebner_steps: state.groebner_steps,
        })
        if (a_constant === undefined) {
          agenda.push({ ...state, equations: [...rest, pivot.a, pivot.b], depth: state.depth + 1 })
        }
        continue
      }

      // Buchberger is useful before the system becomes zero-dimensional too:
      // a lex basis exposes global triangular relations while preserving the
      // whole ideal. Existing rational-pivot logic then branches on any
      // nonconstant leading coefficient, so no generic chart is silently lost.
      // Keep this bounded to one attempt per branch path and small systems.
      if (
        state.groebner_steps < caps.max_groebner_steps
        && equations.length <= caps.max_groebner_basis
        && state.remaining.length <= 10
        && equations.reduce((sum, equation) => sum + equation.size, 0) <= caps.max_terms
      ) {
        groebner_steps++
        const basis = groebner_basis(equations, {
          max_pairs: caps.max_groebner_pairs,
          max_basis: caps.max_groebner_basis,
          max_terms: caps.max_terms,
          should_stop: () => abort_signal?.aborted === true
            || performance.now() - started > caps.max_milliseconds,
        })
        if (abort_signal?.aborted) return decline('aborted')
        if (performance.now() - started > caps.max_milliseconds) return decline('time cap')
        if (basis !== undefined) {
          agenda.push({
            ...state,
            equations: basis,
            depth: state.depth + 1,
            groebner_steps: state.groebner_steps + 1,
          })
          continue
        }
      }

      let pseudo: { variable: number, divisor_index: number, dividend_index: number, divisor_degree: number } | undefined
      for (const variable of state.remaining) {
        const involving = equations
          .map((p, index) => ({ index, degree: poly_max_degree_of_var(p, variable) }))
          .filter((x) => x.degree > 0)
          .sort((a, b) => a.degree - b.degree)
        for (let i = 0; i < involving.length - 1 && pseudo === undefined; i++) {
          for (let j = i + 1; j < involving.length; j++) {
            if (involving[i]!.degree < involving[j]!.degree) {
              pseudo = { variable, divisor_index: involving[i]!.index, dividend_index: involving[j]!.index, divisor_degree: involving[i]!.degree }
              break
            }
          }
        }
        if (pseudo !== undefined) break
      }
      if (pseudo === undefined) {
        const split = choose_factor_split(equations, caps)
        if (split === undefined) {
          unresolved = true
          continue
        }
        const rest = equations.filter((_, index) => index !== split.equation_index)
        agenda.push({ ...state, equations: [...rest, split.factor], depth: state.depth + 1 })
        agenda.push({ ...state, equations: [...rest, split.quotient], depth: state.depth + 1 })
        continue
      }

      const divisor = equations[pseudo.divisor_index]!
      const dividend = equations[pseudo.dividend_index]!
      const lead = coefficient(divisor, pseudo.variable, pseudo.divisor_degree)
      const remainder = pseudo_remainder(dividend, divisor, pseudo.variable, caps)
      const generic = equations.filter((_, i) => i !== pseudo!.dividend_index)
      if (remainder.size > 0) generic.push(remainder)
      agenda.push({
        ...state,
        equations: generic,
        nonzero: [...nonzero, lead],
        depth: state.depth + 1,
        pseudo_steps: state.pseudo_steps + 1,
      })
      if (P.constant_value(lead) === undefined) {
        const lower = P.add(divisor, P.neg(P.mul(lead, variable_power(pseudo.variable, pseudo.divisor_degree))))
        agenda.push({
          ...state,
          equations: [...equations.filter((_, i) => i !== pseudo!.divisor_index), lead, lower],
          depth: state.depth + 1,
          pseudo_steps: state.pseudo_steps + 1,
        })
      }
    }
  } catch (error) {
    return decline(error instanceof Error ? error.message : 'internal error')
  }
  if (diagnostics !== undefined) {
    diagnostics.reason = unresolved ? (branches.length === 0 ? 'unresolved' : 'partial') : 'complete'
    diagnostics.elapsed_ms = performance.now() - started
    diagnostics.nodes = nodes
    diagnostics.branches = branches.length
    diagnostics.groebner_steps = groebner_steps
  }
  return unresolved && branches.length === 0 ? undefined : branches
}
