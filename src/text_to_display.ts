import { Editable, rEditable } from './editable';
import { el, math_el, tel } from "./el";
import { assert, assert_exists, fallthrough, sleep } from "./utils";
import { parse_constraint, parse_constraint_or_real_expr } from "./parser";
import { constraint_to_string, letter_string, TruthTable, variables_in_constraints } from "./pr_sat";
import { FancyEvaluatorOutput, init_z3, ModelAssignmentOutput, pr_sat_wrapped, PrSATResult, WrappedSolver, WrappedSolverResult } from "./z3_integration";
import { s_to_string } from "./s";
import { ConstraintOrRealExpr, PrSat } from "./types";
import { InputBlockLogic } from "./display_logic";
import { constraint_to_html, real_expr_to_html, state_id } from "./prsat_to_html";
import { generic_input_block, split_input, SplitInput } from "./block_playground";

import * as TestId from '../tests/test_ids'
import * as Constants from './constants'

import './style.css'
import { download } from './download';
import * as htmlToImage from 'html-to-image';

const root = assert_exists(document.getElementById('app'), 'Root element with id \'#app\' doesn\'t exist!')

type Constraint = PrSat['Constraint']
// type RealExpr = PrSat['RealExpr']
// type Sentence = PrSat['Sentence']

// type SingleInputCallbacks<ParseOutput extends {}> = {
//   siblings: EditableDLL<SingleInput<ParseOutput>>
//   set_is_ready: (si: SingleInput<ParseOutput>, is_ready: boolean) => void
//   make_newline: (si: SingleInput<ParseOutput>) => void
//   remove: (si: SingleInput<ParseOutput>) => void
//   focus_first: () => void
//   focus_next: (si: SingleInput<ParseOutput>) => void
//   focus_prev: (si: SingleInput<ParseOutput>) => void
// }

// type SingleInput<ParseOutput extends {}> = {
//   full: HTMLElement
//   input: HTMLInputElement
//   watch_group: WatchGroup<unknown>
//   constraint: rEditable<ParseOutput | undefined | { error: string }>
//   set_text: (text: string) => void
// }

// const single_input_callbacks_after = <ParseOutput extends {}>(
//   test_id_gen: TestIdGenerator,
//   siblings: EditableDLL<SingleInput<ParseOutput>>,
//   placeholder: string,
//   input_instructions: string,
//   parser: (text: string) => Res<ParseOutput, string>,
//   display: (output: ParseOutput) => Element,
// ): [Editable<boolean>, SingleInputCallbacks<ParseOutput>] => {
//   const ready_set = new Set<SingleInput<ParseOutput>>()
//   const all_are_ready = new Editable(false)
//   const recheck_ready = () => {
//     if (ready_set.size === siblings.size()) {
//       all_are_ready.set(true)
//     } else if (all_are_ready.get() === true && ready_set.size < siblings.size()) {
//       all_are_ready.set(false)
//     }
//   }
//   const self: SingleInputCallbacks<ParseOutput> = {
//     siblings,
//     set_is_ready: (si, is_ready) => {
//       if (is_ready) {
//         ready_set.add(si)
//       } else {
//         ready_set.delete(si)
//       }
//       recheck_ready()
//     },
//     make_newline: (si: SingleInput<ParseOutput>) => {
//       const new_input = single_input(test_id_gen, placeholder, input_instructions, parser, display, self)
//       siblings.insert_after(si, new_input)
//       new_input.input.focus()
//       recheck_ready()
//     },
//     remove: (si: SingleInput<ParseOutput>) => {
//       if (siblings.size() === 1) {
//         // Don't do it!
//       } else {
//         const prev_sibling = siblings.get_previous(si)
//         if (prev_sibling !== undefined) {
//           prev_sibling?.input.focus()
//           prev_sibling?.input.setSelectionRange(0, 0)
//         } else {
//           const next_sibling = siblings.get_next(si)
//           next_sibling?.input.focus()
//           next_sibling?.input.setSelectionRange(0, 0)
//         }
//         siblings.remove(si)
//         si.watch_group.unwatch()
//         ready_set.delete(si)
//         recheck_ready()
//       }
//     },
//     focus_first: () => {
//       siblings.at(0)?.full.focus()
//     },
//     focus_next: (si: SingleInput<ParseOutput>) => {
//       const next_sibling = siblings.get_next(si)
//       next_sibling?.input.focus()
//     },
//     focus_prev: (si: SingleInput<ParseOutput>) => {
//       const prev_sibling = siblings.get_previous(si)
//       prev_sibling?.input.focus()
//     },
//   }
//   return [all_are_ready, self]
// }

// https://stackoverflow.com/questions/4827044/how-to-detect-mathml-tag-support-mfrac-mtable-from-javascript
const hasMathMLSupport = () => {
  const div = document.createElement("div");
  div.innerHTML = '<math><mfrac><mn>1</mn><mn>2</mn></mfrac></math>' +
                  '<math><mn>1</mn></math>';
  document.body.appendChild(div);
  const has_mathml = assert_exists(div.firstElementChild?.firstElementChild).getBoundingClientRect().height > assert_exists(div.lastElementChild?.firstElementChild).getBoundingClientRect().height + 1;
  div.remove()
  return has_mathml
}

// const single_input = <ParseOutput extends {}>(
//   test_id_gen: TestIdGenerator,
//   placeholder: string,
//   input_instructions: string,
//   parser: (text: string) => Res<ParseOutput, string>,
//   display: (output: ParseOutput) => Element,
//   callbacks: SingleInputCallbacks<ParseOutput>,
// ): SingleInput<ParseOutput> => {
//   const DEFAULT_INPUT_WIDTH = placeholder.length
//   const i = tel(TestId.single_input.input, 'input', { type: 'input', class: 'text', style: `width: ${DEFAULT_INPUT_WIDTH}ch`, placeholder }) as HTMLInputElement
//   const parse_error = new Editable<undefined | string>(undefined)
//   const watch_group = new WatchGroup([])
//   const constraint = new Editable<ParseOutput | undefined | { error: string }>(undefined)
//   const info_message = new Editable<string>(Constants.INFO_MESSAGE_EMPTY)
//   const info_button = el('input', { type: 'button', class: 'info' }) as HTMLButtonElement
//   const info_element = el('div', { class: 'input-instructions', style: 'white-space: pre-wrap; margin-top: 0.4em;' }, input_instructions)
//   const info_error_element = el('div', { class: 'error', style: 'white-space: pre-wrap; margin-top: 0.4em;' })
//   const info_container = el('div', { class: 'info-container' }, info_error_element, info_element)
//   // const empty_display = el('input', { type: 'button', value: 'ⓘ How can I insert constraints?' })
//   const constraint_display = el('div', { class: 'constraint' })
//   // const error_display = el('span', { style: 'color: red; font-style: italic;' }, 'error')
//   // const body = el('div', {}, i, constraint_display)

//   watch_group.add(info_message.watch((info_message) => {
//     info_button.value = info_message
//   })).call()

//   watch_group.add(constraint.watch((c) => {
//     constraint_display.innerHTML = ''
//     if (c === undefined) {
//       callbacks.set_is_ready(self, false)
//       info_message.set(Constants.INFO_MESSAGE_EMPTY)
//       info_button.classList.remove('error')
//       // constraint_display.appendChild(empty_display)
//     } else if ('error' in c) {
//       callbacks.set_is_ready(self, false)
//       info_message.set(Constants.INFO_MESSAGE_ERROR)
//       info_button.classList.add('error')
//       // constraint_display.appendChild(error_display)
//       // error_display.title = c.error
//     } else {
//       callbacks.set_is_ready(self, true)
//       constraint_display.appendChild(display(c))
//       info_message.set(Constants.INFO_MESSAGE_OKAY)
//       info_button.classList.remove('error')
//     }
//   }))

//   watch_group.add(parse_error.watch((pe) => {
//     if (pe === undefined) {
//       i.classList.remove('has-error')
//     } else {
//       i.classList.add('has-error')
//     }
//   }))

//   i.addEventListener('keydown', (event) => {
//     if (event.key === 'Enter') {
//       callbacks.make_newline(self)
//     } else if (event.key === 'ArrowUp') {
//       callbacks.focus_prev(self)
//     } else if (event.key === 'ArrowDown') {
//       callbacks.focus_next(self)
//     } else if (event.key === 'Backspace') {
//       if (i.value.length === 0) {
//         callbacks.remove(self)
//       }
//     }
//   })

//   i.addEventListener('input', () => {
//     if (i.value.length > DEFAULT_INPUT_WIDTH) {
//       i.style.width = `${i.value.length * 1}ch`
//     } else {
//       i.style.width = `${DEFAULT_INPUT_WIDTH}ch`
//     }
//   })

//   i.addEventListener('input', debounce(Constants.DEFAULT_DEBOUNCE_MS, {
//     lead: () => {
//       constraint_display.classList.add('updating')
//     },
//     trail: () => {
//       console.log('INPUT EVENT')
//       constraint_display.classList.remove('updating')
//       if (i.value.length === 0) {
//         parse_error.set(undefined)
//         constraint.set(undefined)
//         return
//       }

