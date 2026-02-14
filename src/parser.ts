import P from 'parsimmon'
import { BINARY_LEFT, BINARY_RIGHT, make_parser, operators, PREFIX } from "./parsimmon_expr"
import { clause, default_clause, match_s, S, spv } from "./s"
import { sentence_builder, real_expr_builder, constraint_builder, possible_constraint_connectives, possible_sentence_connectives } from './pr_sat'
import { assert_result, Res } from './utils'
import { ConstraintOrRealExpr, PrSat } from './types'

type Sentence = PrSat['Sentence']
type RealExpr = PrSat['RealExpr']
type Constraint = PrSat['Constraint']

const { val, letter, not, and, or, imp, iff } = sentence_builder
const { lit, neg, power, multiply, divide, plus, minus, pr, cpr, vbl } = real_expr_builder
const { eq, neq, lt, lte, gt, gte, cnot } = constraint_builder

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
  const connectives = possible_constraint_connectives[ctag]
  if (connectives.length === 1) {
    return P.string(connectives[0])
  } else {
    return P.alt(...connectives.map((c) => P.string(c)))
  }
}

const stag_to_c_parser = (stag: Sentence['tag']): P.Parser<any> => {
  const connectives = possible_sentence_connectives[stag]
  if (connectives.length === 1) {
    return P.string(connectives[0])
  } else {
    return P.alt(...connectives.map((c) => P.string(c)))
  }
}

const ConstraintLang = P.createLanguage({
  Constraint: (r) => P.alt(
    // r.Equal,
    // r.NotEqual,
    // r.LessThan,
    // r.GreaterThan,
    // r.LessThanOrEqual,
    // r.GreaterThanOrEqual,
    r.CAnd,
    r.COr,
    r.CImp,
    r.CIff,
    r.ConstraintFactor,
  ),
  ConstraintFactor: (r) => P.alt(
    r.Equal,
    r.NotEqual,
    r.LessThan,
    r.GreaterThan,
    r.LessThanOrEqual,
    r.GreaterThanOrEqual,
    r.CNot,
    P.string('(').then(r.Constraint).skip(P.string(')')),
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
  CNot: (r) => ctag_to_c_parser('negation').then(r.ConstraintFactor)
    .map((inner) => cnot(inner)),
  CAnd: (r) => r.ConstraintFactor.sepBy(P.optWhitespace.skip(ctag_to_c_parser('conjunction')).skip(P.optWhitespace))
    .assert((operands) => operands.length >= 2, 'And expects at least 2 operands!')
    .map((operands) => operands.reduceRight((pv, cv) => and(cv, pv))),
  COr: (r) => r.ConstraintFactor.sepBy(P.optWhitespace.skip(ctag_to_c_parser('disjunction')).skip(P.optWhitespace))
    .assert((operands) => operands.length >= 2, 'Or expects at least 2 operands!')
    .map((operands) => operands.reduceRight((pv, cv) => or(cv, pv))),
  CImp: (r) => r.ConstraintFactor.sepBy(P.optWhitespace.skip(ctag_to_c_parser('conditional')).skip(P.optWhitespace))
    .assert((operands) => operands.length >= 2, 'Imp expects at least 2 operands!')
    .map((operands) => operands.reduceRight((pv, cv) => imp(cv, pv))),
  CIff: (r) => r.ConstraintFactor.sepBy(P.optWhitespace.skip(ctag_to_c_parser('biconditional')).skip(P.optWhitespace))
    .assert((operands) => operands.length >= 2, 'Imp expects at least 2 operands!')
    .map((operands) => operands.reduceRight((pv, cv) => iff(cv, pv))),
  
  ProbabilityLead: () => P.alt(P.string('Pr('), P.string('P('), P.string('p(')),

  RealExprBase: (r) => P.alt(
    P.string('(').then(P.optWhitespace).then(r.RealExpr).skip(P.optWhitespace).skip(P.string(')')),
    P.seq(r.ProbabilityLead, P.optWhitespace, r.Sentence, P.optWhitespace, P.string('|'), P.optWhitespace, r.Sentence, P.optWhitespace, P.string(')'))
      .map(([_lp, _lw, s, _mlw, _sep, _mrw, r]) => cpr(s, r)),
    r.ProbabilityLead.then(P.optWhitespace).then(r.Sentence).skip(P.optWhitespace).skip(P.string(')'))
      .map((s) => pr(s)),
    P.regexp(/[0-9]+(\.[0-9]+)?/).map((n) => parseFloat(n)),
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

  Sentence: (r) => P.alt(r.And, r.Or, r.Imp, r.Iff, r.SentenceFactor),
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
  And: (r) => r.SentenceFactor.sepBy(P.seq(P.optWhitespace, stag_to_c_parser('conjunction'), P.optWhitespace))
    .assert((operands) => operands.length >= 2, 'And expects at least two operands!')
    .map((operands) => operands.reduceRight((pv, cv) => and(cv, pv))),
  Or: (r) => r.SentenceFactor.sepBy(P.seq(P.optWhitespace, stag_to_c_parser('disjunction'), P.optWhitespace))
    .assert((operands) => operands.length >= 2, 'Or expects at least two operands!')
    .map((operands) => operands.reduceRight((pv, cv) => or(cv, pv))),
  Imp: (r) => r.SentenceFactor.sepBy(P.seq(P.optWhitespace, stag_to_c_parser('conditional'), P.optWhitespace))
    .assert((operands) => operands.length >= 2, 'Imp expects at least two operands!')
    .map((operands) => operands.reduceRight((pv, cv) => imp(cv, pv))),
  Iff: (r) => r.SentenceFactor.sepBy(P.seq(P.optWhitespace, stag_to_c_parser('biconditional'), P.optWhitespace))
    .assert((operands) => operands.length >= 2, 'Iff expects at least two operands!')
    .map((operands) => operands.reduceRight((pv, cv) => iff(cv, pv))),
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
