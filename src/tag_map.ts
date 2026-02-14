import { Bounds, Random, StringParams } from "./random"
import { assert, assert_exists, Identity, include_exclude_array, lazy, record_keys } from "./utils"

export type Equiv<T1, T2> = [T1] extends [T2] ? [T2] extends [T1] ? true : false : false
export type Extends<T1, T2> = T1 extends T2 ? true : false

export type TagUnion<TagKey extends string> = Record<TagKey, string>
export type UnionToTagMap<TagKey extends string, Union extends TagUnion<TagKey>> = {
  [K in Union[TagKey]]: Union extends infer U extends { [TK in TagKey]: K } ? U : never
}

{
  type SimpleTagUnion =
    | { tag: 'something' }
    | { tag: 'happened' }
    | { tag: 'here' }
  const simple_tag_union_works: Equiv<
    UnionToTagMap<'tag', SimpleTagUnion>,
    {
      something: { tag: 'something' }
      happened: { tag: 'happened' }
      here: { tag: 'here' }
    }
  > = true; void simple_tag_union_works

  type TagUnionWithFields =
    | { type: 'something', else: 4 }
    | { type: 'has', possibly: boolean }
    | { type: 'happened', here: string }
  const tag_union_with_fields_works: Equiv<
    UnionToTagMap<'type', TagUnionWithFields>,
    {
      something: { type: 'something', else: 4 }
      has: { type: 'has', possibly: boolean }
      happened: { type: 'happened', here: string }
    }
  > = true; void tag_union_with_fields_works
}

export type ReverseMapLookup<Map extends Record<string, unknown>, T> = {
  [K in keyof Map]: T extends Map[K] ? K : never
}[keyof Map]

{
  const reverse_lookup_success: Equiv<
    ReverseMapLookup<{ something: 'else', happened: 'here' }, 'else'>,
    'something'
  > = true; void reverse_lookup_success

  const reverse_lookup_success_2: Equiv<
    ReverseMapLookup<{ something: 'else', happened: 'here' }, 'jk'>,
    never
  > = true; void reverse_lookup_success_2
}

type InnerTagMapEntryToSpec<TK extends string, ReuseMap extends Record<string, unknown>, Entry> =
  [Entry] extends [ReuseMap[keyof ReuseMap]]
    ? ReverseMapLookup<ReuseMap, Entry>
  : TagMapEntryToSpec<TK, ReuseMap, Entry>

export type TagMapEntryToSpec<TK extends string, ReuseMap extends Record<string, unknown>, Entry> =
  Equiv<[Entry], [undefined]> extends true
    ? { tag: 'constant', value: undefined }
  : Equiv<[Entry], [boolean]> extends true
    ? { tag: 'primitive', type: 'boolean' }
  : Equiv<[Entry], [number]> extends true
    ? { tag: 'primitive', type: 'number', constraints?: { bounds?: Partial<Bounds>, is_integer?: true } }
  : Equiv<[Entry], [string]> extends true
    ? { tag: 'primitive', type: 'string', constraints?: { bounds?: Partial<Bounds>, characters?: string } }
  : Entry extends (infer A)[]
    ? { tag: 'list', spec: InnerTagMapEntryToSpec<TK, ReuseMap, A>, max_length?: number }
  : Entry extends { [_: string]: unknown }
    ? { tag: 'record', record: { [K in keyof Omit<Entry, TK>]: InnerTagMapEntryToSpec<TK, ReuseMap, Entry[K]> } }
  : Entry extends (...args: any) => any
    ? { tag: 'function', f: Entry }
  : { tag: 'constant', value: Entry }

{
  const constant_false_has_correct_spec: Equiv<
    TagMapEntryToSpec<'tag', {}, true>,
    { tag: 'constant', value: true }
  > = true; void constant_false_has_correct_spec

  const constant_true_has_correct_spec: Equiv<
    TagMapEntryToSpec<'tag', {}, true>,
    { tag: 'constant', value: true }
  > = true; void constant_true_has_correct_spec

  const primitive_boolean_has_correct_spec: Equiv<
    TagMapEntryToSpec<'tag', {}, boolean>,
    { tag: 'primitive', type: 'boolean' }
  > = true; void primitive_boolean_has_correct_spec

  const primitive_string_has_correct_spec: Equiv<
    TagMapEntryToSpec<'tag', {}, string>,
    { tag: 'primitive', type: 'string' }
  > = true; void primitive_string_has_correct_spec

  const record_avoids_tag_key: Equiv<
    TagMapEntryToSpec<'tag', {}, { tag: 'something', else: string }>,
    { tag: 'record', record: { else: { tag: 'primitive', type: 'string' } } }
  > = true; void record_avoids_tag_key

  const function_has_correct_spec: Equiv<
    TagMapEntryToSpec<'tag', {}, (a1: number, a2: boolean) => string>,
    { tag: 'function', f: (a1: number, a2: boolean) => string }
  > = true; void function_has_correct_spec
}

