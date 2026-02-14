import { Arith, Bool, Context, Expr, init, Model, Z3HighLevel, Z3LowLevel } from "z3-solver"
import { match_s, S, spv, clause, s_to_string, default_clause } from "./s"
import { constraints_to_smtlib_lines, eliminate_state_variable_index, enrich_constraints, parse_s, real_expr_to_smtlib, translate, TruthTable, variables_in_constraints, state_index_id, constraint_to_smtlib, translate_constraint, translate_real_expr, free_variables_in_constraint_or_real_expr as free_sentence_variables_in_constraint_or_real_expr, LetterSet, free_real_variables_in_constraint_or_real_expr, VariableLists, div0_conditions_in_constraint_or_real_expr, translate_constraint_or_real_expr, eliminate_state_variable_index_in_constraint_or_real_expr } from "./pr_sat"
import { ConstraintOrRealExpr, PrSat } from "./types"
import { as_array, assert, assert_exists, assert_result, fallthrough, Res, sleep } from "./utils"

type RealExpr = PrSat['RealExpr']
type Constraint = PrSat['Constraint']

export const init_z3 = async (): Promise<Z3HighLevel & Z3LowLevel> => {
    // console.log('Initializing z3...')
    // const init_start = performance.now()
    const z3_interface = await init()
    // const init_end = performance.now()
    // console.log('done!')
    // console.log(`init time: ${(init_end - init_start) / 1000} seconds.`)
    return z3_interface
}

// const model_to_state_values = async <CtxKey extends string>(ctx: Context<CtxKey>, model: Model<CtxKey>): Promise<Record<number, number>> => {
//   const values_map: Record<number, number> = {}
//   const { simplify } = ctx
//   for (const decl of model.decls()) {
//     if (decl.arity() !== 0) {
//       // throw new Error(`model includes a function declaration with arity not equal to zero!\nname: ${decl.name()}`)
//       continue
//     }
//     const name = decl.name().toString()
//     if (name.length < 3) {
//       throw new Error(`Expected model entry name to be of length at least 3!\nname: ${name.length}`)
//     }
//     const index_str = name.substring(2)
//     const index = parseInt(index_str)
//     if (isNaN(index)) {
//       throw new Error(`Expected model entry name to be of the form s_<number>!\nname: ${name}`)
//     }

//     const value_expr = await simplify(model.eval(decl.call()))
//     const parsed_s = parse_s(value_expr.sexpr())
//     const value = parse_and_evaluate(parsed_s)
//     values_map[index] = value
//   }

//   const values: number[] = []
//   for (let i = 0; i < Object.keys(values_map).length; i++) {
//     values.push(values_map[i])
//   }
//   return values
// }

export type ModelAssignmentOutput =
  | { tag: 'literal', value: number }
  | { tag: 'negative', inner: ModelAssignmentOutput }
  | { tag: 'rational', numerator: ModelAssignmentOutput, denominator: ModelAssignmentOutput }
  | { tag: 'root-obj', index: number, a: ModelAssignmentOutput, b: ModelAssignmentOutput, c: ModelAssignmentOutput }
  | { tag: 'generic-root-obj', index: number, degree: number, coefficients: number[] }
  | { tag: 'unknown', s: S }

export const constraint_or_real_expr_to_smtlib = (tt: TruthTable, c_or_re: ConstraintOrRealExpr): S => {
  if (c_or_re.tag === 'constraint') {
    const t = translate_constraint(tt, c_or_re.constraint)
    return constraint_to_smtlib(t)
  } else if (c_or_re.tag === 'real_expr') {
    const t = translate_real_expr(tt, c_or_re.real_expr)
    return real_expr_to_smtlib(t)
  } else {
    return fallthrough('constraint_or_real_expr_to_smtlib', c_or_re)
  }
}

export type FancyEvaluatorOutput =
  | { tag: 'undeclared-vars', variables: VariableLists }
  | { tag: 'div0' }
  | { tag: 'result', result: ModelAssignmentOutput }
  | { tag: 'bool-result', result: boolean }

// const constraint_contains_div0 = (c: Constraint): boolean => {
//   const sub = constraint_contains_div0
//   const sub_real = real_expr_contains_div0
//   if (c.tag === 'biconditional') {
//     return sub(c.left) || sub(c.right)
//   } else if (c.tag === 'conditional') {
//     return sub(c.left) || sub(c.right)
//   } else if (c.tag === 'conjunction') {
//     return sub(c.left) || sub(c.right)
//   } else if (c.tag === 'disjunction') {
//     return sub(c.left) || sub(c.right)
//   } else if (c.tag === 'equal') {
//     return sub_real(c.left) || sub_real(c.right)
//   } else if (c.tag === 'greater_than') {
//     return sub_real(c.left) || sub_real(c.right)
//   } else if (c.tag === 'greater_than_or_equal') {
//     return sub_real(c.left) || sub_real(c.right)
//   } else if (c.tag === 'less_than') {
//     return sub_real(c.left) || sub_real(c.right)
//   } else if (c.tag === 'less_than_or_equal') {
//     return sub_real(c.left) || sub_real(c.right)
//   } else if (c.tag === 'negation') {
//     return sub(c.constraint)
//   } else if (c.tag === 'not_equal') {
//     return sub_real(c.left) || sub_real(c.right)
//   } else {
//     return fallthrough('constraint_contains_div0', c)
//   }
// }

