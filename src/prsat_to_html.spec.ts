import { beforeAll, describe, expect, test } from 'vitest'
import { JSDOM } from 'jsdom'
import { assert_parse_real_expr } from './parser'
import { real_expr_to_html } from './prsat_to_html'

describe('real_expr_to_html', () => {
  beforeAll(() => {
    const dom = new JSDOM()
    globalThis.document = dom.window.document
  })

  test('parenthesizes a negative base of exponentiation', () => {
    const rendered = real_expr_to_html(assert_parse_real_expr('(-2)^2'), true)
    expect(rendered.textContent).toBe('(-2)2')
  })
})
