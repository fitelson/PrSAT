import { describe, expect, test } from "vitest"
import { match_s, S, spv, clause, default_clause } from "./s"

const interpret = (s: S): number => {
  return match_s(s, [
    clause<{ a: 'number' }, number>(
      { a: 'number' },
      spv('a'),
      (m) => m('a')),
    clause<{ a: 's', b: 's' }, number>(
      { a: 's', b: 's' },
      ['+', spv('a'), spv('b')],
      (m) => interpret(m('a')) + interpret(m('b'))),
    default_clause(() => { throw new Error('interpret fallthrough!') }),
  ])
}

describe('interpret', () => {
  test('1', () => expect(interpret(1)).toEqual(1))
  test('412', () => expect(interpret(412)).toEqual(412))
  test('(+ 1 412)', () => expect(interpret(['+', 1, 412])).toEqual(413))
  test('(+ 1 (+ 3 2))', () => expect(interpret(['+', 1, ['+', 3, 2]])).toEqual(6))
})