// const real_expr_contains_div0 = (e: RealExpr): boolean => {
//   if (e.tag === 'divide') {
//     return 
//   } else if (e.tag === 'given_probability') {
//   } else if (e.tag === 'literal') {
//   } else if (e.tag === 'minus') {
//   } else if (e.tag === 'multiply') {
//   } else if (e.tag === 'negative') {
//   } else if (e.tag === 'plus') {
//   } else if (e.tag === 'power') {
//   } else if (e.tag === 'probability') {
//   } else if (e.tag === 'state_variable_sum') {
//   } else if (e.tag === 'variable') {
//   } else {
//     return fallthrough('real_expr_contains_div0', e)
//   }
// }

// const constraint_or_real_expr_contains_div0 = (c_or_re: ConstraintOrRealExpr): boolean => {
//   if (c_or_re.tag === 'constraint') {
//     return constraint_contains_div0(c_or_re.constraint)
//   } else if (c_or_re.tag === 'real_expr') {
//     return real_expr_contains_div0(c_or_re.real_expr)
//   } else {
//     return fallthrough('constraint_or_real_expr_contains_div0', c_or_re)
//   }
// }

// The given Solver should already have all the other variables inside it declared but if not I will CRY.
export const fancy_evaluate_constraint_or_real_expr = async <CtxKey extends string>(ctx: Context<CtxKey>, model: Model<CtxKey>, tt: TruthTable, c_or_re: ConstraintOrRealExpr): Promise<FancyEvaluatorOutput> => {
  const free_sentence_vars = free_sentence_variables_in_constraint_or_real_expr(c_or_re, new LetterSet(), new LetterSet([...tt.letters()]))
  const free_real_vars = free_real_variables_in_constraint_or_real_expr(c_or_re, new Set)

  if (!free_sentence_vars.is_empty() || free_real_vars.size > 0) {
    return { tag: 'undeclared-vars', variables: { sentence: [...free_sentence_vars], real: [...free_real_vars] } }
  }

  const div0_constraints = div0_conditions_in_constraint_or_real_expr(c_or_re)
  const index_to_eliminate = tt.n_states() - 1  // TODO: put this in a function.
  for (const c of div0_constraints) {
    const translated = translate_constraint(tt, c)
    const [_, eliminated] = eliminate_state_variable_index_in_constraint_or_real_expr(tt.n_states(), index_to_eliminate, { tag: 'constraint', constraint: translated })
    if (eliminated.tag !== 'constraint') throw new Error('Expected constraint after elimination')
    const z3_expr = constraint_to_bool(ctx, model, eliminated.constraint)
    const result = model.eval(z3_expr, true)  // true = model_completion to evaluate eliminated variables
    if (result.sexpr() === 'false') {
      // found a denominator equal to zero!
      return { tag: 'div0' }
    }
  }

  const translated_c_or_re = translate_constraint_or_real_expr(tt, c_or_re)
  const [_, eliminated] = eliminate_state_variable_index_in_constraint_or_real_expr(tt.n_states(), index_to_eliminate, translated_c_or_re)
  const to_evaluate_z3 = constraint_or_real_expr_to_z3_expr(ctx, model, eliminated)
  if (c_or_re.tag === 'constraint') {
    const result = model.eval(to_evaluate_z3, true)
    const s = result.sexpr()
    return { tag: 'bool-result', result: s === 'true' }
  }

  const output = await expr_to_assignment(ctx, model, to_evaluate_z3)
  console.log('RESULT', output)

  return { tag: 'result', result: output }
}

const int_to_s = (i: number): S => {
  if (i < 0) {
    return ['-', (-i).toString()]
  } else {
    return i.toString()
  }
}

export const poly_s = (cs: number[]) => {
  if (cs.length === 0) {
    return '0'
  } else if (cs.length === 1) {
    return int_to_s(cs[0]).toString()
  } else if (cs.length === 2) {
    return ['+', ['*', int_to_s(cs[0]), 'x'], cs[1].toString()]
  } else {
    const ret: S = ['+']
    for (const [index, c] of cs.entries()) {
      const exp = cs.length - index - 1
      if (exp === 0) {
        ret.push(int_to_s(c))
      } else if (exp === 1) {
        if (c === 1) {
          ret.push('x')
        } else if (c === 0) {
          // skip!
        } else {
          ret.push(['*', int_to_s(c), 'x'])
        }
      } else {
        if (c === 1) {
          ret.push(['^', 'x', exp.toString()])
        } else if (c === -1) {
          ret.push(['-', ['^', 'x', exp.toString()]])
        } else if (c === 0) {
          // skip!
        } else {
          ret.push(['*', int_to_s(c), ['^', 'x', exp.toString()]])
        }
      }
    }
    return ret
  }
}

