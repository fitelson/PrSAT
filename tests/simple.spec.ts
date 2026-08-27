import { test, expect, Page, Locator } from '@playwright/test'
import * as TestId from './test_ids'
import * as Constants from '../src/constants'
import { fallthrough } from '../src/utils'

const URL = 'http://127.0.0.1:5174/'
const DEFAULT_TIMEOUT = 20_000

const load_app = async (page: Page): Promise<void> => {
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId(TestId.z3_status)).toBeEmpty({ timeout: DEFAULT_TIMEOUT })
}

const to_load = async (page: Page): Promise<void> => {
  await load_app(page)
}

const find_model = async (page: Page, with_result: 'sat' | 'unsat' | 'unknown' | 'cancelled', timeout_ms?: number) => {
  const state_display = page.getByTestId(TestId.state_display_id)
  const result_timeout = timeout_ms ?? DEFAULT_TIMEOUT
  await page.getByTestId(TestId.find_model).click()
  // Right after we click, we want to be searching!
  await state_display.getByText(Constants.SEARCH).isVisible()

  if (with_result === 'sat') {
    await expect(state_display).toContainText(Constants.SAT, { timeout: result_timeout })
  } else if (with_result === 'unsat') {
    await expect(state_display).toContainText(Constants.UNSAT, { timeout: result_timeout })
  } else if (with_result === 'unknown') {
    await expect(state_display).toContainText(Constants.UNKNOWN, { timeout: result_timeout })
  } else if (with_result === 'cancelled') {
    // expect(state_display).toContainText(Constants.CANCELLED)
  } else {
    fallthrough('find_model', with_result)
  }
}

test('single constraint', async ({ page }) => {
  await to_load(page)
  const test_ids = TestId.generic_multi_input('constraints')

  const single_input = page.getByTestId(test_ids.split.single.get(0))
  await single_input.getByTestId(test_ids.split.input).fill('Pr(A & B) = Pr(A) * Pr(B)')
  await page.getByTestId(TestId.find_model).click()
  await page.getByTestId(TestId.regular_toggle).check()
  await page.getByTestId(TestId.find_model).click()

  await expect(page.getByTestId(TestId.model_table)).toBeVisible({ timeout: DEFAULT_TIMEOUT })
  await expect(page.getByText(Constants.SAT)).toBeVisible()
});

test('TwistPrSAT defaults to LET_K+ and solves a glut with Z3', async ({ page }) => {
  await load_app(page)
  await expect(page.getByText('TwistPrSAT', { exact: true })).toBeVisible()
  await expect(page.getByText(/Trivalent \(ERS\)|Trivalent \(CCK\)/)).toHaveCount(0)

  const test_ids = TestId.generic_multi_input('constraints')
  await set_block_input(page, test_ids, ['Pr(A) = 1', 'Pr(~A) = 1', 'Pr(○A) = 0'])
  await find_model(page, 'sat', DEFAULT_TIMEOUT)

  await expect(page.getByTestId(TestId.model_table).locator('tbody tr')).toHaveCount(6)
  await expect(page.getByTestId(TestId.solver_method.badge)).toContainText('LET_K+')
})

