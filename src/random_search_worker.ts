// Web Worker entry point for the Random Search solver.
//
// All Random Search computation (translation, equation elimination, Gröbner,
// Maple-bridge branch search, Nelder-Mead, exact verification) runs here, off
// the main thread — so no constraint system can ever freeze the page, and
// Cancel is a clean worker.terminate() from the UI side.
//
// Protocol (postMessage):
//   in:  { constraints, variables, options }   (plain data; no callbacks)
//   out: { tag: 'translated', translated }     (forwarded to onTranslated)
//        { tag: 'done', result }               (RandomPrSATResult minus the
//                                               non-cloneable `evaluate`; the
//                                               main thread rebuilds it from
//                                               result.rational_model)
//        { tag: 'error', message }

import { random_pr_sat_wrapped, RandomSearchOptions } from './random_search'
import { TruthTable, VariableLists } from './pr_sat'
import { PrSat } from './types'

type Constraint = PrSat['Constraint']

type WorkerRequest = {
  constraints: Constraint[]
  variables: VariableLists
  options: Partial<Omit<RandomSearchOptions, 'abort_signal' | 'onTranslated'>>
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { constraints, variables, options } = event.data
  try {
    const tt = new TruthTable(variables)
    const result = await random_pr_sat_wrapped(tt, constraints, {
      ...options,
      onTranslated: (translated) => {
        self.postMessage({ tag: 'translated', translated })
      },
    })
    // `evaluate` is a closure — strip it; everything else is plain data.
    const { solver_output, ...rest } = result
    const cloneable_output =
      solver_output.status === 'sat'
        ? { status: 'sat' as const, state_assignments: solver_output.state_assignments }
        : solver_output
    self.postMessage({ tag: 'done', result: { ...rest, solver_output: cloneable_output } })
  } catch (e: any) {
    self.postMessage({ tag: 'error', message: String(e?.message ?? e) })
  }
}