export const model_assignment_output_to_string = (output: ModelAssignmentOutput): string => {
  const sub = (output: ModelAssignmentOutput): string => model_assignment_output_to_string(output)
  const wrap = (output: ModelAssignmentOutput, extra_wraps: ModelAssignmentOutput['tag'][] = []): string => {
    if (output.tag === 'literal' || output.tag === 'negative' || extra_wraps.includes(output.tag)) {
      return sub(output)
    } else {
      return `(${sub(output)})`
    }
  }

  if (output.tag === 'literal') {
    return output.value.toString()
  } else if (output.tag === 'negative') {
    return `-${wrap(output.inner)}`
  } else if (output.tag === 'rational') {
    return `${wrap(output.numerator)} / ${output.denominator}`
  } else if (output.tag === 'root-obj') {
    return `(root-obj ${output.index} (${wrap(output.a)} * x^2 + ${wrap(output.b)} * x + ${wrap(output.c)}))`
  } else if (output.tag === 'generic-root-obj') {
    const terms_str = output.coefficients.map((c, index) => {
      const exp = output.coefficients.length - index
      if (exp === 0) {
        return c
      } else if (exp === 1) {
        return `${c} * x`
      } else if (exp >= 2) {
        return `${c} * x^${exp}`
      } else {
        throw new Error('fallthrough!')
      }
    }).join(' + ')
    return `(root-obj ${output.index} (${terms_str}))`
  } else if (output.tag === 'unknown') {
    return s_to_string(output.s, false)
  } else {
    return fallthrough('model_assignment_output_to_string', output)
  }
}

// // Should be *mostly* simplified, but still might run into issues so this function is here just in case.
// const simplify_model_assignment_output = (output: ModelAssignmentOutput): ModelAssignmentOutput => {
//   throw new Error('unimplemented')
// }

const parse_int = (a: string): Res<number, string> => {
  const as_int = parseInt (a)
  if (isNaN(as_int)) {
    return [false, `Parsing '${a}' as int gave a NaN!`]
  } else {
    return [true, as_int]
  }
}

const parse_float = (a: string): Res<number, string> => {
  const as_float = parseFloat(a)
  if (isNaN(as_float)) {
    return [false, `Parsing '${a}' as float gave a NaN!`]
  } else {
    return [true, as_float]
  }
}

const parse_and_evaluate = (s: S): number => {
  const [a, b, c, d] = [spv('a'), spv('b'), spv('c'), spv('d')]
  return match_s(s, [
    clause<{ a: 'string' }, number>({ a: 'string' }, a, (m) => {
      return assert_result(parse_float(m('a')))
    }),
    clause<{ a: 'string' }, number>({ a: 'string' }, ['-', a], (m) => {
      return -parse_and_evaluate(m('a'))
    }),
    clause<{ a: 'string', b: 'string' }, number>({ a: 'string', b: 'string' }, ['/', a, b], (m) => {
      return parse_and_evaluate(m('a')) / parse_and_evaluate(m('b'))
    }),
    // expect(parse_s('(root-obj (+ (* 8 (^ x 2)) (* 6 x) (- 1)) 2)'))
    clause<{ a: 's', b: 's', c: 's', d: 'string' }, number>(
      { a: 's', b: 's', c: 's', d: 'string' },
      ['root-obj', ['+', ['*', a], ['*', b], c], d],
      (m) => {
        const af = parse_and_evaluate(m('a'))
        const bf = parse_and_evaluate(m('b'))
        const cf = parse_and_evaluate(m('c'))
        const di = assert_result(parse_int(m('d')))

        // (-b +- sqrt(b^2 - 4ac)) / 2a
        const det = bf * bf - 4 * af * cf
        if (det < 0) {
          throw new Error('Evaluated value to complex number oops!')
        } else if (di === 1) {
          return (-bf - Math.sqrt(det)) / (2 * af)
        } else if (di === 2) {
          return (-bf + Math.sqrt(det)) / (2 * af)
        } else {
          throw new Error(`Unrecognized root index ${di}!`)
        }
      }),
  ])
}

// const parse_s_integer = (term: S): number | undefined => {
//   const a = spv('a')
//   return match_s(term, [
//     clause({ a: 'string' }, ['-', a], (m) => {
//       return -assert_result(parse_int(m('a')))
//     }),
//     clause({ a: 'string' }, a, (m) => {
//       return assert_result(parse_int(m('a')))
//     }),
//   ])
// }

