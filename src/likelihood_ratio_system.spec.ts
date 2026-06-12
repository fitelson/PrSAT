import { describe, test } from "vitest"
import { random_pr_sat_wrapped } from "./random_search"
import { eliminate_equations } from "./equation_elimination"
import { constraint_builder, real_expr_builder, sentence_builder, enrich_constraints, translate, TruthTable } from "./pr_sat"
import { PrSat } from "./types"

type Constraint = PrSat['Constraint']
const { eq, neq } = constraint_builder
const { svs, lit, divide, minus, neg } = real_expr_builder
const { letter } = sentence_builder

const d = divide, m = minus
const half = divide(lit(1), lit(2))

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
