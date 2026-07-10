import { describe, test, expect } from 'vitest'
import { assert_parse_constraint } from './parser'
import { fancy_evaluate_constraint_or_real_expr, init_z3, pr_sat } from './z3_integration'

describe('compound metalinguistic constraints', () => {
  // Theorem: (1) & (2) IFF (3)
  //   (1) Pr(A | A <-> B) = Pr(A | ~(A <-> B))
  //   (2) Pr(B | A <-> B) = Pr(B | ~(A <-> B))
  //   (3) Pr(A) = Pr(B) = 1/2
  const c1 = 'Pr(A | A <-> B) = Pr(A | ~(A <-> B))'
  const c2 = 'Pr(B | A <-> B) = Pr(B | ~(A <-> B))'
  const c3 = '(Pr(A) = 1/2 & Pr(B) = 1/2)'
  const theorem = `(${c1} & ${c2}) <-> ${c3}`

  test('parses as a single compound Constraint', () => {
    const c = assert_parse_constraint(theorem)
    expect(c.tag).toBe('biconditional')
  })

  test('Z3: theorem holds (negation is UNSAT)', async () => {
    const negated = assert_parse_constraint(`~(${theorem})`)
    const z3 = await init_z3()
    const ctx = z3.Context('main')
    const result = await pr_sat(ctx, [negated])
    expect(result.status).toBe('unsat')
  }, 60_000)

  test('model evaluator uses the solver\'s branch-local definedness semantics', async () => {
    const constraint = assert_parse_constraint('(1 = 1) v (Pr(A | false) = 0)')
    const z3 = await init_z3()
    const ctx = z3.Context('definedness')
    const solved = await pr_sat(ctx, [constraint])
    expect(solved.status).toBe('sat')
    if (solved.status !== 'sat') return

    const evaluated = await fancy_evaluate_constraint_or_real_expr(
      ctx,
      solved.z3_model,
      solved.tt,
      { tag: 'constraint', constraint },
    )
    expect(evaluated).toEqual({ tag: 'bool-result', result: true })
  })
})
