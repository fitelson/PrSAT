import { describe, expect, test } from "vitest"
import { random_pr_sat } from "./random_search"
import { constraint_builder, real_expr_builder, sentence_builder } from "./pr_sat"
import { PrSat } from "./types"

type Constraint = PrSat['Constraint']
const { gt, lt } = constraint_builder
const { pr, cpr, divide, minus } = real_expr_builder
const { letter, not } = sentence_builder

const H1 = letter('H', 1), E1 = letter('E', 1), H2 = letter('H', 2), E2 = letter('E', 2)

const constraints: Constraint[] = [
  gt(minus(cpr(H1, E1), pr(H1)), minus(cpr(H2, E2), pr(H2))),
  lt(divide(cpr(E1, H1), cpr(E1, not(H1))), divide(cpr(E2, H2), cpr(E2, not(H2)))),
]

describe('small fractions on Branden test case', () => {
  test('random search yields small denominators', async () => {
    for (const seed of ['pin-1', 'pin-2', 'pin-3']) {
      const result = await random_pr_sat(constraints, { seed, search_attempts: 10 })
      console.log(`seed=${seed} status=${result.solver_output.status} attempts=${result.attempts_used}`)
      expect(result.solver_output.status).toBe('sat')
      if (result.solver_output.status === 'sat') {
        const sa = result.solver_output.state_assignments as Record<number, any>
        const strs = Object.entries(sa).map(([k, v]) => {
          if (v.tag === 'literal') return `a_${Number(k)+1}=${v.value}`
          if (v.tag === 'rational') return `a_${Number(k)+1}=${v.numerator.value}/${v.denominator.value}`
          return `a_${Number(k)+1}=${JSON.stringify(v)}`
        })
        console.log('  ' + strs.join(', '))
        const max_denom = Math.max(...Object.values(sa).map((v: any) => v.tag === 'rational' ? v.denominator.value : 1))
        console.log(`  max denominator: ${max_denom}`)
        expect(max_denom).toBeLessThanOrEqual(50)
      }
    }
  }, 120_000)
})
