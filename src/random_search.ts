// Random-search solver orchestrator.
//
// Ports the `Method -> "Random"` branch of the Mathematica PrSAT reference
// (PrSAT.m lines 886–995) to pure TypeScript. Does NOT use Z3.
//
// Algorithm:
//   1. Translate user constraints (Pr → state_variable_sum) and enrich with
//      probability axioms (incl. Σ a_i = 1) and div0 conditions.
//   2. Equation elimination (equation_elimination.ts): absorb top-level
//      equations — linear ones exactly, nonlinear ones via generic-branch
//      v = −B/A substitutions — leaving a (mostly) pure-inequality residual
//      system in k free variables. Inconsistent linear equations → sound UNSAT.
//   3. Build a numeric cost function f over the k free variables with
//      f(x) < ε iff constraints are numerically satisfied (cost_function.ts).
//   4. For up to `search_attempts` attempts:
//        - Sample free coordinates from a Dirichlet(1,...,1) point over n atoms.
//        - Minimize f with Nelder-Mead (early stop), then polish (no early stop).
//        - If f(x*) < ε: rationalize the free coordinates (small denominators
//          first), reconstruct the pinned variables exactly (equations hold by
//          construction), and verify the full system in exact rational
//          arithmetic.
//        - If verification succeeds, return SAT.
//   5. If no attempt verifies: return 'unknown'.

import {
  enrich_constraints,
  translate,
  translate_constraint_or_real_expr,
  TruthTable,
  div0_conditions_in_constraint_or_real_expr,
  free_real_variables_in_constraint_or_real_expr,
  free_variables_in_constraint_or_real_expr,
  LetterSet,
  variables_in_constraints,
} from './pr_sat'
import { PrSat, ConstraintOrRealExpr } from './types'
import {
  eliminate_equations,
  eliminate_specialized_partial,
  EquationElimination,
  evaluate_chain,
  poly_max_degree_of_var,
  reconstruct_full_assignment,
  substitute_constraint,
  vars_in_polys,
} from './equation_elimination'
import { solve_zero_dimensional, ZeroDimCaps } from './groebner'
import { MapleBranch, solve_equations_via_maple } from './maple_bridge_client'
import { extract_equation_system, substitute_constraint_indices } from './equation_elimination'
import { Random } from './random'
import { sleep } from './utils'
import { build_cost_function, MATHEMATICA_MARGIN } from './cost_function'
import { minimize } from './optimizer'
import {
  Rational, ZERO, ONE, r_sub, r_sign, r_add, r_cmp, r_from_fraction,
  rationalize,
  evaluate_real_expr_rational,
  evaluate_constraint_rational,
  verify_rational_model,
} from './rationalize'
import {
  FancyEvaluatorOutput, ModelAssignmentOutput, WrappedSolverResult,
} from './z3_integration'
import {
  translate_constraints_cooper,
  translate_constraint_or_real_expr_cooper,
} from './cooper'
import {
  translate_constraints_cck,
  translate_constraint_or_real_expr_cck,
} from './cck'

type Constraint = PrSat['Constraint']
type RealExpr = PrSat['RealExpr']

export const DEFAULT_REG_MARGIN = 1e-3
export const DEFAULT_SEARCH_ATTEMPTS = 3
export const DEFAULT_MAX_RATIONALIZE_ATTEMPTS = 40
export type ProbabilitySemantics = 'classical' | 'trivalent-ers' | 'trivalent-cck'

// Numeric acceptance threshold. Non-strict inequalities sitting exactly on
// their boundary (e.g. a state pinned to 0 by a certainty constraint) have
// cost exactly 0, so a strict `fMin < 0` test can never accept them. Anything
// below this epsilon is treated as numerically satisfied — the exact rational
// verification is the real judge. Genuinely violated strict inequalities cost
// at least the margin (1e-6), three orders of magnitude above this.
export const NUMERIC_ACCEPT_EPS = 1e-9

// Models are only accepted when every state value's denominator is at most
// this bound — Branden's rule: never return an ugly-but-exact witness; keep
// searching for a pretty one instead.
export const DEFAULT_MAX_MODEL_DENOMINATOR = 10_000n

const is_pretty_model = (full: Record<number, Rational>, max_den: bigint = DEFAULT_MAX_MODEL_DENOMINATOR): boolean => {
  for (const v of Object.values(full)) {
    if (v.d > max_den) return false
  }
  return true
}

export type RandomSearchOptions = {
  semantics: ProbabilitySemantics
  regular: boolean
  search_attempts: number
  margin: number
  reg_margin: number
  max_rationalize_attempts: number
  seed?: string
  abort_signal?: AbortSignal
  onTranslated?: (translated: Constraint[]) => void
  // Optional local Maple bridge (maple_bridge/server.mjs): equations are
  // solved by desktop Maple and each rational solution branch is searched.
  maple_bridge_url?: string
}

