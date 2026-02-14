import {
  assert_exists,
  // Identity
} from "./utils"

export type S =
  | SAtom
  | S[]

type SAtom =
  | string
  | number
  | boolean

export const s_to_string = (s: S, wrap_strings: boolean = true): string => {
  if (typeof s === 'string') {
    if (wrap_strings) {
      return `'${s}'`
    } else {
      return `${s}`
    }
  } else if (typeof s === 'number') {
    return s.toString()
  } else if (typeof s === 'boolean') {
    return s ? 'true' : 'false'
  } else if (Array.isArray(s)) {
    return `(${s.map((s) => s_to_string(s, wrap_strings)).join(' ')})`
  } else {
    throw new Error('s_to_string fallthrough')
  }
}

type SType =
  | 's'
  | 'string'
  | 'number'
  | 'boolean'
  | 'list'

type STypeToS<ST extends SType> =
  ST extends 's' ? S
  : ST extends 'string' ? string
  : ST extends 'number' ? number
  : ST extends 'boolean' ? boolean
  : ST extends 'list' ? S[]
  : never

type MatchSClause<Vars extends Record<string, SType>, R> = [Vars, ClausePattern<Vars>, (m: SMatch<Vars>) => R]

type ClausePattern<Vars extends Record<string, SType>> =
  | SAtom
  | SPatternVar<Vars, keyof Vars & string>
  // | SPatternListVar<Vars, keyof Vars & string>
  | ClausePattern<Vars>[]

type SPatternVar<Vars extends Record<string, SType>, Id extends keyof Vars & string> = {
  tag: 's-pattern-var'
  id: Id
}

export const spv = <Vars extends Record<string, SType>, Id extends keyof Vars & string>(id: Id): SPatternVar<Vars, Id> => ({
  tag: 's-pattern-var',
  id,
})

// type SPatternListVar<Vars, Id extends keyof Vars & string> = {
//   tag: 's-pattern-list-var'
//   id: Vars[Id] extends 'list' ? Id : never
// }

// const spvl = <Vars extends Record<string, SType>, Id extends keyof Vars & string>(id: Vars[Id] extends 'list' ? Id : never): SPatternListVar<Vars, Id> => ({
//   tag: 's-pattern-list-var',
//   id,
// })

type SMatch<Vars extends Record<string, SType>> = <Id extends keyof Vars & string>(id: Id) => {} extends Vars ? never : STypeToS<Vars[Id]>
// type SMatch<Vars extends Record<string, SType>> = <Id extends keyof Vars>(id: Id) => undefined

// type RefU<R extends Record<any, any>, K extends keyof R> = Identity<{ tag: K } & R[K]>
// type U<R extends Record<any, any>> = {
//   get: { [K in keyof R]: RefU<R, K> }
//   union: { [K in keyof R]: RefU<R, K> }[keyof R]
// }

// type PreMatch = U<{
//   empty: {}
//   non_empty: { entry: { id: string, expr: S }, rest: PreMatch['union'] }
// }>

// const pm_mt = (): PreMatch['get']['empty'] => ({ tag: 'empty' })
// const pm_nmt = (id: string, expr: S, rest: PreMatch['union']): PreMatch['get']['non_empty'] =>
//   ({ tag: 'non_empty', entry: { id, expr }, rest })

// const pre_match_to_record = (pm: PreMatch['union']): Record<string, S> => {
//   throw new Error('unimplemented')
// }

const attempt_match = (s: S, vars: Record<string, SType>, pattern: ClausePattern<any>): Record<string, S> | undefined => {
  const sub = (s: S, pattern: ClausePattern<any>, acc: Record<string, S>): Record<string, S> | undefined => {
    if (typeof pattern === 'string' && typeof s === 'string' && pattern === s) {
      return acc
    } else if (typeof pattern === 'boolean' && typeof s === 'boolean' && pattern === s) {
      return acc
    } else if (typeof pattern === 'number' && typeof s === 'number' && pattern === s) {
      return acc
    } else if (Array.isArray(pattern) && Array.isArray(s)) {
      if (pattern.length > s.length) {
        return undefined
      }
      let pm = acc
      for (let pi = 0; pi < pattern.length; pi++) {
        const current_pattern = pattern[pi]
        const current_expr = s[pi]
        const next_match = sub(current_expr, current_pattern, acc)
        if (next_match === undefined) {
          return undefined
        }
        pm = next_match
      }
      return pm
    } else if (typeof pattern === 'object' && 'tag' in pattern) {
      if (pattern.tag === 's-pattern-var') {
        const st = vars[pattern.id]
        if (st === 'string' && typeof s === 'string') {
          // If pattern.id is already set, just override it.
          acc[pattern.id] = s
          return acc
        } else if (st === 'boolean' && typeof s === 'boolean') {
          acc[pattern.id] = s
          return acc
        } else if (st === 'number' && typeof s === 'number') {
          acc[pattern.id] = s
          return acc
        } else if (st === 'list' && Array.isArray(s)) {
          acc[pattern.id] = s
          return acc
        } else if (st === 's') {
          acc[pattern.id] = s
          return acc
        } else {
          return undefined
        }
      } else if (pattern.tag === 's-pattern-list-var') {
        pattern
        // try matching nothing else and continuing.
      } else {
        throw new Error('attempt_match pattern object fallthrough')
      }
    } else {
      return undefined
    }
  }
  const pm = sub(s, pattern, {})

  if (pm !== undefined) {
    for (const key of Object.keys(vars)) {
      if (!(key in pm)) {
        throw new Error(`'${key}' found in map of possible variables but not in expr!`)
      }
    }
  }

  return pm
}

export const match_s = <R>(s: S, clauses: MatchSClause<any, R>[]): R => {
  for (const [vars, pattern, f] of clauses) {
    const m = attempt_match(s, vars, pattern)
    if (m !== undefined) {
      return f((id) => assert_exists(m[id], `id '${id}' not associated with an S!`) as never)
    }
  }
  throw new Error('match_s fallthrough!')
}

export const clause = <const Vars extends Record<string, SType>, const R>(vars: Vars, pattern: ClausePattern<Vars>, f: (m: SMatch<Vars>) => R): MatchSClause<Vars, R> => {
  return [vars, pattern, f]
}

export const default_clause = <R>(f: (m: SMatch<{ s: 's' }>) => R): MatchSClause<{ s: 's' }, R> => {
  return [{ s: 's' }, spv('s'), f]
}

