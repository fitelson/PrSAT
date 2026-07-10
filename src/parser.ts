import P from 'parsimmon'
import { BINARY_LEFT, BINARY_RIGHT, make_parser, operators, PREFIX } from "./parsimmon_expr"
import { clause, default_clause, match_s, S, spv } from "./s"
import { sentence_builder, real_expr_builder, constraint_builder, possible_constraint_connectives, possible_sentence_connectives } from './pr_sat'
import { assert_result, Res } from './utils'
import { ConstraintOrRealExpr, PrSat, RealExprMap } from './types'

type Sentence = PrSat['Sentence']
type RealExpr = PrSat['RealExpr']
type Constraint = PrSat['Constraint']

const { val, letter, not, and, or, imp, iff } = sentence_builder
const { lit, neg, power, multiply, divide, plus, minus, pr, cpr, vbl } = real_expr_builder
const { eq, neq, lt, lte, gt, gte, cnot, cand, cor, cimp, ciff } = constraint_builder

const finish_real_expr_parse = (s: S): RealExpr => {
  const a = spv('a')
  const b = spv('b')
  return match_s(s, [
    // This is rough because the types of a and b aren't actually S!
    clause<{ a: 'number' }, RealExpr>({ a: 'number' },
      a,
      (m) => lit(m('a'))),
    clause<{ a: 's' }, RealExpr>({ a: 's' },
      ['Negate', a],
      (m) => neg(finish_real_expr_parse(m('a')))),
    clause<{ a: 's', b: 's' }, RealExpr>({ a: 's', b: 's' },
      ['Exponentiate', a, b],
      (m) => {
        const exp = finish_real_expr_parse(m('b'))
        return power(finish_real_expr_parse(m('a')), exp)
      }) ,
    clause<{ a: 's', b: 's' }, RealExpr>({ a: 's', b: 's' },
      ['Multiply', a, b],
      (m) => multiply(finish_real_expr_parse(m('a')), finish_real_expr_parse(m('b')))),
    clause<{ a: 's', b: 's' }, RealExpr>({ a: 's', b: 's' },
      ['Divide', a, b],
      (m) => divide(finish_real_expr_parse(m('a')), finish_real_expr_parse(m('b')))),
    clause<{ a: 's', b: 's' }, RealExpr>({ a: 's', b: 's' },
      ['Add', a, b],
      (m) => plus(finish_real_expr_parse(m('a')), finish_real_expr_parse(m('b')))),
    clause<{ a: 's', b: 's' }, RealExpr>({ a: 's', b: 's' },
      ['Subtract', a, b],
      (m) => minus(finish_real_expr_parse(m('a')), finish_real_expr_parse(m('b')))),
    default_clause((s) => s('s') as any as RealExpr)
  ])
}

const ctag_to_c_parser = (ctag: Constraint['tag']): P.Parser<any> => {
  const connectives = [...possible_constraint_connectives[ctag]].sort((a, b) => b.length - a.length)
  if (connectives.length === 1) {
    return P.string(connectives[0]).trim(P.optWhitespace)
  } else {
    return P.alt(...connectives.map((c) => P.string(c))).trim(P.optWhitespace)
  }
}

const stag_to_c_parser = (stag: Sentence['tag']): P.Parser<any> => {
  const connectives = [...possible_sentence_connectives[stag]].sort((a, b) => b.length - a.length)
  if (connectives.length === 1) {
    return P.string(connectives[0]).trim(P.optWhitespace)
  } else {
    return P.alt(...connectives.map((c) => P.string(c))).trim(P.optWhitespace)
  }
}

const right_assoc_binary = <T>(factor: P.Parser<T>, op: P.Parser<(left: T, right: T) => T>): P.Parser<T> => {
  let parser: P.Parser<T>
  parser = P.lazy(() =>
    P.seqMap(
      factor,
      P.seq(op, parser).fallback(undefined),
      (left, rest) => rest === undefined ? left : rest[0](left, rest[1]),
    )
  )
  return parser
}

