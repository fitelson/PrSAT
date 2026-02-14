import { math_el } from "./el"
import { letter_string, possible_constraint_connectives, possible_sentence_connectives } from "./pr_sat"
import { PrSat } from "./types"
import { assert_exists } from "./utils"

type Sentence = PrSat['Sentence']
type RealExpr = PrSat['RealExpr']
type Constraint = PrSat['Constraint']

export const state_id = (index: number | string): MathMLElement => {
  const i = typeof index === 'number' ? index + 1 : index
  return math_el('msub', {}, math_el('mi', {}, 'a'), math_el('mi', {}, i.toString()))
}

export const constraint_to_html = (constraint: Constraint, wrap_in_math_element: boolean): MathMLElement => {
  const re2h = (expr: RealExpr): MathMLElement => real_expr_to_html(expr, false)
  const wrap = (constraint: Constraint, exclude: Constraint['tag'][]): MathMLElement => {
    if (!exclude.includes(constraint.tag)) {
      const lp = math_el('mo', {}, '(')
      const rp = math_el('mo', {}, ')')
      return math_el('mrow', {}, lp, sub(constraint), rp)
    } else {
      return sub(constraint)
    }
  }
  const sub = (constraint: Constraint): MathMLElement => {
    const connectives = assert_exists(possible_constraint_connectives[constraint.tag])
    const c = assert_exists(connectives[0])
    const op = math_el('mo', {}, c)
    if (constraint.tag === 'equal') {
      return math_el('mrow', {}, re2h(constraint.left), op, re2h(constraint.right))
    } else if (constraint.tag === 'not_equal') {
      return math_el('mrow', {}, re2h(constraint.left), op, re2h(constraint.right))
    } else if (constraint.tag === 'less_than') {
      return math_el('mrow', {}, re2h(constraint.left), op, re2h(constraint.right))
    } else if (constraint.tag === 'less_than_or_equal') {
      return math_el('mrow', {}, re2h(constraint.left), op, re2h(constraint.right))
    } else if (constraint.tag === 'greater_than') {
      return math_el('mrow', {}, re2h(constraint.left), op, re2h(constraint.right))
    } else if (constraint.tag === 'greater_than_or_equal') {
      return math_el('mrow', {}, re2h(constraint.left), op, re2h(constraint.right))
    } else if (constraint.tag === 'negation') {
      return math_el('mrow', {}, op, wrap(constraint.constraint, ['negation']))
    } else {
      const no_wrap_tags: Constraint['tag'][] = ['negation', 'equal', 'not_equal', 'less_than', 'less_than_or_equal', 'greater_than', 'greater_than_or_equal']
      return math_el('mrow', {}, wrap(constraint.left, no_wrap_tags), op, wrap(constraint.right, [...no_wrap_tags, constraint.tag]))
    }
  }

  if (wrap_in_math_element) {
    return math_el('math', {}, sub(constraint))
  } else {
    return sub(constraint)
  }
}

