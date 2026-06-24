import {
  constraint_builder,
  real_expr_builder,
  sentence_builder,
  TruthTable,
} from './pr_sat'
import { ConstraintOrRealExpr, PrSat, SentenceMap } from './types'
import { fallthrough } from './utils'

type Sentence = PrSat['Sentence']
type RealExpr = PrSat['RealExpr']
type Constraint = PrSat['Constraint']

export type TruthValue3 = 0 | 0.5 | 1

export type CooperValueSets = {
  true_indices: number[]
  false_indices: number[]
  void_indices: number[]
  classical_indices: number[]
}

const { imp } = sentence_builder
const { lit, svs, divide, ite } = real_expr_builder
const { eq } = constraint_builder

const cooper_not = (v: TruthValue3): TruthValue3 =>
  v === 1 ? 0 : v === 0 ? 1 : 0.5

const cooper_and = (l: TruthValue3, r: TruthValue3): TruthValue3 => {
  if (l === 0 || r === 0) return 0
  if (l === 1 || r === 1) return 1
  return 0.5
}

const cooper_or = (l: TruthValue3, r: TruthValue3): TruthValue3 => {
  if (l === 1 || r === 1) return 1
  if (l === 0 || r === 0) return 0
  return 0.5
}

const cooper_imp = (l: TruthValue3, r: TruthValue3): TruthValue3 =>
  l === 0 ? 0.5 : r

const cooper_iff = (l: TruthValue3, r: TruthValue3): TruthValue3 =>
  cooper_and(cooper_imp(l, r), cooper_imp(r, l))

export const evaluate_cooper_sentence = (
  eval_letter: (l: SentenceMap['letter']) => boolean,
  sentence: Sentence,
): TruthValue3 => {
  const sub = (s: Sentence): TruthValue3 => evaluate_cooper_sentence(eval_letter, s)

  if (sentence.tag === 'value') {
    return sentence.value ? 1 : 0
  } else if (sentence.tag === 'letter') {
    return eval_letter(sentence) ? 1 : 0
  } else if (sentence.tag === 'negation') {
    return cooper_not(sub(sentence.sentence))
  } else if (sentence.tag === 'conjunction') {
    return cooper_and(sub(sentence.left), sub(sentence.right))
  } else if (sentence.tag === 'disjunction') {
    return cooper_or(sub(sentence.left), sub(sentence.right))
  } else if (sentence.tag === 'conditional') {
    return cooper_imp(sub(sentence.left), sub(sentence.right))
  } else if (sentence.tag === 'biconditional') {
    return cooper_iff(sub(sentence.left), sub(sentence.right))
  } else {
    return fallthrough('evaluate_cooper_sentence', sentence)
  }
}

export const compute_cooper_value_sets = (tt: TruthTable, sentence: Sentence): CooperValueSets => {
  const true_indices: number[] = []
  const false_indices: number[] = []
  const void_indices: number[] = []

  for (const state_index of tt.state_indices()) {
    const value = evaluate_cooper_sentence(
      (letter) => tt.letter_value_from_index(letter, state_index),
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

export const translate_cooper_probability = (tt: TruthTable, sentence: Sentence): RealExpr => {
  const sets = compute_cooper_value_sets(tt, sentence)
  const numerator = state_sum_expr(tt, sets.true_indices)
  const denominator = state_sum_expr(tt, sets.classical_indices)

  if (denominator.tag === 'literal') {
    if (denominator.value === 0) return lit(1)
    if (denominator.value === 1) return numerator
  }

  return ite(eq(denominator, lit(0)), lit(1), divide(numerator, denominator))
}

export const cooper_probability_denominator = (tt: TruthTable, sentence: Sentence): RealExpr => {
  const sets = compute_cooper_value_sets(tt, sentence)
  return state_sum_expr(tt, sets.classical_indices)
}

export const translate_real_expr_cooper = (tt: TruthTable, expr: RealExpr): RealExpr => {
  const sub = (e: RealExpr): RealExpr => translate_real_expr_cooper(tt, e)

  if (expr.tag === 'literal') {
    return expr
  } else if (expr.tag === 'variable') {
    return expr
  } else if (expr.tag === 'state_variable_sum') {
    return expr
  } else if (expr.tag === 'probability') {
    return translate_cooper_probability(tt, expr.arg)
  } else if (expr.tag === 'given_probability') {
    return translate_cooper_probability(tt, imp(expr.given, expr.arg))
  } else if (expr.tag === 'ite') {
    return { tag: 'ite', condition: translate_constraint_cooper(tt, expr.condition), then_expr: sub(expr.then_expr), else_expr: sub(expr.else_expr) }
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
    return fallthrough('translate_real_expr_cooper', expr)
  }
}

export const translate_constraint_cooper = (tt: TruthTable, constraint: Constraint): Constraint => {
  const sub = (c: Constraint): Constraint => translate_constraint_cooper(tt, c)
  const re = (e: RealExpr): RealExpr => translate_real_expr_cooper(tt, e)

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
    return fallthrough('translate_constraint_cooper', constraint)
  }
}

export const translate_constraints_cooper = (tt: TruthTable, constraints: Constraint[]): Constraint[] =>
  constraints.map((constraint) => translate_constraint_cooper(tt, constraint))

export const translate_constraint_or_real_expr_cooper = (tt: TruthTable, c_or_re: ConstraintOrRealExpr): ConstraintOrRealExpr => {
  if (c_or_re.tag === 'constraint') {
    return { tag: 'constraint', constraint: translate_constraint_cooper(tt, c_or_re.constraint) }
  } else if (c_or_re.tag === 'real_expr') {
    return { tag: 'real_expr', real_expr: translate_real_expr_cooper(tt, c_or_re.real_expr) }
  } else {
    return fallthrough('translate_constraint_or_real_expr_cooper', c_or_re)
  }
}

export const div0_conditions_in_cooper_probability = (_tt: TruthTable, _sentence: Sentence): Constraint[] => []
