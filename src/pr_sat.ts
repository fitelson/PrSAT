import { Random } from "./random"
import { assert, assert_exists, fallthrough, include_exclude_set, Res } from "./utils"

type Sentence = PrSat['Sentence']
type RealExpr = PrSat['RealExpr']
type Constraint = PrSat['Constraint']

export const letter_string = (l: SentenceMap['letter']): string =>
  `${l.id}${l.index > 0 ? l.index : ''}`

export const sentence_builder = {
  val: (v: boolean): Sentence => ({ tag: 'value', value: v }),
  letter: (id: string, index?: number): SentenceMap['letter'] => ({ tag: 'letter', id, index: index ?? 0 }),
  not: (s: Sentence): Sentence => ({ tag: 'negation', sentence: s }),
  and: (left: Sentence, right: Sentence): Sentence => ({ tag: 'conjunction', left, right }),
  or: (left: Sentence, right: Sentence): Sentence => ({ tag: 'disjunction', left, right }),
  imp: (left: Sentence, right: Sentence): Sentence => ({ tag: 'conditional', left, right }),
  iff: (left: Sentence, right: Sentence): Sentence => ({ tag: 'biconditional', left, right }),
}
const { letter, val, not, and } = sentence_builder
// const { letter, value: val, negation: not, conjunction: and } = PrSatFuncs.inits.Sentence

export const real_expr_builder = {
  lit: (value: number): RealExprMap['literal'] => {
    assert(value >= 0, `RealExpr literal initialized with a negative value '${value}'!`)
    return ({ tag: 'literal', value })
  },
  vbl: (id: string): RealExprMap['variable'] => ({ tag: 'variable', id }),
  svs: (indices: number[]): RealExprMap['state_variable_sum'] => ({ tag: 'state_variable_sum', indices }),
  pr: (arg: Sentence): RealExprMap['probability'] => ({ tag: 'probability', arg }),
  cpr: (arg: Sentence, given: Sentence): RealExprMap['given_probability'] => ({ tag: 'given_probability', arg, given }),
  neg: (expr: RealExpr): RealExprMap['negative'] => ({ tag: 'negative', expr }),
  plus: (left: RealExpr, right: RealExpr): RealExprMap['plus'] => ({ tag: 'plus', left, right }),
  minus: (left: RealExpr, right: RealExpr): RealExprMap['minus'] => ({ tag: 'minus', left, right }),
  multiply: (left: RealExpr, right: RealExpr): RealExprMap['multiply'] => ({ tag: 'multiply', left, right }),
  divide: (numerator: RealExpr, denominator: RealExpr): RealExprMap['divide'] => ({ tag: 'divide', numerator, denominator }),
  power: (base: RealExpr, exponent: RealExpr): RealExprMap['power'] => ({ tag: 'power', base, exponent }),
}
const { svs, lit, minus, plus, pr } = real_expr_builder
// const { state_variable_sum: svs, literal: lit } = PrSatFuncs.inits.RealExpr

export const constraint_builder = {
  eq: (left: RealExpr, right: RealExpr): Constraint => ({ tag: 'equal', left, right }),
  neq: (left: RealExpr, right: RealExpr): Constraint => ({ tag: 'not_equal', left, right }),
  lt: (left: RealExpr, right: RealExpr): Constraint => ({ tag: 'less_than', left, right }),
  lte: (left: RealExpr, right: RealExpr): Constraint => ({ tag: 'less_than_or_equal', left, right }),
  gt: (left: RealExpr, right: RealExpr): Constraint => ({ tag: 'greater_than', left, right }),
  gte: (left: RealExpr, right: RealExpr): Constraint => ({ tag: 'greater_than_or_equal', left, right }),
  cnot: (constraint: Constraint): Constraint => ({ tag: 'negation', constraint }),
  cand: (left: Constraint, right: Constraint): Constraint => ({ tag: 'conjunction', left, right }),
  cor: (left: Constraint, right: Constraint): Constraint => ({ tag: 'disjunction', left, right }),
  cimp: (left: Constraint, right: Constraint): Constraint => ({ tag: 'conditional', left, right }),
  ciff: (left: Constraint, right: Constraint): Constraint => ({ tag: 'biconditional', left, right }),
}
const { gt, gte, eq, cnot, lte, lt } = constraint_builder

// https://stackoverflow.com/questions/9939760/how-do-i-convert-an-integer-to-binary-in-javascript
const to_bin_str = (n: number) => (n >>> 0).toString(2)

const comp_letters = (a: SentenceMap['letter'], b: SentenceMap['letter']): number => {
  const local_comp = a.id.localeCompare(b.id)
  if (local_comp === 0) {
    return a.index - b.index
  } else {
    return local_comp
  }
}

export class LetterSet {
  private readonly underlying_map = new Map<string, Set<number>>()
  private readonly all_letters: SentenceMap['letter'][] = []

  constructor(letters: SentenceMap['letter'][] = []) {
    for (const l of letters) {
      this.add(l)
    }
  }

  [Symbol.iterator]() { return this.all_letters[Symbol.iterator]() }

  has(letter: SentenceMap['letter']): boolean {
    const underlying_set = this.underlying_map.get(letter.id)
    return underlying_set?.has(letter.index) ?? false
  }

  add(l: SentenceMap['letter']): boolean {
    const underlying_set = this.underlying_map.get(l.id)
    if (underlying_set === undefined) {
      this.underlying_map.set(l.id, new Set([l.index]))
      this.all_letters.push(l)
      return true
    } else if (!underlying_set.has(l.index)) {
      underlying_set.add(l.index)
      this.all_letters.push(l)
      return true
    } else {
      return false
    }
  }

  is_empty(): boolean {
    return this.underlying_map.size <= 0
  }

  diff(other: LetterSet): LetterSet {
    const diff_arr = this.all_letters.filter((l) => !other.has(l))
    return new LetterSet(diff_arr)
  }
}

export class TruthTable {
  private readonly letter_ids: SentenceMap['letter'][]
  // private readonly state_table: { assignment: Record<string, boolean>, state: Sentence }[]
  // indices correspond to states indices.
  // values are sets -- if a letter in letter_ids appears in a state_index's set, then the state
  // has that letter set to true.
  private readonly state_table: LetterSet[]

  constructor(readonly variables: Readonly<VariableLists>) {
    this.letter_ids = [...new LetterSet(variables.sentence)].sort(comp_letters)
    this.state_table = TruthTable.enumerate_states(this.letter_ids)
  }

  private static enumerate_states(letter_ids: SentenceMap['letter'][]): LetterSet[] {
    const n_states = Math.pow(2, letter_ids.length)
    const assignments: LetterSet[] = []

    if (letter_ids.length === 0) {
      assignments.push(new LetterSet())
      return assignments
    }

    for (let state_index = 0; state_index < n_states; state_index++) {
      const bin_str = to_bin_str(state_index).padStart(letter_ids.length, '0')
      assert(bin_str.length === letter_ids.length, 'Binary string length different than number of letters in TruthTable!')
      const state_set = new LetterSet()
      for (let bi = 0; bi < bin_str.length; bi++) {
        const current_bit = assert_exists(bin_str[bin_str.length - bi - 1])
        const current_let = assert_exists(letter_ids[bin_str.length - bi - 1])
        if (current_bit === '0') {
          state_set.add(current_let)
        }
      }
      assignments.push(state_set)
    }

    return assignments
  }

  letter_value_from_index(l: SentenceMap['letter'], index: number): boolean {
    assert(0 <= index && index < this.state_table.length, 'State index out of bounds!')
    const state = this.state_table[index]
    return state.has(l)
  }

  letters(): Iterable<SentenceMap['letter']> {
    return this.letter_ids
  }

  n_letters(): number {
    return this.letter_ids.length
  }
  
  n_states(): number {
    return this.state_table.length
  }

  compute_dnf(sentence: Sentence): number[] {
    const dnf: number[] = []
    // for (const [index, { assignment }] of this.state_table.entries()) {
    for (const [index, state_set] of this.state_table.entries()) {
      const value = recursively_evaluate_sentence((id) => state_set.has(id), sentence)
      if (value) {
        dnf.push(index)
      }
    }
    return dnf
  }

  private evaluate_state(eval_letter: (id: SentenceMap['letter']) => boolean, state_index: number): boolean {
    assert(state_index >= 0)
    assert(state_index < this.state_table.length)
    const state_set = this.state_table[state_index]
    for (const id of this.letter_ids) {
      // If they don't agree on one, return false.
      if (eval_letter(id) !== state_set.has(id)) {
        return false
      }
    }
    return true
  }

  evaluate_dnf(eval_letter: (id: SentenceMap['letter']) => boolean, state_dnf: number[]): boolean {
    for (const state_index of state_dnf) {
      assert(state_index >= 0, 'Evaluating state < 0!')
      assert(state_index < this.state_table.length, 'Evaluating state >= number of states!')
      // const { state } = this.state_table[state_index]
      // const value = recursively_evaluate_sentence(assignment, state)
      const value = this.evaluate_state(eval_letter, state_index)
      if (value) {
        return true
      }
    }
    return false
  }

  state_indices(): Iterable<number> {
    return {
      [Symbol.iterator]: (): Iterator<number> => {
        let current_index = 0
        return {
          next: (): IteratorResult<number> => {
            if (current_index >= this.state_table.length) {
              return { done: true, value: -1 }
            } else {
              return { done: false, value: current_index++ }
            }
          }
        }
      }
    }
  }

  state_from_index(state_index: number): Sentence {
    assert(Number.isInteger(state_index))
    assert(state_index >= 0)

    const letters = this.letter_ids
    const upper_bound = Math.pow(2, letters.length)
    assert(state_index < upper_bound)

    if (letters.length === 0) {
      return val(true)
    } else {
      const bin_str = to_bin_str(state_index).padStart(letters.length, '0')
      assert(bin_str.length === letters.length)
      let current_sentence: Sentence | undefined = undefined
      for (let bi = 0; bi < bin_str.length; bi++) {
        const current_bit = assert_exists(bin_str[bin_str.length - bi - 1])
        const current_let = assert_exists(letters[bin_str.length - bi - 1])
        const part = assert_exists(
          current_bit === '0' ? current_let
          : current_bit === '1' ? not(current_let)
          : undefined, `current bit is neither 0 nor 1!\nactual: ${current_bit}`)
        current_sentence =
          current_sentence === undefined ? part
          : and(part, current_sentence)
      }
      return assert_exists(current_sentence)
    }
  }
}

export const recursively_evaluate_sentence = (eval_letter: (l: SentenceMap['letter']) => boolean, sentence: Sentence): boolean => {
  // const evaluate = (sentence: Sentence): boolean => recursively_evaluate_sentence(assignments, sentence)
  const evaluate = (sentence: Sentence): boolean => recursively_evaluate_sentence(eval_letter, sentence)
  if (sentence.tag === 'value') {
    return sentence.value
  } else if (sentence.tag === 'letter') {
    // const assigned = assert_exists(assignments[sentence.id], `Letter '${sentence.id}' has no assignment during evaluation!`)
    // return assigned
    return eval_letter(sentence)
  } else if (sentence.tag === 'negation') {
    const sub_value = evaluate(sentence.sentence)
    return !sub_value
  } else if (sentence.tag === 'conjunction') {
    const lv = evaluate(sentence.left)
    const rv = evaluate(sentence.right)
    return lv && rv
  } else if (sentence.tag === 'disjunction') {
    const lv = evaluate(sentence.left)
    const rv = evaluate(sentence.right)
    return lv || rv
  } else if (sentence.tag === 'conditional') {
    const lv = evaluate(sentence.left)
    const rv = evaluate(sentence.right)
    return !lv || rv
  } else if (sentence.tag === 'biconditional') {
    const lv = evaluate(sentence.left)
    const rv = evaluate(sentence.right)
    return lv === rv
  } else {
    throw new Error('evaluate_sentence fallthrough')
  }
}