//       const [status, parsed] = parser(i.value)
//       if (!status) {
//         constraint.set({ error: parsed })
//         parse_error.set(parsed)
//       } else {
//         constraint.set(parsed)
//         parse_error.set(undefined)
//       }
//     },
//   }))

//   i.addEventListener('focus', () => {
//     e.classList.add('focused')
//   })

//   i.addEventListener('blur', () => {
//     e.classList.remove('focused')
//   })

//   const close_button = tel(TestId.single_input.close, 'input', { type: 'button', value: '⌫', class: 'close' })
//   close_button.addEventListener('click', () => {
//     callbacks.remove(self)
//   })

//   const newline_button = tel(TestId.single_input.newline, 'input', { type: 'button', value: '⏎', class: 'newline' })
//   newline_button.addEventListener('click', () => {
//     callbacks.make_newline(self)
//   })

//   const e = tel(test_id_gen.gen(), 'div', { class: 'single-input' },
//     el('div', { style: 'display: flex;' },
//       el('div', { style: 'display: flex;' },
//           close_button,
//           i,
//           newline_button,
//           info_button,
//       ),
//       constraint_display
//     ),
//     info_container,
//   )

//   e.addEventListener('click', () => {
//     i.focus()
//   })

//   const show_info = new Editable(false)
//   info_button.onclick = () => {
//     show_info.set(!show_info.get())
//   }

//   parse_error.watch((error) => {
//     if (error === undefined) {
//       info_error_element.style.display = 'none'
//     } else {
//       info_error_element.style.display = 'block'
//       info_error_element.innerHTML = ''
//       info_error_element.append(`Error: ${error}`)
//     }
//   })

//   show_info.watch((show_info) => {
//     if (show_info) {
//       info_container.style.display = 'block'
//     } else {
//       info_container.style.display = 'none'
//     }
//   }).call()

//   const set_text = (text: string) => {
//     const input_event = new InputEvent('input', {
//       bubbles: true,
//       cancelable: true,
//       inputType: 'insertText',
//       data: text,
//     })
//     i.value = text
//     i.dispatchEvent(input_event)
//   }

//   const self: SingleInput<ParseOutput> = { full: e, input: i, constraint, watch_group, set_text }
//   return self
// }

// type MultiInput<ParseOutput extends {}> = {
//   element: HTMLElement
//   all_constraints: rEditable<ParseOutput[] | undefined>
//   get_fields: () => string[]
//   set_fields: (fields: string[]) => void
//   refresh: () => void
// }

// const multi_input = <ParseOutput extends {}>(
//   test_ids: TestId.GenericMultiInputTestIds['multi'],
//   test_id_gen: TestIdGenerator,
//   input_placeholder: string,
//   input_instructions: string,
//   parser: (text: string) => Res<ParseOutput, string>,
//   display: (output: ParseOutput) => Element,
//   block_logic: InputBlockLogic<ParseOutput>,
// ): MultiInput<ParseOutput> => {
//   const children = new EditableDLL<SingleInput<ParseOutput>>([])
//   const [all_are_ready, callbacks] = single_input_callbacks_after(test_id_gen, children, input_placeholder, input_instructions, parser, display)
//   const first = single_input(test_id_gen, input_placeholder, input_instructions, parser, display, callbacks)
//   const all_constraints = new Editable<ParseOutput[] | undefined>(undefined)
//   children.insert_after(undefined, first)

//   const parent = tel(test_ids.id, 'div', { class: 'multi-input' })

//   children.watch_insert((to_insert, lead_sibling) => {
//     if (lead_sibling === undefined) {
//       parent.insertAdjacentElement('afterbegin', to_insert.full)
//     } else {
//       lead_sibling.full.insertAdjacentElement('afterend', to_insert.full)
//     }
//   }).call()

//   children.watch_remove((to_remove) => {
//     if (children.size() === 1) {
//       throw new Error('Trying to remove the last element of a list!')
//     } else {
//       to_remove.full.remove()
//     }
//   })

//   all_are_ready.watch((all_are_ready) => {
//     console.log('all-are-ready-is-called!')
//     if (all_are_ready) {
//       console.log('all-are-ready')
//       const all_constraints_array: ParseOutput[] = []
//       for (const si of children) {
//         const constraint = si.constraint.get()
//         if (constraint === undefined || 'error' in constraint) {
//           throw new Error('multi_input.all_are_ready === true but there\'s a constraint that\'s not ready!')
//         }
//         all_constraints_array.push(constraint)
//       }
//       all_constraints.set(all_constraints_array)
//     } else {
//       console.log('all-are-not-ready')
//       all_constraints.set(undefined)
//     }
//   })

//   const get_fields = (): string[] => {
//     const fields: string[] = []
//     for (const child of children) {
//       const f = child.input.value
//       fields.push(f)
//     }
//     return fields
//   }

//   const set_fields = (fields: string[]) => {
//     if (fields.length <= children.size()) {
//       for (const [index, child] of children.entries()) {
//         if (index < fields.length) {
//           const f = assert_exists(fields[index], 'fields[index] is undefined!')
//           child.set_text(f)
//         } else {
//           if (child === first) {
//             child.set_text('')
//           } else {
//             children.remove(child)
//           }
//         }
//       }
//     } else if (fields.length > children.size()) {
//       let last_child: SingleInput<ParseOutput> | undefined = undefined
//       for (const [index, child] of children.entries()) {
//         console.log(child.full)
//         const f = assert_exists(fields[index], 'fields[index] is undefined!')
//         child.set_text(f)
//         last_child = child
//       }

//       for (let beyond_index = children.size(); beyond_index < fields.length; beyond_index++) {
//         const f = assert_exists(fields[beyond_index], 'fields[beyond_index] is undefined!')
//         const new_child = single_input(test_id_gen, input_placeholder, input_instructions, parser, display, callbacks)
//         console.log(new_child.full)
//         new_child.set_text(f)
//         children.insert_after(last_child, new_child)
//         last_child = new_child
//       }
//     }
//   }

//   const refresh = () => {
//     for (const child of children) {
//       child.set_text(child.input.value)
//     }
//   }

//   return { element: parent, all_constraints, set_fields, get_fields, refresh }
// }

// const update_constraints_view = <ParseOutput extends {}>(
//   view: HTMLElement,
//   parsed_lines: Res<ParseOutput, string>[],
//   display: (output: ParseOutput) => Element,
// ): void => {
//   view.innerHTML = ''
//   for (const [status, constraint] of parsed_lines) {
//     if (status) {
//       const constraint_view = display(constraint)
//       view.appendChild(el('div', {}, constraint_view))
//     } else {
//       const error_view = el('span', { class: 'error' }, 'Error!')
//       view.appendChild(el('div', {}, error_view))
//     }
//   }
// }

// const batch_input = <ParseOutput extends {}>(
//   test_ids: TestId.GenericMultiInputTestIds['batch'],
//   input_placeholder: string,
//   input_instructions: string,
//   parser: (text: string) => Res<ParseOutput, string>,
//   display: (output: ParseOutput) => Element,
//   block_logic: InputBlockLogic<ParseOutput>,
// ): MultiInput<ParseOutput> => {
//   const PARSE_BUTTON_EMPTY = 'Nothing to parse'  // in_sync = true, contains_error = false
//   const PARSE_BUTTON_ERROR = 'Fix error before reparsing!'  // contains_error = true
//   const PARSE_BUTTON_OUT_OF_SYNC = 'Parse'  // in_sync = false
//   const PARSE_BUTTON_IN_SYNC = 'Up to date!'

//   const in_sync = new Editable(false)
//   const contains_error = new Editable(false)
//   const info_toggle = new Editable(false)

//   const info_button = el('input', {type: 'button', value: 'Show input instructions' }) as HTMLButtonElement
//   const info_container = el('div', { style: 'white-space: pre-wrap; margin-bottom: 0.4em;' },
//     `Insert a list of [Constraint]s separated by a newline.\n\n${input_instructions}`)
//   const file_loader = el('input', { type: 'file', value: 'Load input', title: ' ' }) as HTMLInputElement
//   const pre_button_line = el('div', { class: 'button-line', style: 'margin-bottom: 0.4em;' }, file_loader, info_button)
//   const parse_button = el('input', { type: 'button', value: '', class: 'button' }) as HTMLButtonElement
//   const save_button = el('input', { type: 'button', value: 'Save input', class: 'button' }) as HTMLButtonElement
//   const button_line = el('div', { class: 'button-line' }, parse_button, save_button)
//   const textbox = tel(test_ids.textbox, 'textarea', { placeholder: input_placeholder, style: 'display: block; border-radius: 0.4em;', rows: '10', cols: '50' }) as HTMLTextAreaElement
//   const constraints_view = el('div', { style: 'margin-top: 0.4em;' })
//   const all_constraints = new Editable<ParseOutput[] | undefined>(undefined)

//   const set_state = (in_sync: boolean, contains_error: boolean): void => {
//     parse_button.disabled = textbox.value === '' || in_sync
//     save_button.disabled = textbox.value === ''