export type TagMapToSpecGrammar<TK extends string, TM extends Record<string, unknown>, ReuseMap extends Record<string, unknown>> = {
  [K in keyof TM]: TagMapEntryToSpec<TK, ReuseMap, TM[K]>
}

export type TagMap<TagKey extends string> = { [_: string]: { [TK in TagKey]: string } }

export type TagMapToMutualMap<TagKey extends string, TM extends TagMap<TagKey>> = {
  key: TagKey
  grammar: {
    [TopKey in keyof TM]: TagMapToSpecGrammar<TagKey, UnionToTagMap<TagKey, TM[TopKey]>, TM>
  }
  map: {
    [TopKey in keyof TM]: UnionToTagMap<TagKey, TM[TopKey]>
  }
  union: {
    [TopKey in keyof TM]: TM[TopKey]
  }
  guide: TM
}

export type MutualTagMap<TagKey extends string> = {
  [top_key: string]: TagMap<TagKey>
}

export type MutualMapSpec =
  | string
  | { tag: 'primitive', type: 'boolean' }
  | { tag: 'primitive', type: 'number', constraints?: { is_integer?: boolean, bounds?: Partial<Bounds> } }
  | { tag: 'primitive', type: 'string', constraints?: { bounds?: Partial<Bounds>, characters?: string } }
  | { tag: 'constant', value: unknown }
  | { tag: 'list', spec: MutualMapSpec, max_length?: number }
  | { tag: 'record', record: Record<string, MutualMapSpec> }
  | { tag: 'function' }

export type MutualMapGrammar = {
  [top_name: string]: {
    [inner_name: string]: MutualMapSpec
  }
}

export type MutualMapSnap =
  | { tag: 'primitive', value: boolean | number | string }
  | { tag: 'constant', value: unknown }
  | { tag: 'list', list: MutualMapSnap[] }
  | { tag: 'record', mm_keys?: { top: string, inner: string }, record: Record<string, MutualMapSnap> }
  | { tag: 'function' }

export type MutualMap<TagKey extends string> = {
  key: TagKey
  grammar: MutualMapGrammar
  map: MutualTagMap<TagKey>
  guide: Record<string, unknown>
}

{
  const mutual_map_extends_tag_to_mutual_map_results: Extends<
    TagMapToMutualMap<'tag', TagMap<'tag'>>,
    MutualMap<'tag'>
  > = true; void mutual_map_extends_tag_to_mutual_map_results
}

type InitTagMap<TagKey extends string, TM extends TagMap<TagKey>> = {
  [K in keyof TM]: (input: Identity<Omit<TM[K], TagKey>>) => TM[K]
}

export type MutualMapInits<TagKey extends string, MM extends MutualMap<TagKey>> = {
  [TN in keyof MM['map']]: InitTagMap<MM['key'], MM['map'][TN]>
}

export const grammar_to_inits = <TK extends string, MM extends MutualMap<TK>>(tag_key: TK, grammar: MM['grammar']): MutualMapInits<TK, MM> => {
  // const tag_key = 'tag' as const
  const top_inits: any = {}

  const init_for = (spec: MutualMapSpec, inner_key: string): any => {
    if (typeof spec !== 'object' || spec === null || Array.isArray(spec) || spec.tag !== 'record') {
      throw new Error('top-level spec is dumb!')
    }

    const spec_entries_to_check: [string, MutualMapSpec][] = []
    for (const [spec_key, sub_spec] of Object.entries(spec.record)) {
      // WE NEED TO DO MORE THAN CHECK THIS IN CASE THE INPUT ISN'T POSSIBLY MADE WITH AN INITIALIZER!!!!!!!!
      // Actually jk I don't care too much about this check just don't be dumb about it.
      if (typeof sub_spec !== 'string' && sub_spec.tag === 'primitive') {
        spec_entries_to_check.push([spec_key, sub_spec])
      }
    }

    return (input: any): any => {
      if (typeof input !== 'object' || input === null || Array.isArray(input)) {
        throw new Error('input is dumb!')
      }

      for (const [spec_key, sub_spec] of spec_entries_to_check) {
        // We only check the primitive keys!
        if (typeof sub_spec !== 'string' && sub_spec.tag === 'primitive') {
          // const sub_input = assert_exists(input[spec_key])
          const error = check_primitive(sub_spec, input[spec_key])
          if (error !== undefined) {
            throw new Error(`Error checking primitive at key '${spec_key}' during '${inner_key}' init: ${error}`)
          }
        }
      }

      return { [tag_key]: inner_key, ...input }
    }
  }

  for (const top_key of record_keys(grammar)) {
    top_inits[top_key] = {}
    const top_spec = grammar[top_key]
    for (const inner_key of record_keys(top_spec)) {
      const inner_spec = top_spec[inner_key]
      top_inits[top_key][inner_key] = init_for(inner_spec, inner_key)
    }
  }

  return top_inits
}