export const state_from_index = (letters: string[], state_index: number): Sentence => {
  assert(Number.isInteger(state_index))
  assert(state_index >= 0)

  const upper_bound = Math.pow(2, letters.length)
  assert(state_index < upper_bound)

  if (letters.length === 0) {
    return val(true)
  } else {
    const bin_str = to_bin_str(state_index).padStart(letters.length, '0')
    assert(bin_str.length === letters.length)
    let current_sentence: Sentence | undefined = undefined
    for (let bi = 0; bi < bin_str.length; bi++) {
      const current_bit = assert_exists(bin_str[bin_str.length - bi - 1])
      const current_let = letter(assert_exists(letters[bin_str.length - bi - 1]))
      const part = assert_exists(
        current_bit === '0' ? current_let
        : current_bit === '1' ? not(current_let)
        : undefined, `current bit is neither 0 nor 1!\nactual: ${current_bit}`)
      current_sentence =
        current_sentence === undefined ? part
        : and(part, current_sentence)
    }
    return assert_exists(current_sentence)
  }
}

// const evaluate_sentence = (assignments: Record<string, boolean>, sentence: Sentence): boolean => {
export const evaluate_sentence = (eval_letter: (l: SentenceMap['letter']) => boolean, sentence: Sentence): boolean => {
  const evaluate = (sentence: Sentence): boolean => {
    type StackItem = 
      | { tag: 'start', s: Sentence }
      | { tag: 'partial', s: Sentence }
      // | { tag: 'finished', s: Sentence, value: boolean }
    const stack: StackItem[] = [{ tag: 'start', s: sentence }]
    // const args: { s: Sentence, value: boolean }[] = []
    const value_map = new Map<Sentence, boolean>()

    while (stack.length > 0) {
      const top = assert_exists(stack.pop())
      if (top.tag === 'start') {
        if (top.s.tag === 'value') {
          // stack.push({ tag: 'finished', s: top.s, value: top.s.value })
          // args.unshift({ s: top.s, value: top.s.value })
          value_map.set(top.s, top.s.value)
        } else if (top.s.tag === 'letter') {
          // stack.push({ tag: 'finished', s: top.s, value: assert_exists(assignments[top.s.id]) })
          // args.unshift({ s: top.s, value: assert_exists(assignments[top.s.id]) })
          // value_map.set(top.s, assert_exists(assignments[top.s.id]))
          value_map.set(top.s, eval_letter(top.s))
        } else if (top.s.tag === 'negation') {
          stack.push({ tag: 'partial', s: top.s })
          stack.push({ tag: 'start', s: top.s.sentence })
        } else if (top.s.tag === 'conjunction') {
          stack.push({ tag: 'partial', s: top.s })
          stack.push({ tag: 'start', s: top.s.left })
          stack.push({ tag: 'start', s: top.s.right })
        } else if (top.s.tag === 'disjunction') {
          stack.push({ tag: 'partial', s: top.s })
          stack.push({ tag: 'start', s: top.s.left })
          stack.push({ tag: 'start', s: top.s.right })
        } else if (top.s.tag === 'conditional') {
          stack.push({ tag: 'partial', s: top.s })
          stack.push({ tag: 'start', s: top.s.left })
          stack.push({ tag: 'start', s: top.s.right })
        } else if (top.s.tag === 'biconditional') {
          stack.push({ tag: 'partial', s: top.s })
          stack.push({ tag: 'start', s: top.s.left })
          stack.push({ tag: 'start', s: top.s.right })
        } else {
          throw new Error('evaluate_sentence start fallthrough')
        }
      } else if (top.tag === 'partial') {
        if (top.s.tag === 'value') {
          // do nothing!
        } else if (top.s.tag === 'letter') {
          // do nothing!
        } else if (top.s.tag === 'negation') {
          // assert(args.length >= 1, `Negation expected 1 argument, got ${args.length}!`)
          // const s = assert_exists(args.pop())
          const s = assert_exists(value_map.get(top.s.sentence))
          // assert(s.s === top.s.sentence)
          // args.push({ s: top.s, value: !s.value })
          value_map.set(top.s, !s)
        } else if (top.s.tag === 'conjunction') {
          // assert(args.length >= 2, `Conjunction expected 2 argument, got ${args.length}!`)
          // const l = assert_exists(args.pop())
          // const r = assert_exists(args.pop())
          const l = assert_exists(value_map.get(top.s.left))
          const r = assert_exists(value_map.get(top.s.right))
          // assert(l.s === top.s.left)
          // assert(r.s === top.s.right)
          // args.push({ s: top.s, value: l && r })
          value_map.set(top.s, l && r)
        } else if (top.s.tag === 'disjunction') {
          // assert(args.length >= 2, `Disjunction expected 2 argument, got ${args.length}!`)
          // const l = assert_exists(args.pop())
          // const r = assert_exists(args.pop())
          const l = assert_exists(value_map.get(top.s.left))
          const r = assert_exists(value_map.get(top.s.right))
          // assert(l.s === top.s.left)
          // assert(r.s === top.s.right)
          // args.push({ s: top.s, value: l || r })
          value_map.set(top.s, l || r)
        } else if (top.s.tag === 'conditional') {
          // assert(args.length >= 2, `Conditional expected 2 argument, got ${args.length}!`)
          // const l = assert_exists(args.pop())
          // const r = assert_exists(args.pop())
          const l = assert_exists(value_map.get(top.s.left))
          const r = assert_exists(value_map.get(top.s.right))
          // assert(l.s === top.s.left)
          // assert(r.s === top.s.right)
          // args.push({ s: top.s, value: !l || r })
          value_map.set(top.s, !l || r)
        } else if (top.s.tag === 'biconditional') {
          // assert(args.length >= 2, `Biconditional expected 2 argument, got ${args.length}!`)
          // const l = assert_exists(args.pop())
          // const r = assert_exists(args.pop())
          const l = assert_exists(value_map.get(top.s.left))
          const r = assert_exists(value_map.get(top.s.right))
          // assert(l.s === top.s.left)
          // assert(r.s === top.s.right)
          // args.push({ s: top.s, value: l === r })
          value_map.set(top.s, l === r)
        } else {
          throw new Error('evaluate_sentence partial fallthrough')
        }
      // } else if (top.tag === 'finished') {
      //   args.unshift(top.value)
      } else {
        throw new Error('evaluate_sentence StackItem fallthrough')
      }
    }
    // assert(args.length === 1, 'No final result!')
    // assert(args[0].s === sentence)
    // return args[0].value
    return assert_exists(value_map.get(sentence))
  }
  return evaluate(sentence)
}

const probability_constraints = (tt: TruthTable, eliminated_index: number | undefined, regular: boolean): Constraint[] => {
  const sis = [...tt.state_indices()].filter((si) => si !== eliminated_index)
  const zero_c = regular ? gt : gte
  const cs = sis.map((si) => zero_c(svs([si]), lit(0)))
  const eq_c = eliminated_index === undefined ? eq : regular ? lt : lte
  const sum_c = eq_c(svs(sis), lit(1))
  cs.push(sum_c)
  return cs
}

export type VariableLists = { real: string[], sentence: SentenceMap['letter'][] }

// Will modify letters array.
const letters_in_constraint = (constraint: Constraint, letters: VariableLists = { real: [], sentence: [] }): VariableLists => {
  if (constraint.tag === 'equal') {
    const ll = letters_in_real_expr(constraint.left, letters)
    return letters_in_real_expr(constraint.right, ll)
  } else if (constraint.tag === 'not_equal') {
    const ll = letters_in_real_expr(constraint.left, letters)
    return letters_in_real_expr(constraint.right, ll)
  } else if (constraint.tag === 'less_than') {
    const ll = letters_in_real_expr(constraint.left, letters)
    return letters_in_real_expr(constraint.right, ll)
  } else if (constraint.tag === 'less_than_or_equal') {
    const ll = letters_in_real_expr(constraint.left, letters)
    return letters_in_real_expr(constraint.right, ll)
  } else if (constraint.tag === 'greater_than') {
    const ll = letters_in_real_expr(constraint.left, letters)
    return letters_in_real_expr(constraint.right, ll)
  } else if (constraint.tag === 'greater_than_or_equal') {
    const ll = letters_in_real_expr(constraint.left, letters)
    return letters_in_real_expr(constraint.right, ll)
  } else if (constraint.tag === 'negation') {
    return letters_in_constraint(constraint.constraint, letters)
  } else if (constraint.tag === 'conjunction') {
    const ll = letters_in_constraint(constraint.left, letters)
    return letters_in_constraint(constraint.right, ll)
  } else if (constraint.tag === 'disjunction') {
    const ll = letters_in_constraint(constraint.left, letters)
    return letters_in_constraint(constraint.right, ll)
  } else if (constraint.tag === 'conditional') {
    const ll = letters_in_constraint(constraint.left, letters)
    return letters_in_constraint(constraint.right, ll)
  } else if (constraint.tag === 'biconditional') {
    const ll = letters_in_constraint(constraint.left, letters)
    return letters_in_constraint(constraint.right, ll)
  } else {
    throw new Error('letters_in_constraint fallthrough')
  }
}

// Will modify letters array.
const letters_in_real_expr = (expr: RealExpr, letters: VariableLists): VariableLists => {
  if (expr.tag === 'literal' || expr.tag === 'variable' || expr.tag === 'state_variable_sum') {
    return letters
  } else if (expr.tag === 'probability') {
    return { real: letters.real, sentence: letters_in_sentence(expr.arg, letters.sentence) }
  } else if (expr.tag === 'given_probability') {
    const al = letters_in_sentence(expr.arg, letters.sentence)
    return { real: letters.real, sentence: letters_in_sentence(expr.given, al) }
  } else if (expr.tag === 'power') {
    return letters_in_real_expr(expr.base, letters)
  } else if (expr.tag === 'negative') {
    return letters_in_real_expr(expr.expr, letters)
  } else if (expr.tag === 'divide') {
    const nl = letters_in_real_expr(expr.numerator, letters)
    return letters_in_real_expr(expr.denominator, nl)
  } else {
    const ll = letters_in_real_expr(expr.left, letters)
    return letters_in_real_expr(expr.right, ll)
  }
}

// Will modify letters array.
const letters_in_sentence = (sentence: Sentence, letters: SentenceMap['letter'][] = []): SentenceMap['letter'][] => {
  if (sentence.tag === 'value') {
    return letters
  } else if (sentence.tag === 'letter') {
    letters.push(sentence)
    return letters
  } else if (sentence.tag === 'negation') {
    return letters_in_sentence(sentence.sentence, letters)
  } else {
    const ll = letters_in_sentence(sentence.left, letters)
    return letters_in_sentence(sentence.right, ll)
  }
}

export const variables_in_constraints = (constraints: Constraint[]): VariableLists => {
  const variables = { real: [] as string[], sentence: [] as SentenceMap['letter'][] }
  for (const c of constraints) {
    letters_in_constraint(c, variables)
  }
  // gross!
  variables.real = [...new Set(variables.real)]
  variables.sentence = [...new Set(variables.sentence)]
  return variables
}

