import { DLL, DLLElement } from './dll'
import { assert, assert_exists } from "./utils"

export interface Watcher<T> {
  call(old?: T): undefined
  unwatch(): void
  // then_watch(f: (value: T, old?: T) => boolean): Watcher<T>
}

export interface AsyncWatcher<T> {
  call(old?: T): Promise<undefined>
  unwatch(): void
  // then_watch(f: (value: T, old?: T) => boolean): Watcher<T>
}

export interface RemoveListWatcher {
  unwatch(): void
  // then_watch(): RemoveListWatcher<T>
}

export interface AddListWatcher {
  call(): void
  unwatch(): void
  // then_watch(): Watcher<T>
}

export class WatchGroup<T> {
  private readonly watchers: Set<Watcher<T> | AddListWatcher | RemoveListWatcher>

  constructor(watchers: (Watcher<T> | AddListWatcher | RemoveListWatcher)[]) {
    this.watchers = new Set(watchers)
  }

  add<W extends Watcher<T> | RemoveListWatcher | AddListWatcher>(watcher: W): W {
    this.watchers.add(watcher)
    return watcher
  }

  unwatch(): void {
    for (const w of this.watchers) {
      w.unwatch()
    }
    this.watchers.clear()
  }
}

export interface rEditable<T> {
  get(): T
  watch(f: (value: T, old?: T) => void): Watcher<T>
}

export class AsyncEditable<T> {
  private watchers = new Set<AsyncWatcher<T>>()

  constructor(private value: T) {}

  get(): T { return this.value }

  async set(value: T): Promise<void> {
    const old = this.value
    this.value = value
    await this.notify(value, old)
  }

  private async notify(new_value: T, old_value?: T) {
    this.value = new_value
    for (const [_, w] of this.watchers.entries()) {
      await w.call(old_value)
    }
  }

  watch(f: (value: T, old?: T) => Promise<undefined>): AsyncWatcher<T> {
    const w = {
      call: async (old?: T) => await f(this.get(), old),
      unwatch: () => this.watchers.delete(w),
    }
    this.watchers.add(w)
    return w
  }

  cleanup() { this.watchers.clear() }
}

export class Editable<T> implements rEditable<T> {
  private watchers = new Set<Watcher<T>>()

  constructor(private value: T) {}

  get(): T { return this.value }

  set(value: T): undefined {
    const old = this.value
    this.value = value
    this.notify(value, old)
  }

  private notify(new_value: T, old_value?: T) {
    this.value = new_value
    for (const [_, w] of this.watchers.entries()) {
      w.call(old_value)
    }
  }

  watch(f: (value: T, old?: T) => undefined): Watcher<T> {
    const w = {
      call: (old?: T) => f(this.get(), old),
      unwatch: () => this.watchers.delete(w),
    }
    this.watchers.add(w)
    return w
  }

  cleanup() { this.watchers.clear() }
}

export class EditableDLL<T> {
  private values: DLL<T>
  private insert_watchers = new Map<(value: T, lead_sibling: T | undefined) => void, AddListWatcher>()
  private remove_watchers = new Map<(value: T) => void, RemoveListWatcher>()

  constructor(initial_values: T[]) {
    this.values = new DLL(initial_values)
  }

  [Symbol.iterator]() { return this.values[Symbol.iterator]() }

  *entries(): Generator<[number, T]> {
    yield *this.values.entries()
  }

  set_all(ts: T[]): void {
    for (const t of this) {
      this.remove(t)
    }

    let last: undefined | T = undefined
    for (const t of ts) {
      this.insert_after(last, t)
      last = t
    }
  }

  insert_after(lead_sibling: T | undefined, to_insert: T): DLLElement<T> {
    const all_lead_sibling_elements = lead_sibling === undefined ? undefined : [...this.values.data_containers(lead_sibling)]
    assert(all_lead_sibling_elements === undefined || all_lead_sibling_elements.length === 1, 'EditableDLL lead_sibling appears 0 or ≥ 2 times in the list!')
    const lead_sibling_element = all_lead_sibling_elements === undefined ? undefined : all_lead_sibling_elements[0]
    const new_element = this.values.insert_after(lead_sibling_element, to_insert)
    this.notify_insert(to_insert, lead_sibling)
    return new_element
  }

  private notify_insert(inserted: T, lead_sibling: T | undefined) {
    for (const f of this.insert_watchers.keys()) {
      f(inserted, lead_sibling)
    }
  }

  at(index: number): T | undefined {
    return [...this.values][index]
  }