const DEFAULTS: Omit<RandomSearchOptions, 'seed' | 'abort_signal' | 'onTranslated'> = {
  semantics: 'classical',
  regular: false,
  search_attempts: DEFAULT_SEARCH_ATTEMPTS,
  margin: MATHEMATICA_MARGIN,
  reg_margin: DEFAULT_REG_MARGIN,
  max_rationalize_attempts: DEFAULT_MAX_RATIONALIZE_ATTEMPTS,
}

// Matches PrSATResult from z3_integration.ts (so callers can interoperate)
// but with extra random-search-specific metadata. Uses `smtlib_input` to hold
// a human-readable run descriptor; this preserves the existing "Save SMTLIB"
// button behavior while not being actual SMTLIB.
export type RandomPrSATResult = {
  constraints: {
    original: Constraint[]
    translated: Constraint[]
    extra: Constraint[]
    eliminated: Constraint[]
  }
  smtlib_input: string
  method: 'random'
  semantics: ProbabilitySemantics
  seed: string
  used_maple_bridge?: boolean
  // Exact rational model (when sat) — plain data, so it survives the
  // structured clone across the Web Worker boundary; the main thread rebuilds
  // the `evaluate` closure from it.
  rational_model?: Record<number, Rational>
  attempts_used: number
  final_fmin?: number           // best numerical objective found across attempts
  solver_output: WrappedSolverResult
}

const describe_run = (opts: RandomSearchOptions, seed: string, attempts_used: number, status: string, fmin?: number): string => {
  const lines = [
    opts.semantics === 'trivalent-ers'
      ? `; Trivalent (ERS) Random Search run`
      : opts.semantics === 'trivalent-cck'
        ? `; Trivalent (CCK) Random Search run`
        : `; PrSAT Random Search run`,
    `; semantics = ${opts.semantics}`,
    `; seed = ${seed}`,
    `; search_attempts = ${opts.search_attempts}`,
    `; attempts_used = ${attempts_used}`,
    `; margin = ${opts.margin}`,
    `; reg_margin = ${opts.reg_margin}`,
    `; regular = ${opts.regular}`,
    `; status = ${status}`,
  ]
  if (fmin !== undefined) lines.push(`; final_fmin = ${fmin}`)
  return lines.join('\n')
}

// ---------- Dirichlet sampling ----------

// Dirichlet(1,...,1) over n atoms via exponential normalization:
//   u_i = -ln(Random.unit())
//   return u_i / sum(u)
// Returns array of length n, elements ≥ 0, sum === 1.
export const sample_dirichlet_ones = (random: Random, n: number): number[] => {
  if (n <= 0) throw new Error(`sample_dirichlet_ones: n must be positive, got ${n}`)
  const us = new Array<number>(n)
  let total = 0
  for (let i = 0; i < n; i++) {
    // Random.unit() is in [0, 1); guard against zero → -ln(0) = +∞.
    let u = random.unit()
    while (u === 0) u = random.unit()
    const e = -Math.log(u)
    us[i] = e
    total += e
  }
  for (let i = 0; i < n; i++) us[i]! /= total
  return us
}

// ---------- Rational → ModelAssignmentOutput ----------

const bigint_literal_output = (n: bigint): ModelAssignmentOutput => {
  const value = Number(n)
  // Past 2^53 the float is lossy: carry the exact digits for display.
  return Number.isSafeInteger(value)
    ? { tag: 'literal', value }
    : { tag: 'literal', value, source: n.toString() }
}

export const rational_to_model_assignment = (r: Rational): ModelAssignmentOutput => {
  if (r.n === 0n) return { tag: 'literal', value: 0 }
  if (r.d === 1n) {
    const pos = bigint_literal_output(r.n < 0n ? -r.n : r.n)
    return r.n < 0n ? { tag: 'negative', inner: pos } : pos
  }
  const neg = r.n < 0n
  const abs_n = neg ? -r.n : r.n
  const frac: ModelAssignmentOutput = {
    tag: 'rational',
    numerator: bigint_literal_output(abs_n),
    denominator: bigint_literal_output(r.d),
  }
  return neg ? { tag: 'negative', inner: frac } : frac
}

// ---------- Rationalize vector while preserving simplex constraint ----------

// Rationalize each coordinate then set last = 1 - sum(rest). Returns
// `undefined` if the resulting last coordinate falls outside [0, 1] (caller
// should halve tol and retry).
const rationalize_vector_with_eliminated = (
  xs: number[],
  tol: number,
): Record<number, Rational> | undefined => {
  const rs: Rational[] = xs.map((x) => rationalize(x, tol))
  let sum: Rational = ZERO
  for (const r of rs) sum = { n: sum.n * r.d + r.n * sum.d, d: sum.d * r.d }
  // Re-normalize sum denominators (cheap — normalize via r_sub below).
  const last_rational = r_sub(ONE, sum)
  if (r_sign(last_rational) < 0) return undefined  // sum > 1, infeasible
  if (last_rational.n > last_rational.d) return undefined  // last > 1, infeasible (shouldn't happen if sum >= 0)
  const assignments: Record<number, Rational> = {}
  for (let i = 0; i < rs.length; i++) {
    if (r_sign(rs[i]!) < 0) return undefined
    assignments[i] = rs[i]!
  }
  assignments[xs.length] = last_rational
  return assignments
}