type RecursorTagMap<TagKey extends string, TM extends TagMap<TagKey>, Input> =
  <A, R>(initial_acc: () => A, recursors: { [TK in keyof TM]: (input: Omit<TM[TK], TagKey>, acc: A, rec: (input: Input, acc: A) => R) => R }) => (input: Input) => R

export type MutualMapRecursors<TagKey extends string, MM extends MutualMap<TagKey>> = {
  [TN in keyof MM['map'] & keyof MM['guide']]: RecursorTagMap<MM['key'], MM['map'][TN], MM['guide'][TN]>
}

export const grammar_to_recursors = <TK extends string, MM extends MutualMap<TK>>(tag_key: TK, grammar: MM['grammar']): MutualMapRecursors<TK, MM> => {
  const top_recursors: any = {}

  const recursor_for = (): any => {
    return (initial_acc: () => any, recursors: any): any => {
      const cool = (input: any, acc: any = initial_acc()): any => {
        const tag = input[tag_key]
        const specific_rec = recursors[tag]
        return specific_rec(input as any, acc, cool)
      }

      return cool
    }
  }

  for (const top_key of record_keys(grammar)) {
    top_recursors[top_key] = recursor_for()
  }

  return top_recursors
}

export type FuzzerOptions<TagKey extends string, MTM extends MutualTagMap<TagKey>> = {
  target_depth?: number
  include?: { [TK in keyof MTM]?: (keyof MTM[TK] & string)[] }
  exclude?: { [TK in keyof MTM]?: (keyof MTM[TK] & string)[] }
}

type MutualMapFuzzers<TagKey extends string, MM extends MutualMap<TagKey>> = {
  [TN in keyof MM['map'] & keyof MM['guide']]: {
    of_type: (options?: FuzzerOptions<TagKey, MM['map']>) => MM['guide'][TN]
    of_spec: (options?: FuzzerOptions<TagKey, MM['map']>) => MutualMapSnap
  }
}