export const translate = (tt: TruthTable, constraints: Constraint[]): Constraint[] => {
  const translated: Constraint[] = []

  for (const c of constraints) {
    const td = translate_constraint(tt, c)
    translated.push(td)
  }

  return translated
}

type StringGens<TagKey extends string, U extends { [T in TagKey]: string }> = {
  [Tag in U[TagKey]]: () => string
}

type PossibleConnectives<TagKey extends string, U extends { [T in TagKey]: string }> = {
  [Tag in U[TagKey]]: string[]
}

export const possible_constraint_connectives: PossibleConnectives<'tag', Constraint> = {
  negation: ['~', '-', '!'],
  disjunction: ['∨', '\\/', 'v'],
  conjunction: ['&', '/\\'],
  conditional: ['→', '->', '>'],
  biconditional: ['↔', '<>', '<->'],
  equal: ['='],
  not_equal: ['≠', '!='],
  less_than: ['<'],
  less_than_or_equal: ['≤', '<='],
  greater_than: ['>'],
  greater_than_or_equal: ['≥', '>='],
}

const constraint_to_gen_string = (c: Constraint, gens: StringGens<'tag', Constraint>, re2s: (expr: RealExpr) => string) => {
  const wrap = (c: Constraint): string => {
    const sub_str = constraint_to_gen_string(c, gens, re2s)
    if (c.tag === 'negation') {
      return sub_str
    } else {
      return `(${sub_str})`
    }
  }

  if (c.tag === 'negation') {
    return `${gens['negation']()}${wrap(c.constraint)}`
  } else if (c.tag === 'conjunction') {
    return `${wrap(c.left)} ${gens['conjunction']()} ${wrap(c.right)}`
  } else if (c.tag === 'disjunction') {
    return `${wrap(c.left)} ${gens['disjunction']()} ${wrap(c.right)}`
  } else if (c.tag === 'conditional') {
    return `${wrap(c.left)} ${gens['conditional']()} ${wrap(c.right)}`
  } else if (c.tag === 'biconditional') {
    return `${wrap(c.left)} ${gens['biconditional']()} ${wrap(c.right)}`
  } else {
    const conn = gens[c.tag]()
    return `${re2s(c.left)} ${conn} ${re2s(c.right)}`
  }
}

export const constraint_to_string = (c: Constraint): string => {
  return constraint_to_gen_string(c, {
    negation: () => assert_exists(possible_constraint_connectives['negation'][0]),
    disjunction: () => assert_exists(possible_constraint_connectives['disjunction'][0]),
    conjunction: () => assert_exists(possible_constraint_connectives['conjunction'][0]),
    conditional: () => assert_exists(possible_constraint_connectives['conditional'][0]),
    biconditional: () => assert_exists(possible_constraint_connectives['biconditional'][0]),
    equal: () => assert_exists(possible_constraint_connectives['equal'][0]),
    not_equal: () => assert_exists(possible_constraint_connectives['not_equal'][0]),
    less_than: () => assert_exists(possible_constraint_connectives['less_than'][0]),
    less_than_or_equal: () => assert_exists(possible_constraint_connectives['less_than_or_equal'][0]),
    greater_than: () => assert_exists(possible_constraint_connectives['greater_than'][0]),
    greater_than_or_equal: () => assert_exists(possible_constraint_connectives['greater_than_or_equal'][0]),
  }, real_expr_to_string)
}

export const constraint_to_random_string = (random: Random, c: Constraint): string => {
  return constraint_to_gen_string(c, {
    negation: () => random.pick(possible_constraint_connectives['negation']),
    disjunction: () => random.pick(possible_constraint_connectives['disjunction']),
    conjunction: () => random.pick(possible_constraint_connectives['conjunction']),
    conditional: () => random.pick(possible_constraint_connectives['conditional']),
    biconditional: () => random.pick(possible_constraint_connectives['biconditional']),
    equal: () => random.pick(possible_constraint_connectives['equal']),
    not_equal: () => random.pick(possible_constraint_connectives['not_equal']),
    less_than: () => random.pick(possible_constraint_connectives['less_than']),
    less_than_or_equal: () => random.pick(possible_constraint_connectives['less_than_or_equal']),
    greater_than: () => random.pick(possible_constraint_connectives['greater_than']),
    greater_than_or_equal: () => random.pick(possible_constraint_connectives['greater_than_or_equal']),
  }, (e) => real_expr_to_random_string(random, e))
}

const real_expr_to_gen_string = (expr: RealExpr, s2s: (s: Sentence) => string): string => {
  const sub = (expr: RealExpr): string => real_expr_to_gen_string(expr, s2s)

  const wrap = (expr: RealExpr): string => {
    const sub_str = sub(expr)
    if (expr.tag === 'literal' || expr.tag === 'variable' || expr.tag === 'probability' || expr.tag === 'given_probability' || expr.tag === 'negative' || (expr.tag === 'state_variable_sum' && expr.indices.length <= 1)) {
      return sub_str
    } else {
      return `(${sub_str})`
    }
  }

  if (expr.tag === 'literal') {
    return expr.value.toString()
  } else if (expr.tag === 'variable') {
    return expr.id
  } else if (expr.tag === 'probability') {
    return `Pr(${s2s(expr.arg)})`
  } else if (expr.tag === 'given_probability') {
    return `Pr(${s2s(expr.arg)} | ${s2s(expr.given)})`
  } else if (expr.tag === 'power') {
    const mod_wrap_neg = (e: RealExpr): string => e.tag === 'negative' ? `(${real_expr_to_string(e)})` : wrap(e)
    return `${mod_wrap_neg(expr.base)}^${mod_wrap_neg(expr.exponent)}`
  } else if (expr.tag === 'negative') {
    // Gross but it works.
    return `-${wrap(expr.expr)}`
  } else if (expr.tag === 'state_variable_sum') {
    if (expr.indices.length === 0) {
      return '0'
    } else if (expr.indices.length === 1) {
      return `a_${expr.indices[0] + 1}`
    } else {
      return expr.indices.map((i) => `a_${i + 1}`).join(' + ')
    }
  } else if (expr.tag === 'divide') {
    return `${wrap(expr.numerator)} / ${wrap(expr.denominator)}`
  } else {
    const c =
      expr.tag === 'plus' ? '+'
      : expr.tag === 'minus' ? '-'
      : expr.tag === 'multiply' ? '*'
      : '??'
    return `${wrap(expr.left)} ${c} ${wrap(expr.right)}`
  }
}

export const real_expr_to_string = (expr: RealExpr): string => {
  return real_expr_to_gen_string(expr, sentence_to_string)
}

export const real_expr_to_random_string = (random: Random, expr: RealExpr): string => {
  return real_expr_to_gen_string(expr, (s) => sentence_to_random_string(random, s))
}

const sentence_to_gen_string = (s: Sentence, gens: StringGens<'tag', Sentence>): string => {
  const wrap = (s: Sentence): string => {
    const sub_str = sentence_to_gen_string(s, gens)
    if (s.tag === 'value' || s.tag === 'letter' || s.tag === 'negation') {
      return sub_str
    } else {
      return `(${sub_str})`
    }
  }

  if (s.tag === 'value') {
    return s.value ? '⊤' : '⊥'
  } else if (s.tag === 'letter') {
    return `${s.id}${s.index > 0 ? s.index : ''}`
  } else if (s.tag === 'negation') {
    return `${gens['negation']()}${wrap(s.sentence)}`
  } else {
    const c = gens[s.tag]()
    return `${wrap(s.left)} ${c} ${wrap(s.right)}`
  }
}

export const possible_sentence_connectives: PossibleConnectives<'tag', Sentence> = {
  value: [''],
  letter: [''],
  negation: ['~', '-', '!'],
  disjunction: ['∨', '\\/', 'v'],
  conjunction: ['&', '/\\'],
  conditional: ['→', '->', '>'],
  biconditional: ['↔', '<->', '<>'],
}

export const sentence_to_string = (s: Sentence): string => {
  return sentence_to_gen_string(s, {
    value: () => { throw new Error('Value sentence shouldn\'t have a connective!') },
    letter: () => { throw new Error('Letter sentence shouldn\'t have a connective!') },
    negation: () => assert_exists(possible_sentence_connectives['negation'][0]),
    disjunction: () => assert_exists(possible_sentence_connectives['disjunction'][0]),
    conjunction: () => assert_exists(possible_sentence_connectives['conjunction'][0]),
    conditional: () => assert_exists(possible_sentence_connectives['conditional'][0]),
    biconditional: () => assert_exists(possible_sentence_connectives['biconditional'][0]),
  })
}

export const sentence_to_random_string = (random: Random, s: Sentence): string => {
  return sentence_to_gen_string(s, {
    value: () => { throw new Error('Value sentence shouldn\'t have a connective!') },
    letter: () => { throw new Error('Letter sentence shouldn\'t have a connective!') },
    negation: () => random.pick(possible_sentence_connectives['negation']),
    disjunction: () => random.pick(possible_sentence_connectives['disjunction']),
    conjunction: () => random.pick(possible_sentence_connectives['conjunction']),
    conditional: () => random.pick(possible_sentence_connectives['conditional']),
    biconditional: () => random.pick(possible_sentence_connectives['biconditional']),
  })
}

// type S =
//   | string
//   | S[]

export const div0_conditions_in_constraint_or_real_expr = (c_or_re: ConstraintOrRealExpr): Constraint[] => {
  if (c_or_re.tag === 'constraint') {
    return div0_conditions_in_single_constraint(c_or_re.constraint)
  } else if (c_or_re.tag === 'real_expr') {
    return div0_conditions_in_real_expr(c_or_re.real_expr)
  } else {
    return fallthrough('div0_conditions_in_constraint_or_real_expr', c_or_re)
  }
}

export const div0_conditions_in_single_constraint = (c: Constraint): Constraint[] => {
  if (c.tag === 'equal') {
    return [...div0_conditions_in_real_expr(c.left), ...div0_conditions_in_real_expr(c.right)]
  } else if (c.tag === 'not_equal') {
    return [...div0_conditions_in_real_expr(c.left), ...div0_conditions_in_real_expr(c.right)]
  } else if (c.tag === 'less_than') {
    return [...div0_conditions_in_real_expr(c.left), ...div0_conditions_in_real_expr(c.right)]
  } else if (c.tag === 'less_than_or_equal') {
    return [...div0_conditions_in_real_expr(c.left), ...div0_conditions_in_real_expr(c.right)]
  } else if (c.tag === 'greater_than') {
    return [...div0_conditions_in_real_expr(c.left), ...div0_conditions_in_real_expr(c.right)]
  } else if (c.tag === 'greater_than_or_equal') {
    return [...div0_conditions_in_real_expr(c.left), ...div0_conditions_in_real_expr(c.right)]
  } else if (c.tag === 'negation') {
    return div0_conditions_in_single_constraint(c.constraint)
  } else if (c.tag === 'conjunction') {
    return [...div0_conditions_in_single_constraint(c.left), ...div0_conditions_in_single_constraint(c.right)]
  } else if (c.tag === 'disjunction') {
    return [...div0_conditions_in_single_constraint(c.left), ...div0_conditions_in_single_constraint(c.right)]
  } else if (c.tag === 'conditional') {
    return [...div0_conditions_in_single_constraint(c.left), ...div0_conditions_in_single_constraint(c.right)]
  } else if (c.tag === 'biconditional') {
    return [...div0_conditions_in_single_constraint(c.left), ...div0_conditions_in_single_constraint(c.right)]
  } else {
    throw new Error('div0_condition_in_single_constraint fallthrough')
  }
}

