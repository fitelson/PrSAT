import { describe, expect, test } from 'vitest'
import {
  // Bounds,
  Random,
  // StringParams
} from './random'
import {
  // assert, assert_exists, Identity, include_exclude_array,
  record_keys
} from './utils'
// import { Constraint, RealExpr, Sentence } from './types'
import {
  grammar_to_inits, grammar_to_savers, grammar_to_recursors,
  // Equiv, Extends, MutualMap, MutualMapGrammar,
  MutualMapInits, MutualMapLoaders, MutualMapRecursors, MutualMapSavers,
  // MutualMapSnap, MutualMapSpec, MutualTagMap, ReverseMapLookup, TagMap, TagMapEntryToSpec,
  TagMapToMutualMap,
  // TagMapToSpecGrammar, TagUnion, UnionToTagMap, 
  grammar_to_loaders, grammar_to_fuzzers,
  full_from_partial_string_params
} from './tag_map'
import { PrSat } from './types'

type Constraint = PrSat['Constraint']
type RealExpr = PrSat['RealExpr']
type Sentence = PrSat['Sentence']

// type IsFunction<F> = F extends (...args: any) => any ? true : false
// const is_function_1: IsFunction<boolean> = false
// const is_function_2: IsFunction<() => void> = true

// const cm_extends_tm: Extends<ConstraintMap, TagMap<'tag'>> = true
// const tm_extends_tu2tm: Extends<TagMap<'tag'>, UnionToTagMap<'tag', TagUnion<'tag'>>> = true
// const tu2tm_extends_tm: Extends<UnionToTagMap<'tag', TagUnion<'tag'>>, TagMap<'tag'>> = true

// type ConstraintMap = UnionToTagMap<'tag', Constraint>
// type equal = ConstraintMap['equal']
// type and = ConstraintMap['conjunction']

// type Initializers = InitTagMap<'tag', ConstraintMap>
// const inits: Initializers = {
//   equal: function ({ left, right }): { tag: 'equal'; left: RealExpr; right: RealExpr } {
//     return { tag: 'equal', left, right }
//   },
//   not_equal: function (input: { left: RealExpr; right: RealExpr }): { tag: 'not_equal'; left: RealExpr; right: RealExpr } {
//     throw new Error('Function not implemented.')
//   },
//   less_than: function (input: { left: RealExpr; right: RealExpr }): { tag: 'less_than'; left: RealExpr; right: RealExpr } {
//     throw new Error('Function not implemented.')
//   },
//   less_than_or_equal: function (input: { left: RealExpr; right: RealExpr }): { tag: 'less_than_or_equal'; left: RealExpr; right: RealExpr } {
//     throw new Error('Function not implemented.')
//   },
//   greater_than: function (input: { left: RealExpr; right: RealExpr }): { tag: 'greater_than'; left: RealExpr; right: RealExpr } {
//     throw new Error('Function not implemented.')
//   },
//   greater_than_or_equal: function (input: { left: RealExpr; right: RealExpr }): { tag: 'greater_than_or_equal'; left: RealExpr; right: RealExpr } {
//     throw new Error('Function not implemented.')
//   },
//   negation: function (input: { constraint: Constraint }): { tag: 'negation'; constraint: Constraint } {
//     throw new Error('Function not implemented.')
//   },
//   conjunction: function (input: { left: Constraint; right: Constraint }): { tag: 'conjunction'; left: Constraint; right: Constraint } {
//     throw new Error('Function not implemented.')
//   },
//   disjunction: function (input: { left: Constraint; right: Constraint }): { tag: 'disjunction'; left: Constraint; right: Constraint } {
//     throw new Error('Function not implemented.')
//   },
//   conditional: function (input: { left: Constraint; right: Constraint }): { tag: 'conditional'; left: Constraint; right: Constraint } {
//     throw new Error('Function not implemented.')
//   },
//   biconditional: function (input: { left: Constraint; right: Constraint }): { tag: 'biconditional'; left: Constraint; right: Constraint } {
//     throw new Error('Function not implemented.')
//   }
// }

// inits.equal({ left: undefined as any, right: undefined as any })

// type cool = TagMapToSpecGrammar<'tag', { something: { else: Constraint } }, { Constraint: Constraint }>
// type RealExprMap = UnionToTagMap<'tag', RealExpr>
// type SentenceMap = UnionToTagMap<'tag', Sentence>