export const grammar_to_fuzzers = <TK extends string, MM extends MutualMap<TK>>(
  _tag_key: TK,
  grammar: MM['grammar'],
  loader: MutualMapLoaders<TK, MM>
) => (
  random?: Random,
  outer_options?: FuzzerOptions<TK, MM['map']>
): MutualMapFuzzers<TK, MM> => {
  const DEFAULT_LIST_LENGTH = 10
  const DEFAULT_TARGET_DEPTH = 10

  const fuzzers: any = {}
  // The allowed keys before they're constrained.
  const pre_allowed_keys = split_terminal_and_function_keys_but_better(grammar)

  type AllowedKeys = Record<string, { terminals: string[], indirects: string[], functions: string[] }>
  const compute_allowed_keys = (options?: FuzzerOptions<TK, MM['map']>, prev: AllowedKeys = pre_allowed_keys): AllowedKeys => {
    const allowed_keys: AllowedKeys = {}

    for (const top_key of record_keys(grammar)) {
      const include = options?.include?.[top_key]
      const exclude = options?.exclude?.[top_key]
      const terminals_and_functions = assert_exists(prev[top_key])
      const terminals = include_exclude_array(terminals_and_functions.terminals, include, exclude)
      const indirects = include_exclude_array(terminals_and_functions.indirects, include, exclude)
      const functions = include_exclude_array(terminals_and_functions.functions, include, exclude)
      allowed_keys[top_key] = { terminals, indirects, functions }
    }

    return allowed_keys
  }

  const rand = random ?? new Random()
  const allowed_keys = compute_allowed_keys(outer_options)

  const fuzzer_for_top_key = (
    top_key: keyof MutualMapLoaders<TK, MM>
  ): any => {
    const self = {
      of_type: function (options?: FuzzerOptions<TK, MM['map']>) {
        const snap = self.of_spec(options)
        return loader[top_key](snap)
      },
      of_spec: function (options?: FuzzerOptions<TK, MM['map']>): MutualMapSnap {
        const allowed_keys_to_use = options?.include !== undefined || options?.exclude !== undefined
          ? compute_allowed_keys(options, allowed_keys)
          : allowed_keys
        return generate_for_top_key(top_key as any, rand, allowed_keys_to_use, options?.target_depth ?? outer_options?.target_depth ?? DEFAULT_TARGET_DEPTH)
      }
    }

    return self
  }

  for (const top_key of record_keys(grammar)) {
    fuzzers[top_key] = fuzzer_for_top_key(top_key)
  }

  const generate_for_top_key = <TK extends keyof typeof grammar & string>(
    top_key: TK,
    random: Random,
    allowed_keys_lists: Record<string, { terminals: string[], indirects: string[], functions: string[] }>,
    target_depth: number,
  ): MutualMapSnap => {
    type PrimSpec = UnionToTagMap<'tag', Exclude<MutualMapSpec, string>>['primitive']
    type PrimValue = UnionToTagMap<'tag', MutualMapSnap>['primitive']['value']
    const random_prim = (spec: PrimSpec): PrimValue => {
      if (spec.type === 'boolean') {
        return random.boolean()
      } else if (spec.type === 'number') {
        const bounds: Bounds = full_from_partial_bounds(spec.constraints?.bounds)
        if (spec.constraints?.is_integer ?? false) {
          return random.integer(bounds)
        } else {
          return random.float(bounds)
        }
      } else if (spec.type === 'string') {
        return random.string(full_from_partial_string_params(spec.constraints))
      } else {
        throw new Error('random_prim fallthrough')
      }
    }

    const generate_for_spec = (spec: MutualMapSpec, target_depth: number): MutualMapSnap => {
      if (typeof spec === 'string') {
        if (!(top_key in grammar)) {
          throw new Error(`Couldn\'t find key '${grammar}' in grammar!`)
        }
        return generate_for_top_key(spec as keyof typeof grammar & string, random, allowed_keys_lists, target_depth)
      } else if (spec.tag === 'constant') {
        return { tag: 'constant', value: spec.value }
      } else if (spec.tag === 'primitive') {
        return { tag: 'primitive', value: random_prim(spec) }
      } else if (spec.tag === 'list') {
        const max_length = spec.max_length ?? DEFAULT_LIST_LENGTH
        assert(max_length >= 1)
        const length = random.integer({ lower: 1, upper: max_length })
        const largest_index = random.integer({ lower: 0, upper: length - 1 })
        const list: MutualMapSnap[] = []
        for (let i = 0; i < length; i++) {
          if (i === largest_index || target_depth <= 0) {
            const sub = generate_for_spec(spec.spec, target_depth - 1)
            list.push(sub)
          } else {
            const sub_target_depth = random.integer({ lower: 0, upper: target_depth - 1 })
            const sub = generate_for_spec(spec.spec, sub_target_depth)
            list.push(sub)
          }
        }
        return { tag: 'list', list }
      } else if (spec.tag === 'record') {
        const record: Record<string, MutualMapSnap> = {}
        for (const key of record_keys(spec.record)) {
          const sub_spec = spec.record[key]
          const sub = generate_for_spec(sub_spec, target_depth - 1)
          record[key] = sub
        }
        return { tag: 'record', record }
      } else {
        throw new Error('generate_for_inner_key fallthrough')
      }
    }

    const possible_keys_from_target_depth = (allowed_keys: AllowedKeys[keyof AllowedKeys], target_depth: number): string[] => {
      if (target_depth <= 0) {
        if (allowed_keys.terminals.length > 0) {
          return allowed_keys.terminals
        } else {
          assert(allowed_keys.indirects.length > 0, 'No terminal or indirect terminals to pick from, necessitating an infinitely generating loop!')
          return allowed_keys.indirects
        }
      } else {
        return allowed_keys.functions
      }
    }

    const top_spec = assert_exists(grammar[top_key])
    const inner_keys = assert_exists(allowed_keys_lists[top_key])
    const possible_keys = possible_keys_from_target_depth(inner_keys, target_depth)
    const specific_key = random.pick(possible_keys)
    const specific_spec = assert_exists(top_spec[specific_key as keyof typeof top_spec])
    const result = generate_for_spec(specific_spec, target_depth)
    if (result.tag !== 'record') {
      throw new Error(`Expected generate_for_spec to return a record, instead got a ${result.tag}!`)
    }
    result.mm_keys = { top: top_key, inner: specific_key }
    return result
  }

  return fuzzers
}