// TODO: Write function that just pulls out denominators, then change this family of functions so it just returns the negation of equality to zero or whatever.
export const div0_conditions_in_real_expr = (expr: RealExpr): Constraint[] => {
  if (expr.tag === 'literal') {
    return []
  } else if (expr.tag === 'variable') {
    return []
  } else if (expr.tag === 'probability') {
    return []
  } else if (expr.tag === 'given_probability') {
    // Conditional probability Pr(A|B) = Pr(A&B)/Pr(B) is undefined when Pr(B) = 0
    return [cnot(eq(pr(expr.given), lit(0)))]
  } else if (expr.tag === 'state_variable_sum') {
    return []
  } else if (expr.tag === 'negative') {
    return div0_conditions_in_real_expr(expr.expr)
  } else if (expr.tag === 'power') { 
    return div0_conditions_in_real_expr(expr.base)
  } else if (expr.tag === 'plus') {
    return [...div0_conditions_in_real_expr(expr.left), ...div0_conditions_in_real_expr(expr.right)]
  } else if (expr.tag === 'minus') {
    return [...div0_conditions_in_real_expr(expr.left), ...div0_conditions_in_real_expr(expr.right)]
  } else if (expr.tag === 'multiply') {
    return [...div0_conditions_in_real_expr(expr.left), ...div0_conditions_in_real_expr(expr.right)]
  } else if (expr.tag === 'divide') {
    return [
      ...(expr.denominator.tag !== 'literal' || expr.denominator.value === 0 ? [cnot(eq(expr.denominator, lit(0)))] : []),
      ...div0_conditions_in_real_expr(expr.numerator),
      ...div0_conditions_in_real_expr(expr.denominator),
    ]
  } else {
    throw new Error('div0_condition_in_real_expr fallthrough')
  }
}

const find_div0_conditions_in_constraints = (constraints: Constraint[]): Constraint[] => {
  const cs: Constraint[] = []
  for (const c of constraints) {
    const div0_conditions = div0_conditions_in_single_constraint(c)
    cs.push(...div0_conditions)
  }
  return cs
}

export const combine_inverse = (svs1: RealExprMap['state_variable_sum'], svs2: RealExprMap['state_variable_sum']): RealExpr => {
  // Computes svs1 + (1 - svs2)
  // which equals 1 + sum(svs1 diff svs2) - sum(svs2 diff svs1)
  const in_svs1 = new Set(svs1.indices)
  const in_svs2 = new Set(svs2.indices)

  assert(in_svs1.size === svs1.indices.length, 'Some index in svs1 appears more than once!')
  assert(in_svs2.size === svs2.indices.length, 'Some index in svs2 appears more than once!')

  const svs1_diff_svs2 = svs1.indices.filter((svs1i) => !in_svs2.has(svs1i))
  const svs2_diff_svs1 = svs2.indices.filter((svs2i) => !in_svs1.has(svs2i))

  if (svs1_diff_svs2.length === 0 && svs2_diff_svs1.length === 0) {
    return lit(1)
  } else if (svs2_diff_svs1.length === 0) {
    return plus(lit(1), svs(svs1_diff_svs2))
  } else if (svs1_diff_svs2) {
    return minus(lit(1), svs(svs2_diff_svs1))
  } else {
    return plus(lit(1), minus(svs(svs1_diff_svs2), svs(svs2_diff_svs1)))
  }
}

export const eliminate_state_variable_index_in_svs = (index: number, inverted_redef: RealExprMap['state_variable_sum'], subject_svs: RealExprMap['state_variable_sum']): RealExpr => {
  const subject_wo_index = subject_svs.indices.filter((svsi) => svsi !== index)
  const index_in_subject = subject_wo_index.length !== subject_svs.indices.length  // If it was removed, it was originally in it.

  const result = index_in_subject
    ? combine_inverse(svs(subject_wo_index), inverted_redef)
    : subject_svs
  
  return result
}

const eliminate_state_variable_index_in_real_expr = (index: number, inverted_redef: RealExprMap['state_variable_sum'], e: RealExpr): RealExpr => {
  const sub = (e: RealExpr): RealExpr => eliminate_state_variable_index_in_real_expr(index, inverted_redef, e)
  if (e.tag === 'divide') {
    return { tag: 'divide', numerator: sub(e.numerator), denominator: sub(e.denominator) }
  } else if (e.tag === 'given_probability') {
    return e
  } else if (e.tag === 'literal') {
    return e
  } else if (e.tag === 'minus') {
    return { tag: 'minus', left: sub(e.left), right: sub(e.right) }
  } else if (e.tag === 'multiply') {
    return { tag: 'multiply', left: sub(e.left), right: sub(e.right) }
  } else if (e.tag === 'negative') {
    return { tag: 'negative', expr: sub(e.expr) }
  } else if (e.tag === 'plus') {
    return { tag: 'plus', left: sub(e.left), right: sub(e.right) }
  } else if (e.tag === 'power') {
    return { tag: 'power', base: sub(e.base), exponent: sub(e.exponent) }
  } else if (e.tag === 'probability') {
    return e
  } else if (e.tag === 'state_variable_sum') {
    return eliminate_state_variable_index_in_svs(index, inverted_redef, e)
  } else if (e.tag === 'variable') {
    return e
  } else {
    const check: Equiv<typeof e, never> = true
    void check
    throw new Error('eliminate_state_variable_index_in_real_expr fallthrough')
  }
}

const eliminate_state_variable_index_in_constraint = (index: number, inverted_redef: RealExprMap['state_variable_sum'], c: Constraint): Constraint => {
  const sub = (c: Constraint): Constraint => eliminate_state_variable_index_in_constraint(index, inverted_redef, c)
  const re = (e: RealExpr): RealExpr => eliminate_state_variable_index_in_real_expr(index, inverted_redef, e)
  if (c.tag === 'biconditional') {
    return { tag: 'biconditional', left: sub(c.left), right: sub(c.right) }
  } else if (c.tag === 'conditional') {
    return { tag: 'conditional', left: sub(c.left), right: sub(c.right) }
  } else if (c.tag === 'conjunction') {
    return { tag: 'conjunction', left: sub(c.left), right: sub(c.right) }
  } else if (c.tag === 'disjunction') {
    return { tag: 'disjunction', left: sub(c.left), right: sub(c.right) }
  } else if (c.tag === 'equal') {
    return { tag: 'equal', left: re(c.left), right: re(c.right) }
  } else if (c.tag === 'greater_than') {
    return { tag: 'greater_than', left: re(c.left), right: re(c.right) }
  } else if (c.tag === 'greater_than_or_equal') {
    return { tag: 'greater_than_or_equal', left: re(c.left), right: re(c.right) }
  } else if (c.tag === 'less_than') {
    return { tag: 'less_than', left: re(c.left), right: re(c.right) }
  } else if (c.tag === 'less_than_or_equal') {
    return { tag: 'less_than_or_equal', left: re(c.left), right: re(c.right) }
  } else if (c.tag === 'negation') {
    return { tag: 'negation', constraint: sub(c.constraint) }
  } else if (c.tag === 'not_equal') {
    return { tag: 'not_equal', left: re(c.left), right: re(c.right) }
  } else {
    return fallthrough('eliminate_state_variable_index_in_constraint fallthrough', c)
  }
}

export const compute_inverted_redef = (n_states: number, index_to_eliminate: number): RealExprMap['state_variable_sum'] => {
  return svs(Array(n_states).fill(0).map((_, i) => i).filter((e) => e !== index_to_eliminate))
}

// Returns [redef, new constraints]
export const eliminate_state_variable_index = (n_states: number, index: number, constraints: Constraint[]): [RealExpr, Constraint[]] => {
  // a_1, ..., a_i, ..., a_n --> a_1, ..., a_n
  const inverted_redef = compute_inverted_redef(n_states, index)
  const new_constraints = constraints.map((c) => eliminate_state_variable_index_in_constraint(index, inverted_redef, c))
  const redef = minus(lit(1), inverted_redef)
  const final_constraints = [
    ...new_constraints,
    // eq(svs([index]), redef),
  ]
  return [redef, final_constraints]
}

export const eliminate_state_variable_index_in_constraint_or_real_expr = (n_states: number, index: number, c_or_re: ConstraintOrRealExpr): [RealExpr, ConstraintOrRealExpr] => {
  const inverted_redef = compute_inverted_redef(n_states, index)
  const redef = minus(lit(1), inverted_redef)
  if (c_or_re.tag === 'constraint') {
    return [redef, { tag: 'constraint', constraint: eliminate_state_variable_index_in_constraint(index, inverted_redef, c_or_re.constraint) }]
  } else if (c_or_re.tag === 'real_expr') {
    return [redef, { tag: 'real_expr', real_expr: eliminate_state_variable_index_in_real_expr(index, inverted_redef, c_or_re.real_expr) }]
  } else {
    return fallthrough('eliminate_state_variable_index_in_constraint_or_real_expr', c_or_re)
  }
}

// Adds probability and division by zero constraints.

export const enrich_constraints = (tt: TruthTable, index_to_eliminate: number | undefined, regular: boolean, constraints: Constraint[]): Constraint[] => {
  return [
    ...probability_constraints(tt, index_to_eliminate, regular),
    ...find_div0_conditions_in_constraints(constraints),
    ...constraints,
  ]
}

const translate_constraints_to_smtlib = (tt: TruthTable, index_to_eliminate: number, constraints: Constraint[]): S[] => {
  const smtlib_lines: S[] = []
  smtlib_lines.push(['set-logic', 'QF_NRA'])

  for (const rv of tt.variables.real.entries()) {
    const declaration = ['declare-const', rv, 'Real']
    smtlib_lines.push(declaration)
  }

  for (const state_index of tt.state_indices()) {
    if (state_index === index_to_eliminate) {
      continue
    }
    const declaration = ['declare-const', state_index_id(state_index), 'Real']
    smtlib_lines.push(declaration)
  }

  for (const c of constraints) {
    const as_smtlib = constraint_to_smtlib(c)
    const assertion = ['assert', as_smtlib]
    smtlib_lines.push(assertion)
  }

  // smtlib_lines.push(['check-sat'])
  // smtlib_lines.push(['get-model'])

  return smtlib_lines
}

/*
(declare-const s_0 Real)
(declare-const s_1 Real)
(declare-const s_2 Real)
(declare-const s_3 Real)
(assert (>= s_0 0))
(assert (>= s_1 0))
(assert (>= s_2 0))
(assert (>= s_3 0))
(assert (= (+ s_0 s_1 s_2 s_3) 1))
(assert (< 1 (/ 1 2)))
(assert (> (/ s_0 1) (/ 1 2)))
(assert (> (/ s_0 1) (/ 1 2)))
(assert (not (< (/ s_1 1) 1)))
(check-sat)
(get-model)

(declare-const s_0 Real)
(declare-const s_1 Real)
(declare-const s_2 Real)
(declare-const s_3 Real)
(assert (>= s_0 0))
(assert (>= s_1 0))
(assert (>= s_2 0))
(assert (>= s_3 0))
(assert (= (+ s_0 s_1 s_2 s_3) 1))
(assert (not (= (+ s_0 s_2) 0)))
(assert (not (= (+ s_0 s_1) 0)))
(assert (not (= (+ s_1 s_3) 0)))
(assert (< (+ s_0 s_1) (/ 1 2)))
(assert (> (/ s_0 (+ s_0 s_2)) (/ 1 2)))
(assert (> (/ s_0 (+ s_0 s_1)) (/ 1 2)))
(assert (not (< (/ s_1 (+ s_1 s_3)) (+ s_0 s_2))))
(check-sat)
(get-model)
*/

