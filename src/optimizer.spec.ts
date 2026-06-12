import { describe, expect, test } from 'vitest'
import { minimize } from './optimizer'

describe('minimize (Nelder-Mead)', () => {
  test('sphere function — 2D', () => {
    // f(x, y) = x^2 + y^2, minimum at (0, 0)
    const f = (x: number[]) => x[0]! * x[0]! + x[1]! * x[1]!
    const r = minimize(f, [1.5, -1.5])
    expect(r.fMin).toBeLessThan(1e-8)
    expect(Math.abs(r.xMin[0]!)).toBeLessThan(1e-4)
    expect(Math.abs(r.xMin[1]!)).toBeLessThan(1e-4)
    expect(r.reason).toBe('converged')
  })

  test('Rosenbrock function — 2D', () => {
    // f(x, y) = (1 - x)^2 + 100*(y - x^2)^2, minimum at (1, 1) with f=0
    const f = (x: number[]) => {
      const a = 1 - x[0]!
      const b = x[1]! - x[0]! * x[0]!
      return a * a + 100 * b * b
    }
    const r = minimize(f, [0, 0], { maxIter: 5000 })
    expect(r.fMin).toBeLessThan(1e-6)
    expect(Math.abs(r.xMin[0]! - 1)).toBeLessThan(1e-3)
    expect(Math.abs(r.xMin[1]! - 1)).toBeLessThan(1e-3)
  })

  test('sphere function — 4D', () => {
    const f = (x: number[]) => x.reduce((s, xi) => s + xi * xi, 0)
    const r = minimize(f, [0.5, -0.5, 0.7, -0.3])
    expect(r.fMin).toBeLessThan(1e-8)
  })

  test('earlyStopBelow returns quickly when condition met', () => {
    // Any vertex where f < 0 should bail out.
    const f = (x: number[]) => x[0]! - 1  // minimum at -inf; but crosses 0 at x=1
    const r = minimize(f, [10], { earlyStopBelow: 0, maxIter: 1000 })
    expect(r.reason).toBe('early_stop')
    expect(r.iterations).toBeLessThan(200)
    expect(r.fMin).toBeLessThan(0)
  })

  test('earlyStopBelow NOT triggered when always positive', () => {
    const f = (x: number[]) => x[0]! * x[0]! + 1  // always >= 1
    const r = minimize(f, [5], { earlyStopBelow: 0 })
    expect(r.reason).not.toBe('early_stop')
  })

  test('maxIter stops runaway', () => {
    // A function that encourages divergence
    const f = (x: number[]) => -x[0]!  // unbounded below
    const r = minimize(f, [0], { maxIter: 50 })
    expect(r.reason).toBe('max_iter')
    expect(r.iterations).toBe(50)
  })

  test('zero-dim shortcut', () => {
    const r = minimize(() => 42, [])
    expect(r.fMin).toBe(42)
    expect(r.xMin).toEqual([])
  })

  test('non-smooth (max of linears) — Nelder-Mead handles modestly', () => {
    // f(x) = max(x - 1, -x - 1, 0.5*x^2)  — minimum near x=0
    const f = (x: number[]) => Math.max(x[0]! - 1, -x[0]! - 1, 0.5 * x[0]! * x[0]!)
    const r = minimize(f, [3], { maxIter: 2000 })
    expect(r.fMin).toBeLessThan(0.01)
  })

  test('abort signal — polled every 100 iters', async () => {
    const ac = new AbortController()
    // Unbounded problem that would otherwise run forever within maxIter.
    const f = (x: number[]) => -x[0]!
    // Abort right away.
    ac.abort()
    const r = minimize(f, [0], { abort_signal: ac.signal, maxIter: 10000 })
    expect(r.reason).toBe('cancelled')
  })
})