type ConstraintReuseMap = { RealExpr: RealExpr, Constraint: Constraint, Sentence: Sentence }
// type ConstraintGrammar = TagMapToSpecGrammar<'tag', ConstraintMap, ConstraintReuseMap>
// type RealExprGrammar = TagMapToSpecGrammar<'tag', RealExprMap, ConstraintReuseMap>
// type SentenceGrammar = TagMapToSpecGrammar<'tag', SentenceMap, ConstraintReuseMap>
// type noice = SentenceGrammar['biconditional']

type ConstraintMutualMap = TagMapToMutualMap<'tag', ConstraintReuseMap>
// type ConstraintMutualMapGrammar = ConstraintMutualMap['grammar']

// const cmmg_extends_mmg: Extends<ConstraintMutualMap['grammar'], MutualMapGrammar> = true
// const cmmu_extends_mmu: Extends<ConstraintMutualMap['map'], MutualTagMap<'tag'>> = true
// const cmmu_extends_mmu2: Extends<ConstraintMutualMap['map']['Constraint'], TagMap<'tag'>> = true
// const cmm_extends_mm: Extends<ConstraintMutualMap, MutualMap<'tag'>> = true
// const c_extends_cmm_union_c: Equiv<ConstraintMutualMap['guide'], ConstraintReuseMap> = true

// Instead of choosing a 'primitive' for this type it chose a 'constant' and put it in an or.
// type L = ConstraintMutualMap['grammar']['Sentence']

