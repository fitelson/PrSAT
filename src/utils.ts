export function zip<T1, T2>(l1: T1[], l2: T2[]): [T1, T2][] {
    if (l1.length !== l2.length)
        throw new Error("Lists must be same length in order to zip together")
    return l1.map((e, i) => [e, l2[i]])
}

export const dedupe = <T>(arr: T[]): T[] => [...new Set(arr)]

export const separate_by = <T>(arr: T[], t: T): T[] => {
    const new_arr: T[] = []
    for (const [index, current] of arr.entries()) {
        new_arr.push(current)
        if (index < arr.length - 1)
            new_arr.push(t)
    }
    return new_arr
}

export const arrays_equal = <T>(l1: T[], l2: T[], elements_equal: (t1: T, t2: T) => boolean = (t1, t2) => t1 === t2): boolean =>
    l1.length === l2.length && zip(l1, l2).every(([t1, t2]) => elements_equal(t1, t2))
export const first = <T>(arr: T[]): T => arr[0]

export const last = <T>(arr: T[]): T | undefined => arr[arr.length - 1]

export const rest = <T>(arr: T[]): T[] => arr.slice(1)

export const all_but_last = <T>(arr: T[]): T[] => arr.slice(0, -1)

export const string_in_array = (stra: string[], str: string): boolean => stra.some((in_a) => str === in_a)

export const replace_at_index = <T>(arr: T[], index: number, replacement: T): T[] => { const ret = arr.slice(); ret.splice(index, 1, replacement); return ret }

export const remove_index = <T>(arr: T[], index: number): T[] => [...arr.slice(0, index), ...arr.slice(index + 1)]

export const invert_string_array = (array: string[]): Record<string, number> =>
    array.length === 0 ? ({})
    : Object.assign({ [array[array.length - 1]]: array.length - 1 }, invert_string_array(array.slice(0, -1)))

/*
- Takes two arrays with elements of the same type T | undefined and of the same length.
- A new array is produced with the same length.
- An entry at index i in the return array ret[i] is equal to arr1[i], or arr2[i] if arr1[i] is undefined.
*/
export const fit_arrays = <T>(arr1: (T | undefined)[], arr2: (T | undefined)[]): (T | undefined)[] => zip(arr1, arr2).map(([e1, e2]) => e1 === undefined ? e2 : e1)

export const defined = <T>(v: T | undefined): v is T => v !== undefined

export const declare = <Value, K>(value: Value, k: (value: Value) => K): K => k(value)

export const is_object = (o: any): o is object => typeof o === "object" && o !== null && !Array.isArray(o)

export const is_any = (_a: any): _a is any => true

export const index_out_of_bounds = (index: number, length: number): boolean => index < 0 || length <= index

export const is_string = (s: any): s is string => typeof s === "string"

export const is_integer = (i: number): boolean => Number.isInteger(i)

export const is_number = (i: any): i is number => typeof i === "number"

export const is_unit = (o: any): o is [] => Array.isArray(o) && o.length === 0

export const is_array = (a: any): a is any[] => Array.isArray(a)

export const is_empty = (a: any): a is [] => is_array(a) && a.length === 0

export const object_from_entries = <T>(...entries: [string, T][]): { [key: string]: T } =>
    entries.reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {})

export const display_or_undefined = <T>(display_func: (o: T) => any, o: T | undefined) =>
    defined(o) ? display_func(o) : 'undefined'

export const match_defined = <T, Return>(v: T | undefined, def: (v: T) => Return, und: () => Return): Return => {
    if (defined(v))
        return def(v)
    return und()
}

// : <T>((e1: T, e2: T) => boolean), T, T, => boolean
export const arrays_are_equal = <T>(elements_are_equal: (t1: T, t2: T) => boolean, arr1: T[], arr2: T[]) => {
  if (arr1.length !== arr2.length)
    return false
  for (const [index, e1] of arr1.entries())
    if (!elements_are_equal(e1, arr2[index]))
      return false
  return true
}

export const assert_exists = <T>(t?: T | null, msg?: string): T => {
    if (t === undefined || t === null)
        throw new Error(msg ?? 'doesn\'t exist!')
    return t
}

export const assert_defined = <T>(t: T | undefined, msg?: string): T => {
    if (t === undefined)
        throw new Error(msg ?? 'doesn\'t exist!')
    return t
}

export const assert = (condition: boolean, message: string = ''): void => {
    if (!condition)
        throw new Error(message)
}

export const map_exists = <T, R>(t: T | undefined, f: (t: T) => R): R | undefined => {
    if (t === undefined) {
        return undefined
    }
    return f(t)
}

export type UnionToIntersection<U> = (U extends any ? (x: U) => void : never) extends ((x: infer I) => void) ? I : never
export type NumericKeys<T extends readonly unknown[]> = Exclude<keyof T, keyof any[]>;
export type ArrayToUnion<A extends unknown[]> = A[NumericKeys<A>]
export type RecordToUnion<A extends Record<string, unknown>> = A[keyof A]

export type Identity<T> = T extends object ? {} & {
  [P in keyof T]: T[P]
} : T;

export type Res<S, F> = [true, S] | [false, F]

export const assert_result = <T>(r: Res<T, string>): T => {
    const [status, t] = r
    if (!status) {
        throw new Error(t)
    } else {
        return t
    }
}

export const include_exclude_set = (universe: string[], include?: string[], exclude?: string[]): Set<string> => {
    return new Set(include_exclude_array(universe, include, exclude))
}

export const include_exclude_array = (universe: string[], include?: string[], exclude?: string[]): string[] => {
    const U = universe
    const I = new Set(include ?? U)
    const E = new Set(exclude ?? [])
    const R = U.filter((uk) => I.has(uk) && !E.has(uk))
    return R
}

export const narrow_include_exclude_set = (previous_set: Set<string>, include?: string[], exclude?: string[]): Set<string> => {
    if (include !== undefined || exclude !== undefined) {
        const universe = [...previous_set]
        return include_exclude_set(universe, include, exclude)
    } else {
        return previous_set
    }
}

export const record_keys = <R extends Record<string, unknown>>(r: R): (keyof R & string)[] => {
  return Object.keys(r)
}

export const map_record = <
    R extends Record<string, unknown>,
    V2 extends unknown,
    T extends { [K in keyof R]: unknown }
>(
    record: R,
    f: (k: keyof R, v: R[keyof R]) => V2
): T => {
    const new_r = {} as any
    for (const key of record_keys(record)) {
        const value = record[key]
        new_r[key] = f(key, value)
    }
    return new_r
}

export const lazy = <T>(make: () => T): { get: () => T } => {
    let value: T | undefined = undefined
    return {
        get: () => {
        if (value === undefined) {
            value = make()
        }
        return value
        }
    }
}

export const fallthrough = <R>(fname: string, _t: never): R => {
    throw new Error(`${fname} fallthrough`)
}

export const as_array = <T, O>(t: T[] | O, message: string = 'Expected array!'): T[] => {
    if (Array.isArray(t)) {
        return t
    } else {
        throw new Error(message)
    }
}

export const readonly = <T extends {}>(t: T): Readonly<T> => {
    return t
}

// Returns true if cancelled, false otherwise.
export const sleep = async (timeout_ms: number, abort_signal?: AbortSignal): Promise<boolean> => {
    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            resolve(false)
        }, timeout_ms)

        const on_cancel = () => {
            clearTimeout(timeout)
            resolve(true)
        }
        abort_signal?.addEventListener('abort', on_cancel)
    })
}
