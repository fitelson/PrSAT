import {
  constraint_builder,
  real_expr_builder,
  sentence_builder,
  TruthTable,
  VariableLists,
} from './pr_sat'
import { ConstraintOrRealExpr, PrSat, SentenceMap } from './types'
import { fallthrough } from './utils'

type Sentence = PrSat['Sentence']
type RealExpr = PrSat['RealExpr']
type Constraint = PrSat['Constraint']

export type CCKTruthValue = 0 | 0.5 | 1

export type CCKValueSets = {
  true_indices: number[]
  false_indices: number[]
  void_indices: number[]
  classical_indices: number[]
}

const { imp } = sentence_builder
const { lit, svs, divide, ite } = real_expr_builder
const { eq } = constraint_builder

const truth_value = (v: boolean | CCKTruthValue): CCKTruthValue =>
  v === true ? 1
    : v === false ? 0
      : v

const cck_not = (v: CCKTruthValue): CCKTruthValue =>
  v === 1 ? 0 : v === 0 ? 1 : 0.5

const cck_and = (l: CCKTruthValue, r: CCKTruthValue): CCKTruthValue => {
  if (l === 0 || r === 0) return 0
  if (l === 0.5 || r === 0.5) return 0.5
  return 1
}

const cck_or = (l: CCKTruthValue, r: CCKTruthValue): CCKTruthValue => {
  if (l === 1 || r === 1) return 1
  if (l === 0.5 || r === 0.5) return 0.5
  return 0
}

const cck_imp = (l: CCKTruthValue, r: CCKTruthValue): CCKTruthValue =>
  l === 0 ? 0.5 : r

const cck_iff = (l: CCKTruthValue, r: CCKTruthValue): CCKTruthValue =>
  cck_and(cck_imp(l, r), cck_imp(r, l))

export class CCKTruthTable extends TruthTable {
  private readonly cck_letter_ids: SentenceMap['letter'][]

  constructor(variables: Readonly<VariableLists>) {
    super(variables)
    this.cck_letter_ids = Array.from(super.letters())
  }

  private letter_offset(l: SentenceMap['letter']): number {
    const idx = this.cck_letter_ids.findIndex((candidate) =>
      candidate.id === l.id && candidate.index === l.index)
    if (idx < 0) throw new Error(`Letter ${l.id}${l.index > 0 ? l.index : ''} is not in this CCK truth table`)
    return idx
  }

  letters(): Iterable<SentenceMap['letter']> {
    return this.cck_letter_ids
  }

  n_letters(): number {
    return this.cck_letter_ids.length
  }

  n_states(): number {
    return Math.pow(3, this.cck_letter_ids.length)
  }

  state_indices(): Iterable<number> {
    return {
      [Symbol.iterator]: (): Iterator<number> => {
        let current_index = 0
        return {
          next: (): IteratorResult<number> =>
            current_index >= this.n_states()
              ? { done: true, value: -1 }
              : { done: false, value: current_index++ },
        }
      },
    }
  }

  letter_value3_from_index(l: SentenceMap['letter'], index: number): CCKTruthValue {
    if (!Number.isInteger(index) || index < 0 || index >= this.n_states()) {
      throw new Error(`CCK state index ${index} out of bounds`)
    }
    const offset = this.letter_offset(l)
    const power = Math.pow(3, this.cck_letter_ids.length - offset - 1)
    const digit = Math.floor(index / power) % 3
    if (digit === 0) return 1
    if (digit === 1) return 0.5
    return 0
  }

  letter_value_from_index(l: SentenceMap['letter'], index: number): boolean {
    return this.letter_value3_from_index(l, index) === 1
  }
}

export const is_cck_truth_table = (tt: TruthTable): tt is CCKTruthTable =>
  typeof (tt as any).letter_value3_from_index === 'function'

export const table_truth_value = (
  tt: TruthTable,
  l: SentenceMap['letter'],
  state_index: number,
): CCKTruthValue =>
  is_cck_truth_table(tt)
    ? tt.letter_value3_from_index(l, state_index)
    : truth_value(tt.letter_value_from_index(l, state_index))

export const evaluate_cck_sentence = (
  eval_letter: (l: SentenceMap['letter']) => boolean | CCKTruthValue,
  sentence: Sentence,
): CCKTruthValue => {
  const sub = (s: Sentence): CCKTruthValue => evaluate_cck_sentence(eval_letter, s)

  if (sentence.tag === 'value') {
    return sentence.value ? 1 : 0
  } else if (sentence.tag === 'letter') {
    return truth_value(eval_letter(sentence))
  } else if (sentence.tag === 'negation') {
    return cck_not(sub(sentence.sentence))
  } else if (sentence.tag === 'conjunction') {
    return cck_and(sub(sentence.left), sub(sentence.right))
  } else if (sentence.tag === 'disjunction') {
    return cck_or(sub(sentence.left), sub(sentence.right))
  } else if (sentence.tag === 'conditional') {
    return cck_imp(sub(sentence.left), sub(sentence.right))
  } else if (sentence.tag === 'biconditional') {
    return cck_iff(sub(sentence.left), sub(sentence.right))
  } else {
    return fallthrough('evaluate_cck_sentence', sentence)
  }
}

export const compute_cck_value_sets = (tt: TruthTable, sentence: Sentence): CCKValueSets => {
  const true_indices: number[] = []
  const false_indices: number[] = []
  const void_indices: number[] = []

  for (const state_index of tt.state_indices()) {
    const value = evaluate_cck_sentence(
      (letter) => table_truth_value(tt, letter, state_index),
      sentence,
    )
    if (value === 1) {
      true_indices.push(state_index)
    } else if (value === 0) {
      false_indices.push(state_index)
    } else {
      void_indices.push(state_index)
    }
  }

  return {
    true_indices,
    false_indices,
    void_indices,
    classical_indices: [...true_indices, ...false_indices].sort((a, b) => a - b),
  }
}

