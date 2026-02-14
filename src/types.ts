import { setup_mutual_map, UnionToTagMap } from "./tag_map"

type Sentence =
  | { tag: 'value', value: boolean }
  | { tag: 'letter', id: string, index: number }
  | { tag: 'negation', sentence: Sentence }
  | { tag: 'disjunction', left: Sentence, right: Sentence }
  | { tag: 'conjunction', left: Sentence, right: Sentence }
  | { tag: 'conditional', left: Sentence, right: Sentence }
  | { tag: 'biconditional', left: Sentence, right: Sentence }
export type SentenceMap = UnionToTagMap<'tag', Sentence>

type RealExpr =
  | { tag: 'literal', value: number }
  | { tag: 'variable', id: string }
  | { tag: 'state_variable_sum', indices: number[] }
  | { tag: 'probability', arg: Sentence }
  | { tag: 'given_probability', arg: Sentence, given: Sentence }
  | { tag: 'negative', expr: RealExpr }
  | { tag: 'plus', left: RealExpr, right: RealExpr }
  | { tag: 'minus', left: RealExpr, right: RealExpr }
  | { tag: 'multiply', left: RealExpr, right: RealExpr }
  | { tag: 'divide', numerator: RealExpr, denominator: RealExpr }
  | { tag: 'power', base: RealExpr, exponent: RealExpr }
export type RealExprMap = UnionToTagMap<'tag', RealExpr>

type Constraint =
  | { tag: 'equal', left: RealExpr, right: RealExpr }
  | { tag: 'not_equal', left: RealExpr, right: RealExpr }
  | { tag: 'less_than', left: RealExpr, right: RealExpr }
  | { tag: 'less_than_or_equal', left: RealExpr, right: RealExpr }
  | { tag: 'greater_than', left: RealExpr, right: RealExpr }
  | { tag: 'greater_than_or_equal', left: RealExpr, right: RealExpr }
  | { tag: 'negation', constraint: Constraint }
  | { tag: 'conjunction', left: Constraint, right: Constraint }
  | { tag: 'disjunction', left: Constraint, right: Constraint }
  | { tag: 'conditional', left: Constraint, right: Constraint }
  | { tag: 'biconditional', left: Constraint, right: Constraint }

export type ConstraintOrRealExpr =
  | { tag: 'constraint', constraint: Constraint }
  | { tag: 'real_expr', real_expr: RealExpr }

export type PrSat = {
  Sentence: Sentence
  RealExpr: RealExpr
  Constraint: Constraint
}

export const PrSatFuncs = setup_mutual_map<PrSat>()({
  Sentence: {
    value: {
      tag: "record",
      record: {
        value: {
          tag: "primitive",
          type: "boolean"
        }
      }
    },
    letter: {
      tag: "record",
      record: {
        id: {
          tag: "primitive",
          type: "string",
          constraints: {
            bounds: {
              lower: 1,
              upper: 1,
            },
            characters: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
          }
        },
        index: {
          tag: "primitive",
          type: "number",
          constraints: {
            is_integer: true,
            bounds: {
              lower: 0,
            }
          }
        }
      }
    },
    negation: {
      tag: "record",
      record: {
        sentence: "Sentence"
      }
    },
    disjunction: {
      tag: "record",
      record: {
        left: "Sentence",
        right: "Sentence"
      }
    },
    conjunction: {
      tag: "record",
      record: {
        left: "Sentence",
        right: "Sentence"
      }
    },
    conditional: {
      tag: "record",
      record: {
        left: "Sentence",
        right: "Sentence"
      }
    },
    biconditional: {
      tag: "record",
      record: {
        left: "Sentence",
        right: "Sentence"
      }
    }
  },
  RealExpr: {
    literal: {
      tag: "record",
      record: {
        value: {
          tag: "primitive",
          type: "number",
          constraints: {
            bounds: {
              lower: 0,
            }
          }
        }
      }
    },
    variable: {
      tag: "record",
      record: {
        id: {
          tag: "primitive",
          type: "string",
          constraints: {
            bounds: {
              lower: 1,
              upper: 1,
            },
            characters: 'abcdefghijklmnopqrstuvwxyz'
          }
        }
      }
    },
    state_variable_sum: {
      tag: "record",
      record: {
        indices: {
          tag: "list",
          spec: {
            tag: "primitive",
            type: "number",
            constraints: {
              bounds: {
                lower: 0
              },
              is_integer: true,
            }
          },
          max_length: undefined
        }
      }
    },
    probability: {
      tag: "record",
      record: {
        arg: "Sentence"
      }
    },
    given_probability: {
      tag: "record",
      record: {
        arg: "Sentence",
        given: "Sentence"
      }
    },
    negative: {
      tag: "record",
      record: {
        expr: "RealExpr"
      }
    },
    plus: {
      tag: "record",
      record: {
        left: "RealExpr",
        right: "RealExpr"
      }
    },
    minus: {
      tag: "record",
      record: {
        left: "RealExpr",
        right: "RealExpr"
      }
    },
    multiply: {
      tag: "record",
      record: {
        left: "RealExpr",
        right: "RealExpr"
      }
    },
    divide: {
      tag: "record",
      record: {
        numerator: "RealExpr",
        denominator: "RealExpr"
      }
    },
    power: {
      tag: "record",
      record: {
        base: "RealExpr",
        exponent: "RealExpr"
      }
    }
  },
  Constraint: {
    negation: {
      tag: "record",
      record: {
        constraint: "Constraint"
      }
    },
    disjunction: {
      tag: "record",
      record: {
        left: "Constraint",
        right: "Constraint"
      }
    },
    conjunction: {
      tag: "record",
      record: {
        left: "Constraint",
        right: "Constraint"
      }
    },
    conditional: {
      tag: "record",
      record: {
        left: "Constraint",
        right: "Constraint"
      }
    },
    biconditional: {
      tag: "record",
      record: {
        left: "Constraint",
        right: "Constraint"
      }
    },
    equal: {
      tag: "record",
      record: {
        left: "RealExpr",
        right: "RealExpr"
      }
    },
    not_equal: {
      tag: "record",
      record: {
        left: "RealExpr",
        right: "RealExpr"
      }
    },
    less_than: {
      tag: "record",
      record: {
        left: "RealExpr",
        right: "RealExpr"
      }
    },
    less_than_or_equal: {
      tag: "record",
      record: {
        left: "RealExpr",
        right: "RealExpr"
      }
    },
    greater_than: {
      tag: "record",
      record: {
        left: "RealExpr",
        right: "RealExpr"
      }
    },
    greater_than_or_equal: {
      tag: "record",
      record: {
        left: "RealExpr",
        right: "RealExpr"
      }
    }
  },
})
