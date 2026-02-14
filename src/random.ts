import { assert, assert_exists } from "./utils";

export type Bounds = { lower: number, upper: number }
export type StringParams = { bounds: Bounds, characters: string }

export class Random {
  static readonly default_seed_length_bounds: Bounds = { lower: 5, upper: 10 }
  static readonly default_float_bounds: Bounds = { lower: -100000, upper: 100000 }
  static readonly default_int_bounds: Bounds = { lower: -100000, upper: 100000 }
  static readonly default_string_params: StringParams = {
    bounds: { lower: 1, upper: 30 },
    characters: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456',
  }

  public readonly seed_string: string
  public readonly seed: number
  private readonly rand: () => number

  constructor(seed?: string) {
    this.seed_string = seed ?? unseeded_random_string(Random.default_seed_length_bounds)
    this.seed = cyrb128(this.seed_string)[0]
    this.rand = splitmix32(this.seed)
  }

  unit(): number {
    return this.rand()
  }

  boolean(): boolean {
    return this.integer({ lower: 0, upper: 1 }) === 0
  }

  float(bounds: Bounds = Random.default_float_bounds): number {
    assert_consistent_float_bounds(bounds)
    const min = bounds.lower
    const max = bounds.upper
    return this.rand() * (max - min + 1) + min
  }

  integer(bounds: { lower: number, upper: number } = Random.default_int_bounds) {
    assert_consistent_integer_bounds(bounds)
    const min = Math.ceil(bounds.lower)
    const max = Math.floor(bounds.upper)
    return Math.floor(this.rand() * (max - min + 1)) + min
  }

  string(params: StringParams = Random.default_string_params): string {
    assert_consistent_string_params(params)
    const length = this.integer(params.bounds)
    const cs = []

    for (let i = 0; i < length; i++) {
      cs.push(this.pick(params.characters.split('')))
    }

    return cs.join('')
  }

  pick<T>(options: T[]): T {
    assert(options.length > 0, 'Trying to pick from a list of zero options!')
    const index = this.integer({ lower: 0, upper: options.length - 1 })
    return assert_exists(options[index])
  }
}

export const assert_consistent_integer_bounds = (bounds: Bounds) => {
  assert(Number.isInteger(bounds.lower), `Lower bound is not an integer!\nlower: ${bounds.lower}\nupper: ${bounds.upper}`)
  assert(Number.isInteger(bounds.upper), `Upper bound is not an integer!\nlower: ${bounds.lower}\nupper: ${bounds.upper}`)
  assert(bounds.lower <= bounds.upper, `Lower bound > upper bound!\nlower: ${bounds.lower}\nupper: ${bounds.upper}`)
}

export const assert_consistent_float_bounds = (bounds: Bounds) => {
  assert(bounds.lower <= bounds.upper, `Lower bound > upper bound!\nlower: ${bounds.lower}\nupper: ${bounds.upper}`)
}

export const assert_consistent_string_params = (params: StringParams) => {
  assert_consistent_integer_bounds(params.bounds)
}

const unseeded_random_int = (bounds: Bounds): number => {
  assert_consistent_integer_bounds(bounds)
  const min = Math.ceil(bounds.lower)
  const max = Math.floor(bounds.upper);
  return Math.floor(Math.random() * (max - min + 1)) + min
}

const unseeded_randomly_pick = <T>(options: T[]): T => {
  return assert_exists(options[unseeded_random_int({ lower: 0, upper: options.length - 1 })])
}

// const unseeded_random_bool = (): boolean => {
//   return unseeded_random_int({ lower: 0, upper: 2 }) === 0
// }

const unseeded_random_string = (bounds: { lower: number, upper: number }): string => {
  assert(bounds.lower <= bounds.upper, `lower bound > upper bound: ${bounds.lower} > ${bounds.upper}`)

  const options = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456'.split('')
  const length = unseeded_random_int(bounds)
  const cs = []

  for (let i = 0; i < length; i++) {
    cs.push(unseeded_randomly_pick(options))
  }

  return cs.join('')
}

// Everything else in this file is from
// https://stackoverflow.com/questions/521295/seeding-the-random-number-generator-in-javascript.
function splitmix32(a: number): () => number {
  return function() {
    a |= 0;
    a = a + 0x9e3779b9 | 0;
    let t = a ^ a >>> 16;
    t = Math.imul(t, 0x21f0aaad);
    t = t ^ t >>> 15;
    t = Math.imul(t, 0x735a2d97);
    return ((t = t ^ t >>> 15) >>> 0) / 4294967296;
  }
}

// Generates hashes given a string
function cyrb128(s: string) {
  let h1 = 1779033703, h2 = 3144134277,
      h3 = 1013904242, h4 = 2773480762;
  for (let i = 0, k; i < s.length; i++) {
      k = s.charCodeAt(i);
      h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
      h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
      h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
      h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= (h2 ^ h3 ^ h4), h2 ^= h1, h3 ^= h1, h4 ^= h1;
  return [h1>>>0, h2>>>0, h3>>>0, h4>>>0];
}
