import { beforeAll, describe, expect, test } from 'vitest'
import { JSDOM } from 'jsdom'

import { parse_constraint } from './parser'
import { constraint_to_html } from './prsat_to_html'
import { assert_result } from './utils'

describe('prsat_to_html', () => {
  beforeAll(() => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>')
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: dom.window.document,
    })
  })

  test('renders TwistPrSAT reliability and classical-negation syntax', () => {
    const constraint = assert_result(parse_constraint('Pr(○A) > Pr(∼A)'))
    const rendered = constraint_to_html(constraint, true)

    expect(rendered.textContent).toContain('○')
    expect(rendered.textContent).toContain('→')
    expect(rendered.textContent).toContain('⊥')
    expect(rendered.textContent).toContain('>')
  })
})
