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
  constraint_to_bool,
  expr_to_assignment,
  FancyEvaluatorOutput,
  PrSATResult,
  real_expr_to_arith,
  WrappedSolver,
} from './z3_integration'
import { Context, Model } from 'z3-solver'
import {
  translate_constraint_or_real_expr_letk,
  translate_constraints_letk,
} from './letk'

type Constraint = PrSat['Constraint']

export const fancy_evaluate_constraint_or_real_expr_letk = async <CtxKey extends string>(
  ctx: Context<CtxKey>,
  model: Model<CtxKey>,
  table: TruthTable,
  input: ConstraintOrRealExpr,
): Promise<FancyEvaluatorOutput> => {
  const free_sentence_vars = free_variables_in_constraint_or_real_expr(input, new LetterSet(), new LetterSet([...table.letters()]))
  const free_real_vars = free_real_variables_in_constraint_or_real_expr(input, new Set<string>())
  for (const declared of table.variables.real) free_real_vars.delete(declared)
  if (!free_sentence_vars.is_empty() || free_real_vars.size > 0) {
    return { tag: 'undeclared-vars', variables: { sentence: [...free_sentence_vars], real: [...free_real_vars] } }
  }

  const translated_input = translate_constraint_or_real_expr_letk(table, input)
  const index_to_eliminate = table.n_states() - 1

  if (translated_input.tag === 'constraint') {
    const guarded = guard_div0_conditions_in_constraint(translated_input.constraint)
    const [, eliminated] = eliminate_state_variable_index_in_constraint_or_real_expr(
      table.n_states(), index_to_eliminate, { tag: 'constraint', constraint: guarded },
    )
    if (eliminated.tag !== 'constraint') throw new Error('Expected LET_K+ constraint after elimination')
    return { tag: 'bool-result', result: model.eval(constraint_to_bool(ctx, model, eliminated.constraint), true).sexpr() === 'true' }
  }

  for (const div0_constraint of div0_conditions_in_constraint_or_real_expr(translated_input)) {
    const [, eliminated] = eliminate_state_variable_index_in_constraint_or_real_expr(
      table.n_states(), index_to_eliminate, { tag: 'constraint', constraint: div0_constraint },
    )
    if (eliminated.tag !== 'constraint') throw new Error('Expected LET_K+ division guard after elimination')
    if (model.eval(constraint_to_bool(ctx, model, eliminated.constraint), true).sexpr() === 'false') return { tag: 'div0' }
  }

  const [, eliminated] = eliminate_state_variable_index_in_constraint_or_real_expr(
    table.n_states(), index_to_eliminate, translated_input,
  )
  if (eliminated.tag !== 'real_expr') throw new Error('Expected LET_K+ real expression after elimination')
  return { tag: 'result', result: await expr_to_assignment(ctx, model, real_expr_to_arith(ctx, model, eliminated.real_expr)) }
}

type LETKSolverOptions = {
  regular: boolean
  timeout_ms: number
  abort_signal?: AbortSignal
  cancel_fallback?: () => Promise<undefined>
  onTranslated?: (translated: Constraint[]) => void
}

const DEFAULT_OPTIONS: LETKSolverOptions = {
  regular: false,
  timeout_ms: 30_000,
}

export type LETKSATResult = PrSATResult & { method: 'twist'; semantics: 'twist-letk' }

export const letk_sat_wrapped = async (
  solver: WrappedSolver,
  table: TruthTable,
  constraints: Constraint[],
  options?: Partial<LETKSolverOptions>,
): Promise<LETKSATResult> => {
  const { regular, timeout_ms, abort_signal, cancel_fallback, onTranslated } = { ...DEFAULT_OPTIONS, ...(options ?? {}) }
  const translated = translate_constraints_letk(table, constraints)
  onTranslated?.(translated)
  const index_to_eliminate = table.n_states() - 1
  const enriched_constraints = enrich_constraints(table, index_to_eliminate, regular, translated)
  const [redefinition, eliminated_constraints] = eliminate_state_variable_index(
    table.n_states(), index_to_eliminate, enriched_constraints,
  )
  const smtlib_lines = constraints_to_smtlib_lines(table, index_to_eliminate, eliminated_constraints)
  const smtlib_string = smtlib_lines.map((line) => s_to_string(line, false)).join('\n')
  const result = await solver.solve_with_evaluator(
    smtlib_string,
    timeout_ms,
    (ctx, model) => async (event_table, input) =>
      await fancy_evaluate_constraint_or_real_expr_letk(ctx, model, event_table, input),
    abort_signal,
    cancel_fallback,
  )
  const output_constraints = {
    original: constraints,
    translated,
    extra: enriched_constraints,
    eliminated: eliminated_constraints,
  }

  if (result.status === 'sat') {
    const eliminated_value = await result.evaluate(table, { tag: 'real_expr', real_expr: redefinition })
    if (eliminated_value.tag !== 'result') throw new Error('Unable to calculate the eliminated LET_K+ state')
    return {
      method: 'twist',
      semantics: 'twist-letk',
      constraints: output_constraints,
      smtlib_input: smtlib_string + `\n(define-fun s_${index_to_eliminate} () Real ${s_to_string(real_expr_to_smtlib(redefinition), false)})\n(check-sat)\n(get-model)`,
      solver_output: {
        ...result,
        state_assignments: { ...result.state_assignments, [index_to_eliminate]: eliminated_value.result },
      },
    }
  }

  return {
    method: 'twist',
    semantics: 'twist-letk',
    constraints: output_constraints,
    smtlib_input: smtlib_string + '\n(check-sat)',
    solver_output: result,
  }
}
