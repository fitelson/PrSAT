import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

import { assert_parse_constraint } from './parser'
import { LETKTruthTable } from './letk'
import { letk_sat_wrapped } from './letk_sat'
import { variables_in_constraints } from './pr_sat'
import { random_pr_sat_wrapped } from './random_search'
import { init_z3, WrappedSolver } from './z3_integration'

const example_text = readFileSync(new URL('../public/TwistPrSAT_examples.txt', import.meta.url), 'utf8')
const example_constraints = example_text
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line.length > 0)
  .map(assert_parse_constraint)

describe('public TwistPrSAT example file', () => {
  test('contains thirteen parseable constraints over one letter', () => {
    expect(example_constraints).toHaveLength(13)
    const table = new LETKTruthTable(variables_in_constraints(example_constraints))
    expect(table.n_letters()).toBe(1)
    expect(table.n_states()).toBe(6)
  })

  test('is satisfiable through Z3', async () => {
    const table = new LETKTruthTable(variables_in_constraints(example_constraints))
    const z3 = await init_z3()
    if (z3 === undefined) throw new Error('Z3 failed to initialize')
    const result = await letk_sat_wrapped(new WrappedSolver(z3, init_z3), table, example_constraints)
    expect(result.solver_output.status).toBe('sat')
  })

  test('has an exact Random Search witness from browser algebra', async () => {
    const table = new LETKTruthTable(variables_in_constraints(example_constraints))
    const result = await random_pr_sat_wrapped(table, example_constraints, {
      semantics: 'twist-letk',
      seed: 'public-six-region-example',
      search_attempts: 1,
      browser_equation_solver: true,
    })
    expect(result.solver_output.status).toBe('sat')
    expect(result.used_browser_equation_solver).toBe(true)
    expect(Object.values(result.rational_model ?? {})).toEqual(
      Array.from({ length: 6 }, () => ({ n: 1n, d: 6n })),
    )
  })
})