// [number, integer]
const parse_poly_term = (term: S): [number, number] => {
  const c = spv('c')
  const exp = spv('exp')
  const pi = (s: string): number => assert_result(parse_int(s))
  return match_s(term, [
    clause<{ c: 'string' }, [number, number]>({ c: 'string' }, c, (m) => {
      const [is_int, as_int] = parse_int(m('c'))
      if (is_int) {
        return [as_int, 0]
      } else {
        // Then we just saw an 'x' and we should return 1 for both the coefficient and the degree.
        return [1, 1]
      }
    }),
    clause<{ c: 'string' }, [number, number]>({ c: 'string' }, ['-', c], (m) => {
      const [is_int, as_int] = parse_int(m('c'))
      if (is_int) {
        return [-as_int, 0]
      } else {
        return [-1, 1]
      }
    }),
    clause<{ exp: 'string' }, [number, number]>({ exp: 'string' }, ['^', 'x', exp], (m) => {
      return [1, pi(m('exp'))]
    }),
    clause<{ exp: 'string' }, [number, number]>({ exp: 'string' }, ['-', ['^', 'x', exp]], (m) => {
      return [-1, pi(m('exp'))]
    }),
    clause<{ c: 'string' }, [number, number]>({ c: 'string' }, ['*', c, 'x'], (m) => {
      return [pi(m('c')), 1]
    }),
    clause<{ c: 'string' }, [number, number]>({ c: 'string' }, ['*', ['-', c], 'x'], (m) => {
      return [-pi(m('c')), 1]
    }),
    clause<{ c: 'string', exp: 'string' }, [number, number]>({ c: 'string', exp: 'string' }, ['*', c, ['^', 'x', exp]], (m) => {
      return [pi(m('c')), assert_result(parse_int(m('exp')))]
    }),
    clause<{ c: 'string', exp: 'string' }, [number, number]>({ c: 'string', exp: 'string' }, ['*', ['-', c], ['^', 'x', exp]], (m) => {
      return [-pi(m('c')), assert_result(parse_int(m('exp')))]
    }),
  ])
}

export const parse_to_assignment = (s: S): ModelAssignmentOutput => {
  // const [a, b, c, d] = [spv('a'), spv('b'), spv('c'), spv('d')]
  const [a, b] = [spv('a'), spv('b')]
  return match_s(s, [
    clause<{ a: 'string' }, ModelAssignmentOutput>({ a: 'string' }, a, (m) => {
      const ma = m('a')
      const as_float = assert_result(parse_float(ma))
      return { tag: 'literal', value: as_float }
    }),
    clause<{ a: 's' }, ModelAssignmentOutput>({ a: 's' }, ['-', a], (m) => {
      const inner = parse_to_assignment(m('a'))
      return { tag: 'negative', inner }
    }),
    clause<{ a: 'string', b: 'string' }, ModelAssignmentOutput>({ a: 'string', b: 'string' }, ['/', a, b], (m) => {
      const numerator = parse_to_assignment(m('a'))
      const denominator = parse_to_assignment(m('b'))
      return { tag: 'rational', numerator, denominator }
    }),
    clause<{ a: 'string', b: 'string' }, ModelAssignmentOutput>({ a: 'string', b: 'string' }, ['/', a, b], (m) => {
      const numerator = parse_to_assignment(m('a'))
      const denominator = parse_to_assignment(m('b'))
      return { tag: 'rational', numerator, denominator }
    }),
    // clause<{ a: 's', b: 's', c: 's', d: 'string' }, ModelAssignmentOutput>(
    //   { a: 's', b: 's', c: 's', d: 'string' },
    //   ['root-obj', ['+', ['*', a, ['^', 'x', '2']], ['*', b], c], d],
    //   (m) => {
    //     const af = parse_to_assignment(m('a'))
    //     const bf = parse_to_assignment(m('b'))
    //     const cf = parse_to_assignment(m('c'))
    //     const di = assert_result(parse_int(m('d')))

    //     return { tag: 'root-obj', index: di, a: af, b: bf, c: cf }
    //   }),
      default_clause<ModelAssignmentOutput>((s) => {
        const t = s('s')
        if (Array.isArray(t) && t.length > 2 && t[0] === 'root-obj') {
          // super-hacky but it's fine.
          // it's of the form
          // ['root-obj', ['+'], index]
          const sum_s = assert_exists(as_array(t[1]), 'missing sum in root-obj!')
          if (sum_s.length <= 1) {
            throw new Error('sum_s in root-obj doesn\'t have enough terms!')
          }
          assert(sum_s[0] === '+', `first element of sum isn\'t '+', but is instead '${sum_s[0]}'!`)

          const coefficients: number[] = []
          const n_terms = sum_s.length - 1  // -1 to exclude leading '+'.
          let largest_exp = 0
          let previous_exp: number | undefined = undefined
          for (let term_index = 0; term_index < n_terms; term_index++) {
            const term = assert_exists(sum_s[1 + term_index], `term missing at index ${1 + term_index!}`)
            const [c, exp] = parse_poly_term(term)
            if (previous_exp !== undefined && previous_exp <= exp) {
              throw new Error('Expected exponents to monotonically decrease in polynomial!')
            }

            assert(previous_exp === undefined || previous_exp > exp)
            if (previous_exp !== undefined) {
              for (let exp_gap = previous_exp - 1; exp_gap > exp; exp_gap--) {
                coefficients.push(0)
              }
            }
            coefficients.push(c)

            largest_exp = Math.max(largest_exp, exp)
            previous_exp = exp
          }
          
          const index_s = assert_exists(t[2], 'missing index!')
          const index = typeof index_s === 'string' ? assert_result(parse_int(index_s))
            : typeof index_s === 'number' ? index_s
            : -1
          return { tag: 'generic-root-obj', degree: largest_exp, coefficients, index }
        } else {
          return { tag: 'unknown', s: s('s') }
        }
      })
  ])
}

