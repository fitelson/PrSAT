import { assert, assert_exists } from "./utils"

export type DLLElement<D> = {
  readonly data: D
  next: DLLElement<D> | undefined
  prev: DLLElement<D> | undefined
}

export const create_dll_element = <D>(d: D): DLLElement<D> => ({
  data: d,
  next: undefined,
  prev: undefined,
})

export class DLL<D> {
  first: DLLElement<D> | undefined = undefined  // EXTERNALLY READONLY
  last: DLLElement<D> | undefined = undefined  // EXTERNALLY READONLY
  private data_to_container: Map<D, Set<DLLElement<D>>> = new Map()
  private internal_size: number

  static check_invariants: boolean = true

  constructor(data: D[]) {
    this.internal_size = data.length
    const elements = data.map<DLLElement<D>>((d) => create_dll_element(d))
    for (const e of elements) {
      this.register_data_container(e)
    }

    if (elements.length === 0) {
      return
    }

    this.first = elements[0]
    this.last = elements[elements.length - 1]

    const pairs: [DLLElement<D>, DLLElement<D>][] = []
    for (let left_index = 0; left_index < elements.length - 1; left_index++) {
      const right_index = left_index + 1
      const left = elements[left_index]
      const right = elements[right_index]
      left.next = right
      right.prev = left
      pairs.push([left, right])
    }

    if (DLL.check_invariants) {
      assert(this.first === elements[0])
      assert(this.last === elements[elements.length - 1])
      assert(elements[0].prev === undefined, 'DLL initialization is incorrect!  First DLL element has a previous!')
      assert(elements[elements.length - 1].next === undefined, 'DLL initialization is incorrect!  Last DLL element has a next!')
      for (const [index, [left, right]] of pairs.entries()) {
        assert(left.next === right, `DLL initialization is incorrect!  Element [left, right] pair at index ${index} fails left.next === right!`)
        assert(left === right.prev, `DLL initialization is incorrect!  Element [left, right] pair at index ${index} fails left === right.prev!`)
      }
      this.assert_invariants()
    }
  }

  size(): number {
    return this.internal_size
  }

  *[Symbol.iterator]() {
    let current = this.first
    while (current !== undefined) {
      yield current.data
      current = current.next
    }
  }

  *entries(): Generator<[number, D]> {
    let current = this.first
    let index = 0
    while (current !== undefined) {
      yield [index, current.data]
      current = current.next
      index++
    }
  }

  *from(element?: DLLElement<D>) {
    let current = element
    while (current !== undefined) {
      yield current
      current = current.next
    }
  }

  *forwards() {
    let current = this.first
    while (current !== undefined) {
      yield current
      current = current.next
    }
  }

  *backwards() {
    let current = this.last
    while (current !== undefined) {
      yield current
      current = current.prev
    }
  }

  contains(data: D): boolean {
    return this.data_to_container.has(data)
  }

  contains_element(element: DLLElement<D>): boolean {
    for (const e of this.forwards()) {
      if (e === element) {
        return true
      }
    }
    return false
  }

  // insert_after(element: DLLElement<D> | undefined, to_insert: DLLElement<D>): void {
  insert_after(element: DLLElement<D> | undefined, to_insert: D): DLLElement<D> {
    if (DLL.check_invariants) {
      this.assert_invariants()
      assert(element === undefined || this.contains_element(element), 'list does not contain given element!')
    }

    const to_insert_element = create_dll_element(to_insert)

    if (element === undefined) {
      to_insert_element.next = this.first
      if (this.first !== undefined) {
        this.first.prev = to_insert_element
      }
      this.first = to_insert_element
      if (this.last === undefined) {
        this.last = to_insert_element
      }
    } else {
      to_insert_element.next = element.next
      if (element.next !== undefined) {
        element.next.prev = to_insert_element
      }
      element.next = to_insert_element
      to_insert_element.prev = element
      if (element === this.last) {
        this.last = to_insert_element
      }
    }
    this.register_data_container(to_insert_element)
    this.internal_size++

    if (DLL.check_invariants) {
      assert(this.contains_element(to_insert_element))
      assert(element === undefined || element.next === to_insert_element, 'element\'s next element is not to_insert!')
      assert(element === to_insert_element.prev, 'to_insert\'s prev element is not element!')
      this.assert_invariants()
    }

    return to_insert_element
  }

