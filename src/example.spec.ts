import { describe, expect, test } from 'vitest'
import { constraint_builder, parse_s, real_expr_builder, sentence_builder, TruthTable, variables_in_constraints } from './pr_sat'
import { init_z3, model_assignment_output_to_string, ModelAssignmentOutput, pr_sat, pr_sat_with_options } from './z3_integration'
import { PrSat } from './types'
import { S, s_to_string } from './s'

type Sentence = PrSat['Sentence']
type RealExpr = PrSat['RealExpr']
type Constraint = PrSat['Constraint']

const zero_arity_model_to_string = (model: Record<number, ModelAssignmentOutput>): string => {
  return Object.entries(model)
    .map(([name, assignment]) => `${name} = ${model_assignment_output_to_string(assignment)}`)
    .join('\n')
}

const { eq, gt, cnot, lt, cor, gte, cand } = constraint_builder
const { pr, cpr, lit, divide, multiply, minus, plus } = real_expr_builder
const { and, or, imp, iff, not, letter, val } = sentence_builder

const [A, B, C] = [letter('A'), letter('B'), letter('C')]
const [R, H] = [letter('R'), letter('H')]
const [T, W] = [letter('T'), letter('W')]
const [P, Q] = [letter('P'), letter('Q')]

describe('z3', () => {
  test('init', async () => {
    await init_z3()
  })
  test('general additivity', async () => {
    const { Context } = await init_z3()
    const { status: sat, model: _ } = await pr_sat(Context('main'), [
      cnot(eq(pr(or(P, Q)), minus(plus(pr(P), pr(Q)), pr(and(P, Q)))))
    ])
    expect(sat).toEqual('unsat')
  })
  test('titelbaum 2.10', async () => {
    const { Context } = await init_z3()
    const { status: sat } = await pr_sat(Context('main'), [
      eq(pr(imp(A, iff(B, C))), lit(1)),
      eq(pr(B), pr(not(B))),
      eq(pr(C), multiply(lit(2), pr(and(C, A)))),
      eq(pr(and(B, and(C, not(A)))), divide(lit(1), lit(5))),
    ])
    expect(sat).toEqual('sat')
  })
  test('Pr(~X) = 1 - Pr(X)', async () => {
    const { Context } = await init_z3()
    const { status: sat } = await pr_sat(Context('main'), [
      cnot(eq(pr(not(A)), minus(lit(1), pr(A)))),
    ])
    expect(sat).toEqual('unsat')
  })
  test('total probability', async () => {
    const { Context } = await init_z3()
    const { status: sat } = await pr_sat(Context('main'), [
      cnot(eq(pr(A), plus(multiply(cpr(A, B), pr(B)), multiply(cpr(A, not(B)), pr(not(B)))))),
    ])
    expect(sat).toEqual('unsat')
  })
  test('intro lecture 17 end', async () => {
    const { Context } = await init_z3()
    const { status: sat, model: _ } = await pr_sat(Context('main'), [
      cnot(gte(pr(imp(A, B)), cpr(B, A))),
    ])
    expect(sat).toEqual('unsat')
  })
  test('intro lecture 18 th.2', async () => {
    const { Context } = await init_z3()
    const { status: sat, model: _ } = await pr_sat(Context('main'), [
      eq(cpr(A, B), pr(A)),
      cnot(eq(cpr(B, A), cpr(B, not(A)))),
    ])
    expect(sat).toEqual('unsat')
  })
  test('intro lecture 18 not th.4', async () => {
    const { Context } = await init_z3()
    const { status: sat, model: _ } = await pr_sat(Context('main'), [
      cnot(eq(cpr(A, B), cpr(A, not(B)))),
    ])
    expect(sat).toEqual('sat')
  })
  test('intro lecture 18 not th.5', async () => {
    const { Context } = await init_z3()
    const { status: sat, model: _ } = await pr_sat(Context('main'), [
      cnot(gte(pr(iff(A, B)), cpr(B, A))),
    ])
    expect(sat).toEqual('sat')
  })
  test('intro lecture 18 not th.6', async () => {
    const { Context } = await init_z3()
    const { status: sat, model: _ } = await pr_sat(Context('main'), [
      cnot(eq(pr(or(A, B)), plus(pr(A), pr(B)))),
    ])
    expect(sat).toEqual('sat')
  })
  test('intro lecture 18 irrational model', async () => {
    const { Context } = await init_z3()
    const { status: sat, model: _ } = await pr_sat(Context('main'), [
      eq(cpr(B, A), pr(or(A, B))),
      eq(pr(B), pr(not(B))),
      eq(pr(and(A, B)), pr(and(not(A), B))),
    ])
    expect(sat).toEqual('sat')
  })
  test('Pr(true | R) = 1', async () => {
    const { Context } = await init_z3()
    const { status: sat, model: _ } = await pr_sat(Context('main'), [
      cnot(eq(cpr(val(true), R), lit(1))),
    ])
    expect(sat).toEqual('unsat')
  })
  test('Pr(P | R) ≥ 0', async () => {
    const { Context } = await init_z3()
    const { status: sat, model: _ } = await pr_sat(Context('main'), [
      cnot(gte(cpr(P, R), lit(0))),
    ])
    expect(sat).toEqual('unsat')
  })
  test('P and Q mutually exclusive entails Pr(P or Q | R) = Pr(P | R) + Pr(Q | R)', async () => {
    const { Context } = await init_z3()
    const { status: sat, model: _ } = await pr_sat(Context('main'), [
      eq(pr(and(P, Q)), lit(0)),
      cnot(gte(cpr(or(P, Q), R), plus(cpr(P, R), cpr(Q, R)))),
    ])
    expect(sat).toEqual('unsat')
  })
  test('Pr(~P | R) = 1 - Pr(P | R)', async () => {
    const { Context } = await init_z3()
    const { status: sat, model: _ } = await pr_sat(Context('main'), [
      cnot(eq(cpr(not(P), R), minus(lit(1), cpr(P, R)))),
    ])
    expect(sat).toEqual('unsat')
  })
  test('Pr(P | true) = Pr(P)', async() => {
    const { Context } = await init_z3()
    const { status: sat, model: _ } = await pr_sat(Context('main'), [
      cnot(eq(cpr(P, val(true)), pr(P))),
    ])
    expect(sat).toEqual('unsat')
  })
  test('Pr(true) = 1', async () => {
    const { Context } = await init_z3()
    const { status: sat, model: _ } = await pr_sat(Context('main'), [
      cnot(eq(pr(val(true)), lit(1))),
    ])
    expect(sat).toEqual('unsat')
  })
  test('Pr(false) = 0', async () => {
    const { Context } = await init_z3()
    const { status: sat, model: _ } = await pr_sat(Context('main'), [
      cnot(eq(pr(val(false)), lit(0))),
    ])
    expect(sat).toEqual('unsat')
  })
  test('Bayes', async () => {
    const { Context } = await init_z3()
    const { status: sat, model: _ } = await pr_sat(Context('main'), [
      cnot(eq(cpr(A, B), divide(multiply(cpr(B, A), pr(A)), pr(B)))),
    ])
    expect(sat).toEqual('unsat')
  })
  test('titelbaum independence (3.14) => (3.15) through (3.18)', async () => {
    const { Context } = await init_z3()
    const { status: sat, model: _ } = await pr_sat(Context('main'), [
      eq(cpr(P, Q), pr(P)),
      cnot(
        cand(
          eq(pr(P), cpr(P, not(Q))),
          cand(
            eq(cpr(P, Q), cpr(P, not(Q))),
            cand(
              eq(cpr(Q, P), pr(Q)),
              cand(
                eq(pr(Q), cpr(Q, not(P))),
                eq(pr(and(P, Q)), multiply(pr(P), pr(Q)))))))),
    ])
    expect(sat).toEqual('unsat')
  })
  test('titelbaum (3.23) and (3.24) sat', async () => {
    const { Context } = await init_z3()
    const { status: sat, model: _ } = await pr_sat(Context('main'), [
      gt(cpr(A, B), pr(A)),
      eq(cpr(A, and(B, C)), cpr(A, C)),
    ])
    expect(sat).toEqual('sat')
  })
  test('pairwise to mutual independence', async () => {
    const { Context } = await init_z3()

    const { status: sat, model: _ } = await pr_sat(Context('main'), [
      eq(pr(and(A, B)), multiply(pr(A), pr(B))),
      eq(pr(and(A, C)), multiply(pr(A), pr(C))),
      eq(pr(and(B, C)), multiply(pr(B), pr(C))),
      eq(pr(and(A, and(B, C))), multiply(pr(A), multiply(pr(B), pr(C)))),
    ], true)

    expect(sat).toEqual('sat')

    // if (sat) {
    //   console.log(zero_arity_model_to_string(model))
    // }
  })
  describe('lotteries and miracles', () => {
    test('(1)-(3) entail (4)', async () => {
      const { Context } = await init_z3()

      const { status: sat, model: _ } = await pr_sat(Context('main'), [
        lt(pr(T), divide(lit(1), lit(2))),
        gt(cpr(T, W), divide(lit(1), lit(2))),
        gt(cpr(W, T), divide(lit(1), lit(2))),
        cnot(lt(cpr(T, not(W)), pr(W))),
      ])

      expect(sat).toEqual('sat')

      // if (sat) {
      //   console.log(zero_arity_model_to_string(model))
      // }
    })
    test('(1)-(3) entail (5)', async () => {
      const { Context } = await init_z3()

      const { status: sat, model: _ } = await pr_sat(Context('main'), [
        lt(pr(T), divide(lit(1), lit(2))),
        gt(cpr(T, W), divide(lit(1), lit(2))),
        gt(cpr(W, T), divide(lit(1), lit(2))),
        cnot(gt(minus(cpr(T, W), cpr(T, not(W))), minus(pr(not(W)), pr(W)))),
      ])

      expect(sat).toEqual('sat')
      // if (sat) {
      //   console.log(zero_arity_model_to_string(model))
      // }
    })
    test('(1)-(3) entail (4) or (5)', async () => {
      const { Context } = await init_z3()

      const constraints = [
        lt(pr(T), divide(lit(1), lit(2))),
        gt(cpr(T, W), divide(lit(1), lit(2))),
        gt(cpr(W, T), divide(lit(1), lit(2))),
        cnot(
          cor(
            lt(cpr(T, not(W)), pr(W)),
            gt(minus(cpr(T, W), cpr(T, not(W))), minus(pr(not(W)), pr(W)))
          )
        ),
      ]
      const { status: sat, model: _ } = await pr_sat(Context('main'), constraints)

      // if (sat) {
      //   console.log(zero_arity_model_to_string(model))
      // }
      expect(sat).toEqual('unsat')
    })
  })
  describe('raven\'s paradox', () => {
    const _1_through_2 = [
      gt(pr(and(not(H), and(not(B), R))), lit(0)),  // Extra unstated assumption.
      eq(cpr(B, and(R, H)), lit(1)),
      gt(pr(not(B)), pr(R)),
    ]
    const _1_through_4 = [
      ..._1_through_2,
      eq(cpr(B, H), pr(B)),
      eq(cpr(R, H), pr(R)),
    ]
    const _5 = gt(cpr(H, and(R, B)), cpr(H, and(not(R), not(B))))
    const _6 = gt(cpr(H, and(not(R), not(B))), pr(H))
    const _7 = lt(cpr(H, and(not(R), B)), pr(H))
    const _C = gte(cpr(H, R), cpr(H, not(B)))
    const regular = false
    test('(1) - (4) entail (5)', async () => {
      const { Context } = await init_z3()

      const constraints = [
        ..._1_through_4,
        cnot(_5),
      ]
      const { status: sat, model } = await pr_sat(Context('main'), constraints, regular)

      if (sat === 'sat') {
        console.log(zero_arity_model_to_string(model))
      }
      expect(sat).toEqual('unsat')
    })
    test('(1) - (4) entail (6)', async () => {
      const { Context } = await init_z3()

      const constraints = [
        ..._1_through_4,
        cnot(_6),
      ]
      const { status: sat, model: _ } = await pr_sat(Context('main'), constraints, regular)

      // if (sat) {
      //   console.log(zero_arity_model_to_string(model))
      // }
      expect(sat).toEqual('unsat')
    })
    test('(1) - (4) entail (7)', async () => {
      const { Context } = await init_z3()

      const constraints = [
        ..._1_through_4,
        cnot(_7),
      ]
      const { status: sat, model: _ } = await pr_sat(Context('main'), constraints, regular)

      // if (sat) {
      //   console.log(zero_arity_model_to_string(model))
      // }
      expect(sat).toEqual('unsat')
    })
    test('(1), (2), (C) entail (5)', async () => {
      const { Context } = await init_z3()

      const constraints = [
        ..._1_through_2,
        _C,
        cnot(_5),
      ]
      const { status: sat, model: _ } = await pr_sat(Context('main'), constraints, regular)

      // if (sat) {
      //   console.log(zero_arity_model_to_string(model))
      // }
      expect(sat).toEqual('unsat')
    })
    test('(1), (2), (C) does not entail (6)', async () => {
      const { Context } = await init_z3()

      const constraints = [
        ..._1_through_2,
        _C,
        cnot(_6),
      ]
      const { status: sat, model: _ } = await pr_sat(Context('main'), constraints)

      // if (sat) {
      //   console.log(zero_arity_model_to_string(model))
      // }
      expect(sat).toEqual('sat')
    })
    test('(1), (2), (C) does not entail (7)', async () => {
      const { Context } = await init_z3()

      const constraints = [
        ..._1_through_2,
        _C,
        cnot(_7),
      ]
      const { status: sat, model: _ } = await pr_sat(Context('main'), constraints)

      // if (sat) {
      //   console.log(zero_arity_model_to_string(model))
      // }
      expect(sat).toEqual('sat')
    })
  })
  describe('bayesian confirmation theory', () => {
    const confirms = (E: Sentence, H: Sentence): Constraint => gt(cpr(H, E), pr(H))
    const dk = (H: Sentence, E: Sentence, K: Sentence): RealExpr =>
      minus(cpr(H, and(E, K)), cpr(H, K))
    const ik = (H: Sentence, E: Sentence, K: Sentence): RealExpr =>
      divide(minus(cpr(E, and(H, K)), cpr(E, and(not(H), K))), plus(cpr(E, and(H, K)), cpr(E, and(not(H), K))))
    const sk = (H: Sentence, E: Sentence, K: Sentence): RealExpr =>
      minus(cpr(H, and(E, K)), cpr(H, and(not(E), K)))
    const without_k = (degk: (H: Sentence, E: Sentence, K: Sentence) => RealExpr) => (H: Sentence, E: Sentence): RealExpr =>
      degk(H, E, val(true))
    const [E1, E2] = [letter('E1'), letter('E2')]

    describe('without K', () => {
      const desideratum = (degree: (H: Sentence, E: Sentence) => RealExpr): Constraint[] => [
        gte(cpr(H, E1), cpr(H, E2)),
        cnot(gte(degree(H, E1), degree(H, E2))),
      ]

      test('d', async () => {
        const { Context } = await init_z3()
        const constraints = desideratum(without_k(dk))
        const { status: sat, model: _ } = await pr_sat(Context('main'), constraints)
        expect(sat).toEqual('unsat')
      })
      test('i', async () => {
        const { Context } = await init_z3()
        const constraints = desideratum(without_k(ik))
        const { status: sat, model: _ } = await pr_sat(Context('main'), constraints)
        expect(sat).toEqual('unsat')
      })
      test('s', async () => {
        const { Context } = await init_z3()
        const constraints = desideratum(without_k(sk))
        const { status: sat, model: _ } = await pr_sat(Context('main'), constraints)
        expect(sat).toEqual('sat')
      })
    })
    describe('with K', () => {
      const desideratum = (degk: (H: Sentence, E: Sentence, K: Sentence) => RealExpr): Constraint[] => [
        confirms(E1, H),
        confirms(E2, H),
        eq(degk(H, E1, E2), without_k(degk)(H, E1)),
        eq(degk(H, E2, E1), without_k(degk)(H, E2)),
        cnot(gt(without_k(degk)(H, and(E1, E2)), without_k(degk)(H, E2))),
      ]
      test('d', async () => {
        const { Context } = await init_z3()
        const constraints = desideratum(dk)
        const { status: sat, model: _ } = await pr_sat(Context('main'), constraints)
        expect(sat).toEqual('unsat')
      })
      test('i', async () => {
        const { Context } = await init_z3()
        const constraints = desideratum(ik)
        const { status: sat, model: _ } = await pr_sat(Context('main'), constraints)
        expect(sat).toEqual('unsat')
      })
      describe('s (which takes too long so we\'re testing timing stuff)', () => {
        test.skip('by itself', async () => {
          const { Context } = await init_z3()
          const constraints = desideratum(sk)
          const { status: sat, model: _ } = await pr_sat(Context('main'), constraints)
          expect(sat).toEqual('sat')
        })
        test('with timeout', async () => {
          const { Context } = await init_z3()
          const constraints = desideratum(sk)
          const start = performance.now()
          const tt = new TruthTable(variables_in_constraints(constraints))
          const timeout_ms = 5_000
          const fudge = 1_000
          const { status: sat, model: _ } = await pr_sat_with_options(Context('main'), tt, constraints, { timeout_ms })
          const end = performance.now()
          expect(sat).toEqual('unknown')
          expect(end - start).toBeLessThan(timeout_ms + fudge)
        })
      })
    })
  })
})