//     if (textbox.value === '') {
//       parse_button.value = PARSE_BUTTON_EMPTY
//     } else if (in_sync && contains_error) {
//       parse_button.value = PARSE_BUTTON_ERROR
//     } else if (in_sync && !contains_error) {
//       parse_button.value = PARSE_BUTTON_IN_SYNC
//     } else if (!in_sync && contains_error) {
//       parse_button.value = PARSE_BUTTON_OUT_OF_SYNC
//     } else if (!in_sync && !contains_error) {
//       parse_button.value = PARSE_BUTTON_OUT_OF_SYNC
//     }

//     if (contains_error) {
//       textbox.classList.add('has-error')
//     } else {
//       textbox.classList.remove('has-error')
//     }
//   }

//   in_sync.watch((in_sync) => set_state(in_sync, contains_error.get()))
//   contains_error.watch((contains_error) => set_state(in_sync.get(), contains_error)).call()

//   info_toggle.watch((info_toggle) => {
//     if (info_toggle) {
//       info_container.style.display = 'block'
//     } else {
//       info_container.style.display = 'none'
//     }
//   }).call()

//   info_button.onclick = () => {
//     info_toggle.set(!info_toggle.get())
//   }

//   textbox.addEventListener('input', () => {
//     in_sync.set(false)
//   })

//   const parse = (): void => {
//     const textbox_value = textbox.value.trim()
//     if (textbox_value === '') {
//       return
//     }

//     const lines = textbox_value.split('\n')
//     const parsed_lines = lines.map(parser)
//     const good_lines: ParseOutput[] = []

//     for (const [status, constraint] of parsed_lines) {
//       if (status) {
//         good_lines.push(constraint)
//       }
//     }

//     if (good_lines.length === parsed_lines.length) {
//       // No bad lines let's go!
//       all_constraints.set(good_lines)
//       contains_error.set(false)
//     } else {
//       all_constraints.set(undefined)
//       contains_error.set(true)
//     }

//     update_constraints_view(constraints_view, parsed_lines, display)
//     in_sync.set(true)
//   }

//   parse_button.onclick = () => {
//     parse()
//   }

//   save_button.onclick = () => {
//     download(textbox.value, 'constraints.txt', 'text/plain')
//   }

//   file_loader.onchange = async () => {
//     const files = assert_exists(file_loader.files, 'file_loader.files is null!')
//     assert(files.length === 1, `Number of files in file_loader != 1!\nactually: ${files.length}`)
//     const f = assert_exists(files[0], 'files[0] is null!')
//     textbox.value = await f.text()
//     parse()
//   }

//   const get_fields = (): string[] => {
//     const lines = textbox.value.split('\n')
//     return lines
//   }

//   const set_fields = (fields: string[]) => {
//     const text = fields.join('\n')
//     const input_event = new InputEvent('input', {
//       bubbles: true,
//       cancelable: true,
//       inputType: 'insertText',
//       data: text,
//     })
//     textbox.value = fields.join('\n')
//     textbox.dispatchEvent(input_event)
//     parse()
//   }

//   const refresh = () => {
//     parse()
//   }

//   const element = tel(test_ids.id, 'div', { class: 'common-element batch-input' },
//     pre_button_line,
//     info_container,
//     textbox,
//     button_line,
//     constraints_view)
//   return { element, all_constraints, get_fields, set_fields, refresh }
// }

const display_polynomial_coefficient = (c: number): Node => {
  if (c < 0) {
    return math_el('mrow', {}, math_el('mo', {}, '-'), math_el('mi', {}, (-c).toString()))
  } else {
    return math_el('mi', {}, c.toString())
  }
}

const display_polynomial_term = (c: number, degree: number): Node => {
  assert(c !== 0, 'coefficient === zero so it shouldn\'t be displayed!')
  const dc = display_polynomial_coefficient
  if (degree === 0) {
    return dc(c)
  } else if (degree === 1) {
    const x = math_el('mi', {}, 'x')
    if (c === 1) {
      return x
    } else if (c === -1) {
      return math_el('mrow', {}, math_el('mo', {}, '-'), x)
    } else {
      const m = math_el('mo', {}, '*')
      return math_el('mrow', {}, dc(c), m, x)
    }
  } else {
    // degree ≥ 2.
    const x = math_el('msup', {}, math_el('mi', {}, 'x'), dc(degree))
    if (c === 1) {
      return x
    } else if (c === -1) {
      return math_el('mrow', {}, math_el('mo', {}, '-'), x)
    } else {
      const m = math_el('mo', {}, '*')
      return math_el('mrow', {}, dc(c), m, x)
    }
  }
}

const display_polynomial = (coefficients: number[]): Node => {
  const cs = coefficients
  const final_node = math_el('mrow', {})
  for (const [index, c] of cs.entries()) {
    const degree = cs.length - index - 1
    if (c === 0) {
      continue
    }

    const term = display_polynomial_term(c, degree)
    final_node.appendChild(term)

    if (index !== cs.length - 1) {
      const p = math_el('mo', {}, '+')
      final_node.appendChild(p)
    }
  }
  return final_node
}

// Helper functions for simplifying quadratic roots
const gcd = (a: number, b: number): number => {
  a = Math.abs(a)
  b = Math.abs(b)
  while (b !== 0) {
    const t = b
    b = a % b
    a = t
  }
  return a
}

const gcd3 = (a: number, b: number, c: number): number => gcd(gcd(a, b), c)

// Extract largest perfect square factor: returns [k, m] where n = k² * m and m is square-free
const extractPerfectSquare = (n: number): [number, number] => {
  if (n <= 0) return [0, 0]
  let k = 1
  let m = n
  for (let i = 2; i * i <= m; i++) {
    while (m % (i * i) === 0) {
      k *= i
      m /= (i * i)
    }
  }
  return [k, m]
}

type SimplifiedQuadratic = {
  // Represents (numeratorConstant + numeratorSqrtCoeff * √squareFree) / denominator
  numeratorConstant: number
  numeratorSqrtCoeff: number
  squareFree: number
  denominator: number
  decimalValue: number
}

// Simplify (-b ± √(b² - 4ac)) / 2a
const simplifyQuadraticRoot = (a: number, b: number, c: number, index: number): SimplifiedQuadratic => {
  const discriminant = b * b - 4 * a * c
  if (discriminant < 0) {
    throw new Error('Negative discriminant - complex roots')
  }

  const [sqrtFactor, squareFree] = extractPerfectSquare(discriminant)
  // √discriminant = sqrtFactor * √squareFree

  // Root is (-b ± sqrtFactor * √squareFree) / (2a)
  const sign = index === 1 ? -1 : 1
  let numeratorConstant = -b
  let numeratorSqrtCoeff = sign * sqrtFactor
  let denominator = 2 * a

  // Handle negative denominator (keep it positive)
  if (denominator < 0) {
    numeratorConstant = -numeratorConstant
    numeratorSqrtCoeff = -numeratorSqrtCoeff
    denominator = -denominator
  }

  // Find GCD and simplify
  const g = gcd3(Math.abs(numeratorConstant), Math.abs(numeratorSqrtCoeff), denominator)
  numeratorConstant /= g
  numeratorSqrtCoeff /= g
  denominator /= g

  // Compute decimal value
  const decimalValue = (-b + sign * Math.sqrt(discriminant)) / (2 * a)

  return { numeratorConstant, numeratorSqrtCoeff, squareFree, denominator, decimalValue }
}