test('public model and theorem example files are linked and ready to load', async ({ page }) => {
  await load_app(page)
  const all_examples_link = page.getByRole('link', { name: 'Open all SAT and UNSAT examples in one text file' })
  await expect(all_examples_link).toBeVisible()
  await expect(all_examples_link).toHaveAttribute('href', 'TwistPrSAT_all_examples.txt')
  const all_examples = await page.request.get(`${URL}TwistPrSAT_all_examples.txt`)
  expect(all_examples.ok()).toBe(true)
  const all_examples_text = await all_examples.text()
  expect(all_examples_text).toContain('EXAMPLE 00: UNIFORM SIX-REGION MODEL')
  expect(all_examples_text).toContain('EXAMPLE 11: GAP-GLUT BALANCE IDENTITY')
  expect(all_examples_text).toContain('EXAMPLE 14: DE MORGAN NEGATION NEED NOT BE COMPLEMENTARY')

  const link = page.getByRole('link', { name: 'Download a ready-to-load example file' })
  await expect(link).toBeVisible()
  await expect(link).toHaveAttribute('href', 'TwistPrSAT_examples.txt')
  await expect(link).toHaveAttribute('download', '')

  const response = await page.request.get(`${URL}TwistPrSAT_examples.txt`)
  expect(response.ok()).toBe(true)
  const text = await response.text()
  expect(text).toContain('Pr(A & oA) = 1/6')
  expect(text.trim().split(/\r?\n/)).toHaveLength(13)

  const theorem_link = page.getByRole('link', { name: 'Open the theorem-challenge index' })
  await expect(theorem_link).toBeVisible()
  await expect(theorem_link).toHaveAttribute('href', 'TwistPrSAT_theorem_examples.txt')
  const theorem_index = await page.request.get(`${URL}TwistPrSAT_theorem_examples.txt`)
  expect(theorem_index.ok()).toBe(true)
  expect(await theorem_index.text()).toContain('04_inclusion_exclusion_unsat.txt')
  const theorem_challenge = await page.request.get(`${URL}theorems/04_inclusion_exclusion_unsat.txt`)
  expect(theorem_challenge.ok()).toBe(true)
  expect((await theorem_challenge.text()).trim()).toBe('Pr(A) + Pr(B) != Pr(A & B) + Pr(A v B)')
})

test('editing a parsed constraint immediately disables stale solving', async ({ page }) => {
  await to_load(page)
  const test_ids = TestId.generic_multi_input('constraints')
  const input = page.getByTestId(test_ids.split.single.get(0)).getByTestId(test_ids.split.input)
  const find_button = page.getByTestId(TestId.find_model)

  await input.fill('Pr(A) = 1/2')
  await page.waitForTimeout(Constants.DEFAULT_DEBOUNCE_MS + 50)
  await expect(find_button).toBeEnabled()

  await input.fill('this is not a constraint')
  await expect(find_button).toBeDisabled()
})

test('TwistPrSAT rejects a truth table that exceeds the local resource limit', async ({ page }) => {
  await to_load(page)
  const test_ids = TestId.generic_multi_input('constraints')
  const input = page.getByTestId(test_ids.split.single.get(0)).getByTestId(test_ids.split.input)
  await input.fill('Pr(A & B & C & D & E) = 1')
  await page.getByTestId(TestId.find_model).click()
  await expect(page.getByTestId(TestId.state_display_id)).toContainText('TwistPrSAT supports at most 4')
})

test('public TwistPrSAT exposes only the Z3 decision procedure', async ({ page }) => {
  await to_load(page)
  await expect(page.locator('select')).toHaveCount(0)
  await expect(page.getByText(/Random Search|Maple bridge|browser algebra/)).toHaveCount(0)
})

test('arithmetic-only constraints do not show a probability table', async ({ page }) => {
  await to_load(page)
  const test_ids = TestId.generic_multi_input('constraints')
  const single_input = page.getByTestId(test_ids.split.single.get(0))

  await single_input.getByTestId(test_ids.split.input).fill('1 / (2 / 4) = 2')
  await find_model(page, 'sat', DEFAULT_TIMEOUT)
  await expect(page.getByTestId(TestId.model_table)).toHaveCount(0)
  await expect(page.getByTestId(TestId.state_row.state(0))).toHaveCount(0)
  await expect(page.locator('.model-evaluators')).toHaveCount(0)

  await single_input.getByTestId(test_ids.split.input).fill('1 / (2 / 4) != 2')
  await find_model(page, 'unsat', DEFAULT_TIMEOUT)
  await expect(page.getByTestId(TestId.model_table)).toHaveCount(0)
  await expect(page.getByTestId(TestId.state_row.state(0))).toHaveCount(0)
  await expect(page.locator('.model-evaluators')).toHaveCount(0)
});

test('adding a bunch of constraints', async ({ page }) => {
  await to_load(page)
  const test_ids = TestId.generic_multi_input('constraints')

  const n_constraints = 10
  for (let cindex = 0; cindex < n_constraints; cindex++) {
    const si = page.getByTestId(test_ids.split.single.get(cindex))
    await expect(si).toBeVisible()
    await si.getByTestId(test_ids.split.newline).click()
  }

  const si = page.getByTestId(test_ids.split.single.get(n_constraints - 1))
  await expect(si).toBeVisible()
})

