import { describe, expect, test } from "vitest"
import { eliminate_equations } from "./equation_elimination"
import { random_pr_sat } from "./random_search"
import { constraint_builder, real_expr_builder, sentence_builder, enrich_constraints, translate, TruthTable, variables_in_constraints } from "./pr_sat"
import { PrSat } from "./types"

type Constraint = PrSat['Constraint']

const { eq, gt, lt, cnot } = constraint_builder
const { pr, cpr, lit, divide, multiply, minus, plus } = real_expr_builder
const { letter, and, or, not, imp, iff } = sentence_builder

const A = letter('A'), B = letter('B'), C = letter('C')
const half = divide(lit(1), lit(2))
const third = divide(lit(1), lit(3))

const enriched_for = (constraints: Constraint[]): { n: number, enriched: Constraint[] } => {
  const tt = new TruthTable(variables_in_constraints(constraints))
  const translated = translate(tt, constraints)
  return { n: tt.n_states(), enriched: enrich_constraints(tt, undefined, false, translated) }
}

describe('eliminate_equations', () => {
  test('linear equations are fully absorbed', () => {
    // Pr(A) = 1/2 and Pr(B|A) = 1/3 (cross-multiplies to linear) + sum = 1:
    // 3 equations, 4 states → 1 free variable.
    const { n, enriched } = enriched_for([eq(pr(A), half), eq(cpr(B, A), third)])
    const result = eliminate_equations(n, enriched)
    expect(result.tag).toBe('eliminated')
    if (result.tag === 'eliminated') {
      expect(result.free_indices.length).toBe(1)
      expect(result.sound).toBe(true)
      // No equations left in the residual system.
      expect(result.residual_conjuncts.every((c) => c.tag !== 'equal')).toBe(true)
    }
  })

  test('inconsistent linear equations are detected soundly', () => {
    const { n, enriched } = enriched_for([eq(pr(A), half), eq(pr(A), third)])
    expect(eliminate_equations(n, enriched).tag).toBe('inconsistent')
  })

  test('independence equation (nonlinear) is absorbed via a generic-branch substitution', () => {
    const { n, enriched } = enriched_for([eq(pr(and(A, B)), multiply(pr(A), pr(B)))])
    const result = eliminate_equations(n, enriched)
    expect(result.tag).toBe('eliminated')
    if (result.tag === 'eliminated') {
      // sum=1 (linear) + independence (nonlinear) both consumed: 4 states → 2 free.
      expect(result.free_indices.length).toBe(2)
      expect(result.sound).toBe(false)  // used a nonconstant denominator
      expect(result.residual_conjuncts.every((c) => c.tag !== 'equal')).toBe(true)
    }
  })

  test('equations linear in no variable stay residual', () => {
    // Pr(A)^2 = 1/2: every variable occurs squared.
    const { n, enriched } = enriched_for([eq({ tag: 'power', base: pr(A), exponent: lit(2) }, half)])
    const result = eliminate_equations(n, enriched)
    expect(result.tag).toBe('eliminated')
    if (result.tag === 'eliminated') {
      expect(result.residual_conjuncts.some((c) => c.tag === 'equal')).toBe(true)
    }
  })
})

describe('random search with equation elimination', () => {
  test('unique solution needs no search: Pr(A)=1/2, Pr(B)=1/2, Pr(A&B)=1/4', async () => {
    const constraints = [
      eq(pr(A), half),
      eq(pr(B), half),
      eq(pr(and(A, B)), divide(lit(1), lit(4))),
    ]
    const result = await random_pr_sat(constraints, { seed: 'unique' })
    expect(result.solver_output.status).toBe('sat')
    expect(result.attempts_used).toBe(0)
  })

  test('unique solution violating an inequality is UNSAT', async () => {
    const constraints = [
      eq(pr(A), half),
      eq(pr(B), half),
      eq(pr(and(A, B)), divide(lit(1), lit(4))),
      gt(pr(or(A, B)), divide(lit(9), lit(10))),  // Pr(A∨B) = 3/4, not > 9/10
    ]
    const result = await random_pr_sat(constraints, { seed: 'unique-unsat' })
    expect(result.solver_output.status).toBe('unsat')
  })

  test('mixed equations and inequalities: Titelbaum 2.10', async () => {
    // Four equations over three letters — the kind of system the random
    // search used to fail on. All linear after cross-multiplication.
    const constraints = [
      eq(pr(imp(A, iff(B, C))), lit(1)),
      eq(pr(B), pr(not(B))),
      eq(pr(C), multiply(lit(2), pr(and(C, A)))),
      eq(pr(and(B, and(C, not(A)))), divide(lit(1), lit(5))),
    ]
    const result = await random_pr_sat(constraints, { seed: 'titelbaum', search_attempts: 10 })
    expect(result.solver_output.status).toBe('sat')
  })

  test('independence plus inequalities (nonlinear equation)', async () => {
    const constraints = [
      eq(pr(and(A, B)), multiply(pr(A), pr(B))),
      gt(pr(A), third),
      lt(pr(A), divide(lit(2), lit(3))),
      gt(pr(B), third),
    ]
    const result = await random_pr_sat(constraints, { seed: 'independence', search_attempts: 10 })
    expect(result.solver_output.status).toBe('sat')
  })

  test('total probability remains correct under elimination (SAT direction)', async () => {
    // Pr(A) = Pr(A|B)Pr(B) + Pr(A|~B)Pr(~B) is a theorem; its instance system
    // with concrete values should be satisfiable.
    const constraints = [
      eq(cpr(A, B), half),
      eq(cpr(A, not(B)), third),
      eq(pr(B), half),
      eq(pr(A), plus(multiply(half, half), multiply(third, half))),
    ]
    const result = await random_pr_sat(constraints, { seed: 'total-prob', search_attempts: 10 })
    expect(result.solver_output.status).toBe('sat')
  })

  test('negated theorem stays unknown (cannot prove UNSAT nonlinearly)', async () => {
    // ~(Pr(~A) = 1 - Pr(A)) is UNSAT but not by linear equation reasoning
    // (the negation is not an equation conjunct) — should stay 'unknown'.
    const constraints = [cnot(eq(pr(not(A)), minus(lit(1), pr(A))))]
    const result = await random_pr_sat(constraints, { seed: 'neg-theorem' })
    expect(result.solver_output.status).toBe('unknown')
  })
})