// const s_to_string = (s: S): string => {
//   if (typeof s === 'string') {
//     return s
//   } else {
//     return `(${s.map(s_to_string).join(' ')})`
//   }
// }

import P from 'parsimmon'
import { ConstraintOrRealExpr, PrSat, RealExprMap, SentenceMap } from "./types"
import { Equiv } from "./tag_map"
import { S } from "./s"

const s_lang = P.createLanguage({
  s: (r) => P.alt(r.list, r.atom),
  atom: () => P.regexp(/[^\s()]+/),
  list: (r) => P.alt(
    P.seq(P.string('('), P.optWhitespace, P.string(')'))
      .map(() => []),
    P.seq(P.string('('), P.optWhitespace, P.sepBy(r.s, r.white), P.optWhitespace, P.string(')'))
      .map(([_l, _w1, middle, _w2, _r]) => middle),
  ),
  white: () => P.whitespace,
})

// INCOMPLETE BUT IT'S FINE FOR NOW!
export const parse_s = (str: string): S => {
  // if (str.length === 0) {
  //   throw new Error('S-expression string is empty!')
  // } else if (str[0] !== '(' && str[str.length - 1] !== ')') {
  //   if (str.includes(' ')) {
  //     throw new Error('S-expression string includes spaces but isn\'t a list!')
  //   } else {
  //     return str
  //   }
  // } else {
  //   const contents = str.substring(1, str.length - 1)
  //   const split_contents = contents.split(' ')
  //   const parsed_contents = split_contents.map(parse_s)
  //   return parsed_contents
  // }
  return s_lang.s.tryParse(str)
}

export const constraints_to_smtlib_lines = (tt: TruthTable, index_to_eliminate: number, constraints: Constraint[]): S[] => {
  const smtlib_lines = translate_constraints_to_smtlib(tt, index_to_eliminate, constraints)
  return smtlib_lines
}

export const translate_constraint_or_real_expr = (tt: TruthTable, c_or_re: ConstraintOrRealExpr): ConstraintOrRealExpr => {
  if (c_or_re.tag === 'constraint') {
    return { tag: 'constraint', constraint: translate_constraint(tt, c_or_re.constraint) }
  } else if (c_or_re.tag === 'real_expr') {
    return { tag: 'real_expr', real_expr: translate_real_expr(tt, c_or_re.real_expr) }
  } else {
    return fallthrough('translate_constraint_or_real_expr', c_or_re)
  }
}

export const translate_constraint = (tt: TruthTable, constraint: Constraint): Constraint => {
  if (constraint.tag === 'equal') {
    const tl = translate_real_expr(tt, constraint.left)
    const tr = translate_real_expr(tt, constraint.right)
    return { tag: 'equal', left: tl, right: tr }
  } else if (constraint.tag === 'not_equal') {
    const tl = translate_real_expr(tt, constraint.left)
    const tr = translate_real_expr(tt, constraint.right)
    return { tag: 'not_equal', left: tl, right: tr }
  } else if (constraint.tag === 'less_than') {
    const tl = translate_real_expr(tt, constraint.left)
    const tr = translate_real_expr(tt, constraint.right)
    return { tag: 'less_than', left: tl, right: tr }
  } else if (constraint.tag === 'less_than_or_equal') {
    const tl = translate_real_expr(tt, constraint.left)
    const tr = translate_real_expr(tt, constraint.right)
    return { tag: 'less_than_or_equal', left: tl, right: tr }
  } else if (constraint.tag === 'greater_than') {
    const tl = translate_real_expr(tt, constraint.left)
    const tr = translate_real_expr(tt, constraint.right)
    return { tag: 'greater_than', left: tl, right: tr }
  } else if (constraint.tag === 'greater_than_or_equal') {
    const tl = translate_real_expr(tt, constraint.left)
    const tr = translate_real_expr(tt, constraint.right)
    return { tag: 'greater_than_or_equal', left: tl, right: tr }
  } else if (constraint.tag === 'negation') {
    const tc = translate_constraint(tt, constraint.constraint)
    return { tag: 'negation', constraint: tc }
  } else if (constraint.tag === 'conjunction') {
    const tl = translate_constraint(tt, constraint.left)
    const tr = translate_constraint(tt, constraint.right)
    return { tag: 'conjunction', left: tl, right: tr }
  } else if (constraint.tag === 'disjunction') {
    const tl = translate_constraint(tt, constraint.left)
    const tr = translate_constraint(tt, constraint.right)
    return { tag: 'disjunction', left: tl, right: tr }
  } else if (constraint.tag === 'conditional')  {
    const tl = translate_constraint(tt, constraint.left)
    const tr = translate_constraint(tt, constraint.right)
    return { tag: 'conditional', left: tl, right: tr }
  } else if (constraint.tag === 'biconditional') {
    const tl = translate_constraint(tt, constraint.left)
    const tr = translate_constraint(tt, constraint.right)
    return { tag: 'biconditional', left: tl, right: tr }
  } else {
    throw new Error('translate_constraint fallthrough')
  }
}

// describe('translate_constraint', () => {
// })

// const sentence_to_dnf = (letter_ids: string[], state_vars: { tag: 'variable', index: number }[], sentence: Sentence): Sentence => {
//   const state_dnf = compute_state_dnf(letter_ids, state_vars, sentence)
//   return state_dnf_to_sentence(letter_ids, state_vars, state_dnf)
// }

const translate_dnf_to_real_expr = (tt: TruthTable, dnf: number[]): RealExpr => {
  // if (dnf.length === 0) {
  //   return lit(0)
  // } else if (dnf.length === tt.n_letters()) {
  //   return lit(1)
  // }
  // } else {
  //   return { tag: 'state_variable_sum', indices: dnf }
  // }
  // if (dnf.length === 0) {
  //   return lit(0)
  // }
  if (dnf.length === tt.n_states()) {
    return lit(1)
  }
  return { tag: 'state_variable_sum', indices: dnf }
}

export const translate_real_expr = (tt: TruthTable, expr: RealExpr): RealExpr => {
  if (expr.tag === 'literal') {
    return expr
  } else if (expr.tag === 'variable') {
    return expr
  } else if (expr.tag === 'negative') {
    const te = translate_real_expr(tt, expr.expr)
    return { tag: 'negative', expr: te }
  } else if (expr.tag === 'probability') {
    const arg_dnf = tt.compute_dnf(expr.arg)
    return translate_dnf_to_real_expr(tt, arg_dnf)
  } else if (expr.tag === 'given_probability') {
    const num_dnf = tt.compute_dnf({ tag: 'conjunction', left: expr.arg, right: expr.given })
    const den_dnf = tt.compute_dnf(expr.given)
    return {
      tag: 'divide',
      numerator: translate_dnf_to_real_expr(tt, num_dnf),
      denominator: translate_dnf_to_real_expr(tt, den_dnf),
    }
  } else if (expr.tag === 'plus') {
    const tl = translate_real_expr(tt, expr.left)
    const tr = translate_real_expr(tt, expr.right)
    return { tag: 'plus', left: tl, right: tr }
  } else if (expr.tag === 'minus') {
    const tl = translate_real_expr(tt, expr.left)
    const tr = translate_real_expr(tt, expr.right)
    return { tag: 'minus', left: tl, right: tr }
  } else if (expr.tag === 'multiply') {
    const tl = translate_real_expr(tt, expr.left)
    const tr = translate_real_expr(tt, expr.right)
    return { tag: 'multiply', left: tl, right: tr }
  } else if (expr.tag === 'divide') {
    const tn = translate_real_expr(tt, expr.numerator)
    const td = translate_real_expr(tt, expr.denominator)
    return { tag: 'divide', numerator: tn, denominator: td }
  } else if (expr.tag === 'power') {
    const tb = translate_real_expr(tt, expr.base)
    const te = translate_real_expr(tt, expr.exponent)
    return { tag: 'power', base: tb, exponent: te }
  } else if (expr.tag === 'state_variable_sum') {
    return expr
  } else {
    const check: Equiv<typeof expr, never> = true
    void check
    throw new Error(`translate_real_expr fallthrough: ${JSON.stringify(expr)}`)
  }
}

const flatten_constraint_children = (tag: 'conjunction' | 'disjunction' | 'conditional', constraint: Constraint, acc: S[] = []): S[] => {
  if (constraint.tag === tag) {
    const lc = flatten_constraint_children(tag, constraint.left, acc)
    return flatten_constraint_children(tag, constraint.right, lc)
  } else {
    acc.push(constraint_to_smtlib(constraint))
    return acc
  }
}

export const constraint_to_smtlib = (constraint: Constraint): S => {
  // :funs ( (true Bool)  (false Bool)  (not Bool Bool)
  // (=> Bool Bool Bool :right-assoc)  (and Bool Bool Bool :left-assoc)
  // (or Bool Bool Bool :left-assoc)  (xor Bool Bool Bool :left-assoc)
  // (par (A) (= A A Bool :chainable))
  // (par (A) (distinct A A Bool :pairwise))
  // (par (A) (ite Bool A A A)) )

  // :funs ((NUMERAL Real) 
  // (DECIMAL Real) 
  // (- Real Real)                  ; negation
  // (- Real Real Real :left-assoc) ; subtraction
  // (+ Real Real Real :left-assoc) 
  // (* Real Real Real :left-assoc)
  // (/ Real Real Real :left-assoc)
  // (<= Real Real Bool :chainable)
  // (<  Real Real Bool :chainable)
  // (>= Real Real Bool :chainable)
  // (>  Real Real Bool :chainable)
  // )

  if (constraint.tag === 'negation') {
    return ['not', constraint_to_smtlib(constraint.constraint)]
  } else if (constraint.tag === 'conjunction') {
    return ['and', ...flatten_constraint_children(constraint.tag, constraint.left), ...flatten_constraint_children(constraint.tag, constraint.right)]
  } else if (constraint.tag === 'disjunction') {
    return ['or', ...flatten_constraint_children(constraint.tag, constraint.left), ...flatten_constraint_children(constraint.tag, constraint.right)]
  } else if (constraint.tag === 'conditional') {
    return ['=>', constraint_to_smtlib(constraint.left), ...flatten_constraint_children(constraint.tag, constraint.right)]
  } else if (constraint.tag === 'biconditional') {
    return ['=', constraint_to_smtlib(constraint.left), constraint_to_smtlib(constraint.right)]
  } else if (constraint.tag === 'equal') {
    return ['=', real_expr_to_smtlib(constraint.left), real_expr_to_smtlib(constraint.right)]
  } else if (constraint.tag === 'not_equal') {
    return ['not', ['=', real_expr_to_smtlib(constraint.left), real_expr_to_smtlib(constraint.right)]]
  } else if (constraint.tag === 'less_than') {
    return ['<', real_expr_to_smtlib(constraint.left), real_expr_to_smtlib(constraint.right)]
  } else if (constraint.tag === 'less_than_or_equal') {
    return ['<=', real_expr_to_smtlib(constraint.left), real_expr_to_smtlib(constraint.right)]
  } else if (constraint.tag === 'greater_than') {
    return ['>', real_expr_to_smtlib(constraint.left), real_expr_to_smtlib(constraint.right)]
  } else if (constraint.tag === 'greater_than_or_equal') {
    return ['>=', real_expr_to_smtlib(constraint.left), real_expr_to_smtlib(constraint.right)]
  } else {
    throw new Error('constraint_to_smtlib fallthrough')
  }
}