const state_sum_expr = (tt: TruthTable, indices: number[]): RealExpr => {
  if (indices.length === 0) return lit(0)
  if (indices.length === tt.n_states()) return lit(1)
  return svs(indices)
}

export const translate_cck_probability = (tt: TruthTable, sentence: Sentence): RealExpr => {
  const sets = compute_cck_value_sets(tt, sentence)
  const numerator = state_sum_expr(tt, sets.true_indices)
  const denominator = state_sum_expr(tt, sets.classical_indices)

  if (denominator.tag === 'literal') {
    if (denominator.value === 0) return lit(1)
    if (denominator.value === 1) return numerator
  }

  return ite(eq(denominator, lit(0)), lit(1), divide(numerator, denominator))
}

export const cck_probability_denominator = (tt: TruthTable, sentence: Sentence): RealExpr => {
  const sets = compute_cck_value_sets(tt, sentence)
  return state_sum_expr(tt, sets.classical_indices)
}

export const translate_real_expr_cck = (tt: TruthTable, expr: RealExpr): RealExpr => {
  const sub = (e: RealExpr): RealExpr => translate_real_expr_cck(tt, e)

  if (expr.tag === 'literal') {
    return expr
  } else if (expr.tag === 'variable') {
    return expr
  } else if (expr.tag === 'state_variable_sum') {
    return expr
  } else if (expr.tag === 'probability') {
    return translate_cck_probability(tt, expr.arg)
  } else if (expr.tag === 'given_probability') {
    return translate_cck_probability(tt, imp(expr.given, expr.arg))
  } else if (expr.tag === 'ite') {
    return { tag: 'ite', condition: translate_constraint_cck(tt, expr.condition), then_expr: sub(expr.then_expr), else_expr: sub(expr.else_expr) }
  } else if (expr.tag === 'negative') {
    return { tag: 'negative', expr: sub(expr.expr) }
  } else if (expr.tag === 'plus') {
    return { tag: 'plus', left: sub(expr.left), right: sub(expr.right) }
  } else if (expr.tag === 'minus') {
    return { tag: 'minus', left: sub(expr.left), right: sub(expr.right) }
  } else if (expr.tag === 'multiply') {
    return { tag: 'multiply', left: sub(expr.left), right: sub(expr.right) }
  } else if (expr.tag === 'divide') {
    return { tag: 'divide', numerator: sub(expr.numerator), denominator: sub(expr.denominator) }
  } else if (expr.tag === 'power') {
    return { tag: 'power', base: sub(expr.base), exponent: sub(expr.exponent) }
  } else {
    return fallthrough('translate_real_expr_cck', expr)
  }
}

export const translate_constraint_cck = (tt: TruthTable, constraint: Constraint): Constraint => {
  const sub = (c: Constraint): Constraint => translate_constraint_cck(tt, c)
  const re = (e: RealExpr): RealExpr => translate_real_expr_cck(tt, e)

  if (constraint.tag === 'equal') {
    return { tag: 'equal', left: re(constraint.left), right: re(constraint.right) }
  } else if (constraint.tag === 'not_equal') {
    return { tag: 'not_equal', left: re(constraint.left), right: re(constraint.right) }
  } else if (constraint.tag === 'less_than') {
    return { tag: 'less_than', left: re(constraint.left), right: re(constraint.right) }
  } else if (constraint.tag === 'less_than_or_equal') {
    return { tag: 'less_than_or_equal', left: re(constraint.left), right: re(constraint.right) }
  } else if (constraint.tag === 'greater_than') {
    return { tag: 'greater_than', left: re(constraint.left), right: re(constraint.right) }
  } else if (constraint.tag === 'greater_than_or_equal') {
    return { tag: 'greater_than_or_equal', left: re(constraint.left), right: re(constraint.right) }
  } else if (constraint.tag === 'negation') {
    return { tag: 'negation', constraint: sub(constraint.constraint) }
  } else if (constraint.tag === 'conjunction') {
    return { tag: 'conjunction', left: sub(constraint.left), right: sub(constraint.right) }
  } else if (constraint.tag === 'disjunction') {
    return { tag: 'disjunction', left: sub(constraint.left), right: sub(constraint.right) }
  } else if (constraint.tag === 'conditional') {
    return { tag: 'conditional', left: sub(constraint.left), right: sub(constraint.right) }
  } else if (constraint.tag === 'biconditional') {
    return { tag: 'biconditional', left: sub(constraint.left), right: sub(constraint.right) }
  } else {
    return fallthrough('translate_constraint_cck', constraint)
  }
}

export const translate_constraints_cck = (tt: TruthTable, constraints: Constraint[]): Constraint[] =>
  constraints.map((constraint) => translate_constraint_cck(tt, constraint))

export const translate_constraint_or_real_expr_cck = (tt: TruthTable, c_or_re: ConstraintOrRealExpr): ConstraintOrRealExpr => {
  if (c_or_re.tag === 'constraint') {
    return { tag: 'constraint', constraint: translate_constraint_cck(tt, c_or_re.constraint) }
  } else if (c_or_re.tag === 'real_expr') {
    return { tag: 'real_expr', real_expr: translate_real_expr_cck(tt, c_or_re.real_expr) }
  } else {
    return fallthrough('translate_constraint_or_real_expr_cck', c_or_re)
  }
}

export const div0_conditions_in_cck_probability = (_tt: TruthTable, _sentence: Sentence): Constraint[] => []