export type MutualMapLoaders<TagKey extends string, MM extends MutualMap<TagKey>> = {
  [TN in keyof MM['map'] & keyof MM['guide']]:
    (snap: MutualMapSnap) => MM['guide'][TN]
}

export const grammar_to_loaders = <TK extends string, MM extends MutualMap<TK>>(tag_key: TK, grammar: MM['grammar']): MutualMapLoaders<TK, MM> => {
  type Loader = (snap: MutualMapSnap) => any
  const top_loaders: Record<string, Loader> = {}
  const top_to_inner_loaders: Record<string, Record<string, Loader>> = {}
  // All the assertions in this function and its sub-functions need to be replaced with Res's.

  const inner_loader = (inner_key: string, spec: MutualMapSpec): Loader => {
    const load_with_spec = (to_load: MutualMapSnap, spec: MutualMapSpec): any => {
      if (typeof spec === 'string') {
        const next_loader = assert_exists(top_loaders[spec])
        return next_loader(to_load)
      } else if (spec.tag === 'constant') {
        if (to_load.tag !== 'constant') {
          throw new Error(`Expected to load constant, but got something else!\nsomething else: ${to_load.tag}`)
        } else {
          assert(to_load.value === spec.value, `Expected to specifically load the constant ${spec.value}, but instead got ${JSON.stringify(spec.value)}!`)
          return to_load.value
        }
      } else if (spec.tag === 'primitive') {
        if (to_load.tag !== 'primitive') {
          throw new Error(`Expected to load primitive, but got something else!\nsomething else: ${to_load.tag}`)
        } else {
          assert(typeof to_load.value === spec.type, `Expected to load primitive of type ${spec.type}, but instead got a value of type ${typeof to_load.value}!`)
          return to_load.value
        }
      } else if (spec.tag === 'list') {
        if (to_load.tag !== 'list') {
          throw new Error(`Expected to load list, but got something else!\nsomething else: ${to_load.tag}`)
        } else {
          const loaded_subs = to_load.list.map((sub) => load_with_spec(sub, spec.spec))
          return loaded_subs
        }
      } else if (spec.tag === 'record') {
        if (to_load.tag !== 'record') {
          throw new Error(`Expected to load record, but got something else!\nsomething else: ${to_load.tag}`)
        } else {
          // if (to_load.mm_keys !== undefined) {
          //   const next_top_loader = assert_exists(top_to_inner_loaders[to_load.mm_keys.top])
          //   const next_loader = assert_exists(next_top_loader[to_load.mm_keys.inner])
          //   return next_loader(to_load)
          // }

          const loaded_subs: any = {}
          for (const key of record_keys(spec.record)) {
            if (!(key in to_load.record)) {
              throw new Error(`Key ${key} is present in spec but missing from loading snap!`)
            }
            const sub_spec = spec.record[key]
            const sub = to_load.record[key]
            loaded_subs[key] = load_with_spec(sub, sub_spec)
          }
          return loaded_subs
        }
      } else {
        throw new Error('constraint_grammar_to_loaders.inner_loader.loader_with_spec')
      }
    }
    return (to_load: MutualMapSnap) => {
      const r = load_with_spec(to_load, spec)
      assert(typeof r === 'object' && r !== undefined && !Array.isArray(r))
      r[tag_key] = inner_key
      return r
    }
  }

  const top_loader_for = (key: string): Loader => {
    return (to_load: MutualMapSnap): any => {
      if (typeof to_load === 'object' && to_load.tag === 'record') {
        const { top, inner } = assert_exists(to_load.mm_keys, 'Missing mm_key info from snap to properly load it!')
        assert(key === top, `Unable to load a ${top}.${inner} using a ${key}'s loader!`)
        const top_loaders = assert_exists(top_to_inner_loaders[top])
        const specific_loader = assert_exists(top_loaders[inner])
        return specific_loader(to_load)
      } else {
        throw new Error('Can\'t load a non-record snap directly!')
      }
    }
  }

  for (const top_key of record_keys(grammar)) {
    top_to_inner_loaders[top_key] = {}
    const top_spec = assert_exists(grammar[top_key])
    for (const inner_key of record_keys(top_spec)) {
      const inner_spec = top_spec[inner_key]
      top_to_inner_loaders[top_key][inner_key] = inner_loader(inner_key, inner_spec)
    }
    top_loaders[top_key] = top_loader_for(top_key)
  }

  return top_loaders as any
}