export const state_index_id = (state_index: number): string => {
  return `a_${state_index + 1}`
}

export const real_expr_to_smtlib = (expr: RealExpr): S => {
  const flatten_children = (tag: 'plus' | 'multiply' | 'minus' | 'divide', constraint: RealExpr, acc: S[] = []): S[] => {
    if (constraint.tag === tag) {
      if (constraint.tag === 'divide') {
        const lc = flatten_children(tag, constraint.numerator, acc)
        return flatten_children(tag, constraint.denominator, lc)
      } else {
        const lc = flatten_children(tag, constraint.left, acc)
        return flatten_children(tag, constraint.right, lc)
      }
    } else {
      acc.push(real_expr_to_smtlib(constraint))
      return acc
    }
  }

  if (expr.tag === 'literal') {
    return expr.value.toString()
  } else if (expr.tag === 'variable') {
    return expr.id
  } else if (expr.tag === 'negative') {
    return ['-', real_expr_to_smtlib(expr.expr)]
  } else if (expr.tag === 'probability' || expr.tag === 'given_probability') {
    // I should probably use a result type for this but I don't want to 😭.
    throw new Error('Unable to convert a probability or a given_probability to an SMTLIB S-expression!  Did you forget to call translate_*?')
  } else if (expr.tag === 'power') {
    // throw new Error('Unable to convert a power to an SMTLIB S-expression!  Did you forget to call translate_*?')
    return ['^', real_expr_to_smtlib(expr.base), real_expr_to_smtlib(expr.exponent)]
  } else if (expr.tag === 'state_variable_sum') {
    if (expr.indices.length === 0) {
      return '0'
    } else if (expr.indices.length === 1) {
      return state_index_id(expr.indices[0])
    } else {
      return ['+', ...expr.indices.map((si) => state_index_id(si))]
    }
  } else if (expr.tag === 'plus') {
    return ['+', ...flatten_children(expr.tag, expr.left), ...flatten_children(expr.tag, expr.right)]
  } else if (expr.tag === 'minus') {
    return ['-', ...flatten_children(expr.tag, expr.left), real_expr_to_smtlib(expr.right)]
  } else if (expr.tag === 'multiply') {
    return ['*', ...flatten_children(expr.tag, expr.left), ...flatten_children(expr.tag, expr.right)]
  } else if (expr.tag === 'divide') {
    return ['/', ...flatten_children(expr.tag, expr.numerator), real_expr_to_smtlib(expr.denominator)]
    // return ['div', ...flatten_children(expr.tag, expr.numerator), real_expr_to_smtlib(expr.denominator)]
  } else {
    throw new Error('real_expr_to_smtlib fallthrough')
  }
}

// Universe is [0, 1, 2, 3, 4]
// I = whitelist (include)
// E = blacklist (exclude)

// (include undefined), (exclude undefined) ==> [0, 1, 2, 3, 4]
// (include undefined), (exclude [1, 3])    ==> [0, 2, 4]
// (include [1, 3]),    (exclude undefined) ==> [1, 3]
// (include [1, 3]),    (exclude [1, 4])    ==> [3]

// If I undefined, E undefined ==> Universe
// If I undefined, E defined   ==> U - E
// If I defined,   E undefined ==> Universe ∩ I
// If I defined,   E defined   ==> (U ∩ I) - E

const make_generator = <T>(
  fs: Record<string, { arity: number, construct: (args: T[]) => T }>,
  include?: string[],
  exclude?: string[],
): ((random: Random, depth: number) => T) => {
  const U = Object.keys(fs)
  const R = include_exclude_set(U, include, exclude)

  const terminals = Object.entries(fs)
    .filter(([_, { arity }]) => arity === 0)
    .map(([key]) => key)
    .filter((key) => R.has(key))
  const functions = Object.entries(fs)
    .filter(([_, { arity }]) => arity > 0)
    .map(([key]) => key)
    .filter((key) => R.has(key))

  if (terminals.length === 0) {
    throw new Error(`No accessible terminals in generator!\nU: ${JSON.stringify(U)}`)
  }

  const gen = (random: Random, d: number): T => {
    assert(d >= 0, 'Trying to generate a sentence with depth < 0!')
    if (d === 0) {
      const terminal_type = random.pick(terminals)
      const { construct } = assert_exists(fs[terminal_type])
      return construct([])
    } else {
      const function_type = random.pick(functions) as Sentence['tag']
      const { arity, construct } = assert_exists(fs[function_type], 'Generated unrecognized sentence function type!')
      assert(arity >= 1, 'Generating sentence function with arity <= 1~')
      const deepest_child_index = random.integer({ lower: 0, upper: arity - 1 })

      const children: T[] = []
      for (let ci = 0; ci < arity; ci++) {
        if (ci === deepest_child_index) {
          const child = gen(random, d - 1)
          children.push(child)
        } else {
          const child_depth = random.integer({ lower: 0, upper: d - 1 })
          const child = gen(random, child_depth)
          children.push(child)
        }
      }

      return construct(children)
    }
  }

  return gen
}

// Only works for letters with index = 0.
export const a2eid = (assignment: Record<string, boolean>) => (l: SentenceMap['letter']): boolean => {
  return assert_exists(assignment[l.id])
}

// Letter ids must have a size equal to 1, so I should allow this function to generate a number
// of letters greater than the size of the alphabet for this, but I don't want to right now.
export const random_letters_and_assignments = (random: Random, n_letters: number): [SentenceMap['letter'][], (letter: SentenceMap['letter']) => boolean] => {
  assert(n_letters > 0, 'n_letters is <= 0!')
  const letter_options = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  assert(n_letters <= letter_options.length, 'n_letters is more than the possible letters!')
  const letters: SentenceMap['letter'][] = letter_options.slice(0, n_letters).split('').map((id) => letter(id, 0))

  const assignment: Record<string, boolean> = {}
  for (const l of letters) {
    assignment[l.id] = random.boolean()
  }

  return [letters, a2eid(assignment)]
}

export class SentenceFuzzer {
  constructor(
    readonly random: Random,
    readonly max_depth: number = 20,
  ) {}

  generate(letters: SentenceMap['letter'][], depth: number = this.max_depth): Sentence {
    assert(letters.length > 0, 'Unable to generate sentence without at least one letter to choose from!')
    assert(depth >= 0, 'Trying to generate a sentence with depth < 0!')
    const ae = assert_exists

    const fs: Record<Sentence['tag'], { arity: number, construct: (args: Sentence[]) => Sentence }> = {
      value: { arity: 0, construct: () => ({ tag: 'value', value: this.random.boolean() }) },
      letter: { arity: 0, construct: () => this.random.pick(letters) },
      negation: { arity: 1, construct: ([s]) => ({ tag: 'negation', sentence: ae(s) }) },
      disjunction: { arity: 2, construct: ([l, r]) => ({ tag: 'disjunction', left: ae(l), right: ae(r) }) },
      conjunction: { arity: 2, construct: ([l, r]) => ({ tag: 'conjunction', left: ae(l), right: ae(r) }) },
      conditional: { arity: 2, construct: ([l, r]) => ({ tag: 'conditional', left: ae(l), right: ae(r) }) },
      biconditional: { arity: 2, construct: ([l, r]) => ({ tag: 'biconditional', left: ae(l), right: ae(r) }) },
    }

    const gen = make_generator(fs)
    return gen(this.random, depth)
  }
}

export class RealExprFuzzer {
  readonly sentence: SentenceFuzzer

  constructor(
    readonly random: Random,
    sentence?: SentenceFuzzer,
    readonly max_depth: number = 20,
    private readonly include?: string[],
    private readonly exclude?: RealExpr['tag'][],
  ) {
    this.sentence = sentence ?? new SentenceFuzzer(this.random, this.max_depth)
  }

