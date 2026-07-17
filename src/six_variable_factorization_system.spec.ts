import { describe, expect, test } from 'vitest'
import { eliminate_equations, extract_equation_system } from './equation_elimination'
import { parse_constraint } from './parser'
import { enrich_constraints, translate, TruthTable, variables_in_constraints } from './pr_sat'
import { PrSat } from './types'

type Constraint = PrSat['Constraint']

const factorization_lines = [
  'Pr(A & B & H) = Pr(A) * Pr(B) * Pr(H | A & B)',
  'Pr(A & B & ~H) = Pr(A) * Pr(B) * Pr(~H | A & B)',
  'Pr(A & ~B & H) = Pr(A) * Pr(~B) * Pr(H | A & ~B)',
  'Pr(A & ~B & ~H) = Pr(A) * Pr(~B) * Pr(~H | A & ~B)',
  'Pr(~A & B & H) = Pr(~A) * Pr(B) * Pr(H | ~A & B)',
  'Pr(~A & B & ~H) = Pr(~A) * Pr(B) * Pr(~H | ~A & B)',
  'Pr(~A & ~B & H) = Pr(~A) * Pr(~B) * Pr(H | ~A & ~B)',
  'Pr(~A & ~B & ~H) = Pr(~A) * Pr(~B) * Pr(~H | ~A & ~B)',
  'Pr(A & B & H) = Pr(F & G & Y)',
  'Pr(A & B & ~H) = Pr(F & G & ~Y)',
  'Pr(A & ~B & H) = Pr(F & ~G & Y)',
  'Pr(A & ~B & ~H) = Pr(F & ~G & ~Y)',
  'Pr(~A & B & H) = Pr(~F & G & Y)',
  'Pr(~A & B & ~H) = Pr(~F & G & ~Y)',
  'Pr(~A & ~B & H) = Pr(~F & ~G & Y)',
  'Pr(~A & ~B & ~H) = Pr(~F & ~G & ~Y)',
  'Pr(F & G & Y) = Pr(F) * Pr(G | F) * Pr(Y | F & G)',
  'Pr(F & G & ~Y) = Pr(F) * Pr(G | F) * Pr(~Y | F & G)',
  'Pr(F & ~G & Y) = Pr(F) * Pr(~G | F) * Pr(Y | F & ~G)',
  'Pr(F & ~G & ~Y) = Pr(F) * Pr(~G | F) * Pr(~Y | F & ~G)',
  'Pr(~F & G & Y) = Pr(~F) * Pr(G | ~F) * Pr(Y | ~F & G)',
  'Pr(~F & G & ~Y) = Pr(~F) * Pr(G | ~F) * Pr(~Y | ~F & G)',
  'Pr(~F & ~G & Y) = Pr(~F) * Pr(~G | ~F) * Pr(Y | ~F & ~G)',
  'Pr(~F & ~G & ~Y) = Pr(~F) * Pr(~G | ~F) * Pr(~Y | ~F & ~G)',
  'Pr(H | A) > Pr(H)',
  'Pr(H | B) > Pr(H)',
  'Pr(A & B) = Pr(A) * Pr(B)',
  'Pr(H | F) > Pr(H)',
  'Pr(H | G) > Pr(H)',
  'Pr(A) = Pr(F)',
  'Pr(B) = Pr(G)',
  'Pr(A) = 1/6',
  'Pr(B) = 1/6',
  'Pr(H) = 1/6',
  'Pr(F) = 1/6',
  'Pr(G) = 1/6',
  'Pr(Y) = 1/6',
  'Pr(A & H)/(Pr(A) * Pr(H)) = Pr(F & H)/(Pr(F) * Pr(H))',
]

describe('six-variable factorization system (research benchmark)', () => {
  test('parses and retains the complete equation system for bounded preprocessing', () => {
    const constraints = factorization_lines.map((line) => parse_constraint(line)[1] as Constraint)
    expect(constraints).toHaveLength(38)

    const tt = new TruthTable(variables_in_constraints(constraints))
    expect(tt.n_states()).toBe(64)
    const enriched = enrich_constraints(tt, undefined, false, translate(tt, constraints))
    const extracted = extract_equation_system(enriched)
    const extracted_terms = extracted.equation_polys.reduce((sum, polynomial) => sum + polynomial.size, 0)
    expect(extracted.equation_polys).toHaveLength(22)
    expect(extracted_terms).toBe(5_039)

    const started = performance.now()
    const elimination = eliminate_equations(tt.n_states(), enriched)
    console.log('six-variable factorization preprocessing:', elimination.tag, Math.round(performance.now() - started), 'ms', {
      equations: extracted.equation_polys.length,
      extracted_terms,
      free: elimination.tag === 'eliminated' ? elimination.free_indices.length : undefined,
    })
    expect(elimination.tag).toBe('eliminated')
    if (elimination.tag === 'eliminated') expect(elimination.free_indices).toHaveLength(52)
  }, 30_000)
})