const model_assignment_display = (ma: ModelAssignmentOutput): Node => {
  const quad_root_to_display = (aCoeff: number, bCoeff: number, cCoeff: number, index: number): Node => {
    assert(index === 1 || index === 2, `Expected root-obj index to equal 1 or 2!\nactual: ${index}`)
    const { numeratorConstant, numeratorSqrtCoeff, squareFree, denominator, decimalValue } =
      simplifyQuadraticRoot(aCoeff, bCoeff, cCoeff, index)

    // Special case: discriminant is a perfect square (squareFree === 1) - result is rational
    if (squareFree === 1) {
      const rationalValue = (numeratorConstant + numeratorSqrtCoeff) / denominator
      if (Number.isInteger(rationalValue)) {
        return math_el('mn', {}, rationalValue.toString())
      }
      return math_el('mfrac', {},
        math_el('mn', {}, (numeratorConstant + numeratorSqrtCoeff).toString()),
        math_el('mn', {}, denominator.toString()))
    }

    // Build the sqrt part: √squareFree or coefficient * √squareFree
    const sqrtPart = math_el('msqrt', {}, math_el('mn', {}, squareFree.toString()))
    const absSqrtCoeff = Math.abs(numeratorSqrtCoeff)
    const sqrtTerm = absSqrtCoeff === 1
      ? sqrtPart
      : math_el('mrow', {}, math_el('mn', {}, absSqrtCoeff.toString()), sqrtPart)

    // Build numerator: constant ± sqrt term
    let numerator: Node
    if (numeratorConstant === 0) {
      // Just the sqrt term (possibly negated)
      numerator = numeratorSqrtCoeff < 0
        ? math_el('mrow', {}, math_el('mo', {}, '-'), sqrtTerm)
        : sqrtTerm
    } else {
      const constPart = math_el('mn', {}, numeratorConstant.toString())
      const op = math_el('mo', {}, numeratorSqrtCoeff < 0 ? '-' : '+')
      numerator = math_el('mrow', {}, constPart, op, sqrtTerm)
    }

    // Build the exact form (with or without denominator)
    let exactForm: Node
    if (denominator === 1) {
      exactForm = numerator
    } else {
      exactForm = math_el('mfrac', {}, numerator, math_el('mn', {}, denominator.toString()))
    }

    // Add decimal approximation
    const approx = math_el('mrow', {},
      math_el('mo', { style: 'padding-left: 0.3em' }, '≈'),
      math_el('mn', {}, decimalValue.toFixed(4)))

    return math_el('mrow', {}, exactForm, approx)
  }
  const sub = (ma: ModelAssignmentOutput): Node => {
    if (ma.tag === 'literal') {
      return math_el('mi', {}, ma.value.toString())
    } else if (ma.tag === 'negative') {
      return math_el('mrow', {}, math_el('mo', {}, '-'), sub(ma.inner))
    } else if (ma.tag === 'rational') {
      return math_el('mfrac', {}, sub(ma.numerator), sub(ma.denominator))
    } else if (ma.tag === 'root-obj') {
      // Legacy case - extract numeric values from ModelAssignmentOutput
      const extractValue = (m: ModelAssignmentOutput): number => {
        if (m.tag === 'literal') return m.value
        if (m.tag === 'negative' && m.inner.tag === 'literal') return -m.inner.value
        throw new Error('Cannot extract numeric value from complex ModelAssignmentOutput')
      }
      return quad_root_to_display(extractValue(ma.a), extractValue(ma.b), extractValue(ma.c), ma.index)
    } else if (ma.tag === 'unknown') {
      return math_el('mtext', {}, s_to_string(ma.s))
      // return math_el('mtext', {}, 'something!')
    } else if (ma.tag === 'generic-root-obj') {
      if (ma.degree === 2) {
        return quad_root_to_display(
          ma.coefficients[0],
          ma.coefficients[1],
          ma.coefficients[2],
          ma.index)
      }
      // return sub({ tag: 'unknown', s: ['root-obj', poly_s(ma.coefficients), ma.index.toString()] })
      // return math_el('mtext', {}, model_assignment_output_to_string(ma))
      return math_el('mrow', {}, math_el('mtext', {}, `Root #${ma.index} of `), math_el('mpadded', { lspace: '0.2em' }, display_polynomial(ma.coefficients)))
    } else {
      return fallthrough('model_assignment_to_display', ma)
    }
  }

  return math_el('math', {}, sub(ma))
}

// Should be the same as the model display, just without the final column.
const truth_table_display = (tt: TruthTable): HTMLElement => {
  // One column per sentence-letter
  // Header has the form "A1 | A2 | ... | An | a_i | Assignment"

  // const model_assignments = await model_to_assignments(ctx, z3_model)
  const body = el('tbody', {})
  const head_row = el('tr', {})
  const head = el('thead', {}, head_row)
  const letters = Array.from(tt.letters())
  letters.forEach((l, idx) => {
    const isLast = idx === letters.length - 1
    head_row.appendChild(el('th', isLast ? { class: 'dv' } : {}, letter_string(l)))
  })
  head_row.appendChild(el('th', {}, state_id('i')))

  for (const state_index of tt.state_indices()) {  // rows
    const row = el('tr', {})
    letters.forEach((l, idx) => {
      const isLast = idx === letters.length - 1
      const letter_value = tt.letter_value_from_index(l, state_index)
      const value_string = letter_value ? '⊤' : '⊥'
      row.appendChild(el('td', isLast ? { class: 'dv' } : {}, value_string))
    })
    row.appendChild(tel(TestId.state_row.state(state_index), 'td', {}, state_id(state_index)))
    body.appendChild(row)
  }
  const e = el('table', {},
    head,
    body)
  return e
}

const model_display = (tt: TruthTable, model_assignments: Record<number, ModelAssignmentOutput>): HTMLElement => {
  // One column per sentence-letter
  // Header has the form "A1 | A2 | ... | An | a_i | Assignment"

  const body = el('tbody', {})
  const head_row = el('tr', {})
  const head = el('thead', {}, head_row)
  const letters = Array.from(tt.letters())
  letters.forEach((l, idx) => {
    const isLast = idx === letters.length - 1
    head_row.appendChild(el('th', isLast ? { class: 'dv' } : {}, letter_string(l)))
  })
  head_row.appendChild(el('th', { class: 'dv' }, state_id('i')))
  head_row.appendChild(el('th', {}, 'Assignment'))

  for (const [i, ma] of Object.entries(model_assignments)) {  // rows
    const state_index = parseInt(i)
    const assignment_html = model_assignment_display(ma)
    const row = el('tr', {})
    letters.forEach((l, idx) => {
      const isLast = idx === letters.length - 1
      const letter_value = tt.letter_value_from_index(l, state_index)  // Scary parseInt!
      const value_string = letter_value ? '⊤' : '⊥'
      row.appendChild(el('td', isLast ? { class: 'dv' } : {}, value_string))
    })
    row.appendChild(tel(TestId.state_row.state(state_index), 'td', { class: 'dv' }, state_id(state_index)))
    row.appendChild(tel(TestId.state_row.value(state_index), 'td', {}, assignment_html))
    body.appendChild(row)
  }
  const e = tel(TestId.model_table, 'table', {},
    head,
    body)
  return e
}

// const simple_options_display = <const Options extends string[]>(test_id_prefix: string, options: Options, def: Options[NumericKeys<Options>]): { element: HTMLElement, options: Editable<Options[NumericKeys<Options>]> } => {
//   const element = tel(TestId.mode_select_id, 'div', {})
//   const opts = new Editable<Options[NumericKeys<Options>]>(def)
//   const options_map = new Map<Options[keyof Options], { element: HTMLButtonElement }>()

//   for (const o of options) {
//     const oe = tel(TestId.mode_select_button(test_id_prefix, o), 'input', { type: 'button', value: o, class: 'button' }, o) as HTMLButtonElement
//     options_map.set(o as any, { element: oe })
//     element.appendChild(oe)

//     oe.onclick = () => {
//       opts.set(o as any)
//     }
//   }

//   opts.watch((o) => {
//     for (const [other_o, { element: other_element }] of options_map.entries()) {
//       other_element.disabled = o === other_o
//     }
//   }).call()

//   return { element, options: opts }
// }

// type ModelFinderState =
//   | { tag: 'waiting' }
//   | { tag: 'looking', truth_table: TruthTable }
//   | { tag: 'sat', truth_table: TruthTable, model: Model, assignments: Record<number, ModelAssignmentOutput> }
//   | { tag: 'unsat', truth_table: TruthTable }
//   | { tag: 'unknown' }
//   | { tag: 'invalidated', last: { truth_table: TruthTable } }

type ModelFinderState2 =
  | { tag: 'waiting' }
  | { tag: 'looking', truth_table: TruthTable, abort_controller: AbortController }
  | { tag: 'finished', truth_table: TruthTable, solver_output: PrSATResult }
  // | { tag: 'invalidated', last: { truth_table: TruthTable } }
  | { tag: 'invalidated', last: ModelFinderState2 }
  | { tag: 'exception', message: string }

type ModelFinderDisplay = {
  element: HTMLElement
  state: rEditable<ModelFinderState2>
  // start_search: (ctx: Context, constraints: Constraint[], is_regular: boolean) => Promise<void>
  start_search_solver: (solver: WrappedSolver, constraints: Constraint[], is_regular: boolean) => Promise<void>
  invalidate: () => void
}

const display_constraint_or_real_expr = (e: ConstraintOrRealExpr, wrap_in_math_element: boolean): Element => {
  if (e.tag === 'constraint') {
    return constraint_to_html(e.constraint, wrap_in_math_element)
  } else {
    return real_expr_to_html(e.real_expr, wrap_in_math_element)
  }
}

// const evaluate_constraint_or_real_expr = (tt: TruthTable, state_values: Record<number, number>, e: ConstraintOrRealExpr): Res<boolean | number, EvaluationError> => {
//   if (e.tag === 'constraint') {
//     return evaluate_constraint_2(tt, state_values, e.constraint)
//   } else if (e.tag === 'real_expr') {
//     return evaluate_real_expr_2(tt, state_values, e.real_expr)
//   } else {
//     const check: Equiv<typeof e, never> = true
//     void check
//     throw new Error('evaluate_constraint_or_real_expr fallthrough')
//   }
// }

// const value_to_string = (value: boolean | number): string => {
//   if (typeof value === 'boolean') {
//     return value ? '⊤' : '⊥'
//   } else if (typeof value === 'number') {
//     return value.toString()
//   } else {
//     const check: Equiv<typeof value, never> = true
//     void check
//     throw new Error('value_to_string fallthrough')
//   }
// }

// const undeclared_variables_string = (vlists: VariableLists): string => {
//   let result = 'Undeclared variables: '
//   if (vlists.real.length === 0 && vlists.sentence.length === 0) {
//     return 'Undeclared variables!'
//   }

//   if (vlists.real.length > 0) {
//     result += vlists.real.join(', ')
//     if (vlists.sentence.length > 0) {
//       result += ', '
//     }
//   }
//   if (vlists.sentence.length > 0) {
//     result += vlists.sentence.map(sentence_to_string).join(', ')
//   }

//   return result
// }