const constraint_grammar: ConstraintMutualMap['grammar']= {
  RealExpr: {
    literal: {
      tag: 'record',
      record: {
        // tag: {
        //   tag: 'constant',
        //   value: 'literal'
        // },
        value: {
          tag: 'primitive',
          type: 'number'
        }
      },
    },
    variable: {
      tag: 'record',
      record: {
        // tag: {
        //   tag: 'constant',
        //   value: 'variable'
        // },
        id: {
          tag: 'primitive',
          type: 'string'
        }
      },
    },
    state_variable_sum: {
      tag: 'record',
      record: {
        // tag: {
        //   tag: 'constant',
        //   value: 'state_variable_sum'
        // },
        indices: {
          tag: 'list',
          spec: {
            tag: 'primitive',
            type: 'number',
            constraints: { is_integer: true, bounds: { lower: 0, upper: 2048 } },  // arbitrary upper bound but we have bigger problems if we hit this.
          }
        }
      },
    },
    probability: {
      tag: 'record',
      record: {
        // tag: {
        //   tag: 'constant',
        //   value: 'probability'
        // },
        arg: 'Sentence'
      },
    },
    given_probability: {
      tag: 'record',
      record: {
        // tag: {
        //   tag: 'constant',
        //   value: 'given_probability'
        // },
        arg: 'Sentence',
        given: 'Sentence'
      },
    },
    negative: {
      tag: 'record',
      record: {
        // tag: {
        //   tag: 'constant',
        //   value: 'negative'
        // },
        expr: 'RealExpr'
      },
    },
    plus: {
      tag: 'record',
      record: {
        // tag: {
        //   tag: 'constant',
        //   value: 'plus'
        // },
        left: 'RealExpr',
        right: 'RealExpr'
      },
    },
    minus: {
      tag: 'record',
      record: {
        // tag: {
        //   tag: 'constant',
        //   value: 'minus'
        // },
        left: 'RealExpr',
        right: 'RealExpr'
      },
    },
    multiply: {
      tag: 'record',
      record: {
        // tag: {
        //   tag: 'constant',
        //   value: 'multiply'
        // },
        left: 'RealExpr',
        right: 'RealExpr'
      },
    },
    divide: {
      tag: 'record',
      record: {
        // tag: {
        //   tag: 'constant',
        //   value: 'divide'
        // },
        numerator: 'RealExpr',
        denominator: 'RealExpr'
      },
    },
    power: {
      tag: 'record',
      record: {
        // tag: {
        //   tag: 'constant',
        //   value: 'power'
        // },
        base: 'RealExpr',
        exponent: 'RealExpr'
      },
    }
  },
  Constraint: {
    equal: {
      tag: 'record',
      record: {
        // tag: {
        //   tag: 'constant',
        //   value: 'equal'
        // },
        left: 'RealExpr',
        right: 'RealExpr'
      },
    },
    not_equal: {
      tag: 'record',
      record: {
        // tag: {
        //   tag: 'constant',
        //   value: 'not_equal'
        // },
        left: 'RealExpr',
        right: 'RealExpr'
      },
    },
    less_than: {
      tag: 'record',
      record: {
        // tag: {
        //   tag: 'constant',
        //   value: 'less_than'
        // },
        left: 'RealExpr',
        right: 'RealExpr'
      },
    },
    less_than_or_equal: {
      tag: 'record',
      record: {
        // tag: {
        //   tag: 'constant',
        //   value: 'less_than_or_equal'
        // },
        left: 'RealExpr',
        right: 'RealExpr'
      },
    },
    greater_than: {
      tag: 'record',
      record: {
        // tag: {
        //   tag: 'constant',
        //   value: 'greater_than'
        // },
        left: 'RealExpr',
        right: 'RealExpr'
      },
    },
    greater_than_or_equal: {
      tag: 'record',
      record: {
        // tag: {
        //   tag: 'constant',
        //   value: 'greater_than_or_equal'
        // },
        left: 'RealExpr',
        right: 'RealExpr'
      },
    },
    negation: {
      tag: 'record',
      record: {
        // tag: {
        //   tag: 'constant',
        //   value: 'negation'
        // },
        constraint: 'Constraint'
      },
    },
    conjunction: {
      tag: 'record',
      record: {
        // tag: {
        //   tag: 'constant',
        //   value: 'conjunction'
        // },
        left: 'Constraint',
        right: 'Constraint'
      },
    },
    disjunction: {
      tag: 'record',
      record: {
        // tag: {
        //   tag: 'constant',
        //   value: 'disjunction'
        // },
        left: 'Constraint',
        right: 'Constraint'
      },
    },
    conditional: {
      tag: 'record',
      record: {
        // tag: {
        //   tag: 'constant',
        //   value: 'conditional'
        // },
        left: 'Constraint',
        right: 'Constraint'
      },
    },
    biconditional: {
      tag: 'record',
      record: {
        // tag: {
        //   tag: 'constant',
        //   value: 'biconditional'
        // },
        left: 'Constraint',
        right: 'Constraint'
      },
    }
  },
  Sentence: {
    negation: {
      tag: 'record',
      record: {
        // tag: {
        //   tag: 'constant',
        //   value: 'negation'
        // },
        sentence: 'Sentence'
      },
    },
    conjunction: {
      tag: 'record',
      record: {
        // tag: {
        //   tag: 'constant',
        //   value: 'conjunction'
        // },
        left: 'Sentence',
        right: 'Sentence'
      },
    },
    disjunction: {
      tag: 'record',
      record: {
        // tag: {
        //   tag: 'constant',
        //   value: 'disjunction'
        // },
        left: 'Sentence',
        right: 'Sentence'
      },
    },
    conditional: {
      tag: 'record',
      record: {
        // tag: {
        //   tag: 'constant',
        //   value: 'conditional'
        // },
        left: 'Sentence',
        right: 'Sentence'
      },
    },
    biconditional: {
      tag: 'record',
      record: {
        // tag: {
        //   tag: 'constant',
        //   value: 'biconditional'
        // },
        left: 'Sentence',
        right: 'Sentence'
      },
    },
    value: {
      tag: 'record',
      record: {
        value: {
          tag: 'primitive',
          type: 'boolean'
        }
      },
    },
    letter: {
      tag: 'record',
      record: {
        // tag: {
        //   tag: 'constant',
        //   value: 'letter'
        // },
        id: {
          tag: 'primitive',
          type: 'string'
        },
        index: {
          tag: 'primitive',
          type: 'number',
          constraints: {
            bounds: { lower: 0 },
            is_integer: true,
          }
        }
      },
    }
  },
}

// const mmspec_test1: Extends<ConstraintMutualMap['grammar'], MutualMapGrammar> = true

const constraint_grammar_to_inits = (cg: ConstraintMutualMap['grammar']): MutualMapInits<'tag', ConstraintMutualMap> => {
  return grammar_to_inits('tag', cg)
}