test('adding then removing a bunch of constraints', async ({ page }) => {
  await to_load(page)
  const test_ids = TestId.generic_multi_input('constraints')

  const n_constraints = 10
  for (let cindex = 0; cindex < n_constraints; cindex++) {
    const si = page.getByTestId(test_ids.split.single.get(cindex))
    await expect(si).toBeVisible()
    await si.getByTestId(test_ids.split.newline).click()
  }

  const si = page.getByTestId(test_ids.split.single.get(n_constraints - 1))
  await expect(si).toBeVisible()

  for (let cindex = 0; cindex < n_constraints; cindex++) {
    const si = page.getByTestId(test_ids.split.single.get(cindex))
    await expect(si).toBeVisible()
    await si.getByTestId(test_ids.split.close).click()
    await expect(si).not.toBeVisible()
  }
})

test('multiple TwistPrSAT constraints', async ({ page }) => {
  await to_load(page)
  const single_inputs: Locator[] = []
  const test_ids = TestId.generic_multi_input('constraints')

  single_inputs.push(page.getByTestId(test_ids.split.single.get(0)))
  await expect(single_inputs[0]).toBeVisible()
  await single_inputs[0].getByTestId(test_ids.split.input).fill('Pr(A) = 1')
  await single_inputs[0].getByTestId(test_ids.split.newline).click()

  single_inputs.push(page.getByTestId(test_ids.split.single.get(1)))
  await expect(single_inputs[1]).toBeVisible()
  await single_inputs[1].getByTestId(test_ids.split.input).fill('Pr(~A) = 1')
  await single_inputs[1].getByTestId(test_ids.split.newline).click()

  single_inputs.push(page.getByTestId(test_ids.split.single.get(2)))
  await expect(single_inputs[2]).toBeVisible()
  await single_inputs[2].getByTestId(test_ids.split.input).fill('Pr(○A) = 0')

  await find_model(page, 'sat')
  await expect(page.getByTestId(TestId.model_table)).toBeVisible({ timeout: DEFAULT_TIMEOUT })
  await expect(page.getByText(Constants.SAT)).toBeVisible()
})

test('regular TwistPrSAT model with several constraints', async ({ page }) => {
  await to_load(page)
  const single_inputs: Locator[] = []
  const test_ids = TestId.generic_multi_input('constraints')

  await page.getByTestId(TestId.regular_toggle).check()

  single_inputs.push(page.getByTestId(test_ids.split.single.get(0)))
  await expect(single_inputs[0]).toBeVisible()
  await single_inputs[0].getByTestId(test_ids.split.input).fill('Pr(A) > 0')
  await single_inputs[0].getByTestId(test_ids.split.newline).click()

  single_inputs.push(page.getByTestId(test_ids.split.single.get(1)))
  await expect(single_inputs[1]).toBeVisible()
  await single_inputs[1].getByTestId(test_ids.split.input).fill('Pr(~A) > 0')
  await single_inputs[1].getByTestId(test_ids.split.newline).click()

  single_inputs.push(page.getByTestId(test_ids.split.single.get(2)))
  await expect(single_inputs[2]).toBeVisible()
  await single_inputs[2].getByTestId(test_ids.split.input).fill('Pr(○A) < 1')

  await page.waitForTimeout(Constants.DEFAULT_DEBOUNCE_MS)  // Wait for all the inputs to update correctly.

  await find_model(page, 'sat')
  // await expect(page.getByTestId(TestId.state_display_id)).toBeVisible()
  // await expect(page.getByText(Constants.SAT)).toBeVisible({ timeout: DEFAULT_TIMEOUT })  // Done searching for the model.
  await expect(page.getByTestId(TestId.exception_id)).not.toBeVisible()
})

