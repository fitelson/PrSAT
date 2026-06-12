import { describe, expect, test } from "vitest"
import { eliminate_ratios_in_constraint } from "./eliminate_ratios"
import { constraint_builder, constraint_to_string, evaluate_constraint_2, real_expr_builder, sentence_builder, translate, TruthTable, variables_in_constraints } from "./pr_sat"
import { init_z3, pr_sat_with_options } from "./z3_integration"
import { PrSat } from "./types"
import { Random } from "./random"

type Constraint = PrSat['Constraint']

const { eq, neq, lt, lte, gt, gte, cand, cnot, cor } = constraint_builder
const { svs, lit, vbl, plus, minus, multiply, divide, power, neg, cpr, pr } = real_expr_builder
const { letter, and } = sentence_builder

const t = (c: Constraint): string => constraint_to_string(eliminate_ratios_in_constraint(c))

describe('eliminate_ratios_in_constraint', () => {
  test('division-free constraints become op-0 form', () => {
    // a_1 = 1/2  ~~>  a_1 * 2 - 1 = 0
    expect(t(eq(svs([0]), divide(lit(1), lit(2))))).toEqual('(a_1 * 2) - 1 = 0')
    // a_1 + a_2 > a_3  ~~>  a_1 + a_2 - a_3 > 0
    expect(t(gt(svs([0, 1]), svs([2])))).toEqual('(a_1 + a_2) - a_3 > 0')
  })

  test('conditional probability equation is cross-multiplied', () => {
    // a_1 / (a_1 + a_2) = 1/2  ~~>  a_1 * 2 - (a_1 + a_2) = 0
    const c = eq(divide(svs([0]), svs([0, 1])), divide(lit(1), lit(2)))
    expect(t(c)).toEqual('(a_1 * 2) - (a_1 + a_2) = 0')
  })

  test('nonnegative denominators are dropped from inequalities', () => {
    // a_1 / (a_1 + a_2) > 1/2  ~~>  a_1 * 2 - (a_1 + a_2) > 0
    const c = gt(divide(svs([0]), svs([0, 1])), divide(lit(1), lit(2)))
    expect(t(c)).toEqual('(a_1 * 2) - (a_1 + a_2) > 0')
  })

  test('comparison of two ratios cross-multiplies both denominators', () => {
    // a_1 / (a_1 + a_2) < a_3 / (a_3 + a_4)
    // ~~> a_1 * (a_3 + a_4) - a_3 * (a_1 + a_2) < 0   (unexpanded)
    const c = lt(divide(svs([0]), svs([0, 1])), divide(svs([2]), svs([2, 3])))
    expect(t(c)).toEqual('(a_1 * (a_3 + a_4)) - (a_3 * (a_1 + a_2)) < 0')
  })

  test('shared denominators are not multiplied through', () => {
    // a_1 / (a_1 + a_2) < a_2 / (a_1 + a_2)  ~~>  a_1 - a_2 < 0
    const c = lt(divide(svs([0]), svs([0, 1])), divide(svs([1]), svs([0, 1])))
    expect(t(c)).toEqual('a_1 - a_2 < 0')
  })

  test('unknown-sign denominator produces a sign case-split', () => {
    // a_1 / x >= 1  ~~>  (x > 0 & a_1 - x >= 0) v (x < 0 & a_1 - x <= 0)
    const c = gte(divide(svs([0]), vbl('x')), lit(1))
    expect(t(c)).toEqual('((x > 0) & (a_1 - x ≥ 0)) ∨ ((x < 0) & (a_1 - x ≤ 0))')
  })

  test('negative constant denominator flips the inequality', () => {
    // a_1 / -2 < 1  ~~>  a_1 - -2 > 0
    const c = lt(divide(svs([0]), neg(lit(2))), lit(1))
    expect(t(c)).toEqual('a_1 - -2 > 0')
  })

  test('powers of denominators are handled', () => {
    // (a_1 + a_2)^2 = 1/4  ~~>  (a_1 + a_2)^2 * 4 - 1 = 0
    const c = eq(power(svs([0, 1]), lit(2)), divide(lit(1), lit(4)))
    expect(t(c)).toEqual('(((a_1 + a_2)^2) * 4) - 1 = 0')
    // a_1 / (a_1 + a_2)^2 > 1  ~~>  even-power denominator is nonneg, dropped
    const c2 = gt(divide(svs([0]), power(svs([0, 1]), lit(2))), lit(1))
    expect(t(c2)).toEqual('a_1 - ((a_1 + a_2)^2) > 0')
  })

  test('boolean structure is preserved', () => {
    const atom = eq(divide(svs([0]), svs([0, 1])), divide(lit(1), lit(2)))
    expect(t(cnot(atom))).toEqual('~((a_1 * 2) - (a_1 + a_2) = 0)')
    expect(t(cand(atom, gt(svs([0]), lit(0))))).toEqual('((a_1 * 2) - (a_1 + a_2) = 0) & (a_1 > 0)')
    expect(t(cor(atom, lte(svs([1]), lit(1))))).toEqual('((a_1 * 2) - (a_1 + a_2) = 0) ∨ (a_2 - 1 ≤ 0)')
  })

  test('decimal literals pass through unchanged', () => {
    const c = eq(multiply(lit(0.1, '0.1'), svs([0])), lit(0.3, '0.3'))
    expect(t(c)).toEqual('(0.1 * a_1) - 0.3 = 0')
  })

  test('not_equal keeps denominators out', () => {
    const c = neq(divide(svs([0]), svs([0, 1])), lit(1))
    expect(t(c)).toEqual('a_1 - (a_1 + a_2) ≠ 0')
  })

  test('transformed constraints agree with originals on random defined points', () => {
    // Pr(A | B) >= Pr(A), Pr(A & B) < Pr(A) * Pr(B), 1 - Pr(A|B) = Pr(~A|B)
    const A = letter('A'), B = letter('B')
    const original: Constraint[] = [
      gte(cpr(A, B), pr(A)),
      lt(pr(and(A, B)), multiply(pr(A), pr(B))),
      eq(minus(lit(1), cpr(A, B)), cpr({ tag: 'negation', sentence: A }, B)),
      lte(plus(divide(pr(A), pr(B)), divide(pr(B), pr(A))), lit(2)),
    ]
    const tt = new TruthTable(variables_in_constraints(original))
    const translated = translate(tt, original)
    const transformed = translated.map(eliminate_ratios_in_constraint)

    const random = new Random('eliminate-ratios-seed')
    let compared = 0
    for (let trial = 0; trial < 200; trial++) {
      // Random point on the probability simplex, with occasional zeros.
      const raw = Array(tt.n_states()).fill(0).map(() => random.integer({ lower: 0, upper: 97 }))
      const total = raw.reduce((a, b) => a + b, 0)
      if (total === 0) {
        continue
      }
      const state_values: Record<number, number> = {}
      raw.forEach((v, i) => { state_values[i] = v / total })

      for (let ci = 0; ci < translated.length; ci++) {
        const [orig_ok, orig_value] = evaluate_constraint_2(tt, state_values, translated[ci])
        if (!orig_ok) {
          continue  // Undefined (division by zero): guarded separately.
        }
        const [trans_ok, trans_value] = evaluate_constraint_2(tt, state_values, transformed[ci])
        expect(trans_ok).toEqual(true)
        expect(trans_value).toEqual(orig_value)
        compared++
      }
    }
    expect(compared).toBeGreaterThan(100)
  })
})