export const model_assignment_output_to_s = (output: ModelAssignmentOutput): S => {
  const sub = (output: ModelAssignmentOutput): S => model_assignment_output_to_s(output)
  if (output.tag === 'literal') {
    return output.value.toString()
  } else if (output.tag === 'negative') {
    return ['-', sub(output.inner)]
  } else if (output.tag === 'rational') {
    return ['/', sub(output.numerator), sub(output.denominator)]
  } else if (output.tag === 'root-obj') {
    return ['root-obj', ['+', ['*', sub(output.a), ['^', 'x', '2']], ['*', sub(output.b), 'x'], sub(output.c)], '2']
  } else if (output.tag === 'generic-root-obj') {
    const terms = output.coefficients.map((c, index) => {
      const exp = output.coefficients.length - index
      if (exp === 0) {
        return c
      } else if (exp === 1) {
        return ['*', c, 'x']
      } else if (exp >= 2) {
        // return `${c} * x^${exp}`
        return ['*', c, ['^', 'x', exp]]
      } else {
        throw new Error('fallthrough!')
      }
    })
    return ['root-obj', ['+', ...terms], output.index]
  } else if (output.tag === 'unknown') {
    return output.s
  } else {
    return fallthrough('model_assignment_output_to_s', output)
  }
}

const expr_to_assignment = async <CtxKey extends string>(ctx: Context<CtxKey>, model: Model<CtxKey>, expr: Expr<CtxKey>): Promise<ModelAssignmentOutput> => {
  const value_expr = await ctx.simplify(model.eval(expr))
  // const value_expr = await ctx.simplify(ctx.Real.val(-2138))
  const parsed_s = parse_s(value_expr.sexpr())
  const value = parse_to_assignment(parsed_s)
  return value
}

export const model_to_assigned_exprs = async <CtxKey extends string>(ctx: Context<CtxKey>, model: Model<CtxKey>): Promise<[number, Expr<CtxKey>][]> => {
  const assigned_exprs: [number, Expr<CtxKey>][] = []
  for (const decl of model.decls()) {
    if (decl.arity() !== 0) {
      // throw new Error(`model includes a function declaration with arity not equal to zero!\nname: ${decl.name()}`)
      continue
    }
    const name = decl.name().toString()
    if (name.length < 3) {
      throw new Error(`Expected model entry name to be of length at least 3!\nname: ${name.length}`)
    }
    const index_str = name.substring(2)
    const parsed_index = parseInt(index_str)
    if (isNaN(parsed_index)) {
      throw new Error(`Expected model entry name to be of the form a_<number>!\nname: ${name}`)
    }
    // Variable names are 1-indexed (a_1, a_2, ...) but internal indices are 0-indexed
    const index = parsed_index - 1

    assigned_exprs.push([index, await ctx.simplify(model.eval(decl.call()))])
  }

  return assigned_exprs
}

export const model_to_assignments = async <CtxKey extends string>(ctx: Context<CtxKey>, model: Model<CtxKey>): Promise<Record<number, ModelAssignmentOutput>> => {
  const assignments_map: Record<number, ModelAssignmentOutput> = {}
  const assigned_exprs = await model_to_assigned_exprs(ctx, model)
  for (const [index, expr] of assigned_exprs) {
    assignments_map[index] = await expr_to_assignment(ctx, model, expr)
  }
  return assignments_map
}

const constraint_or_real_expr_to_z3_expr = <CtxKey extends string>(ctx: Context<CtxKey>, model: Model<CtxKey>, c_or_re: ConstraintOrRealExpr): Expr<CtxKey> => {
  if (c_or_re.tag === 'constraint') {
    return constraint_to_bool(ctx, model, c_or_re.constraint)
  } else if (c_or_re.tag === 'real_expr') {
    return real_expr_to_arith(ctx, model, c_or_re.real_expr)
  } else {
    return fallthrough('constraint_or_real_expr_to_z3_expr', c_or_re)
  }
}