// ---------- Rational-model evaluator for use in PrSATResult.solver_output.evaluate ----------

export const build_rational_evaluator = (
  rational_assignments: Record<number, Rational>,
) => async (evt_tt: TruthTable, c_or_re: ConstraintOrRealExpr): Promise<FancyEvaluatorOutput> => {
  // Check for free sentence or real variables (not declared in the truth table).
  const declared_letters = new LetterSet([...evt_tt.letters()])
  const free_sent = free_variables_in_constraint_or_real_expr(c_or_re, new LetterSet(), declared_letters)
  const free_real = free_real_variables_in_constraint_or_real_expr(c_or_re, new Set())
  if (!free_sent.is_empty() || free_real.size > 0) {
    return { tag: 'undeclared-vars', variables: { sentence: [...free_sent], real: [...free_real] } }
  }

  const translated_c_or_re = translate_constraint_or_real_expr(evt_tt, c_or_re)

  // Check div0 conditions against the rational model.
  const div0s = div0_conditions_in_constraint_or_real_expr(translated_c_or_re)
  for (const c of div0s) {
    const result = evaluate_constraint_rational(c, rational_assignments)
    if (result.tag !== 'ok') {
      // Fall through as if div0 — safest
      return { tag: 'div0' }
    }
    if (result.value === false) return { tag: 'div0' }
  }

  // Evaluate the expression/constraint itself.
  if (translated_c_or_re.tag === 'constraint') {
    const result = evaluate_constraint_rational(translated_c_or_re.constraint, rational_assignments)
    if (result.tag !== 'ok') return { tag: 'div0' }  // best-effort fallback
    return { tag: 'bool-result', result: result.value }
  }
  const result = evaluate_real_expr_rational(translated_c_or_re.real_expr, rational_assignments)
  if (result.tag !== 'ok') return { tag: 'div0' }
  return { tag: 'result', result: rational_to_model_assignment(result.value) }
}

export const build_rational_cooper_evaluator = (
  rational_assignments: Record<number, Rational>,
) => async (evt_tt: TruthTable, c_or_re: ConstraintOrRealExpr): Promise<FancyEvaluatorOutput> => {
  const declared_letters = new LetterSet([...evt_tt.letters()])
  const free_sent = free_variables_in_constraint_or_real_expr(c_or_re, new LetterSet(), declared_letters)
  const free_real = free_real_variables_in_constraint_or_real_expr(c_or_re, new Set())
  if (!free_sent.is_empty() || free_real.size > 0) {
    return { tag: 'undeclared-vars', variables: { sentence: [...free_sent], real: [...free_real] } }
  }

  const translated_c_or_re = translate_constraint_or_real_expr_cooper(evt_tt, c_or_re)
  const div0s = div0_conditions_in_constraint_or_real_expr(translated_c_or_re)
  for (const c of div0s) {
    const result = evaluate_constraint_rational(c, rational_assignments)
    if (result.tag !== 'ok') return { tag: 'div0' }
    if (result.value === false) return { tag: 'div0' }
  }

  if (translated_c_or_re.tag === 'constraint') {
    const result = evaluate_constraint_rational(translated_c_or_re.constraint, rational_assignments)
    if (result.tag !== 'ok') return { tag: 'div0' }
    return { tag: 'bool-result', result: result.value }
  }
  const result = evaluate_real_expr_rational(translated_c_or_re.real_expr, rational_assignments)
  if (result.tag !== 'ok') return { tag: 'div0' }
  return { tag: 'result', result: rational_to_model_assignment(result.value) }
}

export const build_rational_cck_evaluator = (
  rational_assignments: Record<number, Rational>,
) => async (evt_tt: TruthTable, c_or_re: ConstraintOrRealExpr): Promise<FancyEvaluatorOutput> => {
  const declared_letters = new LetterSet([...evt_tt.letters()])
  const free_sent = free_variables_in_constraint_or_real_expr(c_or_re, new LetterSet(), declared_letters)
  const free_real = free_real_variables_in_constraint_or_real_expr(c_or_re, new Set())
  if (!free_sent.is_empty() || free_real.size > 0) {
    return { tag: 'undeclared-vars', variables: { sentence: [...free_sent], real: [...free_real] } }
  }

  const translated_c_or_re = translate_constraint_or_real_expr_cck(evt_tt, c_or_re)
  const div0s = div0_conditions_in_constraint_or_real_expr(translated_c_or_re)
  for (const c of div0s) {
    const result = evaluate_constraint_rational(c, rational_assignments)
    if (result.tag !== 'ok') return { tag: 'div0' }
    if (result.value === false) return { tag: 'div0' }
  }

  if (translated_c_or_re.tag === 'constraint') {
    const result = evaluate_constraint_rational(translated_c_or_re.constraint, rational_assignments)
    if (result.tag !== 'ok') return { tag: 'div0' }
    return { tag: 'bool-result', result: result.value }
  }
  const result = evaluate_real_expr_rational(translated_c_or_re.real_expr, rational_assignments)
  if (result.tag !== 'ok') return { tag: 'div0' }
  return { tag: 'result', result: rational_to_model_assignment(result.value) }
}