test('show and hide batch input', async ({ page }) => {
  await to_load(page)

  const test_ids = TestId.generic_multi_input('constraints')
  const toggle_button = page.getByTestId(test_ids.toggle)
  const textbox = page.getByTestId(test_ids.batch.textbox)
  const parse_button = page.getByTestId(test_ids.batch.parse)

  await expect(textbox).not.toBeVisible()
  await expect(parse_button).not.toBeVisible()

  await toggle_button.click()
  await expect(textbox).toBeVisible()
  await expect(parse_button).toBeVisible()

  await toggle_button.click()
  await expect(textbox).not.toBeVisible()
  await expect(parse_button).not.toBeVisible()
})

const set_block_input = async (page: Page, test_ids: TestId.GenericMultiInputTestIds, constraints_text: string[]) => {
  const toggle_button = page.getByTestId(test_ids.toggle)
  const textbox = page.getByTestId(test_ids.batch.textbox)
  const parse_button = page.getByTestId(test_ids.batch.parse)

  const originally_visible = await textbox.isVisible()
  if (!originally_visible) {
    await toggle_button.click()
  }

  await textbox.fill(constraints_text.join('\n'))
  await page.waitForTimeout(Constants.DEFAULT_DEBOUNCE_MS)
  await parse_button.click()

  if (!originally_visible) {
    await toggle_button.click()
  }
}

test('parse from batch input', async ({ page }) => {
  await to_load(page)

  const test_ids = TestId.generic_multi_input('constraints')
  const inputs = [
    'Pr(A & B & C) = Pr(A) * Pr(B) * Pr(B)',
    'Pr(A & B) = Pr(A) * Pr(B)',
    'Pr(B & C) = Pr(B) * Pr(C)',
    'Pr(A & C) = Pr(A) * Pr(C)',
  ]

  await set_block_input(page, test_ids, inputs)

  for (const [index, text] of inputs.entries()) {
    const element = page.getByTestId(test_ids.split.single.get(index))
    const element_textbox = element.getByTestId(test_ids.split.input)
    await expect(element_textbox).toBeVisible()
    await expect(element_textbox).toHaveValue(text)
  }
})

test('setting multiple evals at once', async ({ page }) => {
  await to_load(page)

  const constraint_test_ids = TestId.generic_multi_input('constraints')
  await set_block_input(page, constraint_test_ids, ['Pr(A & B) = Pr(A) * Pr(B)'])
  await find_model(page, 'sat')

  const eval_test_ids = TestId.generic_multi_input('eval')
  await set_block_input(page, eval_test_ids, ['Pr(A)', 'Pr(B)'])
  await expect(page.getByText('Exception')).not.toBeVisible()
})

test('detect division by zero', async ({ page }) => {
  await to_load(page)

  const constraint_test_ids = TestId.generic_multi_input('constraints')
  await set_block_input(page, constraint_test_ids, ['Pr(A & B) = Pr(A) * Pr(B)'])
  await find_model(page, 'sat')

  const eval_test_ids = TestId.generic_multi_input('eval')
  await set_block_input(page, eval_test_ids, ['Pr(A) / 0'])
  await expect(page.getByTestId(eval_test_ids.split.single.get(0))).toContainText(Constants.DIV0)
})

const cancel_solve = async (page: Page, timeout_ms?: number): Promise<void> => {
  const cancel_button = page.getByTestId(TestId.cancel_id)
  await cancel_button.click()

  const state_display = page.getByTestId(TestId.state_display_id)
  await expect(state_display).toContainText(Constants.CANCELLED, { timeout: timeout_ms })
}

  // This problem was picked because it should take a while to solve.
const LONGISH_SOLVE: string[] = [
  'Pr(B | A) > Pr(B)',
  'Pr(C | A) > Pr(C)',
  'Pr(C | A) - Pr(C) = Pr(C | A & B) - Pr(C | B)',
  'Pr(B \\/ C | A) <= Pr(B \\/ C)',
]
const SUPER_LONG_SOLVE: string[] = [
  'Pr(X & Y) = Pr(X) * Pr(Y)',
  'Pr(X & Z) = Pr(X) * Pr(Z)',
  'Pr(Y & Z) = Pr(Y) * Pr(Z)',
  'Pr(X & U) = Pr(X) * Pr(U)',
  'Pr(Y & U) = Pr(Y) * Pr(U)',
  'Pr(Z & U) = Pr(Z) * Pr(U)',
  'Pr(X & Y & Z) = Pr(X) * Pr(Y) * Pr(Z)',
  'Pr(X & Y & U) = Pr(X) * Pr(Y) * Pr(U)',
  'Pr(X & Z & U) = Pr(X) * Pr(Z) * Pr(U)',
  'Pr(Y & Z & U) = Pr(Y) * Pr(Z) * Pr(U)',
  'Pr(X & Y & Z & U) ≠ Pr(X) * Pr(Y) * Pr(Z) * Pr(U)',
]
const SHORT_WAIT_MS = 50