export const real_expr_to_arith = <CtxKey extends string>(ctx: Context<CtxKey>, model: Model<CtxKey>, expr: RealExpr): Arith<CtxKey> => {
  const sub = (expr: RealExpr): Arith<CtxKey> => real_expr_to_arith(ctx, model, expr)
  if (expr.tag === 'divide') {
    return ctx.Div(sub(expr.numerator), sub(expr.denominator))
  } else if (expr.tag === 'given_probability') {
    throw new Error('Unable to convert conditional probability to a Z3 arith expression!')
  } else if (expr.tag === 'literal') {
    return ctx.Real.val(expr.value)
  } else if (expr.tag === 'minus') {
    return ctx.Sub(sub(expr.left), sub(expr.right))
  } else if (expr.tag === 'multiply') {
    return ctx.Product(sub(expr.left), sub(expr.right))
  } else if (expr.tag === 'negative') {
    return ctx.Neg(sub(expr.expr))
  } else if (expr.tag === 'plus') {
    return ctx.Sum(sub(expr.left), sub(expr.right))
  } else if (expr.tag === 'power') {
    throw new Error('Unable to convert exponent to Z3 arith expression (be careful where real_expr_to_arith is called!)')
  } else if (expr.tag === 'probability') {
    throw new Error('Unable to convert probability to a Z3 arith expression!')
  } else if (expr.tag === 'state_variable_sum') {
    if (expr.indices.length === 0) {
      return ctx.Real.val(0)
    } else {
      const first_var_expr = ctx.Const(state_index_id(expr.indices[0]), ctx.Real.sort())
      const rest_var_exprs = expr.indices.slice(1).map((state_index) => ctx.Const(state_index_id(state_index), ctx.Real.sort()))
      return ctx.Sum(first_var_expr, ...rest_var_exprs)
    }
  } else if (expr.tag === 'variable') {
    throw new Error('Unable to convert variable to Z3 arith expression (be careful where real_expr_to_arith is called!)')
  } else {
    return fallthrough('real_expr_to_arith', expr)
  }
}

export const constraint_to_bool = <CtxKey extends string>(ctx: Context<CtxKey>, model: Model<CtxKey>, c: Constraint): Bool<CtxKey> => {
  const sub = (c: Constraint): Bool<CtxKey> => constraint_to_bool(ctx, model, c)
  const sub_real = (e: RealExpr): Arith<CtxKey> => real_expr_to_arith(ctx, model, e)
  if (c.tag === 'biconditional') {
    return ctx.Iff(sub(c.left), sub(c.right))
  } else if (c.tag === 'conditional') {
    return ctx.Implies(sub(c.left), sub(c.right))
  } else if (c.tag === 'conjunction') {
    return ctx.And(sub(c.left), sub(c.right))
  } else if (c.tag === 'disjunction') {
    return ctx.Or(sub(c.left), sub(c.right))
  } else if (c.tag === 'equal') {
    return ctx.Eq(sub_real(c.left), sub_real(c.right))
  } else if (c.tag === 'greater_than') {
    return ctx.GT(sub_real(c.left), sub_real(c.right))
  } else if (c.tag === 'greater_than_or_equal') {
    return ctx.GE(sub_real(c.left), sub_real(c.right))
  } else if (c.tag === 'less_than') {
    return ctx.LT(sub_real(c.left), sub_real(c.right))
  } else if (c.tag === 'less_than_or_equal') {
    return ctx.LE(sub_real(c.left), sub_real(c.right))
  } else if (c.tag === 'negation') {
    return ctx.Not(sub(c.constraint))
  } else if (c.tag === 'not_equal') {
    return ctx.Not(ctx.Eq(sub_real(c.left), sub_real(c.right)))
  } else {
    return fallthrough('constraint_to_bool', c)
  }
}

export type SolverOptions = {
  regular: boolean
  timeout_ms: number
}

export type SolverReturn<CtxKey extends string> =
  | {
    status: 'sat'
    all_constraints: Constraint[]
    tt: TruthTable
    z3_model: Model<CtxKey>
    model: Record<number, ModelAssignmentOutput>
    // solver: Solver<CtxKey>
  }
  | { status: 'unsat' | 'unknown', all_constraints: Constraint[], tt: TruthTable, model: undefined }

const DEFAULT_SOLVER_OPTIONS: SolverOptions = {
  regular: false,
  timeout_ms: 30_000,
}

// const fill_solver_options = (defaults: SolverOptions, partial: Partial<SolverOptions> | undefined): SolverOptions =>
//   ({ ...defaults, ...partial })

export const pr_sat_with_options = async <CtxKey extends string>(
  ctx: Context<CtxKey>,
  tt: TruthTable,
  constraints: Constraint[],
  options?: Partial<SolverOptions>,
): Promise<SolverReturn<CtxKey>> => {
  const { regular, timeout_ms } = { ...DEFAULT_SOLVER_OPTIONS, ...options }
  const { Solver } = ctx
  const solver = new Solver('QF_NRA');
  solver.set("timeout", timeout_ms)

  const translated = translate(tt, constraints)
  const index_to_eliminate = tt.n_states() - 1  // Only this works right now!
  // const index_to_eliminate = 0
  const enriched_constraints = enrich_constraints(tt, index_to_eliminate, regular, translated)
  const [redef, elim_constraints] = eliminate_state_variable_index(tt.n_states(), index_to_eliminate, enriched_constraints)

  const smtlib_lines = [
    ...constraints_to_smtlib_lines(tt, index_to_eliminate, elim_constraints),
    ['define-fun', `s_${index_to_eliminate}`, [], 'Real', real_expr_to_smtlib(redef)],
  ]
  const smtlib_string = smtlib_lines.map((l) => s_to_string(l, false)).join('\n')
  console.log(smtlib_string)
  solver.fromString(smtlib_string)
  const result = await solver.check()

  if (result === 'sat') {
    const model = solver.model()

    const elim_var_value = await fancy_evaluate_constraint_or_real_expr(ctx, model, tt, { tag: 'real_expr', real_expr: redef })
    if (elim_var_value.tag !== 'result') {
      throw new Error('Oh no error when trying to calculate eliminated variable!')
    }

    const assignments = {
      ...await model_to_assignments(ctx, model),
      [index_to_eliminate]: elim_var_value.result,
    }
    return { status: 'sat', all_constraints: translated, tt, z3_model: model, model: assignments }
  } else {
    return { status: result, all_constraints: translated, tt, model: undefined }
  }
}

