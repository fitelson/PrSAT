import { test, expect, Page, Locator } from '@playwright/test'
import * as TestId from './test_ids'
import * as Constants from '../src/constants'
import { fallthrough } from '../src/utils'

const URL = 'http://localhost:5173/'
const DEFAULT_TIMEOUT = 20_000

const to_load = async (page: Page): Promise<void> => {
  await page.goto(URL)
  await expect(page.getByTestId(TestId.z3_status)).toBeEmpty({ timeout: DEFAULT_TIMEOUT })
}

const expect_state_display = async (page: Page, text: string, timeout_ms?: number): Promise<void> => {
  const state_display = page.getByTestId(TestId.state_display_id)
  await expect(state_display).toContainText(text, { timeout: timeout_ms })
}

const find_model = async (page: Page, with_result: 'sat' | 'unsat' | 'unknown' | 'cancelled', timeout_ms?: number) => {
  const state_display = page.getByTestId(TestId.state_display_id)
  await page.getByTestId(TestId.find_model).click()
  // Right after we click, we want to be searching!
  await state_display.getByText(Constants.SEARCH).isVisible()

  if (with_result === 'sat') {
    await expect(state_display).toContainText(Constants.SAT, { timeout: timeout_ms })
  } else if (with_result === 'unsat') {
    await expect(state_display).toContainText(Constants.UNSAT, { timeout: timeout_ms })
  } else if (with_result === 'unknown') {
    await expect(state_display).toContainText(Constants.UNKNOWN, { timeout: timeout_ms })
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

test('multiple constraints', async ({ page }) => {
  await to_load(page)
  const single_inputs: Locator[] = []
  const test_ids = TestId.generic_multi_input('constraints')

  single_inputs.push(page.getByTestId(test_ids.split.single.get(0)))
  await expect(single_inputs[0]).toBeVisible()
  await single_inputs[0].getByTestId(test_ids.split.input).fill('Pr(A & B & C) = Pr(A) * Pr(B) * Pr(C)')
  await single_inputs[0].getByTestId(test_ids.split.newline).click()

  single_inputs.push(page.getByTestId(test_ids.split.single.get(1)))
  await expect(single_inputs[1]).toBeVisible()
  await single_inputs[1].getByTestId(test_ids.split.input).fill('Pr(A & B) = Pr(A) * Pr(B)')
  await single_inputs[1].getByTestId(test_ids.split.newline).click()

  single_inputs.push(page.getByTestId(test_ids.split.single.get(2)))
  await expect(single_inputs[2]).toBeVisible()
  await single_inputs[2].getByTestId(test_ids.split.input).fill('Pr(A & C) = Pr(A) * Pr(C)')
  await single_inputs[2].getByTestId(test_ids.split.newline).click()

  single_inputs.push(page.getByTestId(test_ids.split.single.get(3)))
  await expect(single_inputs[3]).toBeVisible()
  await single_inputs[3].getByTestId(test_ids.split.input).fill('Pr(B & C) = Pr(B) * Pr(C)')

  await find_model(page, 'sat')
  await expect(page.getByTestId(TestId.model_table)).toBeVisible({ timeout: DEFAULT_TIMEOUT })
  await expect(page.getByText(Constants.SAT)).toBeVisible()
})

test('weird model', async ({ page }) => {
  await to_load(page)
  const single_inputs: Locator[] = []
  const test_ids = TestId.generic_multi_input('constraints')

  page.getByTestId(TestId.regular_toggle).check()

  single_inputs.push(page.getByTestId(test_ids.split.single.get(0)))
  await expect(single_inputs[0]).toBeVisible()
  await single_inputs[0].getByTestId(test_ids.split.input).fill('Pr(A & B & C) > Pr(A & B) * Pr(C)')
  await single_inputs[0].getByTestId(test_ids.split.newline).click()

  single_inputs.push(page.getByTestId(test_ids.split.single.get(1)))
  await expect(single_inputs[1]).toBeVisible()
  await single_inputs[1].getByTestId(test_ids.split.input).fill('Pr(A & B) = Pr(A) * Pr(B)')
  await single_inputs[1].getByTestId(test_ids.split.newline).click()

  single_inputs.push(page.getByTestId(test_ids.split.single.get(2)))
  await expect(single_inputs[2]).toBeVisible()
  await single_inputs[2].getByTestId(test_ids.split.input).fill('Pr(A & C) = Pr(A) * Pr(C)')
  await single_inputs[2].getByTestId(test_ids.split.newline).click()

  single_inputs.push(page.getByTestId(test_ids.split.single.get(3)))
  await expect(single_inputs[3]).toBeVisible()
  await single_inputs[3].getByTestId(test_ids.split.input).fill('Pr(B & C) = Pr(B) * Pr(C)')
  await single_inputs[3].getByTestId(test_ids.split.newline).click()

  single_inputs.push(page.getByTestId(test_ids.split.single.get(4)))
  await expect(single_inputs[4]).toBeVisible()
  await single_inputs[4].getByTestId(test_ids.split.input).fill('Pr(A & B) = Pr(C)')

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
const MEDIUM_SOLVE: string[] = [
  'Pr(A & B) = Pr(A) * Pr(B)',
  'Pr(A & C) = Pr(A) * Pr(C)',
  'Pr(B & C) = Pr(B) * Pr(C)',
  'Pr(A & B & C) ≠ Pr(A) * Pr(B) * Pr(C)',
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

test.skip('cancelling shows cancel message', async ({ page }) => {
  await to_load(page)

  const constraint_test_ids = TestId.generic_multi_input('constraints')
  await set_block_input(page, constraint_test_ids, LONGISH_SOLVE)

  find_model(page, 'cancelled').catch((e) => { throw e })
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

test.skip('re-enable all input elements on cancel', async ({ page }) => {
  await to_load(page)

  const constraint_test_ids = TestId.generic_multi_input('constraints')
  const constraint_input_array = LONGISH_SOLVE
  await set_block_input(page, constraint_test_ids, constraint_input_array)

  find_model(page, 'cancelled').catch((e) => { throw e })
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

const set_timeout = async (page: Page, total_seconds: number): Promise<void> => {
  const timeout_e = page.getByTestId(TestId.timeout.id)
  const seconds_e = timeout_e.getByTestId(TestId.timeout.seconds)
  await seconds_e.fill(total_seconds.toString())
}

test('eval during 2nd solve says no model then updates correctly with model', { tag: '@slow' }, async ({ page }) => {
  test.setTimeout(2 * 1000 * 60)  // 2 minutes to account for solve.
  await to_load(page)

  const solve_timeout_s = 2 * 60
  await set_timeout(page, solve_timeout_s)

  const constraint_test_ids = TestId.generic_multi_input('constraints')
  const constraint_input_array = ['Pr(A & B) = Pr(A) * Pr(B)']
  await set_block_input(page, constraint_test_ids, constraint_input_array)
  await find_model(page, 'sat')

  const constraint_input_array2 = MEDIUM_SOLVE
  await set_block_input(page, constraint_test_ids, constraint_input_array2)
  const second_solve = find_model(page, 'sat', solve_timeout_s * 1000)
  // await find_model(page, 'sat', solve_timeout_s * 1000)
  await page.waitForTimeout(SHORT_WAIT_MS)

  const eval_test_ids = TestId.generic_multi_input('eval')
  const eval_input_array = ['Pr(-A & -B)']
  await set_block_input(page, eval_test_ids, eval_input_array)

  const eval_block = get_multi_input_block(page, eval_test_ids, 0, 1)
  await expect(eval_block.splits[0].output).toContainText(Constants.NO_MODEL)
  await second_solve
  await expect(eval_block.splits[0].output).not.toContainText(Constants.NO_MODEL)
})
