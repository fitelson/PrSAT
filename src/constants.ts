export const DEFAULT_DEBOUNCE_MS = 150
export const CONSTRAINT_INPUT_PLACEHOLDER = 'Enter constraint'
export const BATCH_CONSTRAINT_INPUT_PLACEHOLDER = 'Enter constraints separated by newlines'
export const EVALUATOR_INPUT_PLACEHOLDER = 'Enter expression'
export const BATCH_EVALUATOR_INPUT_PLACEHOLDER = 'Enter expressions separated by newlines'
export const INFO_MESSAGE_EMPTY = 'ⓘ How?'
export const INFO_MESSAGE_ERROR = 'ⓘ Error!'
export const INFO_MESSAGE_OKAY = 'ⓘ'
export const FIND_MODEL_BUTTON_LABEL = 'Find Model'
export const CANCEL_BUTTON_LABEL = 'Cancel'
export const DEFAULT_MULTI_INPUT_MODE: 'Batch' | 'Multi' = 'Multi'
export const CONSTRAINT_INPUT_INSTRUCTIONS = `
To insert a [Constraint], type in one of:
- '[RealExpr] = [RealExpr]' for equality,
- '[RealExpr] ≠ [RealExpr]' or '[RealExpr] != [RealExpr]' for disequality,
- '[RealExpr] < [RealExpr]' for less than,
- '[RealExpr] > [RealExpr]' for greater than,
- '[RealExpr] ≤ [RealExpr]' or '[RealExpr] <= [RealExpr] for less than or equal to,'
- '[RealExpr] ≥ [RealExpr]' or '[RealExpr] >= [RealExpr] for greater than or equal to,'
- '~[Constraint]', '![Constraint]', or '-[Constraint]' for negation,
- '[Constraint] ∨ [Constraint]', '[Constraint] \\/ [Constraint]', or '[Constraint] v [Constraint]' for disjunction,
- '[Constraint] & [Constraint]' for conjunction,
- '[Constraint] → [Constraint]', '[Constraint] -> [Constraint]', or '[Constraint] > [Constraint]' for biconditional,
- '[Constraint] ↔ [Constraint]', '[Constraint] <-> [Constraint]', or '[Constraint] <> [Constraint]' for biconditional.

To insert a [RealExpr], type in one of:
- Any number (integer or decimal),
- 'Pr([Sentence])' for probability,
- 'Pr([Sentence] | [Sentence])' for conditional probability,
- '-[RealExpr]' for negatives,
- '[RealExpr] + [RealExpr]' for addition,
- '[RealExpr] - [RealExpr]' for subtraction,
- '[RealExpr] * [RealExpr]' for multiplication,
- '[RealExpr] / [RealExpr]' for division,
- '[RealExpr]^[RealExpr]' for exponentiation.

To insert a [Sentence], type in one of:
- '⊤' or 'true' for truth (hint: the ⊤ is read as 'top', not 'tee'),
- '⊥' or 'false' for falsity,
- Any upper-case letter for propositional variable, optionally followed by an integer > 0,
- '~[Sentence]', '![Sentence]', or '-[Sentence]' for negation,
- '[Sentence] ∨ [Sentence]', '[Sentence] \\/ [Sentence]', or '[Sentence] v [Sentence]' for disjunction,
- '[Sentence] & [Sentence]' for conjunction,
- '[Sentence] → [Sentence]', '[Sentence] -> [Sentence]', or '[Sentence] > [Sentence]' for biconditional,
- '[Sentence] ↔ [Sentence]', '[Sentence] <-> [Sentence]', or '[Sentence] <> [Sentence]' for biconditional.
`.trim()
export const CONSTRAINT_OR_REAL_EXPR_INPUT_INSTRUCTIONS = `
You can either insert a Constraint or a Real Expression.

${CONSTRAINT_INPUT_INSTRUCTIONS}
`.trim()

export const SAT = 'Constraints are SATisfiable!'
export const UNSAT = 'Constraints are UNSATisfiable!'
export const UNKNOWN = 'Unable to determine if constraints are satisfiable'
export const CANCELLED = 'Solve was cancelled'
export const SEARCH = 'Searching for model satisfying constraints...'
export const CANCELLING = 'Cancelling...'

export const DIV0 = 'Division by zero!'
export const NO_MODEL = 'No model to evaluate!'

export const CANCEL_OVERRIDE_TIMEOUT_MS = 5 * 1000
export const DEFAULT_SOLVE_TIMEOUT_MS = 1 * 1000 * 60

