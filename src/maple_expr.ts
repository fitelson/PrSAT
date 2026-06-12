// Parser for Maple expression strings (as returned by the local Maple bridge)
// into PrSAT RealExpr ASTs. Variables `a<N>` (1-indexed) become
// state_variable_sum([N-1]). Supports + - * / ^ ( ), integers, and unary minus
// — everything Maple's `solve` emits for rational-function solution branches.
// Anything else (function calls like RootOf, floats) fails the parse, which
// the caller treats as "discard this branch" (sound incompleteness).

import { PrSat } from './types'
import { real_expr_builder } from './pr_sat'

type RealExpr = PrSat['RealExpr']

const { lit, svs, neg, plus, minus, multiply, divide, power } = real_expr_builder

type Token =
  | { tag: 'int', value: string }
  | { tag: 'name', value: string }
  | { tag: 'op', value: '+' | '-' | '*' | '/' | '^' | '(' | ')' }

const tokenize = (s: string): Token[] | undefined => {
  const tokens: Token[] = []
  let i = 0
  while (i < s.length) {
    const c = s[i]!
    if (c === ' ' || c === '\t' || c === '\n' || c === '\\') { i++; continue }
    if (c === '+' || c === '-' || c === '*' || c === '/' || c === '^' || c === '(' || c === ')') {
      tokens.push({ tag: 'op', value: c })
      i++
      continue
    }
    if (c >= '0' && c <= '9') {
      let j = i
      while (j < s.length && s[j]! >= '0' && s[j]! <= '9') j++
      if (s[j] === '.') return undefined  // floats: not exact, reject
      tokens.push({ tag: 'int', value: s.slice(i, j) })
      i = j
      continue
    }
    if (/[a-zA-Z_]/.test(c)) {
      let j = i
      while (j < s.length && /[a-zA-Z0-9_]/.test(s[j]!)) j++
      tokens.push({ tag: 'name', value: s.slice(i, j) })
      i = j
      continue
    }
    return undefined  // unsupported character (e.g. RootOf's comma handled upstream)
  }
  return tokens
}

// Parse a Maple expression. `var_to_index` maps a variable name (e.g. "a3")
// to its 0-based state index. Returns undefined on anything unsupported.
export const parse_maple_expr = (
  source: string,
  var_to_index: (name: string) => number | undefined,
): RealExpr | undefined => {
  const tokens = tokenize(source)
  if (tokens === undefined) return undefined
  let pos = 0

  const peek = (): Token | undefined => tokens[pos]
  const take = (): Token | undefined => tokens[pos++]

  const parse_expr = (): RealExpr | undefined => {
    let left = parse_term()
    if (left === undefined) return undefined
    for (;;) {
      const t = peek()
      if (t?.tag === 'op' && (t.value === '+' || t.value === '-')) {
        take()
        const right = parse_term()
        if (right === undefined) return undefined
        left = t.value === '+' ? plus(left, right) : minus(left, right)
      } else {
        return left
      }
    }
  }

  const parse_term = (): RealExpr | undefined => {
    let left = parse_unary()
    if (left === undefined) return undefined
    for (;;) {
      const t = peek()
      if (t?.tag === 'op' && (t.value === '*' || t.value === '/')) {
        take()
        const right = parse_unary()
        if (right === undefined) return undefined
        left = t.value === '*' ? multiply(left, right) : divide(left, right)
      } else {
        return left
      }
    }
  }

  const parse_unary = (): RealExpr | undefined => {
    const t = peek()
    if (t?.tag === 'op' && t.value === '-') {
      take()
      const inner = parse_unary()
      return inner === undefined ? undefined : neg(inner)
    }
    if (t?.tag === 'op' && t.value === '+') {
      take()
      return parse_unary()
    }
    return parse_power()
  }

  const parse_power = (): RealExpr | undefined => {
    const base = parse_atom()
    if (base === undefined) return undefined
    const t = peek()
    if (t?.tag === 'op' && t.value === '^') {
      take()
      // Exponent: integer, possibly parenthesized/negated.
      const exp = parse_unary()
      if (exp === undefined) return undefined
      return power(base, exp)
    }
    return base
  }

  const parse_atom = (): RealExpr | undefined => {
    const t = take()
    if (t === undefined) return undefined
    if (t.tag === 'int') {
      return lit(Number(t.value))
    }
    if (t.tag === 'name') {
      const index = var_to_index(t.value)
      if (index === undefined) return undefined  // unknown name (RootOf, ...)
      return svs([index])
    }
    if (t.tag === 'op' && t.value === '(') {
      const inner = parse_expr()
      if (inner === undefined) return undefined
      const close = take()
      if (close?.tag !== 'op' || close.value !== ')') return undefined
      return inner
    }
    return undefined
  }

  const result = parse_expr()
  return pos === tokens.length ? result : undefined
}

// Standard PrSAT naming: a1..an ↦ indices 0..n-1.
export const default_var_to_index = (n_states: number) => (name: string): number | undefined => {
  const m = name.match(/^a([0-9]+)$/)
  if (m === null) return undefined
  const i = Number(m[1]) - 1
  return i >= 0 && i < n_states ? i : undefined
}