export const pr_sat_with_truth_table = async <CtxKey extends string>(
  ctx: Context<CtxKey>,
  tt: TruthTable,
  constraints: Constraint[],
  regular: boolean = false,
): Promise<SolverReturn<CtxKey>> => {
  return await pr_sat_with_options(ctx, tt, constraints, { regular })
}

export const pr_sat = async <CtxKey extends string>(
  ctx: Context<CtxKey>,
  constraints: Constraint[],
  regular: boolean = false,
): Promise<SolverReturn<CtxKey>> => {
  const tt = new TruthTable(variables_in_constraints(constraints))
  return pr_sat_with_truth_table(ctx, tt, constraints, regular)
}

// const ac = new AbortController()
// const as = ac.signal
// as.onabort = () => {
// }

export type WrappedSolverResult =
  | {
    status: 'sat'
    state_assignments: Record<number, ModelAssignmentOutput>
    evaluate(tt: TruthTable, c_or_re: ConstraintOrRealExpr): Promise<FancyEvaluatorOutput>
  }
  | { status: 'unsat' }
  | { status: 'unknown' }
  | { status: 'exception', message: string }
  | { status: 'cancelled' }

type SolverOptions2 = {
  regular: boolean
  abort_signal?: AbortSignal
  cancel_fallback?: () => Promise<undefined>
  onTranslated?: (translated: Constraint[]) => void
}

const DEFAULT_SOLVER_OPTIONS2: SolverOptions2 = {
  regular: false,
  abort_signal: undefined,
}

export type PrSATResult = {
  constraints: {
    original: Constraint[]
    translated: Constraint[]
    extra: Constraint[]
    eliminated: Constraint[]
  }
  smtlib_input: string,
  solver_output: WrappedSolverResult
}

export const pr_sat_wrapped = async (
  solver: WrappedSolver,
  tt: TruthTable,
  constraints: Constraint[],
  options?: Partial<SolverOptions2>,
): Promise<PrSATResult> => {
  const { regular, abort_signal, cancel_fallback, onTranslated } = { ...DEFAULT_SOLVER_OPTIONS2, ...(options ?? {}) }

  const translated = translate(tt, constraints)
  onTranslated?.(translated)
  const index_to_eliminate = tt.n_states() - 1  // Only this works right now!
  const enriched_constraints = enrich_constraints(tt, index_to_eliminate, regular, translated)
  const [redef, elim_constraints] = eliminate_state_variable_index(tt.n_states(), index_to_eliminate, enriched_constraints)

  const smtlib_lines = constraints_to_smtlib_lines(tt, index_to_eliminate, elim_constraints)
  const smtlib_string = smtlib_lines.map((s) => s_to_string(s, false)).join('\n')
  // const result = await solver.solve(smtlib_lines, abort_signal, cancel_fallback)
  const result = await solver.solve(smtlib_string, abort_signal, cancel_fallback)
  const output_constraints = {
    original: constraints,
    translated,
    extra: enriched_constraints,
    eliminated: elim_constraints,
  }

  if (result.status === 'sat') {
    const elim_var_value = await result.evaluate(tt, { tag: 'real_expr', real_expr: redef })
    if (elim_var_value.tag !== 'result') {
      throw new Error('Oh no error when trying to calculate eliminated variable!')
    }

    return {
      constraints: output_constraints,
      smtlib_input: smtlib_string + `\n(check-sat)\n(get-model)`,
      solver_output: {
        ...result,
        state_assignments: { ...result.state_assignments, [index_to_eliminate]: elim_var_value.result },
      }
    }
  } else {
    return {
      constraints: output_constraints,
      smtlib_input: smtlib_string + `\n(check-sat)`,
      solver_output: result,
    }
  }
}

// I should probably be running z3 inside of a worker.
// Then I could just kill it if it's taking too long to cancel normally.
// Whatever I'll just be weird and do this instead.