const constraint_grammar_to_savers = (cg: ConstraintMutualMap['grammar']): MutualMapSavers<'tag', ConstraintMutualMap> => {
  return grammar_to_savers('tag', cg)
}

const constraint_grammar_to_loaders = (cg: ConstraintMutualMap['grammar']): MutualMapLoaders<'tag', ConstraintMutualMap> => {
  return grammar_to_loaders('tag', cg)
}

const constraint_grammar_to_fuzzers = (
  cg: ConstraintMutualMap['grammar'], loader: MutualMapLoaders<'tag', ConstraintMutualMap>
) => {
  return grammar_to_fuzzers('tag', cg, loader)
}

const constraint_grammar_to_recursors = (cg: ConstraintMutualMap['grammar']): MutualMapRecursors<'tag', ConstraintMutualMap> => {
  return grammar_to_recursors('tag', cg)
}

describe('constraint_inits', () => {
  const inits = constraint_grammar_to_inits(constraint_grammar)
  const { letter, conjunction } = inits.Sentence
  test('A', () => expect(letter({ id: 'A', index: 0 })).toEqual({ tag: 'letter', id: 'A' }))
  test('A & B', () => expect(conjunction({ left: letter({ id: 'A', index: 0 }), right: letter({ id: 'B', index: 0 }) })).toEqual({ tag: 'conjunction', left: { tag: 'letter', id: 'A' }, right: { tag: 'letter', id: 'B' } }))
})

describe('constraint_recursors', () => {
  const recursors = constraint_grammar_to_recursors(constraint_grammar)
  describe('Sentence', () => {
    describe('sentence_to_string', () => {
      const wrap = (sentence: Sentence): string => {
        const str = sentence_to_string(sentence)
        if (sentence.tag === 'negation' || sentence.tag === 'letter' || sentence.tag === 'value') {
          return str
        } else {
          return `(${str})`
        }
      }

      const sentence_to_string = recursors.Sentence<undefined, string>(() => undefined, {
        negation: ({ sentence }) => `~${wrap(sentence)}`,
        conjunction: ({ left, right }) => `${wrap(left)} & ${wrap(right)}`,
        disjunction: ({ left, right }) => `${wrap(left)} \\/ ${wrap(right)}`,
        conditional: ({ left, right }) => `${wrap(left)} -> ${wrap(right)}`,
        biconditional: ({ left, right }) => `${wrap(left)} <-> ${wrap(right)}`,
        value: ({ value }) => `${value}`,
        letter: ({ id }) => id,
      })

      test('A', () => expect(sentence_to_string({ tag: 'letter', id: 'A', index: 0 })).toEqual('A'))
      test('~A', () => expect(sentence_to_string({ tag: 'negation', sentence: { tag: 'letter', id: 'A', index: 0 } })).toEqual('~A'))
      test('~~A', () => expect(sentence_to_string({ tag: 'negation', sentence: { tag: 'negation', sentence: { tag: 'letter', id: 'A', index: 0 } } })).toEqual('~~A'))
      test('A & B', () => expect(sentence_to_string({ tag: 'conjunction', left: { tag: 'letter', id: 'A', index: 0 }, right: { tag: 'letter', id: 'B', index: 0 } })).toEqual('A & B'))
      test('~(A & B)', () => expect(sentence_to_string({ tag: 'negation', sentence: { tag: 'conjunction', left: { tag: 'letter', id: 'A', index: 0 }, right: { tag: 'letter', id: 'B', index: 0 } } })).toEqual('~(A & B)'))
    })
    describe('letters_in', () => {
      const letters_in_1 = recursors.Sentence<string[], string[]>(() => [], {
        negation: (input, acc, rec) => {
          return rec(input.sentence, acc)
        },
        conjunction: (input, acc, rec) => {
          const lacc = rec(input.left, acc)
          return rec(input.right, lacc)
        },
        disjunction: (input, acc, rec) => {
          const lacc = rec(input.left, acc)
          return rec(input.right, lacc)
        },
        conditional: (input, acc, rec) => {
          const lacc = rec(input.left, acc)
          return rec(input.right, lacc)
        },
        biconditional: (input, acc, rec) => {
          const lacc = rec(input.left, acc)
          return rec(input.right, lacc)
        },
        value: (_input, acc, _rec) => acc,
        letter: (input, acc, _rec) => {
          acc.push(input.id)
          return acc
        }
      })

      const letters_in_2 = recursors.Sentence<string[], string[]>(() => [], {
        negation: (input, acc, rec) => rec(input.sentence, acc),
        conjunction: (input, acc, rec) => {
          const lacc = rec(input.left, acc)
          return rec(input.right, lacc)
        },
        disjunction: (input, acc, rec) => {
          const lacc = rec(input.left, acc)
          return rec(input.right, lacc)
        },
        conditional: (input, acc, rec) => {
          const lacc = rec(input.left, acc)
          return rec(input.right, lacc)
        },
        biconditional: (input, acc, rec) => {
          const lacc = rec(input.left, acc)
          return rec(input.right, lacc)
        },
        value: (_input, acc, _rec) => acc,
        letter: (input, acc, _rec) => {
          return [...acc, input.id]
        }
      })

      describe('mutable acc', () => {
        test('A', () => expect(letters_in_1({ tag: 'letter', id: 'A', index: 0 })).toEqual(['A']))
        test('~A', () => expect(letters_in_1({ tag: 'negation', sentence: { tag: 'letter', id: 'B', index: 0 } })).toEqual(['B']))
        test('A & B', () => expect(letters_in_1({ tag: 'conjunction', left: { tag: 'letter', id: 'A', index: 0 }, right: { tag: 'letter', id: 'B', index: 0 } })).toEqual(['A', 'B']))
      })
      describe('immutable acc', () => {
        test('A', () => expect(letters_in_2({ tag: 'letter', id: 'A', index: 0 })).toEqual(['A']))
        test('~B', () => expect(letters_in_2({ tag: 'negation', sentence: { tag: 'letter', id: 'B', index: 0 } })).toEqual(['B']))
        test('A & B', () => expect(letters_in_2({ tag: 'conjunction', left: { tag: 'letter', id: 'A', index: 0 }, right: { tag: 'letter', id: 'B', index: 0 } })).toEqual(['A', 'B']))
      })
    })
  })
})

