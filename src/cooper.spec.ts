import { describe, expect, test } from 'vitest'

import { extract_equation_system } from './equation_elimination'
import { parse_constraint } from './parser'
import { TruthTable, variables_in_constraints } from './pr_sat'
import { translate_constraints_cooper } from './cooper'
import { assert_result } from './utils'

const parse = (s: string) => assert_result(parse_constraint(s))

describe('Cooper/ERS trivalent probability translation', () => {
  test('non-one totalized probability equations are available to polynomial extraction', () => {
    const constraints = [
      parse('Pr(P -> Q) = 1/4'),
      parse('Pr(Q) = 1/6'),
      parse('Pr(Q -> P) = 1'),
      parse('Pr(P) = 2/3'),
    ]
    const tt = new TruthTable(variables_in_constraints(constraints))
    const translated = translate_constraints_cooper(tt, constraints)
    const { equation_polys, other_conjuncts } = extract_equation_system(translated)

    expect(equation_polys).toHaveLength(3)
    expect(other_conjuncts).toHaveLength(1)
  })
})
