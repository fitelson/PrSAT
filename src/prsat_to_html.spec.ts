import { beforeAll, describe, expect, test } from 'vitest'
import { JSDOM } from 'jsdom'

import { parse_constraint, assert_parse_real_expr } from './parser'
import { TruthTable, variables_in_constraints } from './pr_sat'
import { constraint_to_html, real_expr_to_html } from './prsat_to_html'
import { translate_constraint_cooper } from './cooper'
import { assert_result } from './utils'

describe('prsat_to_html', () => {
  beforeAll(() => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>')
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: dom.window.document,
    })
  })

  test('renders translated trivalent constraints containing internal ite expressions', () => {
    const constraint = assert_result(parse_constraint('Pr((A -> B) & C) > Pr(A -> B)'))
    const tt = new TruthTable(variables_in_constraints([constraint]))
    const translated = translate_constraint_cooper(tt, constraint)

    const rendered = constraint_to_html(translated, true)

    expect(rendered.querySelector('mtable')).not.toBeNull()
    expect(rendered.textContent).toContain('if')
    expect(rendered.textContent).toContain('otherwise')
    expect(rendered.textContent).toContain('>')
  })

  test('parenthesizes a negative base before exponentiation', () => {
    const rendered = real_expr_to_html(assert_parse_real_expr('(-2)^2'), true)
    expect(rendered.textContent).toBe('(-2)2')
  })
})