const build_rational_semantic_evaluator = (
  semantics: ProbabilitySemantics,
  assignments: Record<number, Rational>,
) =>
  semantics === 'trivalent-ers'
    ? build_rational_cooper_evaluator(assignments)
    : semantics === 'trivalent-cck'
      ? build_rational_cck_evaluator(assignments)
      : build_rational_evaluator(assignments)

// ---------- Maple-bridge branch search ----------

// Search one Maple solution branch: substitute the branch's rational-function
// solutions into the non-equation conjuncts, run Nelder-Mead over the branch's
// free variables, snap to small rationals, evaluate the solved variables
// EXACTLY, and verify the full system.
const search_maple_branch = async (
  branch: MapleBranch,
  other_conjuncts: Constraint[],
  enriched: Constraint[],
  n_states: number,
  random: Random,
  opts: RandomSearchOptions,
): Promise<{ assignments: Record<number, Rational>, attempts: number, fmin: number } | undefined> => {
  const free_list = [...branch.free].sort((a, b) => a - b)
  const compact = new Map(free_list.map((f, j) => [f, j] as const))

  // Resolve each solved expression down to free variables only (Maple
  // occasionally chains solved variables), remapping to compact indices.
  const resolving = new Set<number>()
  const resolved = new Map<number, RealExpr>()
  const resolve = (i: number): RealExpr | undefined => {
    const j = compact.get(i)
    if (j !== undefined) return { tag: 'state_variable_sum', indices: [j] }
    if (resolved.has(i)) return resolved.get(i)!
    if (resolving.has(i)) return undefined  // cycle
    const raw = branch.solved.get(i)
    if (raw === undefined) return undefined
    resolving.add(i)
    const result = rewrite(raw)
    resolving.delete(i)
    if (result !== undefined) resolved.set(i, result)
    return result
  }
  const rewrite = (e: RealExpr): RealExpr | undefined => {
    try {
      const c = substitute_constraint_indices(
        { tag: 'equal', left: e, right: { tag: 'literal', value: 0 } },
        (i) => {
          const r = resolve(i)
          if (r === undefined) throw new Error('unresolvable')
          return r
        },
      )
      return c.tag === 'equal' ? c.left : undefined
    } catch {
      return undefined
    }
  }
  for (const i of branch.solved.keys()) {
    if (resolve(i) === undefined) return undefined  // unresolvable branch
  }

  const replace_index = (i: number): RealExpr => {
    const r = resolve(i)
    if (r === undefined) throw new Error(`search_maple_branch: unresolvable index ${i}`)
    return r
  }
  let residual_compact: Constraint[]
  try {
    residual_compact = other_conjuncts.map((c) => substitute_constraint_indices(c, replace_index))
  } catch {
    return undefined
  }

  const evaluate_full = (free_values: Record<number, Rational>): Record<number, Rational> | undefined => {
    // free_values keyed by COMPACT index.
    const full: Record<number, Rational> = {}
    for (const [f, j] of compact) full[f] = free_values[j]!
    for (const i of branch.solved.keys()) {
      const expr = resolved.get(i)!
      const r = evaluate_real_expr_rational(expr, free_values)
      if (r.tag !== 'ok') return undefined
      full[i] = r.value
    }
    return full
  }

  const k = free_list.length
  if (k === 0) {
    const full = evaluate_full({})
    if (full === undefined) return undefined
    if (!is_pretty_model(full)) return undefined
    const verify = verify_rational_model(enriched, full)
    return verify.tag === 'ok' && verify.value ? { assignments: full, attempts: 0, fmin: -1 } : undefined
  }

  const cost_fn = build_cost_function(residual_compact, { margin: opts.margin })
  for (let attempt = 1; attempt <= opts.search_attempts; attempt++) {
    if (opts.abort_signal?.aborted) return undefined
    await sleep(0)
    const full_sample = sample_dirichlet_ones(random, n_states)
    const x0 = free_list.map((i) => full_sample[i]!)
    const result = minimize(cost_fn, x0, { earlyStopBelow: 0, abort_signal: opts.abort_signal })
    if (result.reason === 'cancelled') return undefined
    if (result.fMin >= NUMERIC_ACCEPT_EPS) continue
    const polished = minimize(cost_fn, result.xMin, { abort_signal: opts.abort_signal })
    const x_best = polished.fMin < result.fMin ? polished.xMin : result.xMin

    // Snap free coordinates: common denominators first, then continued fractions.
    const try_free = (rs: Rational[]): Record<number, Rational> | undefined => {
      const free_values: Record<number, Rational> = {}
      for (let j = 0; j < rs.length; j++) {
        if (r_sign(rs[j]!) < 0) return undefined
        free_values[j] = rs[j]!
      }
      const full = evaluate_full(free_values)
      if (full === undefined) return undefined
      if (!is_pretty_model(full)) return undefined  // pretty witnesses only
      const verify = verify_rational_model(enriched, full)
      return verify.tag === 'ok' && verify.value ? full : undefined
    }
    for (let q = 1n; q <= BigInt(DEFAULT_MAX_COMMON_DENOMINATOR); q++) {
      if (q % 16n === 0n) {
        if (opts.abort_signal?.aborted) return undefined
        await sleep(0)
      }
      const rs: Rational[] = []
      let ok = true
      for (const x of x_best) {
        const p = BigInt(Math.round(x * Number(q)))
        if (p < 0n || p > q) { ok = false; break }
        rs.push(r_from_fraction(p, q))
      }
      if (!ok) continue
      const full = try_free(rs)
      if (full !== undefined) return { assignments: full, attempts: attempt, fmin: result.fMin }
    }
    // Coarse continued fractions only — fine tolerances yield ugly models
    // the prettiness gate rejects.
    let tol = 0.25
    for (let i = 0; i < Math.min(opts.max_rationalize_attempts, 12); i++) {
      const full = try_free(x_best.map((x) => rationalize(x, tol)))
      if (full !== undefined) return { assignments: full, attempts: attempt, fmin: result.fMin }
      tol /= 2
    }
  }
  return undefined
}

