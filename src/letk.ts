import {
  MAX_TRUTH_TABLE_STATES,
  real_expr_builder,
  TruthTable,
  VariableLists,
} from './pr_sat'
import { ConstraintOrRealExpr, PrSat, SentenceMap } from './types'
import { fallthrough } from './utils'

type Sentence = PrSat['Sentence']
type RealExpr = PrSat['RealExpr']
type Constraint = PrSat['Constraint']

export type LETKTruthValue = 'T' | 't' | 'b' | 'f' | 'F' | 'n'
type Bit = 0 | 1
type TwistTriple = readonly [Bit, Bit, Bit]

export const LETK_VALUES: readonly LETKTruthValue[] = ['T', 't', 'b', 'f', 'F', 'n']
export const MAX_LETK_TRUTH_TABLE_LETTERS = Math.floor(Math.log(MAX_TRUTH_TABLE_STATES) / Math.log(6))

const TRIPLES: Record<LETKTruthValue, TwistTriple> = {
  T: [1, 0, 1],
  t: [1, 0, 0],
  b: [1, 1, 0],
  f: [0, 1, 0],
  F: [0, 1, 1],
  n: [0, 0, 0],
}

const triple_key = ([positive, negative, reliable]: TwistTriple): string =>
  `${positive}${negative}${reliable}`

const VALUE_FROM_TRIPLE = new Map<string, LETKTruthValue>(
  LETK_VALUES.map((value) => [triple_key(TRIPLES[value]), value]),
)

const bit = (value: boolean): Bit => value ? 1 : 0
const from_triple = (triple: TwistTriple): LETKTruthValue => {
  const value = VALUE_FROM_TRIPLE.get(triple_key(triple))
  if (value === undefined) throw new Error(`Illegal LET_K+ twist triple: ${JSON.stringify(triple)}`)
  return value
}

export const letk_designated = (value: LETKTruthValue): boolean => TRIPLES[value][0] === 1

export const letk_not = (value: LETKTruthValue): LETKTruthValue => {
  const [positive, negative, reliable] = TRIPLES[value]
  return from_triple([negative, positive, reliable])
}

export const letk_reliability = (value: LETKTruthValue): LETKTruthValue => {
  const reliable = TRIPLES[value][2]
  return from_triple([reliable, bit(reliable === 0), 1])
}

export const letk_and = (left: LETKTruthValue, right: LETKTruthValue): LETKTruthValue => {
  const [l1, l2, l3] = TRIPLES[left]
  const [r1, r2, r3] = TRIPLES[right]
  return from_triple([
    bit(l1 === 1 && r1 === 1),
    bit(l2 === 1 || r2 === 1),
    bit((l1 === 1 && l3 === 1 && r1 === 1 && r3 === 1) || (l2 === 1 && l3 === 1) || (r2 === 1 && r3 === 1)),
  ])
}

export const letk_or = (left: LETKTruthValue, right: LETKTruthValue): LETKTruthValue => {
  const [l1, l2, l3] = TRIPLES[left]
  const [r1, r2, r3] = TRIPLES[right]
  return from_triple([
    bit(l1 === 1 || r1 === 1),
    bit(l2 === 1 && r2 === 1),
    bit((l2 === 1 && l3 === 1 && r2 === 1 && r3 === 1) || (l1 === 1 && l3 === 1) || (r1 === 1 && r3 === 1)),
  ])
}

export const letk_imp = (left: LETKTruthValue, right: LETKTruthValue): LETKTruthValue => {
  const [l1, l2, l3] = TRIPLES[left]
  const [r1, r2, r3] = TRIPLES[right]
  return from_triple([
    bit(l1 === 0 || r1 === 1),
    bit(l1 === 1 && r2 === 1),
    bit((l1 === 1 && r2 === 1 && r3 === 1) || (l2 === 1 && l3 === 1) || (r1 === 1 && r3 === 1)),
  ])
}

export const letk_iff = (left: LETKTruthValue, right: LETKTruthValue): LETKTruthValue =>
  letk_and(letk_imp(left, right), letk_imp(right, left))