const normalize_numeric_literal_source = (source: string): string => {
  const [integer, decimal] = source.split('.')
  const normalized_integer = (integer ?? '0').replace(/^0+(?=\d)/, '') || '0'
  return decimal === undefined ? normalized_integer : `${normalized_integer}.${decimal}`
}

const parse_numeric_literal = (source: string): RealExprMap['literal'] => {
  const normalized = normalize_numeric_literal_source(source)
  const value = parseFloat(normalized)
  const should_keep_source =
    !Number.isFinite(value) ||
    value.toString() !== normalized ||
    (Number.isInteger(value) && !Number.isSafeInteger(value))
  return lit(value, should_keep_source ? normalized : undefined)
}

const ConstraintLang = P.createLanguage({
  // Logical precedence, from tightest to loosest:
  // negation, conjunction, disjunction, conditional, biconditional.
  // Implication remains right-associative, as do the associative operators.
  Constraint: (r) => r.CIff,
  CIff: (r) => right_assoc_binary(r.CImp, ctag_to_c_parser('biconditional').result(ciff)),
  CImp: (r) => right_assoc_binary(r.COr, ctag_to_c_parser('conditional').result(cimp)),
  COr: (r) => right_assoc_binary(r.CAnd, ctag_to_c_parser('disjunction').result(cor)),
  CAnd: (r) => right_assoc_binary(r.ConstraintFactor, ctag_to_c_parser('conjunction').result(cand)),
  ConstraintFactor: (r) => P.alt(
    r.Equal,
    r.NotEqual,
    r.LessThan,
    r.GreaterThan,
    r.LessThanOrEqual,
    r.GreaterThanOrEqual,
    r.CNot,
    P.string('(').then(P.optWhitespace).then(r.Constraint).skip(P.optWhitespace).skip(P.string(')')),
  ),
  Equal: (r) => P.seq(r.RealExpr.skip(P.optWhitespace).skip(ctag_to_c_parser('equal')).skip(P.optWhitespace), r.RealExpr)
    .map(([l, r]) => eq(l, r)),
  NotEqual: (r) => P.seq(r.RealExpr.skip(P.optWhitespace).skip(ctag_to_c_parser('not_equal')).skip(P.optWhitespace), r.RealExpr)
    .map(([l, r]) => neq(l, r)),
  LessThan: (r) => P.seq(r.RealExpr.skip(P.optWhitespace).skip(ctag_to_c_parser('less_than')).skip(P.optWhitespace), r.RealExpr)
    .map(([l, r]) => lt(l, r)),
  GreaterThan: (r) => P.seq(r.RealExpr.skip(P.optWhitespace).skip(ctag_to_c_parser('greater_than')).skip(P.optWhitespace), r.RealExpr)
    .map(([l, r]) => gt(l, r)),
  LessThanOrEqual: (r) => P.seq(r.RealExpr.skip(P.optWhitespace).skip(ctag_to_c_parser('less_than_or_equal')).skip(P.optWhitespace), r.RealExpr)
    .map(([l, r]) => lte(l, r)),
  GreaterThanOrEqual: (r) => P.seq(r.RealExpr.skip(P.optWhitespace).skip(ctag_to_c_parser('greater_than_or_equal')).skip(P.optWhitespace), r.RealExpr)
    .map(([l, r]) => gte(l, r)),
  CNot: (r) => ctag_to_c_parser('negation').skip(P.optWhitespace).then(r.ConstraintFactor)
    .map((inner) => cnot(inner)),
  
  ProbabilityLead: () => P.alt(P.string('Pr('), P.string('P('), P.string('p(')),

  RealExprBase: (r) => P.alt(
    P.string('(').then(P.optWhitespace).then(r.RealExpr).skip(P.optWhitespace).skip(P.string(')')),
    P.seq(r.ProbabilityLead, P.optWhitespace, r.Sentence, P.optWhitespace, P.string('|'), P.optWhitespace, r.Sentence, P.optWhitespace, P.string(')'))
      .map(([_lp, _lw, s, _mlw, _sep, _mrw, r]) => cpr(s, r)),
    r.ProbabilityLead.then(P.optWhitespace).then(r.Sentence).skip(P.optWhitespace).skip(P.string(')'))
      .map((s) => pr(s)),
    P.regexp(/[0-9]+(\.[0-9]+)?/).map(parse_numeric_literal),
    P.regexp(/[A-Za-z]+/).map((n) => vbl(n)),
    // P.regexp(/[0-9]+/).map((n) => parseInt(n)),
  ),
  PreRealExpr: (r) => make_parser(
    r.RealExprBase,
    [
      { type: BINARY_RIGHT, ops: operators({ Exponentiate: '^' }) },
      { type: PREFIX, ops: operators({ Negate: '-' }) },
      { type: BINARY_LEFT, ops: operators({ Multiply: '*', Divide: '/' }) },
      { type: BINARY_LEFT, ops: operators({ Add: '+', Subtract: '-' }) },
    ]),
  RealExpr: (r) => r.PreRealExpr.map(finish_real_expr_parse),

  Sentence: (r) => r.SIff,
  SIff: (r) => right_assoc_binary(r.SImp, stag_to_c_parser('biconditional').result(iff)),
  SImp: (r) => right_assoc_binary(r.SOr, stag_to_c_parser('conditional').result(imp)),
  SOr: (r) => right_assoc_binary(r.SAnd, stag_to_c_parser('disjunction').result(or)),
  SAnd: (r) => right_assoc_binary(r.SentenceFactor, stag_to_c_parser('conjunction').result(and)),
  SentenceFactor: (r) => P.alt(
    r.Not,
    r.WrappedSentence,
    P.string('true').or(P.string('⊤')).map(() => val(true)),
    P.string('false').or(P.string('⊥')).map(() => val(false)),
    r.SL
  ),
  WrappedSentence: (r) => P.seq(P.string('('), P.optWhitespace, r.Sentence, P.optWhitespace, P.string(')'))
    .map(([_l, _lp, s, _rp, _r]) => s),
  SL: () => P.seq(P.regexp(/[A-Z]/), P.regexp(/([1-9][0-9]*)?/)).map(([id, index]) => letter(id, index.length > 0 ? parseInt(index) : 0)),
  Not: (r) => P.seq(stag_to_c_parser('negation'), P.optWhitespace, r.SentenceFactor).map(([_1, _2, s]) => not(s)),
})