describe('smtlib-direct', () => {
  const smtlib = `
(set-logic QF_NRA)
(declare-fun a2 () Real)
(declare-fun a3 () Real)
(declare-fun a4 () Real)
(declare-fun a5 () Real)
(declare-fun a6 () Real)
(declare-fun a7 () Real)
(declare-fun a8 () Real)
(assert (and (= (+ (* (/ a6 (+ a2 a6)) (- 1)) (/ a8 (+ a5 a8))) (+ (* (/ (+ a4 a6) (- 1 a3 a5 a7 a8)) (- 1)) (/ (+ a7 a8) (+ a3 a5 a7 a8)))) (= (+ (* (/ a7 (+ a3 a7)) (- 1)) (/ a8 (+ a5 a8))) (+ (* (/ (+ a4 a7) (- 1 a2 a5 a6 a8)) (- 1)) (/ (+ a6 a8) (+ a2 a5 a6 a8)))) (<= (+ (* (/ (+ a4 a6 a7) (- 1 a5 a8)) (- 1)) (/ a8 (+ a5 a8))) (+ (* (/ (+ a4 a7) (- 1 a2 a5 a6 a8)) (- 1)) (/ (+ a6 a8) (+ a2 a5 a6 a8)))) (< 0 a2) (< 0 a3) (< 0 a4) (< 0 a5) (< 0 a6) (< 0 a7) (< 0 a8) (< 0 (+ (* (/ (+ a4 a6) (- 1 a3 a5 a7 a8)) (- 1)) (/ (+ a7 a8) (+ a3 a5 a7 a8)))) (< 0 (+ (* (/ (+ a4 a7) (- 1 a2 a5 a6 a8)) (- 1)) (/ (+ a6 a8) (+ a2 a5 a6 a8)))) (< a2 1) (< a3 1) (< a4 1) (< a5 1) (< a6 1) (< a7 1) (< a8 1) (< (+ a2 a3 a4 a5 a6 a7 a8) 1) (not (= (+ a2 a6) 0)) (not (= (+ a5 a8) 0)) (not (= (- 1 a3 a5 a7 a8) 0)) (not (= (+ a3 a5 a7 a8) 0)) (not (= (+ a3 a7) 0)) (not (= (+ a5 a8) 0)) (not (= (- 1 a2 a5 a6 a8) 0)) (not (= (+ a2 a5 a6 a8) 0)) (not (= (- 1 a5 a8) 0)) (not (= (+ a5 a8) 0)) (not (= (- 1 a2 a5 a6 a8) 0)) (not (= (+ a2 a5 a6 a8) 0)) (not (= (- 1 a3 a5 a7 a8) 0)) (not (= (+ a3 a5 a7 a8) 0)) (not (= (- 1 a2 a5 a6 a8) 0)) (not (= (+ a2 a5 a6 a8) 0))))
(check-sat)
(get-model)
  `

  const split_assertion_and = (text: string): string => {
    const split_lines = text.trim().split('\n')
    const s_lines: S[] = []
    for (const l of split_lines) {
      const l_as_s = parse_s(l)
      if (Array.isArray(l_as_s) && l_as_s.length > 0 && l_as_s[0] === 'assert' && Array.isArray(l_as_s[1]) && l_as_s[1].length > 0 && l_as_s[1][0] === 'and') {
        const and_operands = l_as_s[1].slice(1)
        for (const operand of and_operands) {
          s_lines.push(['assert', operand])
        }
      } else {
        s_lines.push(l_as_s)
      }
    }
    const result_lines = s_lines.map((s) => s_to_string(s, false))
    return result_lines.join('\n')
  }

  test('confirmation measure s', async () => {
    const { Context } = await init_z3()
    const ctx = Context('main')
    const { Solver } = ctx
    const s = new Solver()

    const expanded_and_stuff = split_assertion_and(smtlib)
    // console.log(expanded_and_stuff)
    s.fromString(expanded_and_stuff)

    const result = await s.check()
    expect(result).toEqual('sat')
  })

  test('continuing Solver instance', () => {
  })
})