export type MutualMapSavers<TagKey extends string, MM extends MutualMap<TagKey>> = {
  [TN in keyof MM['map'] & keyof MM['guide']]:
    (to_save: MM['guide'][TN]) => MutualMapSnap
}

export const grammar_to_savers = <TK extends string, MM extends MutualMap<TK>>(tag_key: TK, grammar: MM['grammar']): MutualMapSavers<TK, MM> => {
  const top_savers: any = {}
  const top_to_inner_savers: any = {}

  const inner_saver = (top_key: string, inner_key: string, spec: MutualMapSpec): any => {
    const save_with_spec = (top_key: string | undefined, inner_key: string | undefined, to_save: any, spec: MutualMapSpec): MutualMapSnap => {
      if (typeof spec === 'string') {
        const top_spec = assert_exists(grammar[spec])
        const inner_spec = assert_exists(top_spec[to_save.tag])
        return save_with_spec(spec, to_save.tag, to_save, inner_spec)
      } else if (spec.tag === 'constant') {
        assert(spec.value === to_save, 'Constant being saved does not agree with spec!')
        return { tag: 'constant', value: spec.value }
      } else if (spec.tag === 'primitive') {
        assert(spec.type === typeof to_save, 'Primitive being saved does not agree with spec!')
        return { tag: 'primitive', value: to_save }
      } else if (spec.tag === 'list') {
        assert(Array.isArray(to_save), 'List being saved is not actually an array!')
        if (!Array.isArray(to_save)) {
          throw new Error('List being saved is not actually an array!')
        }
        const saved = to_save.map((sub) => save_with_spec(undefined, undefined, sub, spec.spec))
        return { tag: 'list', list: saved }
      } else if (spec.tag === 'record') {
        if (typeof to_save !== 'object' || to_save === null || Array.isArray(to_save)) {
          throw new Error('Record being saved is not actually a record!')
        }
        const saved: Record<string, MutualMapSnap> = {}
        for (const [key, sub_spec] of Object.entries(spec.record)) {
          if (!(key in to_save)) {
            throw new Error(`Record being saved is missing key '${key}', which is in the spec!`)
          }
          const sub_to_save = to_save[key]
          saved[key] = save_with_spec(undefined, undefined, sub_to_save, sub_spec)
        }
        if (top_key !== undefined && inner_key !== undefined) {
          return { tag: 'record', mm_keys: { top: top_key, inner: inner_key }, record: saved }
        } else {
          return { tag: 'record', record: saved }
        }
      } else {
        throw new Error('constraint_grammar_to_savers.inner_saver.save_with_spec fallthrough')
      }
    }
    return (to_save: any) => save_with_spec(top_key, inner_key, to_save, spec)
  }

  const top_saver_for = (key: string): any => {
    return (to_save: any): any => {
      const specific_saver = assert_exists(top_to_inner_savers[key][to_save[tag_key]], `Missing specific saver!\ntop_key: ${key}\ninner_key: ${to_save[tag_key]}`)
      return specific_saver(to_save)
    }
  }

  for (const top_key of record_keys(grammar)) {
    top_to_inner_savers[top_key] = {}
    const top_spec = grammar[top_key]
    for (const inner_key of record_keys(top_spec)) {
      const inner_spec = top_spec[inner_key]
      top_to_inner_savers[top_key][inner_key] = inner_saver(top_key, inner_key, inner_spec)
    }
    top_savers[top_key] = top_saver_for(top_key)
  }

  return top_savers
}

// undefined on success, string on error.
const check_primitive = (spec: UnionToTagMap<'tag', Exclude<MutualMapSpec, string>>['primitive'], p: UnionToTagMap<'tag', Exclude<MutualMapSnap, string>>['primitive']['value']): string | undefined => {
  if (spec.type === 'boolean') {
    return undefined
  } else if (spec.type === 'number') {
    if (typeof p !== 'number') {
      return `Expected number, got ${typeof p}!`
    } else if (spec.constraints?.is_integer && !Number.isInteger(p)) {
      return `Expected integer, got a non-integer value '${p}'!`
    } else if (spec.constraints?.bounds !== undefined) {
      const { lower, upper } = spec.constraints.bounds
      if (lower !== undefined && p < lower) {
        return `Expected integer in range [${lower}, ${upper}], got integer '${p}' breaking the lower bound!`
      } else if (upper !== undefined && p > upper) {
        return `Expected integer in range [${lower}, ${upper}], got integer '${p}' breaking the upper bound!`
      } else {
        return undefined
      }
    } else {
      return undefined
    }
  } else if (spec.type === 'string') {
  } else {
    throw new Error('check_primitive fallthrough')
  }
}