describe('constraint_savers', () => {
  const {
    Sentence: { letter, conjunction: and },
    RealExpr: { probability: pr },
  } = constraint_grammar_to_inits(constraint_grammar)
  const savers = constraint_grammar_to_savers(constraint_grammar)
  const [A, B] = [letter({ id: 'A', index: 0 }), letter({ id: 'B', index: 0 })]
  const AandB = and({ left: A, right: B })
  const PrAandB = pr({ arg: AandB })

  test('A', () => expect(savers.Sentence(A)).toEqual({
    tag: 'record',
    mm_keys: { top: 'Sentence', inner: 'letter' },
    record: {
      // tag: { tag: 'constant', value: 'letter' },
      id: { tag: 'primitive', value: 'A' },
    },
  }))
  test('A & B', () => expect(savers.Sentence(AandB)).toEqual({
    tag: 'record',
    mm_keys: { top: 'Sentence', inner: 'conjunction', },
    record: {
      // tag: { tag: 'constant', value: 'conjunction' }, 
      left: {
        tag: 'record',
        mm_keys: { top: 'Sentence', inner: 'letter' },
        record: {
          // tag: { tag: 'constant', value: 'letter' },
          id: { tag: 'primitive', value: 'A' }
        },
      },
      right: {
        tag: 'record',
        mm_keys: { top: 'Sentence', inner: 'letter' },
        record: {
          // tag: { tag: 'constant', value: 'letter' },
          id: { tag: 'primitive', value: 'B' }
        },
      },
    },
  }))
  test('Pr(A)', () => expect(savers.RealExpr(PrAandB)).toEqual({
    tag: 'record',
    mm_keys: { top: 'RealExpr', inner: 'probability' },
    record: {
      // tag: { tag: 'constant', value: 'probability' },
      arg: {
        tag: 'record',
        mm_keys: { top: 'Sentence', inner: 'conjunction' },
        record: {
          // tag: { tag: 'constant', value: 'conjunction' }, 
          left: {
            tag: 'record',
            mm_keys: { top: 'Sentence', inner: 'letter' },
            record: {
              // tag: { tag: 'constant', value: 'letter' },
              id: { tag: 'primitive', value: 'A' }
            },
          },
          right: {
            tag: 'record',
            mm_keys: { top: 'Sentence', inner: 'letter' },
            record: {
              // tag: { tag: 'constant', value: 'letter' },
              id: { tag: 'primitive', value: 'B' }
            },
          },
        },
      },
    },
  }))
})