test('direct Z3 rejects a reliable contradiction in LET_K+', async ({ page }) => {
  await to_load(page)
  await set_block_input(page, TestId.generic_multi_input('constraints'), [
    'Pr(A & ~A & ○A) = 1',
  ])
  await find_model(page, 'unsat', DEFAULT_TIMEOUT)
})

test('cancelling shows cancel message', async ({ page }) => {
  await to_load(page)

  const constraint_test_ids = TestId.generic_multi_input('constraints')
  await set_block_input(page, constraint_test_ids, LONGISH_SOLVE)

  await find_model(page, 'cancelled')
  await page.waitForTimeout(SHORT_WAIT_MS)
  await cancel_solve(page, 20 * 1000)
})

type SplitInputLocators = {
  element: Locator
  input: Locator
  close: Locator
  newline: Locator
  output: Locator
}

type MultiInputBlockLocators = {
  element: Locator
  batch: {
    element: Locator,
    textbox: Locator
    parse_button: Locator
  }
  splits: SplitInputLocators[]
}

const get_multi_input_block = (page: Page, test_ids: TestId.GenericMultiInputTestIds, split_input_start_index: number, n_split_inputs: number): MultiInputBlockLocators => {
  const block = page.getByTestId(test_ids.id)
  const batch = block.getByTestId(test_ids.batch.id)
  const batch_textbox = block.getByTestId(test_ids.batch.textbox)
  const batch_parse_button = block.getByTestId(test_ids.batch.textbox)
  const split_inputs: SplitInputLocators[] = []

  // Won't always work starting from zero, so check difference in actual test-id index and expected input_index if the element appears missing.
  const start_index = split_input_start_index
  const end_index = start_index + n_split_inputs
  for (let input_index = start_index; input_index < end_index; input_index++) {
    const si = block.getByTestId(test_ids.split.single.get(input_index))
    split_inputs.push({
      element: si,
      input: si.getByTestId(test_ids.split.input),
      close: si.getByTestId(test_ids.split.close),
      newline: si.getByTestId(test_ids.split.newline),
      output: si.getByTestId(test_ids.split.output),
    })
  }

  return {
    element: block,
    batch: {
      element: batch,
      textbox: batch_textbox,
      parse_button: batch_parse_button,
    },
    splits: split_inputs,
  }
}

const expect_disabled = async (loc: Locator, disabled: boolean): Promise<void> => {
  if (disabled) {
    await expect(loc).toBeDisabled()
  } else {
    await expect(loc).not.toBeDisabled()
  }
}

const expect_multi_input_block_disabled = async (block: MultiInputBlockLocators, disabled: boolean): Promise<void> => {
  if (await block.batch.element.isVisible()) {
    await expect_disabled(block.batch.textbox, disabled)
    await expect_disabled(block.batch.parse_button, disabled)
  }

  for (const si of block.splits) {
    await expect_disabled(si.close, disabled)
    await expect_disabled(si.input, disabled)
    await expect_disabled(si.newline, disabled)
  }
}

test('disable all input elements during solve', async ({ page }) => {
  await to_load(page)

  const constraint_test_ids = TestId.generic_multi_input('constraints')
  const constraint_input_array = LONGISH_SOLVE
  await set_block_input(page, constraint_test_ids, constraint_input_array)

  find_model(page, 'cancelled').catch((e) => { throw e })
  await page.waitForTimeout(SHORT_WAIT_MS)

  const constraint_block = get_multi_input_block(page, constraint_test_ids, 0, constraint_input_array.length)
  await expect_multi_input_block_disabled(constraint_block, true)
})

