// import { describe, test } from "vitest"
import { assert } from "./utils"

type DebounceFuncs<Args extends unknown[]> =
  | { lead: (...args: Args) => void, trail?: (...args: Args) => void }
  | { lead?: (...args: Args) => void, trail: (...args: Args) => void }
  | { lead: (...args: Args) => void, trail: (...args: Args) => void }

export const debounce = <Args extends unknown[]>(ms: number, funcs: DebounceFuncs<Args>): ((...args: Args) => void) => {
  assert(Number.isInteger(ms), `Trying to call debounce with a non-integer ms!\nms: ${ms}`)
  let timeout: NodeJS.Timeout | undefined = undefined
  const set = (...args: Args) => {
    timeout = setTimeout(() => {
      // This is the trailing edge.
      funcs.trail?.(...args)
      clearTimeout(timeout)
      timeout = undefined
    }, ms)
  }

  return (...args: Args) => {
    if (timeout === undefined) {
      // This is the leading edge.
      funcs.lead?.(...args)
      set(...args)
    } else {
      // We need to wait again.
      clearTimeout(timeout)
      set(...args)
    }
  }
}

// describe('debounce', () => {
//   test('something')
//   const df = debounce(10, { lead: () => console.log('lead'), trail: () => console.log('trail') })
//   for (let i = 0; i < 10; i++) {
//     console.log('call')
//     df()
//   }
// })
