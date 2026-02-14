import { describe, test, expect } from 'vitest'
import { ModelAssignmentOutput, parse_to_assignment, poly_s, run_solve_cancel_logic } from './z3_integration'
import { S } from './s'
import { sleep } from './utils'

describe('parse_to_assignment', () => {
  describe('negative', () => {
    test('negative rational', () => {
      const s: S = ['-', ['/', '3', '16']]
      const parsed = parse_to_assignment(s)
      const expected: ModelAssignmentOutput = { tag: 'negative', inner: { tag: 'rational', numerator: { tag: 'literal', value: 3 }, denominator: { tag: 'literal', value: 16 } } }
      expect(parsed).toEqual(expected)
    })
  })
  describe('root-obj', () => {
    test('degree 1', () => {
      // Not sure if this will ever be output from a z3 model but its fine.
      const s: S = ['root-obj', ['+', ['*', '3', 'x'], '5'], '1']
      const ps: S = ['root-obj', poly_s([3, 5]), '1']
      expect(ps).toEqual(s)
      const parsed = parse_to_assignment(s)
      const expected: ModelAssignmentOutput = { tag: 'generic-root-obj', degree: 1, coefficients: [3, 5], index: 1 }
      expect(parsed).toEqual(expected)
    })
    test('degree 2', () => {
      const s: S = ['root-obj', ['+', ['*', '3', ['^', 'x', '2']], ['*', '5', 'x'], '4'], '1']
      const ps: S = ['root-obj', poly_s([3, 5, 4]), '1']
      expect(ps).toEqual(s)
      const parsed = parse_to_assignment(s)
      const expected: ModelAssignmentOutput = { tag: 'generic-root-obj', degree: 2, coefficients: [3, 5, 4], index: 1 }
      expect(parsed).toEqual(expected)
    })
    test('degree 3', () => {
      const s: S = ['root-obj', ['+', ['*', '3', ['^', 'x', '3']], ['*', '5', ['^', 'x', '2']], ['*', '4', 'x'], '1'], '3']
      const ps: S = ['root-obj', poly_s([3, 5, 4, 1]), '3']
      expect(ps).toEqual(s)
      const parsed = parse_to_assignment(s)
      const expected: ModelAssignmentOutput = { tag: 'generic-root-obj', degree: 3, coefficients: [3, 5, 4, 1], index: 3 }
      expect(parsed).toEqual(expected)
    })
    test('degree 11', () => {
      // z3 is not guarunteed to explicitly include the coefficient when it's equal to 1 as far as I know, so I
      // need to handle the case where it's implicit.
      const s: S = ['root-obj', ['+', ['*', '3', ['^', 'x', '11']], ['*', '5', ['^', 'x', '10']], ['*', '4', ['^', 'x', '9']], ['*', '1', ['^', 'x', '8']], ['*', '5', ['^', 'x', '7']], ['*', '8', ['^', 'x', '6']], ['*', '19', ['^', 'x', '5']], ['*', '31', ['^', 'x', '4']], ['*', '9', ['^', 'x', '3']], ['*', '7', ['^', 'x', '2']], ['*', '2', 'x'], '89'], '8']
      // const ps: S = ['root-obj', poly([3, 5, 4, 1, 5, 8, 19, 31, 9, 7, 2, 89]), '8']
      // expect(ps).toEqual(s)
      const parsed = parse_to_assignment(s)
      const expected: ModelAssignmentOutput = { tag: 'generic-root-obj', degree: 11, coefficients: [3, 5, 4, 1, 5, 8, 19, 31, 9, 7, 2, 89], index: 8 }
      expect(parsed).toEqual(expected)
    })
    test('degree 11 leave 1s implicit', () => {
      // z3 is not guarunteed to explicitly include the coefficient when it's equal to 1 as far as I know, so I
      // need to handle the case where it's implicit.
      const s: S = ['root-obj', ['+', ['*', '3', ['^', 'x', '11']], ['*', '5', ['^', 'x', '10']], ['*', '4', ['^', 'x', '9']], ['^', 'x', '8'], ['*', '5', ['^', 'x', '7']], ['*', '8', ['^', 'x', '6']], ['*', '19', ['^', 'x', '5']], ['*', '31', ['^', 'x', '4']], ['*', '9', ['^', 'x', '3']], ['*', '7', ['^', 'x', '2']], ['*', '2', 'x'], '89'], '8']
      const ps: S = ['root-obj', poly_s([3, 5, 4, 1, 5, 8, 19, 31, 9, 7, 2, 89]), '8']
      expect(ps).toEqual(s)
      const parsed = parse_to_assignment(s)
      const expected: ModelAssignmentOutput = { tag: 'generic-root-obj', degree: 11, coefficients: [3, 5, 4, 1, 5, 8, 19, 31, 9, 7, 2, 89], index: 8 }
      expect(parsed).toEqual(expected)
    })
    test('badly ordered terms', () => {
      const s: S = ['root-obj', ['+', '1', ['^', 'x', '2']], '1']
      // const parsed = parse_to_assignment(s)
      // expect(parsed).toEqual(true)
      expect(() => parse_to_assignment(s)).toThrow()
    })
    test('mostly zeroes', () => {
      const s: S = ['root-obj', ['+', ['^', 'x', '2'], '1'], '1']
      const parsed = parse_to_assignment(s)
      const expected: ModelAssignmentOutput = { tag: 'generic-root-obj', degree: 2, coefficients: [1, 0, 1], index: 1 }
      expect(parsed).toEqual(expected)
    })
    test('degree 11 with some zeroes', () => {
      const s: S = ['root-obj', ['+', ['*', '3', ['^', 'x', '11']], ['*', '5', ['^', 'x', '10']], ['*', '4', ['^', 'x', '9']], ['^', 'x', '8'], ['*', '5', ['^', 'x', '7']], ['*', '8', ['^', 'x', '6']], ['*', '31', ['^', 'x', '4']], ['*', '9', ['^', 'x', '3']], ['*', '2', 'x'], '89'], '8']
      const ps: S = ['root-obj', poly_s([3, 5, 4, 1, 5, 8, 0, 31, 9, 0, 2, 89]), '8']
      expect(ps).toEqual(s)
      const parsed = parse_to_assignment(s)
      const expected: ModelAssignmentOutput = { tag: 'generic-root-obj', degree: 11, coefficients: [3, 5, 4, 1, 5, 8, 0, 31, 9, 0, 2, 89], index: 8 }
      expect(parsed).toEqual(expected)
    })
    test('with negative coefficients', () => {
      const s: S = ['root-obj', ['+', ['*', ['-', '3'], ['^', 'x', '3']], ['*', '5', ['^', 'x', '2']], ['*', ['-', '4'], 'x'], ['-', '1']], '3']
      const ps: S = ['root-obj', poly_s([-3, 5, -4, -1]), '3']
      expect(ps).toEqual(s)
      const parsed = parse_to_assignment(s)
      const expected: ModelAssignmentOutput = { tag: 'generic-root-obj', degree: 3, coefficients: [-3, 5, -4, -1], index: 3 }
      expect(parsed).toEqual(expected)
    })
    test('implicit 1 with no exp (so just \'x\')', () => {
      const s: S = ['root-obj', ['+', ['^', 'x', '2'], 'x', '1'], '1']
      const parsed = parse_to_assignment(s)
      const expected: ModelAssignmentOutput = { tag: 'generic-root-obj', degree: 2, coefficients: [1, 1, 1], index: 1 }
      expect(parsed).toEqual(expected)
    })
    test('implicit -1 with no exp (so just \'x\')', () => {
      const s: S = ['root-obj', ['+', ['^', 'x', '2'], ['-', 'x'], '1'], '1']
      const parsed = parse_to_assignment(s)
      const expected: ModelAssignmentOutput = { tag: 'generic-root-obj', degree: 2, coefficients: [1, -1, 1], index: 1 }
      expect(parsed).toEqual(expected)
    })
    test('implicit -1 with exp (like \'-x^2\')', () => {
      const s: S = ['root-obj', ['+', ['-', ['^', 'x', '2']], 'x', '1'], '1']
      const parsed = parse_to_assignment(s)
      const expected: ModelAssignmentOutput = { tag: 'generic-root-obj', degree: 2, coefficients: [-1, 1, 1], index: 1 }
      expect(parsed).toEqual(expected)
    })
  })
})

