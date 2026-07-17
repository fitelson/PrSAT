import {
  constraints_to_smtlib_lines,
  div0_conditions_in_constraint_or_real_expr,
  eliminate_state_variable_index,
  eliminate_state_variable_index_in_constraint_or_real_expr,
  enrich_constraints,
  free_real_variables_in_constraint_or_real_expr,
  free_variables_in_constraint_or_real_expr,
  guard_div0_conditions_in_constraint,
  LetterSet,
  real_expr_to_smtlib,
  TruthTable,
} from './pr_sat'
import { s_to_string } from './s'
import { ConstraintOrRealExpr, PrSat } from './types'
import {
  translate_constraint_cooper,
  translate_constraint_or_real_expr_cooper,
  translate_constraints_cooper,
} from './cooper'
import {
  constraint_to_bool,
  expr_to_assignment,
  FancyEvaluatorOutput,
  PrSATResult,
  real_expr_to_arith,
  WrappedSolver,
} from './z3_integration'
import { Context, Model } from 'z3-solver'

export {
  compute_cooper_value_sets,
  cooper_probability_denominator,
  div0_conditions_in_cooper_probability,
  evaluate_cooper_sentence,
  translate_constraint_cooper,
  translate_constraint_or_real_expr_cooper,
  translate_constraints_cooper,
  translate_cooper_probability,
  translate_real_expr_cooper,
} from './cooper'
export type { CooperValueSets, TruthValue3 } from './cooper'

type Constraint = PrSat['Constraint']

export const fancy_evaluate_constraint_or_real_expr_cooper = async <CtxKey extends string>(
  ctx: Context<CtxKey>,
  model: Model<CtxKey>,
  tt: TruthTable,
  c_or_re: ConstraintOrRealExpr,
): Promise<FancyEvaluatorOutput> => {
  const free_sentence_vars = free_variables_in_constraint_or_real_expr(c_or_re, new LetterSet(), new LetterSet([...tt.letters()]))
  const free_real_vars = free_real_variables_in_constraint_or_real_expr(c_or_re, new Set<string>())
  for (const declared of tt.variables.real) {
    free_real_vars.delete(declared)
  }

  if (!free_sentence_vars.is_empty() || free_real_vars.size > 0) {
    return { tag: 'undeclared-vars', variables: { sentence: [...free_sentence_vars], real: [...free_real_vars] } }
  }

  const translated_c_or_re = translate_constraint_or_real_expr_cooper(tt, c_or_re)
  const index_to_eliminate = tt.n_states() - 1

  if (c_or_re.tag === 'constraint') {
    const translated = translate_constraint_cooper(tt, c_or_re.constraint)
    const guarded = guard_div0_conditions_in_constraint(translated)
    const [_, eliminated] = eliminate_state_variable_index_in_constraint_or_real_expr(
      tt.n_states(), index_to_eliminate, { tag: 'constraint', constraint: guarded },
    )
    if (eliminated.tag !== 'constraint') throw new Error('Expected constraint after elimination')
    const result = model.eval(constraint_to_bool(ctx, model, eliminated.constraint), true)
    return { tag: 'bool-result', result: result.sexpr() === 'true' }
  }

  for (const div0_constraint of div0_conditions_in_constraint_or_real_expr(translated_c_or_re)) {
    const [_, eliminated_div0] = eliminate_state_variable_index_in_constraint_or_real_expr(
      tt.n_states(),
      index_to_eliminate,
      { tag: 'constraint', constraint: div0_constraint },
    )
    if (eliminated_div0.tag !== 'constraint') throw new Error('Expected constraint after elimination')
    const z3_expr = constraint_to_bool(ctx, model, eliminated_div0.constraint)
    const result = model.eval(z3_expr, true)
    if (result.sexpr() === 'false') return { tag: 'div0' }
  }

  const [_, eliminated] = eliminate_state_variable_index_in_constraint_or_real_expr(
    tt.n_states(),
    index_to_eliminate,
    translated_c_or_re,
  )
  if (eliminated.tag !== 'real_expr') throw new Error('Expected real expression after elimination')
  const z3_expr = real_expr_to_arith(ctx, model, eliminated.real_expr)
  const output = await expr_to_assignment(ctx, model, z3_expr)
  return { tag: 'result', result: output }
}

type Pr3SolverOptions = {
  regular: boolean
  timeout_ms: number
  abort_signal?: AbortSignal
  cancel_fallback?: () => Promise<undefined>
  onTranslated?: (translated: Constraint[]) => void
}

const DEFAULT_PR3_SOLVER_OPTIONS: Pr3SolverOptions = {
  regular: false,
  timeout_ms: 30_000,
  abort_signal: undefined,
}

export type Pr3SATResult = PrSATResult & { method: 'pr3', semantics: 'trivalent-ers' }

export const pr3_sat_wrapped = async (
  solver: WrappedSolver,
  tt: TruthTable,
  constraints: Constraint[],
  options?: Partial<Pr3SolverOptions>,
): Promise<Pr3SATResult> => {
  const { regular, timeout_ms, abort_signal, cancel_fallback, onTranslated } = { ...DEFAULT_PR3_SOLVER_OPTIONS, ...(options ?? {}) }

  const translated = translate_constraints_cooper(tt, constraints)
  onTranslated?.(translated)
  const index_to_eliminate = tt.n_states() - 1
  const enriched_constraints = enrich_constraints(tt, index_to_eliminate, regular, translated)
  const [redef, elim_constraints] = eliminate_state_variable_index(tt.n_states(), index_to_eliminate, enriched_constraints)

  const smtlib_lines = constraints_to_smtlib_lines(tt, index_to_eliminate, elim_constraints)
  const smtlib_string = smtlib_lines.map((s) => s_to_string(s, false)).join('\n')
  const result = await solver.solve_with_evaluator(
    smtlib_string,
    timeout_ms,
    (ctx, model) => async (evt_tt: TruthTable, c_or_re: ConstraintOrRealExpr): Promise<FancyEvaluatorOutput> =>
      await fancy_evaluate_constraint_or_real_expr_cooper(ctx, model, evt_tt, c_or_re),
    abort_signal,
    cancel_fallback,
  )

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
      method: 'pr3',
      semantics: 'trivalent-ers',
      constraints: output_constraints,
      smtlib_input: smtlib_string + `\n(define-fun ${`s_${index_to_eliminate}`} () Real ${s_to_string(real_expr_to_smtlib(redef), false)})\n(check-sat)\n(get-model)`,
      solver_output: {
        ...result,
        state_assignments: { ...result.state_assignments, [index_to_eliminate]: elim_var_value.result },
      },
    }
  }

  return {
    method: 'pr3',
    semantics: 'trivalent-ers',
    constraints: output_constraints,
    smtlib_input: smtlib_string + `\n(check-sat)`,
    solver_output: result,
  }
}