describe('constraint_loaders', () => {
  const {
    Sentence: { letter, conjunction: and },
    RealExpr: { probability: pr },
  } = constraint_grammar_to_inits(constraint_grammar)
  const loaders = constraint_grammar_to_loaders(constraint_grammar)
  const [A, B] = [letter({ id: 'A', index: 0 }), letter({ id: 'B', index: 0 })]
  const AandB = and({ left: A, right: B })
  const PrAandB = pr({ arg: AandB })

  test('A', () => expect(loaders.Sentence({
    tag: 'record',
    mm_keys: { top: 'Sentence', inner: 'letter' },
    record: {
      id: { tag: 'primitive', value: 'A' },
    },
  })).toEqual(A))
  test('A & B', () => expect(loaders.Sentence({
    tag: 'record',
    mm_keys: { top: 'Sentence', inner: 'conjunction', },
    record: {
      left: {
        tag: 'record',
        mm_keys: { top: 'Sentence', inner: 'letter' },
        record: {
          id: { tag: 'primitive', value: 'A' }
        },
      },
      right: {
        tag: 'record',
        mm_keys: { top: 'Sentence', inner: 'letter' },
        record: {
          id: { tag: 'primitive', value: 'B' }
        },
      },
    },
  })).toEqual(AandB))
  test('Pr(A)', () => expect(loaders.RealExpr({
    tag: 'record',
    mm_keys: { top: 'RealExpr', inner: 'probability' },
    record: {
      arg: {
        tag: 'record',
        mm_keys: { top: 'Sentence', inner: 'conjunction' },
        record: {
          left: {
            tag: 'record',
            mm_keys: { top: 'Sentence', inner: 'letter' },
            record: {
              id: { tag: 'primitive', value: 'A' }
            },
          },
          right: {
            tag: 'record',
            mm_keys: { top: 'Sentence', inner: 'letter' },
            record: {
              id: { tag: 'primitive', value: 'B' }
            },
          },
        },
      },
    },
  })).toEqual(PrAandB))
})

describe('constraint_fuzzers', () => {
  const savers = constraint_grammar_to_savers(constraint_grammar)
  const loaders = constraint_grammar_to_loaders(constraint_grammar)
  const recursors = constraint_grammar_to_recursors(constraint_grammar)
  const fuzzers = constraint_grammar_to_fuzzers(constraint_grammar, loaders)

  const wrap = (sentence: Sentence): string => {
    const str = sentence_to_string(sentence)
    if (sentence.tag === 'negation' || sentence.tag === 'letter' || sentence.tag === 'value') {
      return str
    } else {
      return `(${str})`
    }
  }

  const sentence_to_string = recursors.Sentence<undefined, string>(() => undefined, {
    negation: ({ sentence }) => `~${wrap(sentence)}`,
    conjunction: ({ left, right }) => `${wrap(left)} & ${wrap(right)}`,
    disjunction: ({ left, right }) => `${wrap(left)} \\/ ${wrap(right)}`,
    conditional: ({ left, right }) => `${wrap(left)} -> ${wrap(right)}`,
    biconditional: ({ left, right }) => `${wrap(left)} <-> ${wrap(right)}`,
    value: ({ value }) => `${value}`,
    letter: ({ id }) => id,
  })

  const random = new Random()
  const initted_fuzzers = fuzzers(random, { target_depth: 10 })
  const n_examples_per = 100

  for (const top_key of record_keys(constraint_grammar)) {
    test(top_key, () => {
      for (let example_index = 0; example_index < n_examples_per; example_index++) {
        const snap = initted_fuzzers[top_key].of_spec()
        const loaded = loaders[top_key](snap)
        const saved = savers[top_key](loaded as any)
        expect(saved).toEqual(snap)
      }
    })
  }
})

describe.only('full_from_partial_string_params', () => {
  test('', () => {
    const partial = {
      bounds: {
        lower: 1,
        upper: 1,
      },
      characters: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    }
    expect(full_from_partial_string_params(partial)).toEqual(partial)
  })
})