export const run_solve_cancel_logic = async <R>(
  on_run: (signal?: AbortSignal) => Promise<R>,
  on_cancel: () => Promise<R>,
  on_slow_cancel: () => Promise<R>,
  cancel_timeout_ms: number,  // amount of time into running on_cancel that we go ahead and call on_slow_cancel.
  abort_signal?: AbortSignal,
): Promise<R> => {
  // This function is about to get more complicated -- yay!
  // On cancel, attempt interrupt.
  // If the interrupt succeeds within a certain timeout, resolve with a 'cancel' status.
  // If the interrupt does NOT succeed within the timeout, resolve anyway with a 'cancel' status.
  // Otherwise everything else should resolve normally.

  // The ways the Promise can resolve:
  // - on_run finishes.
  // - abort_signal.abort event and on_cancel finishes before given cancel timeout.
  // - abort_signal.abort event and on_cancel finishes after given cancel timeout (on_slow_cancel).

  const user_cancel = new Promise<{ tag: 'cancelled' }>((resolve) => {
    abort_signal?.addEventListener('abort', () => {
      resolve({ tag: 'cancelled' })
    })
  })

  const run = on_run(abort_signal).then((r) => ({ tag: 'finished' as const, result: r }))
  const result = await Promise.race([
    run,
    user_cancel,
  ])

  if (result.tag === 'finished') {
    return result.result
  } else if (result.tag === 'cancelled') {
    const cancel_result = await on_cancel()
    const result = await Promise.race([
      // If we're at this point, just assume that the run finishes BECAUSE it was cancelled.
      // Ignore the result, though, as it's (best-case) garbage.
      run.then(() => ({ tag: 'finished' as const, result: cancel_result })),
      // on_cancel().then((r) => ({ tag: 'finished' as const, result: r })),
      sleep(cancel_timeout_ms).then(() => ({ tag: 'cancelled' as const })),
    ])

    if (result.tag === 'finished') {
      return result.result
    } else if (result.tag === 'cancelled') {
      return await on_slow_cancel()
    } else {
      return fallthrough('run_solve_cancel_logic', result)
    }
  } else {
    return fallthrough('run_solve_cancel_logic', result)
  }
}

export class WrappedSolver {
  constructor(private z3_interface: (Z3HighLevel & Z3LowLevel) | undefined, private readonly init: () => Promise<(Z3HighLevel & Z3LowLevel) | undefined>) {
  }

  private async reinitialize(): Promise<void> {
    const old = this.z3_interface

    this.z3_interface = await this.init()
    console.log('reinitialized?', old !== this.z3_interface)
  }

  // async solve(smtlib_lines: S[], abort_signal?: AbortSignal, cancel_fallback?: () => Promise<undefined>): Promise<WrappedSolverResult> {
  async solve(smtlib_string: string, abort_signal?: AbortSignal, cancel_fallback?: () => Promise<undefined>): Promise<WrappedSolverResult> {
    // This function is about to get more complicated -- yay!
    // On cancel, attempt interrupt.
    // If the interrupt succeeds within a certain timeout, resolve with a 'cancel' status.
    // If the interrupt does NOT succeed within the timeout, resolve anyway with a 'cancel' status.
    // Otherwise everything else should resolve normally.
    // This logic is complex enough it might be a good idea to make this mockable.

    // const used_ctx = this.z3_interface.Context('main')
    // const solver = new used_ctx.Solver('QF_NRA')
    // const smtlib_lines_string = smtlib_lines.map((s) => s_to_string(s, false)).join('\n')

    return await run_solve_cancel_logic<WrappedSolverResult>(
      async (abort_signal?: AbortSignal): Promise<WrappedSolverResult> => {  // on_run
        if (this.z3_interface === undefined) {
          return { status: 'cancelled' }
        }

        const used_ctx = this.z3_interface.Context('main')
        const solver = new used_ctx.Solver('QF_NRA')
        // const smtlib_lines_string = smtlib_lines.map((s) => s_to_string(s, false)).join('\n')
        const smtlib_lines_string = smtlib_string

        try {
          solver.fromString(smtlib_lines_string)
        } catch (e: any) {
          console.error('smtlib_lines:\n', smtlib_lines_string)
          throw e
        }

        // let interrupted = false
        const on_abort = () => {
          // interrupted = true
          used_ctx.interrupt()
        }
        abort_signal?.addEventListener('abort', on_abort)

        try {
          const result = await solver.check()
          if (result === 'sat') {
            const model = solver.model()
            const evaluate = async (tt: TruthTable, c_or_re: ConstraintOrRealExpr): Promise<FancyEvaluatorOutput> => {
              return await fancy_evaluate_constraint_or_real_expr(used_ctx, model, tt, c_or_re)
            }
            const state_assignments = await model_to_assignments(used_ctx, model)
            return { status: 'sat', evaluate, state_assignments }
          } else {
            return { status: result }
          }
        } catch (e: any) {
          return { status: 'exception', message: e.message }
        } finally {
          abort_signal?.removeEventListener('abort', on_abort)
        }

      },
      async () => {  // on_cancel
        // Reinitialize Z3 after any cancel - the context may be in a bad state after interrupt
        await this.reinitialize()
        return { status: 'cancelled' }
      },
      async () => {  // on_slow_cancel
        console.log('attempting slow cancel...')
        await cancel_fallback?.()
        await this.reinitialize()
        return { status: 'cancelled' }
      },
      2 * 2000,  // two seconds before slow_cancel
      abort_signal,
    )
  }
}