  generate(letters: SentenceMap['letter'][], depth: number = this.max_depth): RealExpr {
    assert(depth >= 0, 'Trying to generate a sentence with depth < 0!')
    const ae = assert_exists
    const sg = (depth: number) => this.sentence.generate(letters, depth)

    const fs: Record<RealExpr['tag'], { arity: number, construct: (args: RealExpr[]) => RealExpr }> = {
      variable: { arity: 0, construct: () => ({ tag: 'variable', id: this.random.string({ bounds: { lower: 1, upper: 3 }, characters: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' }) }) },
      state_variable_sum: { arity: 0, construct: () => ({ tag: 'state_variable_sum', indices: [] }) },
      literal: { arity: 0, construct: () => ({ tag: 'literal', value: this.random.float({ lower: 0, upper: 100 }) }) },
      probability: { arity: 0, construct: () => ({ tag: 'probability', arg: sg(5) }) },
      given_probability: { arity: 0, construct: () => ({ tag: 'given_probability', arg: sg(5), given: sg(5) }) },
      negative: { arity: 1, construct: ([e]) => ({ tag: 'negative', expr: ae(e) }) },
      plus: { arity: 2, construct: ([left, right]) => ({ tag: 'plus', left: ae(left), right: ae(right) }) },
      minus: { arity: 2, construct: ([left, right]) => ({ tag: 'minus', left: ae(left), right: ae(right) }) },
      multiply: { arity: 2, construct: ([left, right]) => ({ tag: 'multiply', left: ae(left), right: ae(right) }) },
      divide: { arity: 2, construct: ([n, d]) => ({ tag: 'divide', numerator: ae(n), denominator: ae(d) }) },
      power: { arity: 1, construct: ([b]) => ({ tag: 'power', base: ae(b), exponent: lit(this.random.integer({ lower: 0, upper: 4 })) }) },
      // root: { arity: 1, construct: ([r]) => ({ tag: 'root', radicand: ae(r), root: this.random.integer() }) },
    }

    const gen = make_generator(fs, this.include, this.exclude)
    return gen(this.random, depth)
  }
}

export class ConstraintFuzzer {
  readonly sentence: SentenceFuzzer
  readonly real_expr: RealExprFuzzer

  constructor(
    readonly random: Random,
    sentence?: SentenceFuzzer,
    real_expr?: RealExprFuzzer,
    readonly max_depth: number = 20,
  ) {
    this.sentence = sentence ?? new SentenceFuzzer(this.random, this.max_depth)
    this.real_expr = real_expr ?? new RealExprFuzzer(this.random, this.sentence, this.max_depth)
  }

  generate(letters: SentenceMap['letter'][], depth: number = this.max_depth): Constraint {
    assert(depth >= 0, 'Trying to generate a sentence with depth < 0!')
    const ae = assert_exists
    const eg = (depth: number) => this.real_expr.generate(letters, depth)

    const fs: Record<Constraint['tag'], { arity: number, construct: (args: Constraint[]) => Constraint }> = {
      equal: { arity: 0, construct: () => ({ tag: 'equal', left: eg(5), right: eg(5) }) },
      not_equal: { arity: 0, construct: () => ({ tag: 'not_equal', left: eg(5), right: eg(5) }) },
      less_than: { arity: 0, construct: () => ({ tag: 'less_than', left: eg(5), right: eg(5) }) },
      less_than_or_equal: { arity: 0, construct: () => ({ tag: 'less_than_or_equal', left: eg(5), right: eg(5) }) },
      greater_than: { arity: 0, construct: () => ({ tag: 'greater_than', left: eg(5), right: eg(5) }) },
      greater_than_or_equal: { arity: 0, construct: () => ({ tag: 'greater_than_or_equal', left: eg(5), right: eg(5) }) },
      negation: { arity: 1, construct: ([c]) => ({ tag: 'negation', constraint: ae(c) }) },
      disjunction: { arity: 2, construct: ([l, r]) => ({ tag: 'disjunction', left: ae(l), right: ae(r) }) },
      conjunction: { arity: 2, construct: ([l, r]) => ({ tag: 'conjunction', left: ae(l), right: ae(r) }) },
      conditional: { arity: 2, construct: ([l, r]) => ({ tag: 'conditional', left: ae(l), right: ae(r) }) },
      biconditional: { arity: 2, construct: ([l, r]) => ({ tag: 'biconditional', left: ae(l), right: ae(r) }) },
    }

    const gen = make_generator(fs)
    return gen(this.random, depth)
  }
}

const tolerance = 0.00000000000001

// state_values: Record<StateIndex, Value>
export const evaluate_constraint = (tt: TruthTable, state_values: Record<number, number>, constraint: Constraint): boolean => {
  if (constraint.tag === 'equal') {
    // return evaluate_real_expr(state_value_array, constraint.left) === evaluate_real_expr(state_value_array, constraint.right)
    return Math.abs(evaluate_real_expr(tt, state_values, constraint.left) - evaluate_real_expr(tt, state_values, constraint.right)) <= tolerance
  } else if (constraint.tag === 'not_equal') {
    // return evaluate_real_expr(state_value_array, constraint.left) !== evaluate_real_expr(state_value_array, constraint.right)
    return Math.abs(evaluate_real_expr(tt, state_values, constraint.left) - evaluate_real_expr(tt, state_values, constraint.right)) > tolerance
  } else if (constraint.tag === 'less_than') {
    return evaluate_real_expr(tt, state_values, constraint.left) < evaluate_real_expr(tt, state_values, constraint.right)
  } else if (constraint.tag === 'less_than_or_equal') {
    return evaluate_real_expr(tt, state_values, constraint.left) <= evaluate_real_expr(tt, state_values, constraint.right)
  } else if (constraint.tag === 'greater_than') {
    return evaluate_real_expr(tt, state_values, constraint.left) > evaluate_real_expr(tt, state_values, constraint.right)
  } else if (constraint.tag === 'greater_than_or_equal') {
    return evaluate_real_expr(tt, state_values, constraint.left) >= evaluate_real_expr(tt, state_values, constraint.right)
  } else if (constraint.tag === 'negation') {
    return !evaluate_constraint(tt, state_values, constraint.constraint)
  } else if (constraint.tag === 'conjunction') {
    return evaluate_constraint(tt, state_values, constraint.left) && evaluate_constraint(tt, state_values, constraint.right)
  } else if (constraint.tag === 'disjunction') {
    return evaluate_constraint(tt, state_values, constraint.left) || evaluate_constraint(tt, state_values, constraint.right)
  } else if (constraint.tag === 'conditional') {
    return !evaluate_constraint(tt, state_values, constraint.left) || evaluate_constraint(tt, state_values, constraint.right)
  } else if (constraint.tag === 'biconditional') {
    return evaluate_constraint(tt, state_values, constraint.left) === evaluate_constraint(tt, state_values, constraint.right)
  } else {
    throw new Error('evaluate_constraint fallthrough')
  }
}

// state_values: Record<StateIndex, Value>
export const evaluate_constraint_2 = (tt: TruthTable, state_values: Record<number, number>, constraint: Constraint): Res<boolean, EvaluationError> => {
  if (constraint.tag === 'equal') {
    // return Math.abs(evaluate_real_expr(tt, state_values, constraint.left) - evaluate_real_expr(tt, state_values, constraint.right)) <= tolerance
    return combine_eval_results(
      evaluate_real_expr_2(tt, state_values, constraint.left),
      evaluate_real_expr_2(tt, state_values, constraint.right),
      (l, r) => [true, Math.abs(l - r) <= tolerance],
    )
  } else if (constraint.tag === 'not_equal') {
    // return Math.abs(evaluate_real_expr(tt, state_values, constraint.left) - evaluate_real_expr(tt, state_values, constraint.right)) > tolerance
    return combine_eval_results(
      evaluate_real_expr_2(tt, state_values, constraint.left),
      evaluate_real_expr_2(tt, state_values, constraint.right),
      (l, r) => [true, Math.abs(l - r) > tolerance],
    )
  } else if (constraint.tag === 'less_than') {
    // return evaluate_real_expr(tt, state_values, constraint.left) < evaluate_real_expr(tt, state_values, constraint.right)
    return combine_eval_results(
      evaluate_real_expr_2(tt, state_values, constraint.left),
      evaluate_real_expr_2(tt, state_values, constraint.right),
      (l, r) => [true, l < r],
    )
  } else if (constraint.tag === 'less_than_or_equal') {
    // return evaluate_real_expr(tt, state_values, constraint.left) <= evaluate_real_expr(tt, state_values, constraint.right)
    return combine_eval_results(
      evaluate_real_expr_2(tt, state_values, constraint.left),
      evaluate_real_expr_2(tt, state_values, constraint.right),
      (l, r) => [true, l <= r],
    )
  } else if (constraint.tag === 'greater_than') {
    // return evaluate_real_expr(tt, state_values, constraint.left) > evaluate_real_expr(tt, state_values, constraint.right)
    return combine_eval_results(
      evaluate_real_expr_2(tt, state_values, constraint.left),
      evaluate_real_expr_2(tt, state_values, constraint.right),
      (l, r) => [true, l > r],
    )
  } else if (constraint.tag === 'greater_than_or_equal') {
    // return evaluate_real_expr(tt, state_values, constraint.left) >= evaluate_real_expr(tt, state_values, constraint.right)
    return combine_eval_results(
      evaluate_real_expr_2(tt, state_values, constraint.left),
      evaluate_real_expr_2(tt, state_values, constraint.right),
      (l, r) => [true, l >= r],
    )
  } else if (constraint.tag === 'negation') {
    // return !evaluate_constraint(tt, state_values, constraint.constraint)
    return map_eval_result(
      evaluate_constraint_2(tt, state_values, constraint.constraint),
      (v) => [true, !v],
    )
  } else if (constraint.tag === 'conjunction') {
    // return evaluate_constraint(tt, state_values, constraint.left) && evaluate_constraint(tt, state_values, constraint.right)
    return combine_eval_results(
      evaluate_constraint_2(tt, state_values, constraint.left),
      evaluate_constraint_2(tt, state_values, constraint.right),
      (l, r) => [true, l && r],
    )
  } else if (constraint.tag === 'disjunction') {
    // return evaluate_constraint(tt, state_values, constraint.left) || evaluate_constraint(tt, state_values, constraint.right)
    return combine_eval_results(
      evaluate_constraint_2(tt, state_values, constraint.left),
      evaluate_constraint_2(tt, state_values, constraint.right),
      (l, r) => [true, l || r],
    )
  } else if (constraint.tag === 'conditional') {
    // return !evaluate_constraint(tt, state_values, constraint.left) || evaluate_constraint(tt, state_values, constraint.right)
    return combine_eval_results(
      evaluate_constraint_2(tt, state_values, constraint.left),
      evaluate_constraint_2(tt, state_values, constraint.right),
      (l, r) => [true, !l || r],
    )
  } else if (constraint.tag === 'biconditional') {
    // return evaluate_constraint(tt, state_values, constraint.left) === evaluate_constraint(tt, state_values, constraint.right)
    return combine_eval_results(
      evaluate_constraint_2(tt, state_values, constraint.left),
      evaluate_constraint_2(tt, state_values, constraint.right),
      (l, r) => [true, l === r],
    )
  } else {
    throw new Error('evaluate_constraint fallthrough')
  }
}

const map_at = <Key extends number | string | symbol, Value>(map: Record<Key, Value>, key: Key): Value => {
  return assert_exists(map[key], `Map at key '${key.toString()}' missing!`)
}

// state_values: Record<StateIndex, Value>
export const evaluate_real_expr = (tt: TruthTable, state_values: Record<number, number>, expr: RealExpr): number => {
  if (expr.tag === 'literal') {
    return expr.value
  } else if (expr.tag === 'variable') {
    throw new Error('not evaluating real variables yet!')
  } else if (expr.tag === 'probability') {
    return evaluate_real_expr(tt, state_values, translate_real_expr(tt, expr))
  } else if (expr.tag === 'given_probability') {
    return evaluate_real_expr(tt, state_values, translate_real_expr(tt, expr))
  } else if (expr.tag === 'state_variable_sum') {
    return expr.indices.map((i) => map_at(state_values, i)).reduce((a, b) => a + b, 0)
  } else if (expr.tag === 'negative') {
    return -evaluate_real_expr(tt, state_values, expr.expr)
  } else if (expr.tag === 'power') {
    return Math.pow(evaluate_real_expr(tt, state_values, expr.base), evaluate_real_expr(tt, state_values, expr.exponent))
  } else if (expr.tag === 'plus') {
    return evaluate_real_expr(tt, state_values, expr.left) + evaluate_real_expr(tt, state_values, expr.right)
  } else if (expr.tag === 'minus') {
    return evaluate_real_expr(tt, state_values, expr.left) - evaluate_real_expr(tt, state_values, expr.right)
  } else if (expr.tag === 'multiply') {
    return evaluate_real_expr(tt, state_values, expr.left) * evaluate_real_expr(tt, state_values, expr.right)
  } else if (expr.tag === 'divide') {
    return evaluate_real_expr(tt, state_values, expr.numerator) / evaluate_real_expr(tt, state_values, expr.denominator)
  } else {
    return fallthrough('evaluate_real_expr', expr)
  }
}

export type EvaluationError =
  | { tag: 'div0' } 
  | { tag: 'undeclared-vars', vars: VariableLists }

const combine_eval_results = <T, R>(r1: Res<T, EvaluationError>, r2: Res<T, EvaluationError>, f: (t1: T, t2: T) => Res<R, EvaluationError>): Res<R, EvaluationError> => {
  const [status1, value1] = r1
  const [status2, value2] = r2

  if (status1 && status2) {
    return f(value1, value2)
  } else if (status1 && !status2) {
    return [false, value2]
  } else if (!status1 && status2) {
    return [false, value1]
  } else if (!status1 && !status2) {
    if (value1.tag === 'undeclared-vars' && value2.tag === 'undeclared-vars') {
      return [false, { tag: 'undeclared-vars', vars: { real: [...value1.vars.real, ...value2.vars.real], sentence: [...value1.vars.sentence, ...value2.vars.sentence] } }]
    } else if (value1.tag === 'div0') {
      return r1
    } else {
      return r2
    }
  } else {
    throw new Error('combine_eval_results fallthrough')
  }
}

const map_eval_result = <T>(r: Res<T, EvaluationError>, f: (t: T) => Res<T, EvaluationError>): Res<T, EvaluationError> => {
  const [status, value] = r
  if (status) {
    return f(value)
  } else {
    return r
  }
}

export const free_real_variables_in_real_expr = (expr: RealExpr, set: Set<string>): Set<string> => {
  const sub = (expr: RealExpr) => free_real_variables_in_real_expr(expr, set)

  if (expr.tag === 'divide') {
    sub(expr.numerator)
    sub(expr.denominator)
  } else if (expr.tag === 'given_probability') {
    // nothing!
  } else if (expr.tag === 'literal') {
    // nothing!
  } else if (expr.tag === 'minus') {
    sub(expr.left)
    sub(expr.right)
  } else if (expr.tag === 'multiply') {
    sub(expr.left)
    sub(expr.right)
  } else if (expr.tag === 'negative') {
    sub(expr.expr)
  } else if (expr.tag === 'plus') {
    sub(expr.left)
    sub(expr.right)
  } else if (expr.tag === 'power') {
    sub(expr.base)
    sub(expr.exponent)
  } else if (expr.tag === 'probability') {
    // nothing!
  } else if (expr.tag === 'state_variable_sum') {
    // nothing!
  } else if (expr.tag === 'variable') {
    set.add(expr.id)
  } else {
    return fallthrough('free_real_variables_in_real_expr', expr)
  }

  return set
}

const free_real_variables_in_constraint = (c: Constraint, set: Set<string>): Set<string> => {
  const sub = (c: Constraint) => free_real_variables_in_constraint(c, set)
  const sub_real = (re: RealExpr) => free_real_variables_in_real_expr(re, set)
  if (c.tag === 'biconditional') {
    sub(c.left)
    sub(c.right)
  } else if (c.tag === 'conditional') {
    sub(c.left)
    sub(c.right)
  } else if (c.tag === 'conjunction') {
    sub(c.left)
    sub(c.right)
  } else if (c.tag === 'disjunction') {
    sub(c.left)
    sub(c.right)
  } else if (c.tag === 'equal') {
    sub_real(c.left)
    sub_real(c.right)
  } else if (c.tag === 'greater_than') {
    sub_real(c.left)
    sub_real(c.right)
  } else if (c.tag === 'greater_than_or_equal') {
    sub_real(c.left)
    sub_real(c.right)
  } else if (c.tag === 'less_than') {
    sub_real(c.left)
    sub_real(c.right)
  } else if (c.tag === 'less_than_or_equal') { 
    sub_real(c.left)
    sub_real(c.right)
  } else if (c.tag === 'negation') {
    sub(c.constraint)
  } else if (c.tag === 'not_equal') {
    sub_real(c.left)
    sub_real(c.right)
  } else {
    return fallthrough('free_real_variables_in_constraint', c)
  }
  return set
}

export const free_real_variables_in_constraint_or_real_expr = (c_or_re: ConstraintOrRealExpr, set: Set<string>): Set<string> => {
  if (c_or_re.tag === 'constraint') {
    return free_real_variables_in_constraint(c_or_re.constraint, set)
  } else if (c_or_re.tag === 'real_expr') {
    return free_real_variables_in_real_expr(c_or_re.real_expr, set)
  } else {
    return fallthrough('free_variables_in_constraint_or_real_expr', c_or_re)
  }
}

export const free_variables_in_constraint_or_real_expr = (c_or_re: ConstraintOrRealExpr, set: LetterSet, declared: LetterSet): LetterSet => {
  if (c_or_re.tag === 'constraint') {
    return free_sentence_variables_in_constraint(c_or_re.constraint, set, declared)
  } else if (c_or_re.tag === 'real_expr') {
    return free_sentence_variables_in_real_expr(c_or_re.real_expr, set, declared)
  } else {
    return fallthrough('free_variables_in_constraint_or_real_expr', c_or_re)
  }
}

export const free_sentence_variables = (s: Sentence, set: LetterSet, declared: LetterSet): LetterSet => {
  const sub = (s: Sentence): void => {
    if (s.tag === 'biconditional') {
      sub(s.left)
      sub(s.right)
    } else if (s.tag === 'conditional') {
      sub(s.left)
      sub(s.right)
    } else if (s.tag === 'conjunction') {
      sub(s.left)
      sub(s.right)
    } else if (s.tag === 'disjunction') {
      sub(s.left)
      sub(s.right)
    } else if (s.tag === 'letter') {
      if (!declared.has(s)) {
        set.add(s)
      }
    } else if (s.tag === 'negation') {
      sub(s.sentence)
    } else if (s.tag === 'value') {
      // nothing!
    } else {
      return fallthrough('free_sentence_variables', s)
    }
  }

  sub(s)
  return set
}

export const free_sentence_variables_in_real_expr = (expr: RealExpr, set: LetterSet, declared: LetterSet): LetterSet => {
  const sub = (expr: RealExpr): void => {
    if (expr.tag === 'divide') {
      sub(expr.numerator)
      sub(expr.denominator)
    } else if (expr.tag === 'given_probability') {
      free_sentence_variables(expr.arg, set, declared)
      free_sentence_variables(expr.given, set, declared)
    } else if (expr.tag === 'literal') {
      // nothing!
    } else if (expr.tag === 'minus') {
      sub(expr.left)
      sub(expr.right)
    } else if (expr.tag === 'multiply') {
      sub(expr.left)
      sub(expr.right)
    } else if (expr.tag === 'negative') {
      sub(expr.expr)
    } else if (expr.tag === 'plus') {
      sub(expr.left)
      sub(expr.right)
    } else if (expr.tag === 'power') {
      sub(expr.base)
      sub(expr.exponent)
    } else if (expr.tag === 'probability') {
      free_sentence_variables(expr.arg, set, declared)
    } else if (expr.tag === 'state_variable_sum') {
      // nothing!
    } else if (expr.tag === 'variable') {
      // nothing!
    } else {
      return fallthrough('free_sentence_variables_in_real_expr', expr)
    }
  }

  sub(expr)
  return set
}

export const free_sentence_variables_in_constraint = (c: Constraint, set: LetterSet, declared: LetterSet): LetterSet => {
  const sub = (c: Constraint): void => {
    if (c.tag === 'biconditional') {
      sub(c.left)
      sub(c.right)
    } else if (c.tag === 'conditional') {
      sub(c.left)
      sub(c.right)
    } else if (c.tag === 'conjunction') {
      sub(c.left)
      sub(c.right)
    } else if (c.tag === 'disjunction') {
      sub(c.left)
      sub(c.right)
    } else if (c.tag === 'equal') {
      free_sentence_variables_in_real_expr(c.left, set, declared)
      free_sentence_variables_in_real_expr(c.right, set, declared)
    } else if (c.tag === 'greater_than') {
      free_sentence_variables_in_real_expr(c.left, set, declared)
      free_sentence_variables_in_real_expr(c.right, set, declared)
    } else if (c.tag === 'greater_than_or_equal') {
      free_sentence_variables_in_real_expr(c.left, set, declared)
      free_sentence_variables_in_real_expr(c.right, set, declared)
    } else if (c.tag === 'less_than') {
      free_sentence_variables_in_real_expr(c.left, set, declared)
      free_sentence_variables_in_real_expr(c.right, set, declared)
    } else if (c.tag === 'less_than_or_equal') {
      free_sentence_variables_in_real_expr(c.left, set, declared)
      free_sentence_variables_in_real_expr(c.right, set, declared)
    } else if (c.tag === 'negation') {
      sub(c.constraint)
    } else if (c.tag === 'not_equal') {
      free_sentence_variables_in_real_expr(c.left, set, declared)
      free_sentence_variables_in_real_expr(c.right, set, declared)
    } else {
      return fallthrough('free_sentence_variables_in_constraint', c)
    }
  }

  sub(c)
  return set
}

// state_values: Record<StateIndex, Value>
export const evaluate_real_expr_2 = (tt: TruthTable, state_values: Record<number, number>, expr: RealExpr): Res<number, EvaluationError> => {
  const sub = (expr: RealExpr): Res<number, EvaluationError> => {
    if (expr.tag === 'literal') {
      return [true, expr.value]
    } else if (expr.tag === 'variable') {
      // throw new Error('not evaluating real variables yet!')
      return [false, { tag: 'undeclared-vars', vars: { real: [expr.id], sentence: [] } }]
    } else if (expr.tag === 'probability') {
      const translated = translate_real_expr(tt, expr)
      return evaluate_real_expr_2(tt, state_values, translated)
    } else if (expr.tag === 'given_probability') {
      return evaluate_real_expr_2(tt, state_values, translate_real_expr(tt, expr))
    } else if (expr.tag === 'state_variable_sum') {
      return [true, expr.indices.map((i) => map_at(state_values, i)).reduce((a, b) => a + b, 0)]
    } else if (expr.tag === 'negative') {
      // return -evaluate_real_expr(tt, state_values, expr.expr)
      return map_eval_result(evaluate_real_expr_2(tt, state_values, expr.expr), (v) => [true, -v])
    } else if (expr.tag === 'power') {
      // return Math.pow(evaluate_real_expr(tt, state_values, expr.base), evaluate_real_expr(tt, state_values, expr.exponent))
      return combine_eval_results(
        evaluate_real_expr_2(tt, state_values, expr.base),
        evaluate_real_expr_2(tt, state_values, expr.exponent),
        (base, exponent) => [true, Math.pow(base, exponent)],
      )
    } else if (expr.tag === 'plus') {
      // return evaluate_real_expr(tt, state_values, expr.left) + evaluate_real_expr(tt, state_values, expr.right)
      return combine_eval_results(
        evaluate_real_expr_2(tt, state_values, expr.left),
        evaluate_real_expr_2(tt, state_values, expr.right),
        (l, r) => [true, l + r],
      )
    } else if (expr.tag === 'minus') {
      // return evaluate_real_expr(tt, state_values, expr.left) - evaluate_real_expr(tt, state_values, expr.right)
      return combine_eval_results(
        evaluate_real_expr_2(tt, state_values, expr.left),
        evaluate_real_expr_2(tt, state_values, expr.right),
        (l, r) => [true, l - r],
      )
    } else if (expr.tag === 'multiply') {
      // return evaluate_real_expr(tt, state_values, expr.left) * evaluate_real_expr(tt, state_values, expr.right)
      return combine_eval_results(
        evaluate_real_expr_2(tt, state_values, expr.left),
        evaluate_real_expr_2(tt, state_values, expr.right),
        (l, r) => [true, l * r],
      )
    } else if (expr.tag === 'divide') {
      // return evaluate_real_expr(tt, state_values, expr.numerator) / evaluate_real_expr(tt, state_values, expr.denominator)
      return combine_eval_results(
        evaluate_real_expr_2(tt, state_values, expr.numerator),
        evaluate_real_expr_2(tt, state_values, expr.denominator),
        (n, d) => {
          if (d === 0) {
            return [false, { tag: 'div0' }]
          } else {
            return [true, n / d]
          }
        },
      )
    } else {
      return fallthrough('evaluate_real_expr', expr)
    }
  }

  const fvs = free_sentence_variables_in_real_expr(expr, new LetterSet([]), new LetterSet([...tt.letters()]))
  const result = sub(expr)
  const [status, value] = result
  if (status) {
    if (!fvs.is_empty()) {
      return [false, { tag: 'undeclared-vars', vars: { real: [], sentence: [...fvs] } }]
    } else {
      return [status, value]
    }
  } else {
    if (value.tag === 'div0') {
      return result
    } else {
      return [false, { tag: 'undeclared-vars', vars: { real: value.vars.real, sentence: [...fvs] } }]
    }
  }
  // return sub(expr)
}

export const validate_model = (constraints: Constraint[], state_values: Record<number, number>, tt: TruthTable): boolean[] => {
  return constraints.map((c) => evaluate_constraint(tt, state_values, c))
}