// 'indirectly_terminating' means one of the spec's ancestors requires going to one of the terminating top specs to terminate.
const is_terminal_spec = (spec: MutualMapSpec, top_key: string, terminating_top_keys: Set<string>): 'terminating' | 'indirectly_terminating' | 'non_terminating' => {
  if (typeof spec === 'string') {
    return spec !== top_key && terminating_top_keys.has(spec) ? 'indirectly_terminating' : 'non_terminating'
  } else if (spec.tag === 'constant' || spec.tag === 'primitive') {
    return 'terminating'
  } else if (spec.tag === 'list') {
    return is_terminal_spec(spec.spec, top_key, terminating_top_keys)
  } else if (spec.tag === 'record') {
    let highest: 'terminating' | 'indirectly_terminating' | 'non_terminating' = 'terminating'
    for (const sub_key of record_keys(spec.record)) {
      const sub = assert_exists(spec.record[sub_key])
      const is_terminating = is_terminal_spec(sub, top_key, terminating_top_keys)
      if (is_terminating === 'non_terminating') {
        return 'non_terminating'
      } else {
        highest = is_terminating
      }
    }
    return highest
  } else {
    throw new Error('is_terminal_spec fallthrough')
  }
}

// PROBLEM:
// The top-level 'Constraint' key doesn't have any directly terminal inner-keys,
// so as it currently stands, attempting to generate a Constraint will incorrectly
// fail because the following function only finds functions and terminals per
// top-level spec.  I've written an algorithm that correctly sorts 'sorts' into
// functions and terminals without this issue.  At the very least this needs to be
// undertaken by looking at all sorts.

const split_terminal_and_function_keys_but_better = (
  top_sorts: Record<string, Record<string, MutualMapSpec>>
): Record<string, { terminals: string[], indirects: string[], functions: string[] }> => {
  const all_top_keys = record_keys(top_sorts)
  const pre_final_thingy: Record<string, { terminals: Set<string>, indirects: Set<string>, functions: Set<string> }> = {}
  const top_level_eventually_terminating_keys = new Set<string>()

  // Initialize.
  for (const top_key of all_top_keys) {
    const top_specs = assert_exists(top_sorts[top_key])
    const inner_keys = record_keys(top_specs)
    pre_final_thingy[top_key] = {
      terminals: new Set(),
      indirects: new Set(),
      functions: new Set([...inner_keys]),
    }
  }

  // Loop.
  let change_just_made = true
  let n_loops = 0
  while (change_just_made) {
    change_just_made = false
    n_loops++

    for (const top_key of all_top_keys) {
      const prev = assert_exists(pre_final_thingy[top_key])
      const inner_sorts = assert_exists(top_sorts[top_key])

      for (const inner_key of prev.functions) {
        const inner_sort = inner_sorts[inner_key]
        const is_terminating = is_terminal_spec(inner_sort, top_key, top_level_eventually_terminating_keys)
        if (is_terminating === 'terminating') {
          prev.terminals.add(inner_key)
          prev.functions.delete(inner_key)
          top_level_eventually_terminating_keys.add(top_key)
          change_just_made = true
        } else if (is_terminating === 'indirectly_terminating') {
          prev.indirects.add(inner_key)
          prev.functions.delete(inner_key)
          top_level_eventually_terminating_keys.add(top_key)
          change_just_made = true
        }
      }
    }
  }

  // Finish.
  const final_thingy: Record<string, { terminals: string[], indirects: string[], functions: string[] }> = {}
  for (const [k, v] of Object.entries(pre_final_thingy)) {
    final_thingy[k] = {
      terminals: [...v.terminals],
      indirects: [...v.indirects],
      functions: [...v.functions],
    }
  }

  return final_thingy
}

const full_from_partial_bounds = (bounds: Partial<Bounds> | undefined, defaults?: { diff: number, lower: number }): Bounds => {
  let ds = defaults ?? {
    diff: 2000,
    lower: -1000,
  }

  const DEFAULT_DIFF = ds.diff
  const DEFAULT_LOWER = ds.lower
  const DEFAULT_UPPER = DEFAULT_LOWER + DEFAULT_DIFF

  if (bounds === undefined || (bounds.lower === undefined && bounds.upper === undefined)) {
    return { lower: DEFAULT_LOWER, upper: DEFAULT_UPPER }
  } else if (bounds.lower === undefined && bounds.upper !== undefined) {
    return { lower: bounds.upper - DEFAULT_DIFF, upper: bounds.upper }
  } else if (bounds.lower !== undefined && bounds.upper === undefined) {
    return { lower: bounds.lower, upper: bounds.lower + DEFAULT_DIFF }
  } else if (bounds.lower !== undefined && bounds.upper !== undefined) {
    return { lower: bounds.lower, upper: bounds.upper }
  } else {
    return { lower: DEFAULT_LOWER, upper: DEFAULT_UPPER }
  }
}