const parse_error_to_string = (error: P.Failure): string => {
  return `At column ${error.index.column}\nexpected ${error.expected.join(' ')}`
}

const parser_to_parse_func = <T>(parser: P.Parser<T>) => (input: string): Res<T, string> => {
  const parsed = parser.parse(input)
  if (!parsed.status) {
    return [false, parse_error_to_string(parsed)]
  } else {
    return [true, parsed.value]
  }
}

const parse_func_to_asserted_func = <T>(parse: (input: string) => Res<T, string>) => (input: string): T => {
  return assert_result(parse(input))
}

export const parse_sentence = parser_to_parse_func<Sentence>(ConstraintLang.Sentence)
export const parse_real_expr = parser_to_parse_func<RealExpr>(ConstraintLang.RealExpr)
export const parse_constraint = parser_to_parse_func<Constraint>(ConstraintLang.Constraint)

export const assert_parse_sentence = parse_func_to_asserted_func(parse_sentence)
export const assert_parse_real_expr = parse_func_to_asserted_func(parse_real_expr)
export const assert_parse_constraint = parse_func_to_asserted_func(parse_constraint)

const ConstraintOrRealExprParser = P.alt(
  ConstraintLang.Constraint.map((e) => ({ tag: 'constraint', constraint: e })),
  ConstraintLang.RealExpr.map((e) => ({ tag: 'real_expr', real_expr: e })),
)

export const parse_constraint_or_real_expr = (input: string): Res<ConstraintOrRealExpr, string> => {
  const parsed = ConstraintOrRealExprParser.parse(input)
  if (!parsed.status) {
    return [false, parse_error_to_string(parsed)]
  } else {
    return [true, parsed.value]
  }
}