const normalize_value = (value: boolean | LETKTruthValue): LETKTruthValue =>
  value === true ? 'T' : value === false ? 'F' : value

export const evaluate_letk_sentence = (
  eval_letter: (letter: SentenceMap['letter']) => boolean | LETKTruthValue,
  sentence: Sentence,
): LETKTruthValue => {
  const sub = (child: Sentence): LETKTruthValue => evaluate_letk_sentence(eval_letter, child)

  if (sentence.tag === 'value') return sentence.value ? 'T' : 'F'
  if (sentence.tag === 'letter') return normalize_value(eval_letter(sentence))
  if (sentence.tag === 'negation') return letk_not(sub(sentence.sentence))
  if (sentence.tag === 'reliability') return letk_reliability(sub(sentence.sentence))
  if (sentence.tag === 'conjunction') return letk_and(sub(sentence.left), sub(sentence.right))
  if (sentence.tag === 'disjunction') return letk_or(sub(sentence.left), sub(sentence.right))
  if (sentence.tag === 'conditional') return letk_imp(sub(sentence.left), sub(sentence.right))
  if (sentence.tag === 'biconditional') return letk_iff(sub(sentence.left), sub(sentence.right))
  return fallthrough('evaluate_letk_sentence', sentence)
}

export class LETKTruthTable extends TruthTable {
  private readonly letk_letter_ids: SentenceMap['letter'][]

  constructor(variables: Readonly<VariableLists>) {
    super(variables)
    this.letk_letter_ids = Array.from(super.letters())
    if (this.letk_letter_ids.length > MAX_LETK_TRUTH_TABLE_LETTERS) {
      throw new Error(
        `TwistPrSAT supports at most ${MAX_LETK_TRUTH_TABLE_LETTERS} distinct sentence letters ` +
        `(${Math.pow(6, MAX_LETK_TRUTH_TABLE_LETTERS)} LET_K+ states); received ${this.letk_letter_ids.length}.`,
      )
    }
  }

  private letter_offset(letter: SentenceMap['letter']): number {
    const index = this.letk_letter_ids.findIndex((candidate) =>
      candidate.id === letter.id && candidate.index === letter.index)
    if (index < 0) throw new Error(`Letter ${letter.id}${letter.index > 0 ? letter.index : ''} is not in this LET_K+ table`)
    return index
  }

  letters(): Iterable<SentenceMap['letter']> { return this.letk_letter_ids }
  n_letters(): number { return this.letk_letter_ids.length }
  n_states(): number { return Math.pow(6, this.letk_letter_ids.length) }

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

  letter_value6_from_index(letter: SentenceMap['letter'], state_index: number): LETKTruthValue {
    if (!Number.isInteger(state_index) || state_index < 0 || state_index >= this.n_states()) {
      throw new Error(`LET_K+ state index ${state_index} out of bounds`)
    }
    const offset = this.letter_offset(letter)
    const power = Math.pow(6, this.letk_letter_ids.length - offset - 1)
    return LETK_VALUES[Math.floor(state_index / power) % 6]!
  }

  letter_value_from_index(letter: SentenceMap['letter'], state_index: number): boolean {
    return letk_designated(this.letter_value6_from_index(letter, state_index))
  }
}

export const is_letk_truth_table = (table: TruthTable): table is LETKTruthTable =>
  typeof (table as LETKTruthTable).letter_value6_from_index === 'function'

export const table_letk_value = (
  table: TruthTable,
  letter: SentenceMap['letter'],
  state_index: number,
): LETKTruthValue => is_letk_truth_table(table)
  ? table.letter_value6_from_index(letter, state_index)
  : table.letter_value_from_index(letter, state_index) ? 'T' : 'F'

export type LETKValueSets = Record<LETKTruthValue, number[]> & {
  positive_indices: number[]
  negative_indices: number[]
  reliable_indices: number[]
}

