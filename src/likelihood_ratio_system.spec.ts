import { describe, expect, test } from "vitest"
import { random_pr_sat_wrapped } from "./random_search"
import { eliminate_equations } from "./equation_elimination"
import { constraint_builder, real_expr_builder, sentence_builder, enrich_constraints, translate, TruthTable, variables_in_constraints } from "./pr_sat"
import { PrSat } from "./types"
import { parse_constraint } from './parser'
import { init_z3, pr_sat_wrapped, WrappedSolver } from './z3_integration'

type Constraint = PrSat['Constraint']
const { eq, neq } = constraint_builder
const { svs, lit, divide, minus, neg } = real_expr_builder
const { letter } = sentence_builder

const d = divide, m = minus
const half = divide(lit(1), lit(2))

const likelihood_ratio_lines = [
  '(Pr(H | E1 & E2) - Pr(H | ~E1 & E2)) = (Pr(H | E1) - Pr(H | ~E1))',
  '(Pr(H | E2 & E1) - Pr(H | ~E2 & E1)) = (Pr(H | E2) - Pr(H | ~E2))',
  'Pr(H | E1) - Pr(H | ~E1) = 1/2',
  'Pr(H | E2) - Pr(H | ~E2) = -1/2',
  'Pr(H | E1 & E2) - Pr(H | ~(E1 & E2)) ≠ 0',
]

// Branden's system over a_1..a_8 (0-indexed svs), a_8 implicit via sum=1.
const constraints: Constraint[] = [
  eq(m(d(svs([0]), svs([0,1])), d(svs([4]), svs([4,5]))),
     m(d(svs([0,2]), svs([0,1,2,3])), d(svs([4,6]), svs([4,5,6,7])))),
  eq(m(d(svs([0]), svs([0,1])), d(svs([2]), svs([2,3]))),
     m(d(svs([0,4]), svs([0,1,4,5])), d(svs([2,6]), svs([2,3,6,7])))),
  eq(m(d(svs([0,2]), svs([0,1,2,3])), d(svs([4,6]), svs([4,5,6,7]))), half),
  eq(m(d(svs([0,4]), svs([0,1,4,5])), d(svs([2,6]), svs([2,3,6,7]))), neg(half)),
  neq(m(d(svs([0]), svs([0,1])), d(svs([2,4,6]), svs([2,3,4,5,6,7]))), lit(0)),
]

const tt = new TruthTable({ real: [], sentence: [letter('A'), letter('B'), letter('C')] })

describe('likelihood-ratio-difference system (research benchmark)', () => {
  test('literal PrSAT input parses into the eight-atom benchmark', () => {
    const parsed = likelihood_ratio_lines.map((line) => parse_constraint(line)[1] as Constraint)
    expect(parsed).toHaveLength(5)
    const parsed_tt = new TruthTable(variables_in_constraints(parsed))
    expect(parsed_tt.n_states()).toBe(8)
  })

  test('elimination structure', () => {
    const translated = translate(tt, constraints)
    const enriched = enrich_constraints(tt, undefined, false, translated)
    const elim = eliminate_equations(tt.n_states(), enriched)
    console.log('tag:', elim.tag)
    if (elim.tag === 'eliminated') {
      console.log('consumed:', elim.consumed_equations, 'chain:', elim.chain.map(e => `a_${e.v+1}${e.den_is_const ? '' : ' (rational)'}`),
                  'free:', elim.free_indices.map(i => `a_${i+1}`), 'sound:', elim.sound,
                  'residual eqs:', elim.residual_conjuncts.filter(c => c.tag === 'equal').length)
    }
  })
  test('Random Search preprocessing is available while regular Z3 stays direct', async () => {
    const parsed = likelihood_ratio_lines.map((line) => parse_constraint(line)[1] as Constraint)
    const parsed_tt = new TruthTable(variables_in_constraints(parsed))
    const translated = translate(parsed_tt, parsed)
    const elimination = eliminate_equations(
      parsed_tt.n_states(), enrich_constraints(parsed_tt, undefined, true, translated))
    expect(elimination.tag).toBe('eliminated')

    const z3 = await init_z3()
    const result = await pr_sat_wrapped(new WrappedSolver(z3, init_z3), parsed_tt, parsed, {
      regular: true,
      timeout_ms: 2_000,
    })
    expect(result.solver_output.status).toBe('unsat')
    // Z3 receives the compact original formulation after normalization-state
    // elimination; equation preprocessing is reserved for Random Search.
    expect(result.smtlib_input.length).toBeLessThan(3_000)
  }, 10_000)
  test('random search certifies an exact model (snap-then-re-eliminate + Groebner)', async () => {
    const { expect } = await import('vitest')
    const result = await random_pr_sat_wrapped(tt, constraints, { seed: 'sys-1', search_attempts: 30 })
    expect(result.solver_output.status).toBe('sat')
    if (result.solver_output.status === 'sat') {
      const sa = result.solver_output.state_assignments as Record<number, any>
      const fmt = (v: any): string => v.tag === 'literal' ? String(v.value) : v.tag === 'rational' ? `${v.numerator.value}/${v.denominator.value}` : JSON.stringify(v)
      console.log('MODEL: ' + Object.entries(sa).map(([k,v]) => `a_${Number(k)+1}=${fmt(v)}`).join(', '))
    }
  }, 300_000)
})