describe('smtlib output', () => {
  test('no division operator anywhere in the solver input', async () => {
    const { constraints_to_smtlib_lines, eliminate_state_variable_index, enrich_constraints } = await import("./pr_sat")
    const { eliminate_ratios_in_constraints } = await import("./eliminate_ratios")
    const { s_to_string } = await import("./s")
    const A = letter('A'), B = letter('B')
    const constraints: Constraint[] = [
      eq(cpr(A, B), divide(lit(1), lit(3))),
      gte(cpr(B, A), multiply(pr(A), pr(B))),
      lt(minus(cpr(A, B), cpr(B, A)), divide(lit(1), lit(7))),
    ]
    const tt = new TruthTable(variables_in_constraints(constraints))
    const translated = translate(tt, constraints)
    const index_to_eliminate = tt.n_states() - 1
    const enriched = eliminate_ratios_in_constraints(enrich_constraints(tt, index_to_eliminate, false, translated))
    const [, elim] = eliminate_state_variable_index(tt.n_states(), index_to_eliminate, enriched)
    const smtlib = constraints_to_smtlib_lines(tt, index_to_eliminate, elim).map((s) => s_to_string(s, false)).join('\n')
    expect(smtlib).not.toContain('/')
  })
})

describe('z3 with eliminate_ratios', () => {
  const A = letter('A'), B = letter('B')

  test('total probability stays a theorem (UNSAT)', async () => {
    const { Context } = await init_z3()
    const constraints: Constraint[] = [
      cnot(eq(pr(A), plus(
        multiply(cpr(A, B), pr(B)),
        multiply(cpr(A, { tag: 'negation', sentence: B }), pr({ tag: 'negation', sentence: B })),
      ))),
    ]
    const tt = new TruthTable(variables_in_constraints(constraints))
    const { status } = await pr_sat_with_options(Context('main'), tt, constraints, { eliminate_ratios: true })
    expect(status).toEqual('unsat')
  }, 60_000)

  test('satisfiable conditional-probability constraints (SAT, same as without)', async () => {
    const { Context } = await init_z3()
    const constraints: Constraint[] = [
      eq(cpr(A, B), divide(lit(1), lit(2))),
      gt(pr(B), pr(A)),
      lt(cpr(B, A), divide(lit(9), lit(10))),
    ]
    const tt = new TruthTable(variables_in_constraints(constraints))
    const { status } = await pr_sat_with_options(Context('main'), tt, constraints, { eliminate_ratios: true })
    expect(status).toEqual('sat')
    const tt2 = new TruthTable(variables_in_constraints(constraints))
    const { status: status_without } = await pr_sat_with_options(Context('main2'), tt2, constraints, { eliminate_ratios: false })
    expect(status_without).toEqual('sat')
  }, 60_000)
})
