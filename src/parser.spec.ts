import { describe, expect, test } from 'vitest'
import { sentence_builder, real_expr_builder, constraint_builder, sentence_to_random_string, real_expr_to_string, constraint_to_random_string } from './pr_sat'
import { assert_parse_constraint, assert_parse_real_expr, assert_parse_sentence } from './parser'
import { Random } from './random'
import { PrSat, PrSatFuncs } from './types'
import { FuzzerOptions } from './tag_map'

type Sentence = PrSat['Sentence']
type RealExpr = PrSat['RealExpr']
type Constraint = PrSat['Constraint']

const { val, letter, not, and, or, imp, iff } = sentence_builder
const { lit, neg, power, multiply, divide, plus, minus, pr, cpr, vbl } = real_expr_builder
const { eq, neq, lt, lte, gt, gte, cnot, cand, cor, cimp, ciff } = constraint_builder

const [A, B, C] = [letter('A'), letter('B'), letter('C')]
const [D, E, F] = [letter('D'), letter('E'), letter('F')]

const shared_random = new Random()
const fuzz_options: FuzzerOptions<any, any> = { target_depth: 6, exclude: { RealExpr: ['state_variable_sum'] } }
const fuzzers = PrSatFuncs.first_order().fuzzers(shared_random)

describe('parse', () => {
  describe('Sentence', () => {
    const parse = assert_parse_sentence
    const test_parse = (input: string, expected: Sentence) => test(input, () => expect(parse(input)).toEqual(expected))
    const test_right_assoc = (c: string, op: (s1: Sentence, s2: Sentence) => Sentence) => {
      test_parse(`A${c}B`, op(A, B))
      test_parse(`A ${c} B`, op(A, B))
      test_parse(`A\t\n\t${c}\n\t\nB`, op(A, B))
      test_parse(`A ${c} B ${c} C`, op(A, op(B, C)))
      test_parse(`A ${c} B ${c} C ${c} D ${c} E ${c} F`, op(A, op(B, op(C, op(D, op(E, F))))))
      test_parse(`(A ${c} B ${c} C ${c} D ${c} E) ${c} F`, op(op(A, op(B, op(C, op(D, E)))), F))
    }
    test_parse('A', A)
    test_parse('B', B)
    test_parse('C', C)
    test_parse('A3', letter('A', 3))
    test_parse('A38389232', letter('A', 38389232))
    test_parse('~A', not(A))
    test_parse('~\t \nA', not(A))
    test_parse('~~~~B', not(not(not(not(B)))))
    test_parse('(((C)))', C)
    test_parse('( (\t\t\t\t(\n\t\n\tC)           )\n\t)', C)
    test_parse('~  (  A)', not(A))
    test_parse('true', val(true))
    test_parse('false', val(false))
    test_right_assoc('&', and)
    test_right_assoc('∨', or)
    test_right_assoc('→', imp)
    test_right_assoc('↔', iff)
  })
  describe('RealExpr', () => {
    const parse = assert_parse_real_expr
    const test_parse = (input: string, expected: RealExpr) => test(input, () => expect(parse(input)).toEqual(expected))
    const test_left_assoc = (c: string, op: (s1: RealExpr, s2: RealExpr) => RealExpr) => {
      test_parse(`40${c}30`, op(lit(40), lit(30)))
      test_parse(`40       ${c}               30`, op(lit(40), lit(30)))
      test_parse(`40 ${c} 30 ${c} 20 ${c} 10 ${c} 0`, op(op(op(op(lit(40), lit(30)), lit(20)), lit(10)), lit(0)))
      test_parse(`-40 ${c} --30 ${c} ---20 ${c} --10 ${c} -0`, op(op(op(op(neg(lit(40)), neg(neg(lit(30)))), neg(neg(neg(lit(20))))), neg(neg(lit(10)))), neg(lit(0))))
    }
    test_parse('1', lit(1))
    test_parse('76123', lit(76123))
    test_parse('1.23456', lit(1.23456))
    test_parse('-2', neg(lit(2)))
    test_parse('----2', neg(neg(neg(neg(lit(2))))))
    test_parse('- - \n  -     \t-2', neg(neg(neg(neg(lit(2))))))
    test_parse('((((((((((((((((12))))))))))))))))', lit(12))
    test_left_assoc('+', plus)
    test_left_assoc('-', minus)
    test_left_assoc('*', multiply)
    test_left_assoc('/', divide)
    test_parse('40^30', power(lit(40), lit(30)))
    test_parse('40^(30 + 10)', power(lit(40), plus(lit(30), lit(10))))
    test_parse('40       ^               30', power(lit(40), lit(30)))
    test_parse('-40 ^ 30', neg(power(lit(40), lit(30))))
    test_parse('1 * 2 / 3 * 4', multiply(divide(multiply(lit(1), lit(2)), lit(3)), lit(4)))
    test_parse('2^(-3)', power(lit(2), neg(lit(3))))
    test_parse('68479.42137390701 / -GSF', divide(lit(68479.42137390701), neg(vbl('GSF'))))
    test_parse('(OSB - -62076.49847564241) * 18062.68360562343', multiply(minus(vbl('OSB'), neg(lit(62076.49847564241))), lit(18062.68360562343)))
    test_parse('-21.592482924461365^2', neg(power(lit(21.592482924461365), lit(2))))
    test_parse('Pr(A)', pr(A))
    test_parse('Pr(A & B & C)', pr(and(A, and(B, C))))
    test_parse('Pr(C)^2 / Pr(B)^3', divide(power(pr(C), lit(2)), power(pr(B), lit(3))))
    test_parse('Pr(A | B)', cpr(A, B))
    test_parse('Pr(A & B | B → C)', cpr(and(A, B), imp(B, C)))
    test_parse('P(A)', pr(A))
    test_parse('P(A & B & C)', pr(and(A, and(B, C))))
    test_parse('P(C)^2 / P(B)^3', divide(power(pr(C), lit(2)), power(pr(B), lit(3))))
    test_parse('P(A | B)', cpr(A, B))
    test_parse('P(A & B | B → C)', cpr(and(A, B), imp(B, C)))
    test_parse('p(A)', pr(A))
    test_parse('p(A & B & C)', pr(and(A, and(B, C))))
    test_parse('p(C)^2 / P(B)^3', divide(power(pr(C), lit(2)), power(pr(B), lit(3))))
    test_parse('p(A | B)', cpr(A, B))
    test_parse('p(A & B | B → C)', cpr(and(A, B), imp(B, C)))
  })
  describe('Constraint', () => {
    const parse = assert_parse_constraint
    const test_parse = (input: string, expected: Constraint) => test(input, () => expect(parse(input)).toEqual(expected))
    const test_right_assoc = (c: string, ctor: (l: Constraint, r: Constraint) => Constraint) => {
      test_parse(`(1 = 2) ${c} (2 = 3)`, ctor(eq(lit(1), lit(2)), eq(lit(2), lit(3))))
      test_parse(`(1 = 2) ${c} (2 = 3) ${c} (3 = 4)`, ctor(eq(lit(1), lit(2)), ctor(eq(lit(2), lit(3)), eq(lit(3), lit(4)))))
      test_parse(`~(1 = 2) ${c} ~~(2 = 3) ${c} ~(3 = 4)`, ctor(cnot(eq(lit(1), lit(2))), ctor(cnot(cnot(eq(lit(2), lit(3)))), cnot(eq(lit(3), lit(4))))))
      test_parse(`1 = 2 ${c} 2 = 3 ${c} 3 = 4`, ctor(eq(lit(1), lit(2)), ctor(eq(lit(2), lit(3)), eq(lit(3), lit(4)))))
    }
    test_parse('1 = 2', eq(lit(1), lit(2)))
    test_parse('1 ≠ 2', neq(lit(1), lit(2)))
    test_parse('1 < 2', lt(lit(1), lit(2)))
    test_parse('1 > 2', gt(lit(1), lit(2)))
    test_parse('1 ≤ 2', lte(lit(1), lit(2)))
    test_parse('1 ≥ 2', gte(lit(1), lit(2)))
    test_parse('~(1 = 2)', cnot(eq(lit(1), lit(2))))
    test_parse('~~(1 = 2)', cnot(cnot(eq(lit(1), lit(2)))))
    test_right_assoc('&', cand)
    test_right_assoc('∨', cor)
    test_right_assoc('→', cimp)
    test_right_assoc('↔', ciff)
  })

  // const random = new Random()
  const random = shared_random
  describe(`fuzzed (seed = ${random.seed_string})`, () => {
    // const n_letters = 5
    const n_examples = 10
    // const sentence_fuzzer = new SentenceFuzzer(new Random(), max_depth)
    // const [letters] = random_letters_and_assignments(random, n_letters)


    describe('Sentence', () => {
      const parse = assert_parse_sentence
      const examples: Sentence[] = []
      for (let example_index = 0; example_index < n_examples; example_index++) {
        // const ex = sentence_fuzzer.generate(letters)
        const ex = fuzzers.Sentence.of_type(fuzz_options)
        fuzzers
        examples.push(ex)
      }

      for (const [index, ex] of examples.entries()) {
        const as_string = sentence_to_random_string(random, ex)
        test(`${index}: ${as_string}`, () => expect(parse(as_string)).toEqual(ex))
      }
    })

    // const real_expr_fuzzer = new RealExprFuzzer(random, sentence_fuzzer, max_depth, undefined, ['state_variable_sum'])
    describe('RealExpr', () => {
      const parse = assert_parse_real_expr
      const examples: RealExpr[] = []
      for (let example_index = 0; example_index < n_examples; example_index++) {
        // const ex = real_expr_fuzzer.generate(letters)
        const ex = fuzzers.RealExpr.of_type(fuzz_options)
        examples.push(ex)
      }

      for (const [index, ex] of examples.entries()) {
        const as_string = real_expr_to_string(ex)
        test(`${index}: ${as_string}`, () => expect(parse(as_string)).toEqual(ex))
      }
    })

    // const constraint_fuzzer = new ConstraintFuzzer(random, sentence_fuzzer, real_expr_fuzzer, max_depth)
    describe('Constraint', () => {
      const parse = assert_parse_constraint
      const examples: Constraint[] = []
      for (let example_index = 0; example_index < n_examples; example_index++) {
        const ex = fuzzers.Constraint.of_type(fuzz_options)
        examples.push(ex)
      }

      for (const [index, ex] of examples.entries()) {
        const as_string = constraint_to_random_string(random, ex)
        test(`${index}: ${as_string}`, () => expect(parse(as_string)).toEqual(ex))
      }
    })
  })
})
