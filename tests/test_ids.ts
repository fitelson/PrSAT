import { readonly } from "../src/utils"

export type TestIdGenerator = { prefix: string, gen: () => string, get: (index: number) => string }

const test_id_generator = (prefix: string): TestIdGenerator => {
  let current = 0
  return {
    prefix,
    gen: () => `${prefix}-${current++}`,
    get: (index: number) => `${prefix}-${index}`,
  }
}

export const z3_status = 'z3-status'
// export const single_input = test_id_generator('single-input')
export const find_model = 'find-model'
export const regular_toggle = 'regular-toggle'
export const model_table = 'model-table'

// export const single_input = readonly({
//   constraint: test_id_generator('single-input-constraint'),
//   eval: test_id_generator('single-input-eval'),
//   close: 'close',
//   input: 'input',
//   newline: 'newline',
// })

export const mode_select_id = 'mode-select'
export const mode_select_button = (prefix: string, option: string): string => `${prefix}-${mode_select_id}-${option}`

export const state_row = readonly({
  state: (index: number) => `state-a${index}`,
  value: (index: number) => `state-value-${index}`,
})

export type GenericMultiInputTestIds = {
  id: string
  // multi: Readonly<{
  //   id: string
  // }>
  toggle: string
  batch: Readonly<{
    id: string
    textbox: string
    parse: string
  }>
  split: Readonly<{
    single: TestIdGenerator
    close: string
    input: string
    newline: string
    output: string
  }>
}

export const generic_multi_input = (prefix: 'constraints' | 'eval'): GenericMultiInputTestIds => {
  const id = prefix
  return {
    id,
    // multi: readonly({
    //   mode: `${id}-mode-multi`,
    //   id: `${id}-multi-parent`,
    // }),
    toggle: `${id}-batch-toggle`,
    batch: readonly({
      id: `${id}-batch-parent`,
      textbox: `${id}-batch-textbox`,
      parse: `${id}-batch-parse`,
    }),
    split: readonly({
      single: test_id_generator(`${id}-single`),
      close: `${id}-close`,
      input: `${id}-input`,
      newline: `${id}-newline`,
      output: `${id}-output`,
    }),
  }
}

export const exception_id = 'exception'
export const state_display_id = 'state-display'
export const batch_input = readonly({
  id: 'batch-input',
  parse_button: 'batch-input-parse',
  toggle_button: 'batch-input-toggle',
})

export const cancel_id = 'cancel'

export const timeout = readonly({
  id: 'timeout',
  seconds: 'timeout-seconds',
})