// const constraint_to_real_expr_result_to_html = (e: Res<boolean | number, EvaluationError>): Element => {
//   const [status, value] = e
//   if (status) {
//     return math_el('mtext', {}, value_to_string(value))
//   } else if (value.tag === 'div0') {
//     return math_el('mtext', { class: 'error' }, 'Division by 0!')
//   } else if (value.tag === 'undeclared-vars') {
//     return math_el('mtext', { class: 'error' }, undeclared_variables_string(value.vars))
//   } else {
//     return fallthrough('constraint_to_real_expr_result_to_html', value)
//   }
// }

type ModelEvaluator = {
  element: HTMLElement
  // multi_input: MultiInput<ConstraintOrRealExpr>
  refresh: () => void
}

const fancy_evaluator_result_to_display = (output: FancyEvaluatorOutput): Node => {
  if (output.tag === 'result') {
    return model_assignment_display(output.result)
  } else if (output.tag === 'bool-result') {
    return math_el('mtext', {}, output.result ? '⊤' : '⊥')
  } else if (output.tag === 'undeclared-vars') {
    const fv_str = [...output.variables.real, ...output.variables.sentence].map((v) => {
      if (typeof v === 'string') {
        return v
      } else {
        return letter_string(v)
      }
    }).join(', ')
    return math_el('mtext', { class: 'error' }, `Undeclared variables: ${fv_str}`)
  } else if (output.tag === 'div0') {
    return math_el('mtext', { class: 'error' }, Constants.DIV0)
  } else {
    return fallthrough('fancy_evaluator_result_to_display', output)
  }
}

const model_evaluators = (
  // z3_state_box: Editable<Z3ContextState>,
  state_box: Editable<ModelFinderState2>,
  model_assignments: rEditable<{ truth_table: TruthTable, values: Record<number, ModelAssignmentOutput> } | undefined>,
): ModelEvaluator => {
  const display_constraint_or_real_expr_with_evaluation = async (e: ConstraintOrRealExpr): Promise<Element> => {
    const d = display_constraint_or_real_expr(e, false)
    const assignments = model_assignments.get()
    if (assignments === undefined) {
      return d
    } else {
      const state = state_box.get()
      const [tt, solve_result]: [TruthTable | undefined, WrappedSolverResult] =
        state.tag === 'finished' ? [state.truth_table, state.solver_output.solver_output]
        : state.tag === 'invalidated' && state.last.tag === 'finished' ? [state.last.truth_table, state.last.solver_output.solver_output]
        : [undefined, { status: 'unknown' }]
      if (solve_result.status !== 'sat' || tt === undefined) {
        const result_html = math_el('mtext', { class: 'error' }, Constants.NO_MODEL)
        return math_el('math', {},
          d,
          math_el('mo', { class: 'yields' }, '⟾'),
          result_html)
      }

      const result = await solve_result.evaluate(tt, e)

      // // Weird that we're evaluating in a display function but I don't care.
      // // const result = evaluate_constraint_or_real_expr(assignments.truth_table, assignments.values, e)
      // const z3_state = z3_state_box.get()
      // if (z3_state.tag !== 'ready') {
      //   throw new Error('Trying to evaluate model that isn\'t ready!')
      // }
      // // const result = await fancy_evaluate_constraint_or_real_expr(z3_state.ctx, assignments.solver, assignments.truth_table, e)  // Could throw!
      // const result = await fancy_evaluate_constraint_or_real_expr(z3_state.ctx, assignments.model, assignments.truth_table, e)  // Could throw!
      // const result_html = constraint_to_real_expr_result_to_html(result)
      const result_html = fancy_evaluator_result_to_display(result)
      return math_el('math', {},
        d,
        math_el('mo', { class: 'yields' }, '⟾'),
        result_html)
    }
  }

  // const mi = generic_multi_input(
  //   TestId.generic_multi_input('eval'),
  //   TestId.single_input.eval,
  //   Constants.EVALUATOR_INPUT_PLACEHOLDER,
  //   Constants.BATCH_EVALUATOR_INPUT_PLACEHOLDER,
  //   Constants.CONSTRAINT_OR_REAL_EXPR_INPUT_INSTRUCTIONS,
  //   parse_constraint_or_real_expr,
  //   display_constraint_or_real_expr_with_evaluation)
  const test_ids = TestId.generic_multi_input('eval')
  const eval_block = new InputBlockLogic<ConstraintOrRealExpr, SplitInput>(
    parse_constraint_or_real_expr,
    // (logic) => split_input(logic, display_constraint_or_real_expr_with_evaluation, Constants.EVALUATOR_INPUT_PLACEHOLDER, TestId.single_input.eval))
    (logic) => split_input(logic, display_constraint_or_real_expr_with_evaluation, Constants.EVALUATOR_INPUT_PLACEHOLDER, test_ids.split))
  const mi = generic_input_block(eval_block, Constants.BATCH_EVALUATOR_INPUT_PLACEHOLDER, test_ids)

  const refresh = async () => {
    for (const input of eval_block.get_inputs()) {
      await input.text.set(input.text.get())
    }
  }

  const element = el('div', { class: 'model-evaluators' },
    el('div', { style: 'margin-bottom: 0.4em;' }, 'Evaluate model'),
    mi.element,
  )
  return { element, refresh  }
}

const seconds_to_hms = (total_seconds: number): { h: number, m: number, s: number } => {
  const ts = Math.floor(total_seconds)

  let leftover = ts
  const h = Math.floor(leftover / 3600)
  leftover -= h * 3600
  const m = Math.floor(leftover / 60)
  leftover -= m * 60
  const s = leftover

  return { h, m, s }
}

const seconds_to_time_string = (total_seconds: number) => {
  const { h: hours, m: minutes, s: seconds } = seconds_to_hms(total_seconds)
  let split_str: string[] = []

  if (hours > 0) {
    split_str.push(`${hours}h`)
  }
  if (minutes > 0) {
    split_str.push(`${minutes}m`)
  }
  if (seconds > 0) {
    split_str.push(`${seconds}s`)
  }

  return split_str.join(', ')
}

const timeout = (timeout_ms: Editable<number>) => {
  const MIN_SECS = 1
  const MAX_SECS = 3600
  const default_secs = Math.round(timeout_ms.get() / 1000)

  const si = tel(TestId.timeout.seconds, 'input', { style: 'margin-right: 0.5ch; width: 5ch;', type: 'number', min: MIN_SECS.toString(), max: MAX_SECS.toString(), value: default_secs.toString() }) as HTMLInputElement

  const set_timeout_ms = () => {
    const s = parseInt(si.value)
    timeout_ms.set(s * 1000)
  }

  si.onchange = () => {
    const parsed = parseInt(si.value)
    const value = Math.max(MIN_SECS, Math.min(parsed, MAX_SECS))
    si.value = value.toString()
    set_timeout_ms()
  }

  return tel(TestId.timeout.id, 'div', { style: 'display: inline;' },
    el('label', {}, si, 'seconds'),
  )
}

const timeout_countdown = (timeout_seconds: Editable<number>, at_zero: () => void): { cancel: () => void } => {
  assert(timeout_seconds.get() >= 0, 'Start of timeout countdown is < 0 for some reason!')
  if (timeout_seconds.get() <= 0) {
    at_zero()
  }

  const cancel = () => {
    clearInterval(interval)
  }

  const interval = setInterval(() => {
    // console.log('THIS INTERVAL IS HITTING', timeout_seconds.get())
    if (timeout_seconds.get() <= 0) {
      at_zero()
      cancel()
    } else {
      timeout_seconds.set(timeout_seconds.get() - 1)
    }
  }, 1000)

  return { cancel }
}

const timeout_element = (timeout_seconds: Editable<number>): { element: HTMLElement, start: (timeout: number, at_zero: () => void) => void, cancel: () => void } => {
  const e = el('span', {}, seconds_to_time_string(timeout_seconds.get()))
  timeout_seconds.watch((seconds_left) => {
    e.innerHTML = ''
    e.append(seconds_to_time_string(seconds_left))
  })

  let countdown: { cancel: () => void } | undefined = undefined

  return {
    element: e,
    start: (timeout: number, at_zero: () => void) => {
      timeout_seconds.set(timeout)
      countdown = timeout_countdown(timeout_seconds, () => {
        at_zero()
      })
    },
    cancel: () => {
      countdown?.cancel()
    },
  }
}