// ---------- Main entry point ----------

export const random_pr_sat_wrapped = async (
  tt: TruthTable,
  constraints: Constraint[],
  options?: Partial<RandomSearchOptions>,
): Promise<RandomPrSATResult> => {
  const opts: RandomSearchOptions = { ...DEFAULTS, ...(options ?? {}) }

  // Reject free real variables up front — v1 limitation.
  const vars = variables_in_constraints(constraints)
  if (vars.real.length > 0) {
    throw new Error(
      `Random search does not yet support constraints with free real variables: ${vars.real.join(', ')}`,
    )
  }

  const random = new Random(opts.seed)
  const translated = opts.semantics === 'trivalent-ers'
    ? translate_constraints_cooper(tt, constraints)
    : opts.semantics === 'trivalent-cck'
      ? translate_constraints_cck(tt, constraints)
      : translate(tt, constraints)
  opts.onTranslated?.(translated)

  const n_states = tt.n_states()
  // Enrich WITHOUT pre-eliminating a state variable: axioms a_i ≥ 0 for all i
  // plus the equation Σ a_i = 1, which the linear elimination below absorbs
  // (eliminating the last variable is just its simplest special case).
  const enriched = enrich_constraints(tt, undefined, opts.regular, translated)

  const elimination = eliminate_equations(n_states, enriched)

  const output_constraints = {
    original: constraints,
    translated,
    extra: enriched,
    eliminated: elimination.tag === 'eliminated'
      ? elimination.residual_conjuncts.map((c) => substitute_constraint(c, elimination))
      : [],
  }

  const make_result = (
    attempts_used: number,
    solver_output: WrappedSolverResult,
    fmin?: number,
  ): RandomPrSATResult => ({
    constraints: output_constraints,
    smtlib_input: describe_run(opts, random.seed_string, attempts_used, solver_output.status, fmin),
    method: 'random',
    semantics: opts.semantics,
    seed: random.seed_string,
    attempts_used,
    final_fmin: fmin,
    solver_output,
  })

  // Inconsistent linear equations: the original system is UNSAT — equations
  // (and the Σ a_i = 1 axiom) are implied by the system, so an inconsistent
  // linear subsystem refutes the whole thing. This is the one case where
  // random search can soundly report UNSAT.
  if (elimination.tag === 'inconsistent') {
    return make_result(0, { status: 'unsat' })
  }

  // Optional local Maple bridge: hand the equations to desktop Maple, then
  // search each rational solution branch (PrSAT.m's sol1[[i]] loop). Falls
  // through if the bridge is unreachable, the solve fails, or no branch
  // certifies.
  if (opts.maple_bridge_url !== undefined) {
    const { equation_polys, other_conjuncts } = extract_equation_system(enriched)
    if (equation_polys.length > 0) {
      const branches = await solve_equations_via_maple(equation_polys, n_states, opts.maple_bridge_url, opts.abort_signal)
      if (branches !== undefined) {
        for (const branch of branches) {
          if (opts.abort_signal?.aborted) break
          const found = await search_maple_branch(branch, other_conjuncts, enriched, n_states, random, opts)
          if (found !== undefined) {
            const state_assignments: Record<number, ModelAssignmentOutput> = {}
            for (const [key, v] of Object.entries(found.assignments)) state_assignments[Number(key)] = rational_to_model_assignment(v)
            const result = make_result(found.attempts, {
              status: 'sat',
              state_assignments,
              evaluate: build_rational_semantic_evaluator(opts.semantics, found.assignments),
            }, found.fmin)
            result.used_maple_bridge = true
            result.rational_model = found.assignments
            return result
          }
        }
      }
    }
  }

  const sat_result = (attempt: number, assignments: Record<number, Rational>, fmin?: number): RandomPrSATResult => {
    const state_assignments: Record<number, ModelAssignmentOutput> = {}
    for (const [k, v] of Object.entries(assignments)) state_assignments[Number(k)] = rational_to_model_assignment(v)
    const result = make_result(attempt, {
      status: 'sat',
      state_assignments,
      evaluate: build_rational_semantic_evaluator(opts.semantics, assignments),
    }, fmin)
    result.rational_model = assignments
    return result
  }

  const free_indices = elimination.free_indices
  const k = free_indices.length

  // All state variables pinned by the equations: the solution is unique
  // (on the generic branch). Verify it exactly — if it satisfies everything,
  // SAT; if it fails and the elimination used only constant denominators
  // (genuinely unique solution), the system is UNSAT.
  if (k === 0) {
    const assignments = reconstruct_full_assignment(elimination, {})
    if (assignments === undefined) {
      return make_result(0, { status: 'unknown' })
    }
    const verify = verify_rational_model(enriched, assignments)
    if (verify.tag === 'ok' && verify.value) {
      return sat_result(0, assignments)
    }
    if (verify.tag === 'ok' && elimination.sound) {
      return make_result(0, { status: 'unsat' })
    }
    return make_result(0, { status: 'unknown' })
  }

  // Pure-inequality (plus any leftover nonlinear-equation) residual system in
  // the k free variables, renumbered to compact coordinates 0..k-1.
  const residual_compact = elimination.residual_conjuncts.map((c) => substitute_constraint(c, elimination))
  const cost_fn = build_cost_function(residual_compact, { margin: opts.margin })

  let best_fmin: number | undefined = undefined

  for (let attempt = 1; attempt <= opts.search_attempts; attempt++) {
    if (opts.abort_signal?.aborted) {
      return make_result(attempt - 1, { status: 'cancelled' }, best_fmin)
    }
    await sleep(0)  // keep the UI responsive between attempts

    // Sample the free coordinates from a Dirichlet point over the full state
    // space (keeps the scale right; for the no-equations case this matches the
    // old eliminate-last-variable sampling exactly).
    const full = sample_dirichlet_ones(random, n_states)
    const x0 = free_indices.map((i) => full[i]!)

    const result = minimize(cost_fn, x0, {
      earlyStopBelow: 0,
      abort_signal: opts.abort_signal,
    })
    if (best_fmin === undefined || result.fMin < best_fmin) best_fmin = result.fMin

    if (result.reason === 'cancelled') {
      return make_result(attempt, { status: 'cancelled' }, best_fmin)
    }

    if (result.fMin < NUMERIC_ACCEPT_EPS) {
      // Numerical success — but the early stop fires the moment f dips below
      // zero, leaving the point just barely inside the feasible region.
      // Polish: keep minimizing (no early stop) to push the point deeper, so
      // the coarse small-denominator rationalization below verifies.
      const polished = minimize(cost_fn, result.xMin, {
        abort_signal: opts.abort_signal,
      })
      const x_best = polished.fMin < result.fMin ? polished.xMin : result.xMin

      // Rationalize the free coordinates, reconstruct the pinned ones exactly
      // (consumed equations hold by construction), and verify everything.
      const assignments = await try_rationalize_reconstruct_verify(
        x_best,
        elimination,
        enriched,
        opts.max_rationalize_attempts,
        DEFAULT_MAX_COMMON_DENOMINATOR,
        opts.abort_signal,
      )
      if (assignments !== undefined) {
        return sat_result(attempt, assignments, result.fMin)
      }
      // Rationalization/verification failed — continue with next attempt.
    }
  }

  return make_result(opts.search_attempts, { status: 'unknown' }, best_fmin)
}