export const compute_letk_value_sets = (table: TruthTable, sentence: Sentence): LETKValueSets => {
  const result = {
    T: [], t: [], b: [], f: [], F: [], n: [],
    positive_indices: [], negative_indices: [], reliable_indices: [],
  } as LETKValueSets

  for (const state_index of table.state_indices()) {
    const value = evaluate_letk_sentence(
      (letter) => is_letk_truth_table(table)
        ? table.letter_value6_from_index(letter, state_index)
        : table.letter_value_from_index(letter, state_index),
      sentence,
    )
    result[value].push(state_index)
    if (letk_designated(value)) result.positive_indices.push(state_index)
    if (value === 'F' || value === 'f' || value === 'b') result.negative_indices.push(state_index)
    if (value === 'T' || value === 'F') result.reliable_indices.push(state_index)
  }
  return result
}

const { lit, svs, divide } = real_expr_builder

const state_sum_expr = (table: TruthTable, indices: number[]): RealExpr => {
  if (indices.length === 0) return lit(0)
  if (indices.length === table.n_states()) return lit(1)
  return svs(indices)
}

export const translate_letk_probability = (table: TruthTable, sentence: Sentence): RealExpr =>
  state_sum_expr(table, compute_letk_value_sets(table, sentence).positive_indices)

export const translate_real_expr_letk = (table: TruthTable, expr: RealExpr): RealExpr => {
  const sub = (child: RealExpr): RealExpr => translate_real_expr_letk(table, child)
  if (expr.tag === 'literal' || expr.tag === 'variable' || expr.tag === 'state_variable_sum') return expr
  if (expr.tag === 'probability') return translate_letk_probability(table, expr.arg)
  if (expr.tag === 'given_probability') {
    const numerator = translate_letk_probability(table, { tag: 'conjunction', left: expr.arg, right: expr.given })
    const denominator = translate_letk_probability(table, expr.given)
    return divide(numerator, denominator)
  }
  if (expr.tag === 'negative') return { tag: 'negative', expr: sub(expr.expr) }
  if (expr.tag === 'plus' || expr.tag === 'minus' || expr.tag === 'multiply') {
    return { tag: expr.tag, left: sub(expr.left), right: sub(expr.right) }
  }
  if (expr.tag === 'divide') return { tag: 'divide', numerator: sub(expr.numerator), denominator: sub(expr.denominator) }
  if (expr.tag === 'power') return { tag: 'power', base: sub(expr.base), exponent: sub(expr.exponent) }
  if (expr.tag === 'ite') {
    return {
      tag: 'ite',
      condition: translate_constraint_letk(table, expr.condition),
      then_expr: sub(expr.then_expr),
      else_expr: sub(expr.else_expr),
    }
  }
  return fallthrough('translate_real_expr_letk', expr)
}

export const translate_constraint_letk = (table: TruthTable, constraint: Constraint): Constraint => {
  const sub = (child: Constraint): Constraint => translate_constraint_letk(table, child)
  const real = (expr: RealExpr): RealExpr => translate_real_expr_letk(table, expr)
  if (constraint.tag === 'equal' || constraint.tag === 'not_equal' ||
      constraint.tag === 'less_than' || constraint.tag === 'less_than_or_equal' ||
      constraint.tag === 'greater_than' || constraint.tag === 'greater_than_or_equal') {
    return { tag: constraint.tag, left: real(constraint.left), right: real(constraint.right) }
  }
  if (constraint.tag === 'negation') return { tag: 'negation', constraint: sub(constraint.constraint) }
  if (constraint.tag === 'conjunction' || constraint.tag === 'disjunction' ||
      constraint.tag === 'conditional' || constraint.tag === 'biconditional') {
    return { tag: constraint.tag, left: sub(constraint.left), right: sub(constraint.right) }
  }
  return fallthrough('translate_constraint_letk', constraint)
}

export const translate_constraints_letk = (table: TruthTable, constraints: Constraint[]): Constraint[] =>
  constraints.map((constraint) => translate_constraint_letk(table, constraint))

export const translate_constraint_or_real_expr_letk = (
  table: TruthTable,
  input: ConstraintOrRealExpr,
): ConstraintOrRealExpr => input.tag === 'constraint'
  ? { tag: 'constraint', constraint: translate_constraint_letk(table, input.constraint) }
  : { tag: 'real_expr', real_expr: translate_real_expr_letk(table, input.real_expr) }