const model_finder_display = (constraint_block: InputBlockLogic<Constraint, SplitInput>): ModelFinderDisplay => {
  // const state = new Editable<ModelFinderState>({ tag: 'waiting' })
  const state2 = new Editable<ModelFinderState2>({ tag: 'waiting' })
  const model_container = el('div', { class: 'model-container' })
  const state_display = tel(TestId.state_display_id, 'div', {})
  const status_container = el('div', { style: 'margin-top: 0.4em;' }, state_display)
  const left_side = el('div', { style: 'border-right: solid gainsboro; padding-right: 1em;' },
    model_container,
  )
  // const z3_state = new Editable<Z3ContextState>({ tag: 'loading' })
  const z3_state2 = new Editable<Z3SolverState>({ tag: 'loading' })
  // const model_assignments = new Editable<{ truth_table: TruthTable, model: Model, values: Record<number, ModelAssignmentOutput> } | undefined>(undefined)
  const model_assignments2 = new Editable<{ truth_table: TruthTable, values: Record<number, ModelAssignmentOutput> } | undefined>(undefined)
  // const evaluators = model_evaluators(z3_state, model_assignments)
  const evaluators = model_evaluators(state2, model_assignments2)
  const right_side = el('div', {},
    // evaluators.element,  // Will be added in the state watcher.
  )
  const split_view = el('div', { style: 'display: flex; margin-top: 0.4em;' },
    left_side,
    right_side,
  )
  const constraints_view = el('div', { style: 'margin-top: 0.4em;' })

  const generate_button = tel(TestId.find_model, 'input', { type: 'button', value: Constants.FIND_MODEL_BUTTON_LABEL, class: 'generate' }) as HTMLButtonElement
  const cancel_button = tel(TestId.cancel_id, 'input', { type: 'button', value: Constants.CANCEL_BUTTON_LABEL, style: 'margin-top: 0.4em;' }) as HTMLButtonElement
  const z3_status_container = tel(TestId.z3_status, 'div', { style: 'margin-bottom: 0.4em;' })
  const is_regular = new Editable(false)
  const regular_toggle = tel(TestId.regular_toggle, 'input', { type: 'checkbox', style: 'margin-left: 0.4em;' }, 'Regular') as HTMLInputElement
  const timeout_ms = new Editable(Constants.DEFAULT_SOLVE_TIMEOUT_MS)
  const timeout_input = timeout(timeout_ms)
  timeout_ms.watch((ms) => { console.log('timeout set to:', ms) })
  const generate_line = el('div', { style: 'display: flex;' },
    generate_button,
    // el('input', { type: 'button', value: Constants.FIND_MODEL_BUTTON_LABEL, class: 'generate' }) as HTMLButtonElement,
    // options_button,
    el('div', { style: 'display: flex; flex-direction: column; margin-left: 0.4em;' },
      el('label', {},
        'Regular:',
        regular_toggle,
      ),
      el('label', { style: 'display: flex;' },
        el('span', { style: 'margin-right: 1ch;' }, 'Timeout:'),
        timeout_input,
      ),
    ),
  )
  
  const set_all_constraints = (all_constraints: Constraint[] | undefined) => {
    // console.log('on_ready', all_constraints?.map(constraint_to_string))
    invalidate()
    if (all_constraints === undefined) {
      generate_button.disabled = true
    } else {
      generate_button.disabled = false
    }
  }

  is_regular.watch(() => {
    invalidate()
  })

  constraint_block.on_ready((all_constraints) => {
    set_all_constraints(all_constraints)
  })
  regular_toggle.addEventListener('change', () => {
    is_regular.set(regular_toggle.checked)
  })

  // const load_z3 = async (): Promise<Context> => {
  //   const { Context } = await init_z3()
  //   return Context('main')
  // }

  // load_z3()
  const init_z3_after_first_time_boo = async () => {
    const state = z3_state2.get()
    if (state.tag !== 'ready') {
      throw new Error('Function should only be called after z3 has been properly loaded at least once.')
    }

    try {
      z3_state2.set({ tag: 'loading' })
      const z3_interface = await init_z3()
      await sleep(1000)
      z3_state2.set({ tag: 'ready', solver: state.solver })
      return z3_interface
    } catch (e: any) {
      z3_state2.set({ tag: 'error', message: e.message })
      return undefined
    }
  }
  // init_z3_and_everything_else()
  //   .catch((e) => { throw e })

  init_z3()
    .then((z3_interface) => {
      // z3_state.set({ tag: 'ready', ctx })
      z3_state2.set({ tag: 'ready', solver: new WrappedSolver(z3_interface, init_z3_after_first_time_boo) })
    })
    .catch((error) => {
      // z3_state.set({ tag: 'error', message: error.message })
      z3_state2.set({ tag: 'error', message: error.message })
    })
  
  // gross
  let already_initialized = false
  
  // z3_state.watch((state) => {
  z3_state2.watch((state) => {
    console.log('z3_state change', z3_state2.get())
    z3_status_container.innerHTML = ''
    if (state.tag === 'loading') {
      z3_status_container.append('Loading Z3...')
      generate_button.disabled = true
    } else if (state.tag === 'ready') {
      // z3_is_ready(state.ctx)
      if (!already_initialized) {
        already_initialized = true
        z3_is_ready_2(state.solver)
      }
      set_all_constraints(constraint_block.get_output())
    } else if (state.tag === 'error') {
      z3_status_container.append(state.message)
      z3_status_container.style.color = 'red'
      if (state.message === 'Out of memory') {
        z3_status_container.append('.  Try closing and re-opening the tab or window.')
      }
      generate_button.disabled = true
    } else {
      fallthrough('model_finder_display.z3_state2.watch', state)
    }
  }).call()

  // const z3_is_ready = (ctx: Context) => {
  //   generate_button.addEventListener('click', async () => {
  //     const constraints = assert_exists(constraint_block.get_output(), 'Generate button clicked but not all constraints ready!')
  //     await start_search(ctx, constraints, is_regular.get())
  //   })
  // }

  const cancel = (abort_controller: AbortController) => {
    console.log('cancelling!')
    state_display.innerHTML = ''
    state_display.append(Constants.CANCELLING)
    abort_controller.abort()
    // This is a hack to just abandon an old solve/ctx if it takes too long to cancel, which is likely if a solve has been running for a while.
    // setTimeout(() => {
    //   // This currently has a bug where if you cancel then start again within the timeout, the new solve will be cancelled, which is lame.
    //   // Damn this could lead to a bug: what if the cancel succeeds at some point in the future?
    //   //                                What if this happens during another solve?
    //   //                                Then that other solve will appear to have been interrupted, which is BAD.
    //   //                                The only solution I can think of is ignoring cancelled states, but that's dumb.
    //   const state = state2.get()
    //   if (state.tag === 'looking') {
    //     // If it's still looking, just cancel it for realsies.
    //     state2.set({
    //       tag: 'finished',
    //       truth_table: state.truth_table,
    //       solver_output: {
    //         constraints: {
    //           original: [],
    //           translated: [],
    //           extra: [],
    //           eliminated: [],
    //         },
    //         // We really just want the cancelled part set correctly.
    //         solver_output: { status: 'cancelled' }
    //       }
    //     })
    //   }
    // }, Constants.CANCEL_OVERRIDE_TIMEOUT_MS)
  }

  const z3_is_ready_2 = (solver: WrappedSolver) => {
    generate_button.addEventListener('click', async () => {
      assert(state2.get().tag !== 'looking', 'Trying to generate another model while looking for stuff!')
      const constraints = assert_exists(constraint_block.get_output(), 'Generate button clicked but not all constraints ready!')
      await start_search_solver(solver, constraints, is_regular.get())
    })
    cancel_button.onclick = () => {
      const state = state2.get()
      if (state.tag !== 'looking') {
        throw new Error(`Trying to cancel while not looking for a model!\nstate: ${JSON.stringify(state)}`)
      }
      cancel(state.abort_controller)
    }
  }

  // const start_search = async (ctx: Context, constraints: Constraint[], is_regular: boolean): Promise<void> => {
  //   const truth_table = new TruthTable(variables_in_constraints(constraints))
  //   state.set({ tag: 'looking', truth_table })
  //   model_container.innerHTML = ''
  //   try {
  //     const tt_display = truth_table_display(truth_table)
  //     model_container.appendChild(tt_display)
  //     // const { status, all_constraints, state_values, model } = await pr_sat_with_truth_table(ctx, truth_table, constraints, is_regular)
  //     const result = await pr_sat_with_options(ctx, truth_table, constraints, { regular: is_regular, timeout_ms: timeout_ms.get() })
  //     const { status, all_constraints, model } = result
  //     if (status === 'sat') {
  //       state.set({ tag: 'sat', model: result.z3_model, truth_table, assignments: model })
  //     } else if (status === 'unsat') {
  //       state.set({ tag: 'unsat', truth_table })
  //     } else if (status === 'unknown') {
  //       state.set({ tag: 'unknown' })
  //     } else {
  //       const check: Equiv<typeof status, never> = true
  //       void check
  //     }

  //     constraints_view.innerHTML = ''
  //     for (const constraint of all_constraints) {
  //       const e = constraint_to_html(constraint, true)
  //       constraints_view.appendChild(el('div', { style: 'margin-top: 0.4em;' }, e))
  //     }
  //   }
  //   catch (e: any) {
  //     state.set({ tag: 'unknown' })
  //     status_container.appendChild(el('div', { style: 'color: red;' },
  //       tel(TestId.exception_id, 'div', {}, 'Exception!'),
  //       e.message))
  //     console.error(e.stack)
  //   }
  // }

  // hack to get timeouts working BOO.
  (async () => {
    const old_constraints_text = localStorage.getItem('constraints')
    if (old_constraints_text !== null) {
      console.log('Setting from old constraints text')
      const lines = old_constraints_text.split('\n')
      await constraint_block.set_fields(lines)
      localStorage.removeItem('constraints')
    }
  })().catch(() => {})

  const cancel_fallback = async (): Promise<undefined> => {
    // No longer reload the page - just let Z3 reinitialize
    // The translated constraints and truth table will remain visible
    console.log('cancel fallback (no reload)')
  }

  const start_search_solver = async (solver: WrappedSolver, constraints: Constraint[], is_regular: boolean): Promise<void> => {
    const truth_table = new TruthTable(variables_in_constraints(constraints))
    // state.set({ tag: 'looking', truth_table })
    const abort_controller = new AbortController()
    state2.set({ tag: 'looking', truth_table, abort_controller })
    model_container.innerHTML = ''
    try {
      const tt_display = truth_table_display(truth_table)
      model_container.appendChild(tt_display)
      // const { status, all_constraints, state_values, model } = await pr_sat_with_truth_table(ctx, truth_table, constraints, is_regular)
      // const result = await pr_sat_with_options(ctx, truth_table, constraints, { regular: is_regular, timeout_ms: timeout_ms.get() })
      const result = await pr_sat_wrapped(solver, truth_table, constraints, {
        regular: is_regular,
        abort_signal: abort_controller.signal,
        cancel_fallback,
        onTranslated: (translated) => {
          constraints_view.innerHTML = ''
          for (const constraint of translated) {
            const e = constraint_to_html(constraint, true)
            constraints_view.appendChild(el('div', { style: 'margin-top: 0.4em;' }, e))
          }
        }
      })
      state2.set({ tag: 'finished', truth_table, solver_output: result })
      // const { status, all_constraints, model } = result
      // if (result.solver_output.status === 'sat') {
      //   state.set({ tag: 'sat', model: result.z3_model, truth_table, assignments: model })
      // } else if (status === 'unsat') {
      //   state.set({ tag: 'unsat', truth_table })
      // } else if (status === 'unknown') {
      //   state.set({ tag: 'unknown' })
      // } else if (status === 'cancelled') {
      // } else if (status === 'exception') {
      // } else {
      //   fallthrough('start_search_solver', status)
      // }

      // Add save buttons at the top (constraints already displayed by onTranslated callback)
      // These buttons always appear regardless of solver result
      const save_translated_constraints_button = el('input', { type: 'button', value: 'Save translated constraints' })
      save_translated_constraints_button.onclick = () =>
        download(result.constraints.translated.map(constraint_to_string).join('\n'), 'translated.txt', 'text/plain')

      const save_smtlib_button = el('input', { type: 'button', value: 'Save SMTLIB input', style: 'margin-left: 0.4em;' })
      save_smtlib_button.onclick = () =>
        download(result.smtlib_input, 'smtlib.txt', 'text/plain')

      const result_save_button_bar = el('div', {},
        el('div', {}, save_translated_constraints_button, save_smtlib_button),
      )

      // Only add the table image button if we have a SAT result (model/table exists)
      if (result.solver_output.status === 'sat') {
        const save_table_image_button = el('input', { type: 'button', value: 'Save table as image' }) as HTMLButtonElement
        save_table_image_button.onclick = async () => {
          try {
            // Add temporary padding to prevent cutoff
            const originalPadding = model_container.style.paddingBottom
            model_container.style.paddingBottom = '20px'

            const dataUrl = await htmlToImage.toPng(model_container, {
              backgroundColor: '#ffffff',
              pixelRatio: 2, // Higher quality
            })

            // Restore original padding
            model_container.style.paddingBottom = originalPadding

            const a = document.createElement('a')
            a.href = dataUrl
            a.download = 'probability_table.png'
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
          } catch (e: any) {
            console.error('Failed to save table as image:', e)
            alert('Failed to save table: ' + e.message)
          }
        }
        save_table_image_button.style.marginTop = '0.4em'
        result_save_button_bar.appendChild(el('div', {}, save_table_image_button))
      }

      constraints_view.insertBefore(result_save_button_bar, constraints_view.firstChild)
    }
    catch (e: any) {
      state2.set({ tag: 'exception', message: e.message })
      status_container.appendChild(el('div', { style: 'color: red;' },
        tel(TestId.exception_id, 'div', {}, 'Exception!'),
        e.message))
      console.error(e.stack)
    }
  }

  // const invalidate = (): void => {
  //   const last_state = state.get()
  //   if (last_state.tag === 'invalidated') {
  //     // do nothing!
  //   } else if (last_state.tag === 'sat') {
  //     state.set({ tag: 'invalidated', last: last_state })
  //   } else {
  //     state.set({ tag: 'waiting' })
  //   }
  // }

  const invalidate = (): void => {
    const last_state = state2.get()
    if (last_state.tag === 'invalidated') {
      // do nothing!
    } else if (last_state.tag === 'looking') {
      // Don't invalidate while a search is in progress (e.g., during Z3 reinitialize on cancel)
    } else if (last_state.tag === 'finished') {
      state2.set({ tag: 'invalidated', last: last_state })
    } else {
      state2.set({ tag: 'waiting' })
    }

    // if (last_state.tag === 'invalidated') {
    //   // do nothing!
    // } else if (last_state.tag === 'sat') {
    //   state.set({ tag: 'invalidated', last: last_state })
    // } else {
    //   state.set({ tag: 'waiting' })
    // }
  }

  const model_part = el('div', {},
    status_container,
    split_view,
    constraints_view,
  )

  const element = el('div', { class: 'model-finder' },
    z3_status_container,
    generate_line,
    cancel_button,
    model_part,
  )

  const timeout_seconds = new Editable(0)
  const { element: timeout_countdown_element, start: start_countdown, cancel: cancel_countdown } = timeout_element(timeout_seconds)

  state2.watch((state, last_state) => {
    console.log('model_finder state change', state)

    // Logic
    if (state.tag === 'finished') {
      if (state.solver_output.solver_output.status === 'sat') {
        model_assignments2.set({ truth_table: state.truth_table, values: state.solver_output.solver_output.state_assignments })
        // evaluators.multi_input.refresh()
        evaluators.refresh()
      // } else if (state.solver_output.solver_output.) {
        // evaluators.multi_input.refresh()
        // evaluators.refresh()
      } else if (state.solver_output.solver_output.status === 'unsat') {
        model_assignments2.set(undefined)
      }
    } else if (last_state?.tag !== 'looking' && state.tag === 'looking') {
      start_countdown(timeout_ms.get() / 1000, () => { cancel(state.abort_controller) })
      evaluators.refresh()
    }
    if (last_state?.tag === 'looking' && state.tag !== 'looking') {
      cancel_countdown()
    }
    
    // Display
    // if (last_state?.tag === 'looking' && state.tag !== 'looking') {
    //   cancel(last_state.abort_controller)
    // }

    model_part.classList.remove('invalidated')
    cancel_button.disabled = true
    if (state.tag === 'waiting') {
      right_side.innerHTML = ''
      state_display.innerHTML = ''
      state_display.append('No model to display!')
      model_part.classList.add('invalidated')
      model_container.innerHTML = ''
      constraints_view.innerHTML = ''
      generate_button.disabled = false
    } else if (state.tag === 'looking') {
      state_display.innerHTML = ''
      state_display.append(Constants.SEARCH)
      state_display.append(' ')
      state_display.appendChild(timeout_countdown_element)
      generate_button.disabled = true
      cancel_button.disabled = false
    } else if (state.tag === 'finished') {
      generate_button.disabled = false
      if (state.solver_output.solver_output.status === 'sat') {
        state_display.innerHTML = ''
        state_display.append(Constants.SAT)
        const model_html = model_display(state.truth_table, state.solver_output.solver_output.state_assignments)
        model_container.innerHTML = ''
        model_container.appendChild(model_html)
        right_side.appendChild(evaluators.element)
      } else if (state.solver_output.solver_output.status === 'unsat') {
        state_display.innerHTML = ''
        state_display.append(Constants.UNSAT)
        right_side.innerHTML = ''
      } else if (state.solver_output.solver_output.status === 'unknown') {
        state_display.innerHTML = ''
        state_display.append(Constants.UNKNOWN)
      } else if (state.solver_output.solver_output.status === 'cancelled') {
        state_display.innerHTML = ''
        state_display.append(Constants.CANCELLED)
      } else if (state.solver_output.solver_output.status === 'exception') {
        state_display.innerHTML = ''
        state_display.appendChild(el('span', {}, `Exception! ${state.solver_output.solver_output.message}`))
      } else {
        fallthrough('model_finder_display.state2.watch', state.solver_output.solver_output)
      }
    } else if (state.tag === 'invalidated') {
      state_display.innerHTML = ''
      state_display.append('No up-to-date model to display')
      model_part.classList.add('invalidated')
    } else if (state.tag === 'exception') {
      generate_button.disabled = false
    } else {
      fallthrough('model_finder_display.state.watch', state)
    }
  })

  return { element, state: state2, start_search_solver, invalidate }
}