// Snap every coordinate to the nearest multiple of 1/q and set the eliminated
// coordinate to 1 - sum. Returns undefined if any coordinate leaves [0, 1].
const snap_vector_to_denominator = (
  xs: number[],
  q: bigint,
): Record<number, Rational> | undefined => {
  const assignments: Record<number, Rational> = {}
  let sum: Rational = ZERO
  for (let i = 0; i < xs.length; i++) {
    const p = BigInt(Math.round(xs[i]! * Number(q)))
    if (p < 0n || p > q) return undefined
    const r = r_from_fraction(p, q)
    assignments[i] = r
    sum = r_add(sum, r)
  }
  const last = r_sub(ONE, sum)
  if (r_sign(last) < 0 || r_cmp(last, ONE) > 0) return undefined
  assignments[xs.length] = last
  return assignments
}

export const DEFAULT_MAX_COMMON_DENOMINATOR = 200

const n_states_of = (elimination: Extract<EquationElimination, { tag: 'eliminated' }>): number =>
  elimination.free_indices.length + elimination.chain.length

// Small-denominator rationalization for the equation-eliminated path: snap or
// continued-fraction the FREE coordinates, reconstruct the pinned (pivot)
// coordinates exactly from the linear solution, and verify the full original
// system under exact rational arithmetic.
const try_rationalize_reconstruct_verify = async (
  xs: number[],  // free coordinates, in compact (free_indices) order
  elimination: Extract<EquationElimination, { tag: 'eliminated' }>,
  enriched_constraints: Constraint[],
  max_attempts: number,
  max_common_denominator: number = DEFAULT_MAX_COMMON_DENOMINATOR,
  abort_signal?: AbortSignal,
): Promise<Record<number, Rational> | undefined> => {
  // This runs on the main thread in the browser: yield to the event loop
  // periodically so the page stays responsive and Cancel works.
  let work_counter = 0
  const breathe = async (): Promise<boolean> => {
    if (abort_signal?.aborted) return false
    if (++work_counter % 16 === 0) await sleep(0)
    return true
  }
  const attempt = (rs: Rational[] | undefined): Record<number, Rational> | undefined => {
    if (rs === undefined) return undefined
    const free_values: Record<number, Rational> = {}
    for (let j = 0; j < rs.length; j++) {
      if (r_sign(rs[j]!) < 0) return undefined
      free_values[elimination.free_indices[j]!] = rs[j]!
    }
    const full = reconstruct_full_assignment(elimination, free_values)
    if (full === undefined) return undefined  // generic-branch denominator vanished
    if (!is_pretty_model(full)) return undefined  // pretty witnesses only
    const verify = verify_rational_model(enriched_constraints, full)
    return verify.tag === 'ok' && verify.value ? full : undefined
  }

  // Pass 1: common-denominator scan (small uniform denominators).
  for (let q = 1n; q <= BigInt(max_common_denominator); q++) {
    if (!await breathe()) return undefined
    const rs: Rational[] = []
    let ok = true
    for (const x of xs) {
      const p = BigInt(Math.round(x * Number(q)))
      if (p < 0n || p > q) { ok = false; break }
      rs.push(r_from_fraction(p, q))
    }
    if (!ok) continue
    const full = attempt(rs)
    if (full !== undefined) return full
  }

  // Pass 2: snap-then-re-eliminate. When the symbolic elimination left
  // equations behind, pin most free variables to snapped rationals and re-run
  // the elimination on the ORIGINAL equation system (not the leftovers — their
  // degrees in the unpinned variables are unfixable). With the pinned
  // coefficients now constant, the original equations are typically solvable
  // for the remaining variables exactly (this mirrors what a CAS `solve` does
  // along one branch, evaluated at a point).
  const leftover = elimination.leftover_equations
  if (leftover.length > 0) {
    const float_of: Record<number, number> = {}
    elimination.free_indices.forEach((f, j) => { float_of[f] = xs[j]! })
    const eq_vars = vars_in_polys(leftover).filter((v) => float_of[v] !== undefined)
    const m = leftover.length

    // Candidate sets of variables to leave UNPINNED (to be solved for):
    // size-m subsets of the variables occurring in the leftover equations,
    // ranked by total degree (prefer solving for low-degree variables).
    const subsets: number[][] = []
    const choose = (start: number, acc: number[]): void => {
      if (acc.length === m) {
        subsets.push([...acc])
        return
      }
      for (let i = start; i < eq_vars.length; i++) {
        acc.push(eq_vars[i]!)
        choose(i + 1, acc)
        acc.pop()
      }
    }
    if (m <= eq_vars.length) choose(0, [])
    const degree_sum = (U: number[]): number =>
      U.reduce((acc, v) => acc + leftover.reduce((a, p) => a + poly_max_degree_of_var(p, v), 0), 0)
    subsets.sort((u1, u2) => degree_sum(u1) - degree_sum(u2))
    const MAX_SUBSETS = 8
    const MAX_SNAP_Q = 48
    // Zero-dimensional solving dominates the cost (~100ms+ per call): use
    // tight caps so blowups bail fast, and budget the calls per attempt.
    const IN_LOOP_ZD_CAPS: ZeroDimCaps = {
      max_solutions: 4,
      max_unknowns: 5,
      groebner: { max_pairs: 400, max_basis: 24, max_terms: 800 },
    }
    let zd_budget = 120

    // q-outer / subset-inner: cheap (small-denominator) certificates across
    // all subsets are tried before expensive high-q ones.
    const subset_list = subsets.slice(0, MAX_SUBSETS)
    for (let q = 1n; q <= BigInt(MAX_SNAP_Q); q++) {
      for (const U of subset_list) {
        const unpinned = new Set(U)
        if (abort_signal?.aborted || zd_budget <= 0) return undefined
        await sleep(0)  // pass 2 iterations are the heavy ones: always yield
        // Pin every chain-1 free variable except those in U; the chain-1
        // eliminated variables stay unpinned too (the re-run solves them).
        const pinned: Record<number, Rational> = {}
        let ok = true
        for (const f of elimination.free_indices) {
          if (unpinned.has(f)) continue
          const p = BigInt(Math.round(float_of[f]! * Number(q)))
          if (p < 0n || p > q) { ok = false; break }
          pinned[f] = r_from_fraction(p, q)
        }
        if (!ok) continue
        // Re-eliminate the FULL original equation system at the pinned values.
        const part = eliminate_specialized_partial(elimination.equation_polys, pinned)
        if (part === 'contradiction') continue
        // Equations the successive elimination could not absorb form a
        // zero-dimensional system in the few remaining unknowns: enumerate its
        // exact rational solutions (lex Groebner basis + rational roots).
        let completions: Array<Record<number, Rational>>
        if (part.leftover.length === 0) {
          completions = [{}]
        } else {
          zd_budget--
          completions = solve_zero_dimensional(part.leftover, IN_LOOP_ZD_CAPS)
        }
        for (const completion of completions) {
          const chain2_vars = new Set(part.chain.map((e) => e.v))
          const known: Record<number, Rational> = { ...pinned, ...completion }
          // Unpinned variables solved by neither the chain nor the
          // zero-dimensional step dropped out of the equations entirely:
          // fill from their snapped floats.
          for (const u of U) {
            if (known[u] === undefined && !chain2_vars.has(u) && float_of[u] !== undefined) {
              const p = BigInt(Math.round(float_of[u]! * Number(q)))
              known[u] = r_from_fraction(p < 0n ? 0n : p > q ? q : p, q)
            }
          }
          const solved = evaluate_chain(part.chain, known)
          if (solved === undefined) continue
          const full: Record<number, Rational> = { ...solved }
          let complete = true
          for (let i = 0; i < n_states_of(elimination); i++) {
            if (full[i] === undefined) {
              if (unpinned.has(i) && float_of[i] !== undefined) {
                const p = BigInt(Math.round(float_of[i]! * Number(q)))
                full[i] = r_from_fraction(p < 0n ? 0n : p > q ? q : p, q)
              } else {
                complete = false
                break
              }
            }
            if (full[i] !== undefined && r_sign(full[i]!) < 0) { complete = false; break }
          }
          if (!complete) continue
          if (!is_pretty_model(full)) continue  // pretty witnesses only
          const verify = verify_rational_model(enriched_constraints, full)
          if (verify.tag === 'ok' && verify.value) return full
        }
      }
    }
  }

  // Pass 3: continued fractions, COARSE tolerances only (fine tolerances
  // produce huge denominators; those models are rejected by the prettiness
  // gate anyway, so don't waste time generating them).
  let tol = 0.25
  for (let i = 0; i < Math.min(max_attempts, 12); i++) {
    if (!await breathe()) return undefined
    const full = attempt(xs.map((x) => rationalize(x, tol)))
    if (full !== undefined) return full
    tol /= 2
  }
  return undefined
}