test('re-enable all input elements on cancel', async ({ page }) => {
  await to_load(page)

  const constraint_test_ids = TestId.generic_multi_input('constraints')
  const constraint_input_array = LONGISH_SOLVE
  await set_block_input(page, constraint_test_ids, constraint_input_array)

  await find_model(page, 'cancelled')
  await page.waitForTimeout(SHORT_WAIT_MS)
  await cancel_solve(page, Constants.CANCEL_OVERRIDE_TIMEOUT_MS + 10 * 1000)  // Boooo!

  const constraint_block = get_multi_input_block(page, constraint_test_ids, 0, constraint_input_array.length)
  await expect_multi_input_block_disabled(constraint_block, false)
})

test('re-enable all input elements on solve', async ({ page }) => {
  await to_load(page)

  const constraint_test_ids = TestId.generic_multi_input('constraints')
  const constraint_input_array = ['Pr(A & B) = Pr(A) * Pr(B)']
  await set_block_input(page, constraint_test_ids, constraint_input_array)
  await find_model(page, 'sat')

  const constraint_block = get_multi_input_block(page, constraint_test_ids, 0, constraint_input_array.length)
  await expect_multi_input_block_disabled(constraint_block, false)
})

test.skip('cancel takes at most a few seconds on long solves', { tag: '@slow' }, async ({ page }) => {
  test.setTimeout(2 * 1000 * 60)  // 2 minutes to account for the long waits.
  await to_load(page)

  const constraint_test_ids = TestId.generic_multi_input('constraints')
  const constraint_input_array = SUPER_LONG_SOLVE
  await set_block_input(page, constraint_test_ids, constraint_input_array)

  find_model(page, 'cancelled').catch((e) => { throw e })
  await page.waitForTimeout(1.5 * 1000 * 60)  // I'm not going to want to run this test every time, but this should ensure the cancel takes forever.

  await cancel_solve(page, Constants.CANCEL_OVERRIDE_TIMEOUT_MS + 2000)  // booooooo
})

test('eval during 2nd solve says no model', async ({ page }) => {
  await to_load(page)

  const constraint_test_ids = TestId.generic_multi_input('constraints')
  const constraint_input_array1 = ['Pr(A & B) = Pr(A) * Pr(B)']
  await set_block_input(page, constraint_test_ids, constraint_input_array1)
  await find_model(page, 'sat')

  const constraint_input_array2 = LONGISH_SOLVE
  await set_block_input(page, constraint_test_ids, constraint_input_array2)
  const second_solve = find_model(page, 'cancelled').catch((e) => { throw e })
  await page.waitForTimeout(SHORT_WAIT_MS)

  const eval_test_ids = TestId.generic_multi_input('eval')
  const eval_input_array = ['Pr(A)', 'Pr(B)']
  await set_block_input(page, eval_test_ids, eval_input_array)

  const eval_block = get_multi_input_block(page, eval_test_ids, 0, eval_input_array.length)
  await expect(eval_block.splits[0].output).toContainText(Constants.NO_MODEL)

  await cancel_solve(page)
  await second_solve
})

test('eval after 1st solve after invalidation does NOT say no model', async ({ page }) => {
  await to_load(page)

  const constraint_test_ids = TestId.generic_multi_input('constraints')
  const constraint_input_array1 = ['Pr(A & B) = Pr(A) * Pr(B)']
  await set_block_input(page, constraint_test_ids, constraint_input_array1)
  await find_model(page, 'sat')

  const constraint_input_array2 = LONGISH_SOLVE
  await set_block_input(page, constraint_test_ids, constraint_input_array2)

  const eval_test_ids = TestId.generic_multi_input('eval')
  const eval_input_array = ['Pr(A)', 'Pr(B)']
  await set_block_input(page, eval_test_ids, eval_input_array)

  const eval_block = get_multi_input_block(page, eval_test_ids, 0, eval_input_array.length)
  await expect(eval_block.splits[0].output).not.toContainText(Constants.NO_MODEL)
})