// type Z3ContextState =
//   | { tag: 'loading' }
//   | { tag: 'ready', ctx: Context }
//   | { tag: 'error', message: string }

type Z3SolverState =
  | { tag: 'loading' }
  | { tag: 'ready', solver: WrappedSolver }
  | { tag: 'error', message: string }

// const generic_multi_input = <ParseOutput extends {}>(
//   test_ids: TestId.GenericMultiInputTestIds,  // different from gen!
//   test_id_gen: TestIdGenerator,
//   single_input_placeholder: string,
//   batch_input_placeholder: string,
//   input_instructions: string,
//   parser: (text: string) => Res<ParseOutput, string>,
//   display: (output: ParseOutput) => Element,
//   default_mode: 'Multi' | 'Batch' = Constants.DEFAULT_MULTI_INPUT_MODE
// ): MultiInput<ParseOutput> => {
//   const all_constraints = new Editable<ParseOutput[] | undefined>(undefined)
//   const display_picker = simple_options_display(test_ids.id, ['Multi', 'Batch'], default_mode)
//   const input_container = el('div', {})
//   display_picker.element.style.marginBottom = '0.4em'
//   const block_logic = new InputBlockLogic(parser, (logic) => single_input(test_id_gen, single_input_placeholder, input_instructions, parser, display, single_input_callbacks_after))
//   const input_elements_map = {
//     'Multi': multi_input(test_ids.multi, test_id_gen, single_input_placeholder, input_instructions, parser, display, block_logic),
//     'Batch': batch_input(test_ids.batch, batch_input_placeholder, input_instructions, parser, display, block_logic),
//   } as const
//   let current_mi = input_elements_map[default_mode]

