import { describe, expect, test } from 'vitest'
import { DEFAULT_BROWSER_EQUATION_SOLVER_CAPS, find_exact_tangent_model, preprocess_rational_rows, solve_equations_in_browser } from './browser_equation_solver'
import { EqPoly, extract_equation_system, poly_internals } from './equation_elimination'
import { evaluate_constraint_rational, evaluate_real_expr_rational, ONE, r_eq, r_from_fraction, r_neg } from './rationalize'
import { parse_constraint } from './parser'
import { random_pr_sat } from './random_search'
import { PrSat } from './types'
import { enrich_constraints, translate, TruthTable, variables_in_constraints } from './pr_sat'

const P = poly_internals
type Constraint = PrSat['Constraint']

const variable = (index: number): EqPoly => {
  const out = P.zero()
  P.add_term(out, { mono: [index], coeff: ONE })
  return out
}

const x = variable(0)
const y = variable(1)
const minus_one = P.constant(r_neg(ONE))

describe('zero-dependency browser equation solver', () => {
  test('solves a triangular linear system into the Maple-compatible branch contract', () => {
    const equations = [
      P.add(P.add(x, y), minus_one),
      P.add(x, P.neg(y)),
    ]
    const branches = solve_equations_in_browser(equations, 2)
    expect(branches).toBeDefined()
    expect(branches).toHaveLength(1)
    expect(branches![0]!.free.size).toBe(0)
    expect([...branches![0]!.solved.keys()].sort()).toEqual([0, 1])
  })

  test('keeps both generic and leading-coefficient-zero branches of x*y = 0', () => {
    const branches = solve_equations_in_browser([P.mul(x, y)], 2)
    expect(branches).toBeDefined()
    expect(branches).toHaveLength(2)

    const solved_sets = branches!.map((branch) => [...branch.solved.keys()].sort())
    expect(solved_sets).toContainEqual([0])
    expect(solved_sets).toContainEqual([1])

    const generic = branches!.find((branch) => branch.conditions !== undefined && branch.conditions.length > 0)
    expect(generic?.conditions?.[0]?.tag).toBe('not_equal')
  })

  test('globally triangularizes coupled quadratics before factor branching', () => {
    const circle = P.add(P.add(P.mul(x, x), P.mul(y, y)), minus_one)
    const coupled = P.add(circle, P.mul(x, y))
    const without_global = solve_equations_in_browser([circle, coupled], 2, undefined, {
      ...DEFAULT_BROWSER_EQUATION_SOLVER_CAPS,
      max_groebner_steps: 0,
    })
    expect(without_global).toBeUndefined()

    const diagnostics: import('./browser_equation_solver').BrowserEquationSolverDiagnostics = {}
    const branches = solve_equations_in_browser([circle, coupled], 2, undefined, undefined, diagnostics)
    expect(diagnostics.groebner_steps).toBeGreaterThan(0)
    expect(diagnostics.reason).toBe('complete')
    expect(branches).toBeDefined()
    expect(branches).toHaveLength(4)
    expect(branches?.every((branch) => branch.free.size === 0)).toBe(true)
  })

  test('explores exact rational tangent directions without probability-specific pattern matching', () => {
    const equations = [P.add(P.add(x, y), minus_one)]
    const constraints: Constraint[] = [
      { tag: 'equal', left: { tag: 'state_variable_sum', indices: [0, 1] }, right: { tag: 'literal', value: 1 } },
      { tag: 'not_equal', left: { tag: 'state_variable_sum', indices: [0] }, right: { tag: 'literal', value: 0.5 } },
      { tag: 'greater_than_or_equal', left: { tag: 'state_variable_sum', indices: [0] }, right: { tag: 'literal', value: 0 } },
      { tag: 'greater_than_or_equal', left: { tag: 'state_variable_sum', indices: [1] }, right: { tag: 'literal', value: 0 } },
    ]
    const model = find_exact_tangent_model(equations, constraints, 2)
    expect(model).toBeDefined()
    expect(r_eq(P.eval(equations[0]!, model!), r_from_fraction(0n, 1n))).toBe(true)
    expect(r_eq(model![0]!, r_from_fraction(1n, 2n))).toBe(false)
  })

  test('returns undefined rather than hanging when a cap is exceeded', () => {
    const result = solve_equations_in_browser([P.mul(x, y)], 2, undefined, {
      max_nodes: 0,
      max_depth: 1,
      max_branches: 1,
      max_terms: 10,
      max_pseudo_steps: 1,
      max_preprocess_steps: 1,
      max_preprocess_terms: 10,
      max_factor_candidates: 1,
      max_linear_factor_bound: 1,
      max_groebner_steps: 0,
      max_groebner_pairs: 1,
      max_groebner_basis: 1,
      max_milliseconds: 10,
    })
    expect(result).toBeUndefined()
  })

  test('reports a sound but incomplete branch set as partial', () => {
    const irreducible = P.add(P.add(P.mul(x, x), P.mul(y, y)), P.constant(ONE))
    const diagnostics: import('./browser_equation_solver').BrowserEquationSolverDiagnostics = {}
    const branches = solve_equations_in_browser(
      [P.mul(x, irreducible)], 2, undefined,
      { ...DEFAULT_BROWSER_EQUATION_SOLVER_CAPS, max_groebner_steps: 0 }, diagnostics)
    expect(branches).toHaveLength(1)
    expect(diagnostics.reason).toBe('partial')
  })

  test('is wired into PrSAT before the Maple fallback', async () => {
    const constraints = [
      'Pr(A) = 1/2',
      'Pr(B) = 1/2',
      'Pr(A & B) = 1/4',
    ].map((line) => parse_constraint(line)[1] as Constraint)
    const result = await random_pr_sat(constraints, {
      seed: 'browser-equation-engine-smoke',
      search_attempts: 1,
    })
    expect(result.solver_output.status).toBe('sat')
    expect(result.used_browser_equation_solver).toBe(true)
    expect(result.used_maple_bridge).not.toBe(true)
  }, 30_000)

  test('solves the substantive likelihood-ratio system without Maple', async () => {
    const constraints = [
      '(Pr(H | E1 & E2) - Pr(H | ~E1 & E2)) = (Pr(H | E1) - Pr(H | ~E1))',
      '(Pr(H | E2 & E1) - Pr(H | ~E2 & E1)) = (Pr(H | E2) - Pr(H | ~E2))',
      'Pr(H | E1) - Pr(H | ~E1) = 1/2',
      'Pr(H | E2) - Pr(H | ~E2) = -1/2',
      'Pr(H | E1 & E2) - Pr(H | ~(E1 & E2)) != 0',
    ].map((line) => parse_constraint(line)[1] as Constraint)
    const tt = new TruthTable(variables_in_constraints(constraints))
    const extracted = extract_equation_system(enrich_constraints(tt, undefined, false, translate(tt, constraints)))
    const preprocessed = preprocess_rational_rows(extracted.equation_rows)
    expect(preprocessed.reduce((sum, p) => sum + p.size, 0))
      .toBeLessThan(extracted.equation_polys.reduce((sum, p) => sum + p.size, 0))
    const diagnostics: import('./browser_equation_solver').BrowserEquationSolverDiagnostics = {}
    const direct_branches = solve_equations_in_browser(preprocessed, tt.n_states(), undefined, undefined, diagnostics)
    console.log('likelihood-ratio triangularization:', diagnostics)
    expect(diagnostics.groebner_steps).toBeGreaterThan(0)
    expect(direct_branches).toBeDefined()
    const witness = [
      r_from_fraction(2n, 31n), r_from_fraction(2n, 31n), r_from_fraction(1n, 31n), r_from_fraction(0n, 1n),
      r_from_fraction(0n, 1n), r_from_fraction(104n, 155n), r_from_fraction(13n, 155n), r_from_fraction(13n, 155n),
    ]
    expect(preprocessed.every((p) => r_eq(P.eval(p, witness), r_from_fraction(0n, 1n)))).toBe(true)
    const witness_branch = direct_branches?.some((branch) =>
      [...branch.solved].every(([index, expression]) => {
        const value = evaluate_real_expr_rational(expression, witness)
        return value.tag === 'ok' && r_eq(value.value, witness[index]!)
      }) && (branch.conditions ?? []).every((condition) => {
        const value = evaluate_constraint_rational(condition, witness)
        return value.tag === 'ok' && value.value
      }))
    expect(witness_branch).toBe(true)
    const result = await random_pr_sat(constraints, {
      seed: 'browser-likelihood-ratio',
      search_attempts: 1,
    })
    expect(result.solver_output.status).toBe('sat')
    expect(result.used_browser_equation_solver).toBe(true)
    expect(result.used_maple_bridge).not.toBe(true)
  }, 30_000)
})