// Rationalize a numeric x-vector and verify against enriched constraints
// under exact rational arithmetic, preferring SMALL denominators. Returns the
// rational assignments (including the eliminated state index) if anything
// verifies, else undefined.
//
// Two passes:
//   1. Common-denominator scan: snap all coordinates to multiples of 1/q for
//      q = 1, 2, 3, ... — the first q that verifies gives a uniform, small
//      denominator (this is what produces pretty Mathematica-style models).
//   2. Continued-fraction fallback, coarse-to-fine: per-coordinate simplest
//      fractions within tol, starting at a coarse tol = 1/4 and halving — the
//      first tolerance that verifies yields the simplest such fractions.
//      (The old behavior started at reg_margin/2 ≈ 5e-4 and only refined,
//      which produced needlessly large denominators.)
export const try_rationalize_and_verify = (
  xs: number[],
  enriched_constraints: Constraint[],
  _reg_margin: number,
  max_attempts: number,
  max_common_denominator: number = DEFAULT_MAX_COMMON_DENOMINATOR,
): Record<number, Rational> | undefined => {
  for (let q = 1n; q <= BigInt(max_common_denominator); q++) {
    const assignments = snap_vector_to_denominator(xs, q)
    if (assignments !== undefined) {
      const verify = verify_rational_model(enriched_constraints, assignments)
      if (verify.tag === 'ok' && verify.value) return assignments
    }
  }

  let tol = 0.25
  for (let i = 0; i < max_attempts; i++) {
    const assignments = rationalize_vector_with_eliminated(xs, tol)
    if (assignments !== undefined) {
      const verify = verify_rational_model(enriched_constraints, assignments)
      if (verify.tag === 'ok' && verify.value) return assignments
    }
    tol /= 2
    if (tol === 0) return undefined
  }
  return undefined
}

// Convenience wrapper when caller has constraints but no TruthTable yet.
export const random_pr_sat = async (
  constraints: Constraint[],
  options?: Partial<RandomSearchOptions>,
): Promise<RandomPrSATResult> => {
  const tt = new TruthTable(variables_in_constraints(constraints))
  return random_pr_sat_wrapped(tt, constraints, options)
}

// Re-export helpers used from the UI so callers can find them on one module.
export { build_cost_function, MATHEMATICA_MARGIN } from './cost_function'
export { minimize } from './optimizer'
export { r_from_int, r_from_fraction, r_to_string } from './rationalize'
