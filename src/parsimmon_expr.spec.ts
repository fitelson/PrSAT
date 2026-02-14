import { expect, test } from 'vitest';
import { match_s, S, clause, default_clause, spv } from './s';
import { MyMath } from './parsimmon_expr';

test.only('something', () => {
  // console.log(MyMath.tryParse('2 + ((3 * 4)) / 1 - 3 ^ (2!)'))
  const evaluate = (s: S): number => {
    const [a, b] = [spv('a'), spv('b')]
    return match_s(s, [
      clause<{ a: 'number' }, number>({ a: 'number' }, ['Number', a], (m) => m('a')),
      clause<{ a: 's' }, number>({ a: 's' }, ['Negate', a], (m) => -evaluate(m('a'))),
      clause<{ a: 's' }, number>({ a: 's' }, ['Factorial', a], (m) => {
        let result = 1
        const av = evaluate(m('a'))
        for (let i = 1; i <= av; i++) {
          result *= i
        }
        return result
      }),
      clause<{ a: 's', b: 's' }, number>({ a: 's', b: 's' },
        ['Add', a, b],
        (m) => evaluate(m('a')) + evaluate(m('b'))),
      clause<{ a: 's', b: 's' }, number>({ a: 's', b: 's' },
        ['Subtract', a, b],
        (m) => evaluate(m('a')) - evaluate(m('b'))),
      clause<{ a: 's', b: 's' }, number>({ a: 's', b: 's' },
        ['Multiply', a, b],
        (m) => evaluate(m('a')) * evaluate(m('b'))),
      clause<{ a: 's', b: 's' }, number>({ a: 's', b: 's' },
        ['Divide', a, b],
        (m) => evaluate(m('a')) / evaluate(m('b'))),
      clause<{ a: 's', b: 's' }, number>({ a: 's', b: 's' },
        ['Exponentiate', a, b],
        (m) => evaluate(m('a')) ** evaluate(m('b'))),
      default_clause((s) => { throw new Error(`evaluate fallthrough: ${s('s')}`) }),
    ])
  }
  // 2 + 3 * 4 / 1 - 3 ^ (2!)
  // 2 + 12 - 9
  // 14 - 9
  // 5
  expect(evaluate(MyMath.tryParse('2 + ((3 * 4)) / 1 - 3 ^ 2!'))).toEqual(5)
  expect(evaluate(MyMath.tryParse('--2'))).toEqual(2)
  expect(evaluate(MyMath.tryParse('2+3'))).toEqual(5)
})
