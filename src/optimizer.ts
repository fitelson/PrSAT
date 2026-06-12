// Nelder-Mead simplex optimizer for the random-search solver.
//
// Classical parameters (α=1, γ=2, ρ=0.5, σ=0.5). Supports an `earlyStopBelow`
// threshold so we can abort as soon as any simplex vertex satisfies the
// constraints (f < 0), without driving all the way to the global minimum.
//
// Not a general-purpose optimizer: deliberately simple, ~150 lines, no deps.
// Known limits: degrades above ~20 dimensions; can stall at non-smooth seams
// (Math.max / Math.min in cost_function.ts). We handle this with multi-start
// retries in random_search.ts.

export type NumericFn = (x: number[]) => number

export type MinimizeOptions = {
  maxIter: number           // hard cap on iterations. Default 500 * dim.
  xTol: number              // simplex diameter below which we converge.
  fTol: number              // simplex function-value range below which we converge.
  earlyStopBelow: number    // return as soon as any vertex has f < this.
  initialStep: number       // simplex edge length. Default 0.05.
  abort_signal?: AbortSignal
}

const DEFAULTS: Omit<MinimizeOptions, 'maxIter' | 'abort_signal'> = {
  xTol: 1e-8,
  fTol: 1e-10,
  earlyStopBelow: Number.NEGATIVE_INFINITY,
  initialStep: 0.05,
}

export type MinimizeReason = 'early_stop' | 'converged' | 'max_iter' | 'cancelled'

export type MinimizeResult = {
  fMin: number
  xMin: number[]
  iterations: number
  reason: MinimizeReason
}

const vec_sub = (a: number[], b: number[]): number[] => a.map((ai, i) => ai - b[i]!)
const vec_add = (a: number[], b: number[]): number[] => a.map((ai, i) => ai + b[i]!)
const vec_scale = (a: number[], s: number): number[] => a.map((ai) => ai * s)
const vec_distance = (a: number[], b: number[]): number => {
  let s = 0
  for (let i = 0; i < a.length; i++) { const d = a[i]! - b[i]!; s += d * d }
  return Math.sqrt(s)
}

// Build initial simplex: x0 plus one perturbation per dimension.
const build_initial_simplex = (x0: number[], step: number): number[][] => {
  const n = x0.length
  const simplex: number[][] = [x0.slice()]
  for (let i = 0; i < n; i++) {
    const v = x0.slice()
    v[i] = v[i]! + step
    simplex.push(v)
  }
  return simplex
}

export const minimize = (
  f: NumericFn,
  x0: number[],
  options?: Partial<MinimizeOptions>,
): MinimizeResult => {
  const dim = x0.length
  if (dim === 0) {
    return { fMin: f([]), xMin: [], iterations: 0, reason: 'converged' }
  }
  const opts = {
    ...DEFAULTS,
    maxIter: options?.maxIter ?? 500 * dim,
    ...options,
  }

  const vertices = build_initial_simplex(x0, opts.initialStep)
  const values = vertices.map(f)

  // Nelder-Mead coefficients.
  const alpha = 1, gamma = 2, rho = 0.5, sigma = 0.5

  const check_cancelled = () => opts.abort_signal?.aborted ?? false

  // Sort helper: permute vertices and values by ascending value.
  const sort_simplex = () => {
    const indices = values.map((_, i) => i)
    indices.sort((a, b) => values[a]! - values[b]!)
    const new_vertices = indices.map((i) => vertices[i]!)
    const new_values = indices.map((i) => values[i]!)
    for (let i = 0; i < vertices.length; i++) {
      vertices[i] = new_vertices[i]!
      values[i] = new_values[i]!
    }
  }

  let iter = 0
  for (; iter < opts.maxIter; iter++) {
    if (iter % 100 === 0 && check_cancelled()) {
      sort_simplex()
      return { fMin: values[0]!, xMin: vertices[0]!, iterations: iter, reason: 'cancelled' }
    }

    sort_simplex()

    // Early stop: best vertex already satisfies.
    if (values[0]! < opts.earlyStopBelow) {
      return { fMin: values[0]!, xMin: vertices[0]!, iterations: iter, reason: 'early_stop' }
    }

    // Convergence tests.
    const f_range = values[values.length - 1]! - values[0]!
    let x_diameter = 0
    for (let i = 1; i < vertices.length; i++) {
      const d = vec_distance(vertices[i]!, vertices[0]!)
      if (d > x_diameter) x_diameter = d
    }
    if (f_range < opts.fTol && x_diameter < opts.xTol) {
      return { fMin: values[0]!, xMin: vertices[0]!, iterations: iter, reason: 'converged' }
    }

    // Centroid of all but worst.
    const worst_idx = vertices.length - 1
    const centroid = new Array<number>(dim).fill(0)
    for (let i = 0; i < worst_idx; i++) {
      for (let k = 0; k < dim; k++) centroid[k]! += vertices[i]![k]!
    }
    for (let k = 0; k < dim; k++) centroid[k]! /= worst_idx

    const worst = vertices[worst_idx]!
    const f_worst = values[worst_idx]!
    const f_second_worst = values[worst_idx - 1]!
    const f_best = values[0]!

    // Reflection
    const xr = vec_add(centroid, vec_scale(vec_sub(centroid, worst), alpha))
    const fr = f(xr)

    if (f_best <= fr && fr < f_second_worst) {
      vertices[worst_idx] = xr
      values[worst_idx] = fr
      continue
    }

    if (fr < f_best) {
      // Expansion
      const xe = vec_add(centroid, vec_scale(vec_sub(xr, centroid), gamma))
      const fe = f(xe)
      if (fe < fr) {
        vertices[worst_idx] = xe
        values[worst_idx] = fe
      } else {
        vertices[worst_idx] = xr
        values[worst_idx] = fr
      }
      continue
    }

    // Contraction
    if (fr < f_worst) {
      // Outside contraction
      const xc = vec_add(centroid, vec_scale(vec_sub(xr, centroid), rho))
      const fc = f(xc)
      if (fc <= fr) {
        vertices[worst_idx] = xc
        values[worst_idx] = fc
        continue
      }
    } else {
      // Inside contraction
      const xc = vec_add(centroid, vec_scale(vec_sub(worst, centroid), rho))
      const fc = f(xc)
      if (fc < f_worst) {
        vertices[worst_idx] = xc
        values[worst_idx] = fc
        continue
      }
    }

    // Shrink: everything but best contracts toward best.
    const best = vertices[0]!
    for (let i = 1; i < vertices.length; i++) {
      const v = vec_add(best, vec_scale(vec_sub(vertices[i]!, best), sigma))
      vertices[i] = v
      values[i] = f(v)
    }
  }

  sort_simplex()
  return { fMin: values[0]!, xMin: vertices[0]!, iterations: iter, reason: 'max_iter' }
}