  insert_before(element: DLLElement<D> | undefined, to_insert: D): DLLElement<D> {
    if (DLL.check_invariants) {
      assert(element === undefined || this.contains_element(element))
    }

    const to_insert_element = element === undefined
      ? this.insert_after(this.last, to_insert)
      : this.insert_after(element.prev, to_insert)

    if (DLL.check_invariants) {
      assert(this.contains(to_insert))
      const to_insert_element = assert_exists([...this.data_containers_set(to_insert)][0])
      assert(element === undefined || element.prev === to_insert_element, 'element\'s prev element is not to_insert!')
      assert(element === to_insert_element.next, 'to_insert\'s next element is not element')
      this.assert_invariants()
    }

    return to_insert_element
  }

  private register_data_container(container: DLLElement<D>) {
    const s = this.data_to_container.get(container.data)
    if (s === undefined) {
      this.data_to_container.set(container.data, new Set([container]))
    } else {
      assert(!s.has(container), 'DLLElement already registered for its given data!')
      s.add(container)
    }
  }

  remove(element: DLLElement<D>): void {
    const invariant_checking_stuff = {
      initial_order: [] as DLLElement<D>[]
    }

    if (DLL.check_invariants) {
      this.assert_invariants()
      invariant_checking_stuff.initial_order = [...this.forwards()]
      assert(this.contains_element(element), 'list does not contain given element!')
    }

    if (element.prev !== undefined) {
      element.prev.next = element.next
    }
    if (element.next !== undefined) {
      element.next.prev = element.prev
    }

    if (element === this.first) {
      this.first = element.next
    }
    if (element === this.last) {
      this.last = element.prev
    }

    const containers = this.data_containers_set(element.data)
    containers.delete(element)
    this.internal_size--
    if (containers.size === 0) {
      this.data_to_container.delete(element.data)
    }

    if (DLL.check_invariants) {
      const initial_order = invariant_checking_stuff.initial_order
      assert(!this.contains_element(element), 'DLL still contains container despite removing element!')
      const actual_final_order = [...this.forwards()]
      const element_index = initial_order.indexOf(element)
      const expected_final_order = initial_order.filter((_, i) => i !== element_index)
      assert(actual_final_order.length === initial_order.length - 1)
      for (let i = 0; i < expected_final_order.length; i++) {
        const ae = actual_final_order[i]
        const ee = expected_final_order[i]
        assert(ae === ee, `expected[${i}] !== actual[${i}] in list!`)
      }
      this.assert_invariants()
    }
  }

  assert_invariants(): void {
    this.assert_no_forwards_loops()
    this.assert_no_backwards_loops()

    const f = [...this.forwards()]
    const b = [...this.backwards()]

    assert(f.length === b.length, 'forwards list of different length than backwards list!')
    for (let i = 0; i < f.length; i++) {
      const fe = f[i]
      const be = b[b.length - i - 1]
      assert(fe === be, `forwards[${i}] and backwards[${b.length - i - 1}] lists differ!`)
    }

    // all keys in list data
    const data_set = new Set(this)
    for (const d of this.data_to_container.keys()) {
      assert(data_set.has(d), 'Registered data not in DLL!')
    }

    // all list data in keys
    for (const d of this) {
      assert(this.data_to_container.has(d), 'Data in DLL not registered!')
    }

    // data's container actually contains data.
    for (const d of this) {
      const containers = this.data_containers_set(d)
      for (const c of containers) {
        assert(c.data === d, 'Data\'s container doesn\'t contain its associated data!')
      }
    }

    const expected_length = [...this].length
    const actual_length = this.size()
    assert(actual_length === expected_length, `DLL length is incorrect for some reason!\nexpected: ${expected_length}\nactual: ${actual_length}`)
  }

  first_data_container(data: D): DLLElement<D> {
    return assert_exists([...this.data_containers_set(data)][0])
  }

  data_containers(data: D): Iterable<DLLElement<D>> {
    const containers = this.data_containers_set(data)
    return containers[Symbol.iterator]()
  }

  private data_containers_set(data: D): Set<DLLElement<D>> {
    const containers = assert_exists(this.data_to_container.get(data), 'Data doesn\'t exist in DLL!')
    return containers
  }

  private assert_no_forwards_loops(): void {
    let current1 = this.first
    let current2 = this.first?.next

    while (current1 !== undefined && current2 !== undefined) {
      if (current1 === current2) {
        throw new Error('List contains a loop forwards!')
      }
      current1 = current1.next
      current2 = current2?.next?.next
    }
  }

  private assert_no_backwards_loops(): void {
    let current1 = this.last
    let slow_index = 0
    let current2 = this.last?.prev
    let fast_index = 1

    // (end) <= _ <= _ <= _

    while (current1 !== undefined && current2 !== undefined) {
      if (current1 === current2) {
        throw new Error('List contains a loop backwards!')
      }
      current1 = current1.prev
      slow_index++
      current2 = current2?.prev?.prev
      fast_index += 2
    }
  }
}