//   display_picker.options.watch((display_code, last_display_code) => {
//     current_mi = input_elements_map[display_code]
//     input_container.innerHTML = ''
//     input_container.appendChild(current_mi.element)

//     if (last_display_code !== undefined) {
//       const last_mi = assert_exists(input_elements_map[last_display_code])
//       if (last_mi) {
//         current_mi.set_fields(last_mi.get_fields())
//       }
//     }
//   }).call()

//   for (const current_input of Object.values(input_elements_map)) {
//     current_input.all_constraints.watch((constraints) => {
//       all_constraints.set(constraints)
//     }).call()
//   }

//   const get_fields = (): string[] => {
//     return current_mi.get_fields()
//   }

//   const set_fields = (fields: string[]) => {
//     current_mi.set_fields(fields)
//   }

//   const refresh = () => {
//     for (const input of Object.values(input_elements_map)) {
//       input.refresh()
//     }
//   }

//   const element = el('div', {},
//     display_picker.element,
//     input_container,
//   )
//   return { element, all_constraints, get_fields, set_fields, refresh }
// }

const main = (): HTMLElement => {
  // const generate_button = tel(TestId.find_model, 'input', { type: 'button', value: Constants.FIND_MODEL_BUTTON_LABEL, class: 'generate' }) as HTMLButtonElement
  // const options_button = el('input', { type: 'button', value: '⚙', class: 'options' }) as HTMLButtonElement
  // const z3_state = new Editable<Z3ContextState>({ tag: 'loading' })
  // const z3_status_container = tel(TestId.z3_status, 'div', { style: 'margin-left: 0.4em;' })
  // const generate_line = el('div', { style: 'display: flex; margin-top: 0.4em;' }, generate_button, options_button, z3_status_container)
  // const is_regular = new Editable(false)
  // const regular_toggle = tel(TestId.regular_toggle, 'input', { type: 'checkbox' }, 'Regular') as HTMLInputElement
  // const mi = generic_multi_input(TestId.generic_multi_input('constraints'), TestId.single_input.constraint, Constants.CONSTRAINT_INPUT_PLACEHOLDER, Constants.BATCH_CONSTRAINT_INPUT_PLACEHOLDER, Constants.CONSTRAINT_INPUT_INSTRUCTIONS, parse_constraint, constraint_to_html)
  const test_ids = TestId.generic_multi_input('constraints')
  const constraint_block = new InputBlockLogic<Constraint, SplitInput>(
    parse_constraint,
    (logic) => split_input(logic, async (c) => constraint_to_html(c, true), Constants.CONSTRAINT_INPUT_PLACEHOLDER, test_ids.split))

  const mi = generic_input_block(constraint_block, Constants.BATCH_CONSTRAINT_INPUT_PLACEHOLDER, test_ids)
  const model_finder = model_finder_display(constraint_block)

  model_finder.state.watch((state, last_state) => {
    if (last_state?.tag !== 'looking' && state.tag === 'looking') {
      mi.set_disabled(true)
    } else if (last_state?.tag === 'looking' && state.tag !== 'looking') {
      mi.set_disabled(false)
    }
  })

  // const set_all_constraints = (all_constraints: Constraint[] | undefined) => {
  //   model_finder.invalidate()
  //   if (all_constraints === undefined) {
  //     generate_button.disabled = true
  //   } else {
  //     generate_button.disabled = false
  //   }
  // }

  // is_regular.watch(() => {
  //   model_finder.invalidate()
  // })

  // constraint_block.on_ready((all_constraints) => {
  //   set_all_constraints(all_constraints)
  // })
  // regular_toggle.addEventListener('change', () => {
  //   is_regular.set(regular_toggle.checked)
  // })

  // const load_z3 = async (): Promise<Context> => {
  //   const { Context } = await init_z3()
  //   return Context('main')
  // }

  // load_z3()
  //   .then((ctx) => {
  //     z3_state.set({ tag: 'ready', ctx })
  //   })
  //   .catch((error) => {
  //     z3_state.set({ tag: 'error', message: error.message })
  //   })
  
  // z3_state.watch((state) => {
  //   z3_status_container.innerHTML = ''
  //   if (state.tag === 'loading') {
  //     z3_status_container.append('Loading Z3...')
  //     generate_button.disabled = true
  //   } else if (state.tag === 'ready') {
  //     z3_is_ready(state.ctx)
  //     set_all_constraints(constraint_block.get_output())
  //   } else if (state.tag === 'error') {
  //     z3_status_container.append(state.message)
  //     z3_status_container.style.color = 'red'
  //     if (state.message === 'Out of memory') {
  //       z3_status_container.append('.  Try closing and re-opening the tab or window.')
  //     }
  //     generate_button.disabled = true
  //   } else {
  //     throw new Error('')
  //   }
  // }).call()

  // const z3_is_ready = (ctx: Context) => {
  //   generate_button.addEventListener('click', async () => {
  //     const constraints = assert_exists(constraint_block.get_output(), 'Generate button clicked but not all constraints ready!')
  //     await model_finder.start_search(ctx, constraints, is_regular.get())
  //   })
  // }

  const global_error_display = el('div', { class: 'global-error' })
  global_error_display.style.display = 'none'
  const show_error = (message: string) => {
    global_error_display.innerHTML = ''
    global_error_display.appendChild(el('div', { class: 'error' }, 'Unexpected Exception!'))
    global_error_display.appendChild(el('div', { class: 'error' }, 'Email a bug report to ', el('a', { href: 'mailto:adjorlolo.k@northeastern.edu' }, 'Koissi Adjorlolo'), ' with a description of what you were doing when this error message popped up along with a screenshot of this page.'))
    global_error_display.appendChild(el('div', { class:' error' }, 'You can still use the app, but things might not work as expected.'))
    global_error_display.appendChild(el('div', { class:' error' }, message))
    global_error_display.style.display = 'block'
  }

  window.onunhandledrejection = (event) => {
    show_error(JSON.stringify(event.reason))
  }

  window.onerror = (event, source, lineno, colno, error) => {
    let message: string
    if (typeof event === 'string') {
      message = event
    } else if (error instanceof Error) {
      message = error.message
    } else if (event instanceof Event && 'message' in event) {
      message = String((event as ErrorEvent).message)
    } else {
      // For resource load errors, provide a more helpful message
      if (source && source.includes('z3')) {
        message = 'Failed to load Z3 WebAssembly module. This may be due to iOS Safari limitations with large WebAssembly files. Try using a desktop browser.'
      } else {
        message = 'A resource failed to load'
      }
    }
    if (source) {
      message += ` (at ${source}:${lineno}:${colno})`
    }
    show_error(message)
  }

  // const throw_button = el('input', { type: 'button', value: 'Throw' })
  // throw_button.onclick = () => {
  //   throw new Error('intentionally thrown!')
  // }

  return el('div', {},
    el('div', { class: 'header' },
      el('div', { style: 'font-weight: bold; font-size: 1.5em;' }, 'PrSAT 3.0'),
      el('br', {}),
      el('div', {},
        'For more information regarding syntax, usage, etc., see the ',
        el('a', { href: 'https://fitelson.org/PrSAT/', target: '_blank' }, 'official PrSAT 3.0 webpage'),
        '.',
      ),
      el('br', {}),
      el('div', {},
        el('a', { href: 'https://youtu.be/F_WbzKr7qJQ', target: '_blank' }, 'Here'),
        ' is a brief video demo of the software. The text file for the demo can be downloaded ',
        el('a', { href: 'https://fitelson.org/PrSAT/PrSAT_3.0_demo_examples.txt', target: '_blank' }, 'here'),
        '.',
      ),
    ),
    // throw_button,
    global_error_display,
    mi.element,
    // el('div', { class: 'model-input' },
    //   mi.element,
    //   generate_line,
    //   regular_toggle,
    // ),
    model_finder.element,
  )
}

if (!hasMathMLSupport()) {
  alert('No mathML support :(')
  throw new Error('No mathML support :(')
}

root.appendChild(main())
