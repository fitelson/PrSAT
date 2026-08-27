import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

import { assert_parse_constraint } from './parser'
import { LETKTruthTable } from './letk'
import { letk_sat_wrapped } from './letk_sat'
import { variables_in_constraints } from './pr_sat'
import { init_z3, WrappedSolver } from './z3_integration'

const unsat_files = [
  '01_reliable_contradiction_unsat.txt',
  '02_reliability_bound_unsat.txt',
  '03_classical_negation_complement_unsat.txt',
  '04_inclusion_exclusion_unsat.txt',
  '05_positive_region_decomposition_unsat.txt',
  '06_negative_region_decomposition_unsat.txt',
  '07_reliability_region_decomposition_unsat.txt',
  '08_six_region_partition_unsat.txt',
  '09_entailment_identity_unsat.txt',
  '10_classical_difference_identity_unsat.txt',
  '11_gap_glut_balance_unsat.txt',
] as const

const sat_files = [
  '12_conflict_possible_sat.txt',
  '13_uncertainty_possible_sat.txt',
  '14_demorgan_noncomplementarity_sat.txt',
] as const

const theorem_files = [...unsat_files, ...sat_files]

const read_theorem_constraint = (filename: string) => {
  const text = readFileSync(new URL(`../public/theorems/${filename}`, import.meta.url), 'utf8').trim()
  return assert_parse_constraint(text)
}

describe('public theorem-challenge files', () => {
  test('index describes all fourteen separately loadable examples', () => {
    const index = readFileSync(new URL('../public/TwistPrSAT_theorem_examples.txt', import.meta.url), 'utf8')
    for (const filename of theorem_files) expect(index).toContain(filename)
  })

  test('Z3 finds no countermodel to any encoded paper result', async () => {
    const z3 = await init_z3()
    if (z3 === undefined) throw new Error('Z3 failed to initialize')
    const solver = new WrappedSolver(z3, init_z3)

    for (const filename of unsat_files) {
      const constraints = [read_theorem_constraint(filename)]
      const table = new LETKTruthTable(variables_in_constraints(constraints))
      const result = await letk_sat_wrapped(solver, table, constraints)
      expect(result.solver_output.status, filename).toBe('unsat')
    }
  })

  test('Z3 finds models for all three distinctive nonclassical possibilities', async () => {
    const z3 = await init_z3()
    if (z3 === undefined) throw new Error('Z3 failed to initialize')
    const solver = new WrappedSolver(z3, init_z3)

    for (const filename of sat_files) {
      const constraints = [read_theorem_constraint(filename)]
      const table = new LETKTruthTable(variables_in_constraints(constraints))
      const result = await letk_sat_wrapped(solver, table, constraints)
      expect(result.solver_output.status, filename).toBe('sat')
    }
  })
})