describe('WrappedSolver', () => {
  describe('solve stuff', () => {
    type R = 'finished' | 'cancelled' | 'slow-cancelled'
    const test_cancel = async (
      config: {
        time_before_cancel_ms: number,
        cancel_timeout_ms: number,
        time_to_actually_cancel_ms: number,
        ignore_abort: boolean,
        fudge_ms: number,
      },
      expected_result: R,
    ) => {
      const on_run_timeout = config.time_before_cancel_ms * 200
      const expected_cancel_time = config.time_before_cancel_ms +
        (expected_result === 'slow-cancelled' ? config.cancel_timeout_ms : config.time_to_actually_cancel_ms)
      const ac =  new AbortController

      const on_run = async (signal?: AbortSignal): Promise<R> => {
        const inner_controller = new AbortController()
        const inner_on_cancel = async () => {
          // wait a bit before actually aborting.
          await sleep(config.time_to_actually_cancel_ms)
          if (!config.ignore_abort) {
            inner_controller.abort()  // don't actually abort!
          }
        }
        signal?.addEventListener('abort', inner_on_cancel)
        await sleep(on_run_timeout, inner_controller.signal)
        return 'finished'
      }
      const on_cancel = async (): Promise<R> => {
        return 'cancelled'
      }
      const on_slow_cancel = async (): Promise<R> => {
        return 'slow-cancelled'
      }

      const start = performance.now()
      const [result] = await Promise.all([
        run_solve_cancel_logic(on_run, on_cancel, on_slow_cancel, config.cancel_timeout_ms, ac.signal),
        (async () => {
          await sleep(config.time_before_cancel_ms)
          ac.abort()
        })(),
      ])
      expect(result).toEqual(expected_result)  // slow-cancelled because on_cancel clearly didn't work if on_run is still going.
      const actual_time = performance.now() - start

      expect(Math.abs(actual_time - expected_cancel_time)).toBeLessThan(config.fudge_ms)
    }

    test('cancel within cancel timeout', async () => {
      await test_cancel({
        time_before_cancel_ms: 10,
        cancel_timeout_ms: 50,
        time_to_actually_cancel_ms: 30,
        fudge_ms: 20,
        ignore_abort: false,
      }, 'cancelled')
    })
    test('cancel after cancel timeout', async () => {
      await test_cancel({
        time_before_cancel_ms: 10,
        cancel_timeout_ms: 50,
        time_to_actually_cancel_ms: 60,
        fudge_ms: 20,
        ignore_abort: false,
      }, 'slow-cancelled')
    })

    test('cancel within cancel timeout, but solve ignores the signal', async () => {
      await test_cancel({
        time_before_cancel_ms: 10,
        cancel_timeout_ms: 50,
        time_to_actually_cancel_ms: 30,
        fudge_ms: 20,
        ignore_abort: true,
      }, 'slow-cancelled')
    })
    test('cancel after cancel timeout, but solve ignores the signal', async () => {
      await test_cancel({
        time_before_cancel_ms: 10,
        cancel_timeout_ms: 50,
        time_to_actually_cancel_ms: 60,
        fudge_ms: 20,
        ignore_abort: true,
      }, 'slow-cancelled')
    })
  })
})