  get_previous(t: T): T | undefined {
    const all_t_elements = [...this.values.data_containers(t)]
    assert(all_t_elements.length === 1, 'EditableDLL element appears 0 or ≥ 2 times in the list!')
    return all_t_elements[0].prev?.data
  }

  get_next(t: T): T | undefined {
    const all_t_elements = [...this.values.data_containers(t)]
    assert(all_t_elements.length === 1, 'EditableDLL element appears 0 or ≥ 2 times in the list!')
    return all_t_elements[0].next?.data
  }

  watch_insert(f: (inserted: T, lead_sibling: T | undefined) => void): AddListWatcher {
    const w: AddListWatcher = {
      call: () => {
        let lead: T | undefined = undefined
        for (const e of this.values) {
          f(e, lead)
          lead = e
        }
      },
      unwatch: () => this.insert_watchers.delete(f)
    }
    this.insert_watchers.set(f, w)
    return w
  }

  remove(to_remove: T) {
    const all_elements = [...this.values.data_containers(to_remove)]
    assert(all_elements.length === 1, 'EditableDLL lead_sibling appears 0 or ≥ 2 times in the list!')
    const element_to_remove = all_elements[0]
    this.notify_remove(to_remove)
    this.values.remove(element_to_remove)
  }

  private notify_remove(removed: T) {
    for (const f of this.remove_watchers.keys()) {
      f(removed)
    }
  }

  watch_remove(f: (removed: T) => void): RemoveListWatcher {
    const w: AddListWatcher = {
      call: () => {
        for (const e of this.values) {
          f(e)
        }
      },
      unwatch: () => this.insert_watchers.delete(f)
    }
    this.remove_watchers.set(f, w)
    return w
  }

  size(): number {
    return this.values.size()
  }

  cleanup() {
    this.insert_watchers.clear()
    this.remove_watchers.clear()
  }
}

export class EditableList<T> {
  private add_watchers = new Map<(index: number, value: T) => void, AddListWatcher>()
  private rem_watchers = new Map<(index: number, value: T) => void, RemoveListWatcher>()

  constructor(private values: T[]) {}

  [Symbol.iterator]() { return this.values[Symbol.iterator]() }

  get(index: number): T { return assert_exists(this.values[index]) }

  // -1 if not found, otherwise found at returned index.
  index_of(value: T): number {
    return this.values.indexOf(value)
  }

  insert_before(index: number, value: T) {
    this.values.splice(index, 0, value)
    this.notify_insert(index, value)
  }

  private notify_insert(index: number, value: T) {
    for (const f of this.add_watchers.keys())
      f(index, value)
  }

  insert_before_element(new_element: T, e?: T): boolean {
    const index = e === undefined ? this.values.length : this.values.indexOf(e)
    if (index === -1)
      return false
    this.insert_before(index, new_element)
    return true
  }

  remove(index: number): boolean {
    if (index < 0 || index >= this.size()) {
      return false
    }

    this.notify_remove(index)
    this.values.splice(index, 1)
    return true
  }

  private notify_remove(index: number) {
    for (const f of this.rem_watchers.keys())
      f(index, assert_exists(this.values[index], `trying to remove a non-existent list element!\nindex: ${index}\nsize: ${this.values.length}`))
  }

  remove_element(e: T): boolean {
    const index = this.values.indexOf(e)
    if (index === -1)
      return false
    this.values.splice(index, 1)
    // It's just easier this way.
    for (const f of this.rem_watchers.keys())
      f(index, e)
    return true
  }

  size(): number { return this.values.length }

  notify() {}

  watch_add(f: (index: number, value: T) => void): AddListWatcher {
    // add watcher's call will call f on all the present values in the list as well as all future
    // added values.
    const w: AddListWatcher = {
      call: () => {
        for (const [i, e] of this.values.entries())
          f(i, e)
      },
      unwatch: () => this.add_watchers.delete(f)
    }
    this.add_watchers.set(f, w)
    return w
  }

  watch_remove(f: (index: number, value: T) => void): RemoveListWatcher {
    const w: RemoveListWatcher = {
      unwatch: () => this.rem_watchers.delete(f)
    }
    this.rem_watchers.set(f, w)
    return w
  }

  cleanup() {
    this.add_watchers.clear()
    this.rem_watchers.clear()
  }
}

type EditableEdit =
  | SingleEditableEdit
  | EditableListEdit

type SingleEditableEdit = {
  readonly tag: 'single-editable-edit'
  readonly editable: Editable<any>
  readonly initial: unknown
  readonly final: unknown
}