export const real_expr_to_html = (expr: RealExpr, wrap_in_math_element: boolean): MathMLElement => {
  const wrap = (expr: RealExpr, exclude: RealExpr['tag'][]): MathMLElement => {
    if (expr.tag === 'state_variable_sum' && expr.indices.length === 1) {
      return sub(expr)
    } else if (!exclude.includes(expr.tag)) {
      const lp = math_el('mo', {}, '(')
      const rp = math_el('mo', {}, ')')
      return math_el('mrow', {}, lp, sub(expr), rp)
    } else {
      return sub(expr)
    }
  }
  const s2h = sentence_to_html
  const sub = (expr: RealExpr): MathMLElement => {
    if (expr.tag === 'literal') {
      return math_el('mi', {}, expr.value.toString())
    } else if (expr.tag === 'variable') {
      return math_el('mi', {}, expr.id)
    } else if (expr.tag === 'probability') {
      const lead = math_el('mo', { lspace: '0', rspace: '0' }, 'Pr')
      const lp = math_el('mo', {}, '(')
      const rp = math_el('mo', {}, ')')
      return math_el('mrow', {}, lead, lp, s2h(expr.arg), rp)
    } else if (expr.tag === 'given_probability') {
      const lead = math_el('mo', { lspace: '0', rspace: '0' }, 'Pr')
      const lp = math_el('mo', {}, '(')
      const mid = math_el('mo', {}, '|')
      const rp = math_el('mo', {}, ')')
      return math_el('mrow', {}, lead, lp, s2h(expr.arg), mid, s2h(expr.given), rp)
    } else if (expr.tag === 'state_variable_sum') {
      if (expr.indices.length === 0) {
        return math_el('mi', {}, '0')
      }
      const e = math_el('mrow', {})
      for (const [index, si] of expr.indices.entries()) {
        const summand = state_id(si)
        e.appendChild(summand)
        if (index < expr.indices.length - 1) {
          const op = math_el('mo', {}, '+')
          e.appendChild(op)
        }
      }
      return e
    } else if (expr.tag === 'negative') {
      const op = math_el('mo', {}, '-')
      return math_el('mrow', {}, op, wrap(expr.expr, ['literal', 'probability', 'given_probability', 'variable']))
    } else if (expr.tag === 'power') {
      return math_el('msup', {}, wrap(expr.base, ['literal', 'probability', 'given_probability', 'negative', 'variable']), sub(expr.exponent))
    } else if (expr.tag === 'plus') {
      const op = math_el('mo', {}, '+')
      return math_el('mrow', {}, wrap(expr.left, ['literal', 'variable', 'probability', 'given_probability', 'negative', 'plus', 'minus', 'multiply', 'divide', 'power']), op, wrap(expr.right, ['variable', 'literal', 'probability', 'given_probability', 'negative', 'multiply', 'divide', 'power']))
    } else if (expr.tag === 'minus') {
      const op = math_el('mo', {}, '-')
      return math_el('mrow', {}, wrap(expr.left, ['variable', 'literal', 'probability', 'given_probability', 'negative', 'plus', 'minus', 'multiply', 'divide', 'power']), op, wrap(expr.right, ['variable', 'literal', 'probability', 'given_probability', 'negative', 'multiply', 'divide', 'power']))
    } else if (expr.tag === 'multiply') {
      const op = math_el('mo', {}, '*')
      return math_el('mrow', {}, wrap(expr.left, ['variable', 'literal', 'probability', 'given_probability', 'negative', 'multiply', 'divide', 'power']), op, wrap(expr.right, ['variable', 'literal', 'probability', 'given_probability', 'negative', 'power', 'divide']))
    } else if (expr.tag === 'divide') {
      const n = math_el('mrow', {}, wrap(expr.numerator, ['state_variable_sum', 'variable', 'literal', 'probability', 'given_probability', 'negative', 'plus', 'minus', 'multiply', 'power']))
      const d = math_el('mrow', {}, wrap(expr.denominator, ['state_variable_sum', 'variable', 'literal', 'probability', 'given_probability', 'negative', 'plus', 'minus', 'multiply', 'power']))
      return math_el('mfrac', {}, n, d)
    } else {
      throw new Error('real_expr_to_html fallthrough')
    }
  }

  if (wrap_in_math_element) {
    return math_el('math', {}, sub(expr))
  } else {
    return sub(expr)
  }
}

const sentence_to_html = (s: Sentence): MathMLElement => {
  const sub = (s: Sentence) => sentence_to_html(s)
  const wrap = (s: Sentence, exclude: Sentence['tag'][]) => {
    if (!exclude.includes(s.tag)) {
      const lp = math_el('mo', {}, '(')
      const rp = math_el('mo', {}, ')')
      return math_el('mrow', {}, lp, sub(s), rp)
    } else {
      return sub(s)
    }
  }

  if (s.tag === 'value') {
    const text = s.value ? '⊤' : '⊥'
    return math_el('mi', {}, text)
  } else if (s.tag === 'letter') {
    const id = letter_string(s)
    return math_el('mi', { mathvariant: 'normal' }, id)
  } else if (s.tag === 'negation') {
    const op = math_el('mo', {}, '~')
    return math_el('mrow', {}, op, wrap(s.sentence, ['negation', 'letter', 'value']))
  } else {
    const connectives = assert_exists(possible_sentence_connectives[s.tag])
    const op = math_el('mo', {}, assert_exists(connectives[0]))
    return math_el('mrow', {}, wrap(s.left, ['negation', 'letter', 'value']), op, wrap(s.right, ['negation', 'letter', 'value']))
  }
}