export const full_from_partial_string_params = (params: { bounds?: { lower?: number, upper?: number }, characters?: string } | undefined): StringParams => {
  const BOUNDS_DEFAULTS = { diff: 0, lower: 10 }
  const DEFAULT_LENGTH_BOUNDS: Bounds = { lower: BOUNDS_DEFAULTS.lower, upper: BOUNDS_DEFAULTS.lower + BOUNDS_DEFAULTS.diff }
  const DEFAULT_CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

  if (params === undefined) {
    return { bounds: DEFAULT_LENGTH_BOUNDS, characters: DEFAULT_CHARACTERS }
  } else if (params.bounds === undefined && params.characters === undefined) {
    return { bounds: DEFAULT_LENGTH_BOUNDS, characters: DEFAULT_CHARACTERS }
  } else if (params.bounds === undefined && params.characters !== undefined) {
    return { bounds: DEFAULT_LENGTH_BOUNDS, characters: params.characters }
  } else if (params.bounds !== undefined && params.characters === undefined) {
    return { bounds: full_from_partial_bounds(params.bounds, BOUNDS_DEFAULTS), characters: DEFAULT_CHARACTERS }
  } else if (params.bounds !== undefined && params.characters !== undefined) {
    return { bounds: full_from_partial_bounds(params.bounds, BOUNDS_DEFAULTS), characters: params.characters }
  } else {
    return { bounds: DEFAULT_LENGTH_BOUNDS, characters: DEFAULT_CHARACTERS }
  }
}

const is_first_order_spec = (spec: MutualMapSpec): boolean => {
  if (typeof spec === 'string') {
    return true
  } else if (spec.tag === 'constant') {
    return true
  } else if (spec.tag === 'primitive') {
    return true
  } else if (spec.tag === 'list') {
    return is_first_order_spec(spec.spec)
  } else if (spec.tag === 'record') {
    for (const r_key of record_keys(spec.record)) {
      const sub_spec = assert_exists(spec.record[r_key])
      if (!is_first_order_spec(sub_spec)) {
        return false
      }
    }
    return true
  } else if (spec.tag === 'function') {
    return false
  } else {
    throw new Error('is_first_order_spec fallthrough')
  }
}

const is_first_order_grammar = (grammar: MutualMapGrammar): boolean => {
  for (const top_key of record_keys(grammar)) {
    const top_spec = assert_exists(grammar[top_key])
    for (const inner_key of record_keys(top_spec)) {
      const spec = assert_exists(top_spec[inner_key])
      if (!is_first_order_spec(spec)) {
        return false
      }
    }
  }
  return true
}

// common to everything:
// - inits
// - recursors
// first-order only:
// - savers
// - loaders
// - fuzzers

type MutualMapUtilities<TK extends string, MM extends MutualMap<TK>> = {
  inits: MutualMapInits<TK, MM>
  recursors: MutualMapRecursors<TK, MM>
  first_order: () => {
    savers: MutualMapSavers<TK, MM>
    loaders: MutualMapLoaders<TK, MM>
    fuzzers: (random?: Random, options?: FuzzerOptions<TK, MM['map']>) => MutualMapFuzzers<TK, MM>
  }
}

// Making the 'tag' bit explicit because TagMapToMutualMap<TK, TM>s don't extend MutualMap<TK>s for an arbitrary
// TK, but does for most TKs specific TKs.
// I think I know why this is but I'm not going to overthink it.
export const setup_mutual_map = <
  TM extends TagMap<'tag'>
>() => <
  MM extends TagMapToMutualMap<'tag', TM>
>(
  grammar: MM['grammar']
): MutualMapUtilities<'tag', MM> => {
  return {
    inits: grammar_to_inits('tag', grammar),
    recursors: grammar_to_recursors('tag', grammar),
    first_order: lazy(() => {
      if (!is_first_order_grammar(grammar)) {
        throw new Error('The grammar contains functions')
      } else {
        const loaders = grammar_to_loaders('tag', grammar)
        return {
          savers: grammar_to_savers('tag', grammar),
          loaders,
          fuzzers: grammar_to_fuzzers('tag', grammar, loaders)
        }
      }
    }).get
  }
}