type EditableListEdit = {
  readonly tag: 'editable-list-edit'
  readonly action: 'add' | 'remove'
  readonly list: EditableDLL<any>
  readonly leading_sibling?: unknown
  // readonly hole: StoredHole  // this hole could be mutated -- if it is I'll cry n stuff.
  readonly thing: unknown
}

export interface SimpleEditTracker {
  track(in_f: () => void): void
  undo(): boolean
  can_undo(): boolean
  redo(): boolean
  can_redo(): boolean
}

export class EditTracker implements SimpleEditTracker {
  private undo_edits: EditableEdit[][] = []
  private redo_edits: EditableEdit[][] = []
  private current_edits: EditableEdit[] | undefined = []
  public watchers = new WatchGroup([])

  start_watching_list(list: EditableDLL<unknown>): WatchGroup<unknown> {
    const wg = new WatchGroup([])

    // at this point we've (hopefully) already retained the surrounding hole, so
    // all the pre-existing list items should have been retained themselves.
    wg.add(list.watch_insert((thing, leading_sibling) => {
      if (this.current_edits !== undefined) {
        const edit: EditableListEdit = {
          tag: 'editable-list-edit',
          action: 'add',
          list,
          thing,
          leading_sibling,
        }
        this.current_edits.push(edit)
      }
    }))

    wg.add(list.watch_remove((thing) => {
      if (this.current_edits !== undefined) {
        const edit: EditableListEdit = {
          tag: 'editable-list-edit',
          action: 'remove',
          list,
          thing,
          leading_sibling: list.get_previous(thing),
        }
        this.current_edits.push(edit)
      }
    }))

    return wg
  }

  start_watching_editable(editable: Editable<unknown>): Watcher<unknown> {
    return editable.watch((stored, old) => {
      if (this.current_edits !== undefined) {
        const edit: SingleEditableEdit = {
          tag: 'single-editable-edit',
          editable,
          final: stored,
          initial: old,
        }
        this.current_edits.push(edit)
      }
    })
  }

  track(in_f: () => void) {
    this.redo_edits.length = 0

    const is_outmost_tracked_block = this.current_edits === undefined
    if (is_outmost_tracked_block) {
      this.current_edits = []
    }
    in_f()
    if (is_outmost_tracked_block) {
      this.undo_edits.push(assert_exists(this.current_edits))
      this.current_edits = undefined
    }
  }

  undo(): boolean {
    assert(this.current_edits === undefined, 'not allowed to undo inside a tracked block!')

    const top_edits = this.undo_edits.pop()
    if (top_edits === undefined) {
      return false
    }

    for (let i = top_edits.length - 1; i >= 0; i--) {
      const e = assert_exists(top_edits[i])
      this.edit_backwards(e)
    }

    this.redo_edits.push(top_edits)
    return true
  }

  can_undo(): boolean {
    return this.undo_edits.length > 0
  }

  redo(): boolean {
    assert(this.current_edits === undefined, 'not allowed to redo inside a tracked block!')

    const top_edits = this.redo_edits.pop()
    if (top_edits === undefined) {
      return false
    }

    for (const e of top_edits) {
      this.edit_forwards(e)
    }

    this.undo_edits.push(top_edits)

    return true
  }

  can_redo(): boolean {
    return this.redo_edits.length > 0
  }

  private edit_backwards(edit: EditableEdit) {
    if (edit.tag === 'single-editable-edit') {
      assert(edit.editable.get() === edit.final, 'hole being edited backwards has the wrong stored!')
      edit.editable.set(edit.initial)
    } else if (edit.tag === 'editable-list-edit') {
      if (edit.action === 'add') {
        edit.list.remove(edit.thing)
      } else if (edit.action === 'remove') {
        edit.list.insert_after(edit.leading_sibling, edit.thing)
      } else {
        throw new Error('edit_backwards hole-list-edit fallthrough')
      }
    } else {
      throw new Error('edit_backwards fallthrough')
    }
  }

  private edit_forwards(edit: EditableEdit) {
    if (edit.tag === 'single-editable-edit') {
      assert(edit.editable.get() === edit.initial, 'hole being edited forwards has the wrong stored!')
      edit.editable.set(edit.final)
    } else if (edit.tag === 'editable-list-edit') {
      if (edit.action === 'add') {
        edit.list.insert_after(edit.leading_sibling, edit.thing)
      } else if (edit.action === 'remove') {
        edit.list.remove(edit.thing)
      } else {
        throw new Error('edit_forwards hole-list-edit fallthrough')
      }
    } else {
      throw new Error('edit_forwards fallthrough')
    }
  }
}
