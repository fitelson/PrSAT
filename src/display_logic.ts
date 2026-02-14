import { AsyncEditable, AsyncWatcher, Editable, EditableDLL, Watcher, WatchGroup } from "./editable"
import { TruthTable } from "./pr_sat"
import { PrSat } from "./types"
import { assert_exists, fallthrough, Res } from "./utils"
import { ModelAssignmentOutput } from "./z3_integration"

type Constraint = PrSat['Constraint']

type ModelState =
  | { tag: 'no-model' }
  | { tag: 'searching' }
  | { tag: 'result', truth_table: TruthTable, result: ModelResult }

type ModelResult =
  | { tag: 'sat', output: Record<number, ModelAssignmentOutput>, values: Record<number, number> }
  | { tag: 'unsat' }
  | { tag: 'unknown' }

type SingleInputState<ParseOutput extends {}> =
  | { tag: 'nothing' }
  | { tag: 'parsed', output: ParseOutput }
  | { tag: 'error', message: string }

export class SingleInputLogic<ParseOutput extends {}, Associate = undefined> {
  readonly text = new AsyncEditable<string>('')
  private readonly output = new AsyncEditable<SingleInputState<ParseOutput>>({ tag: 'nothing' })
  private readonly watch_group = new WatchGroup([])  // To be used externally ONLY!
  public readonly associate: Associate
  public readonly has_siblings: Editable<boolean>
  public readonly is_focused = new Editable<boolean>(false)  // To be used by the parent block ONLY!

  constructor(
    private readonly parent_block: InputBlockLogic<ParseOutput, Associate>,
  ) {
    this.text.watch(async (text) => {
      if (text === '') {
        await this.output.set({ tag: 'nothing' })
      } else {
        const [status, parsed] = this.parent_block.parser(text)
        if (status) {
          await this.output.set({ tag: 'parsed', output: parsed })
        } else {
          await this.output.set({ tag: 'error', message: parsed })
        }
      }
    })
    this.has_siblings = new Editable(false)
    this.associate = this.parent_block?.associate_init(this)
  }

  remove(): SingleInputLogic<ParseOutput, Associate> | undefined {
    return assert_exists(this.parent_block, 'Can\'t remove if we don\'t have a parent!').remove_input(this)
  }

  then_insert(): SingleInputLogic<ParseOutput, Associate> {
    const next = assert_exists(this.parent_block, 'Can\'t remove if we don\'t have a parent!').insert_input_after(this)
    return next
  }

  on_state_change(f: (state: SingleInputState<ParseOutput>, last_state?: SingleInputState<ParseOutput>) => Promise<undefined>): AsyncWatcher<unknown> {
    return this.output.watch(f)
  }

  get_output(): SingleInputState<ParseOutput> {
    return this.output.get()
  }

  on_focus(f: (is_focused: boolean) => undefined): Watcher<unknown> {
    // this.parent_block
    return this.is_focused.watch(f)
  }

  set_focused(): void {
    this.parent_block?.set_focus(this)
  }

  focus_previous(): SingleInputLogic<ParseOutput, Associate> | undefined {
    return this.parent_block?.focus_previous()
  }

  focus_next(): SingleInputLogic<ParseOutput, Associate> | undefined {
    return this.parent_block?.focus_next()
  }

  // on_line_length(f: (new_line_length: number) => void): Watcher<unknown> {
  //   return this.parent_block.on_line_length(f)
  // }

  destroy(): void {
    this.text.cleanup()
    this.output.cleanup()
    this.watch_group.unwatch()
    this.is_focused.cleanup()
  }

  add_watcher(watcher: Watcher<unknown>): void {
    this.watch_group.add(watcher)
  }
}

export class InputBlockLogic<ParseOutput extends {}, Associate = undefined> {
  private readonly inputs = new EditableDLL<SingleInputLogic<ParseOutput, Associate>>([])
  private readonly longest_line_length = new Editable<number>(0)
  private readonly outputs = new Editable<ParseOutput[] | undefined>(undefined)
  private readonly focused = new Editable<SingleInputLogic<ParseOutput, Associate> | undefined>(undefined)

  constructor(
    readonly parser: (text: string) => Res<ParseOutput, string>,
    readonly associate_init: (logic: SingleInputLogic<ParseOutput, Associate>) => Associate,
  ) {
    this.inputs.watch_insert((input) => {
      // nothing -> nothing,
      // error -> error, or
      // should NOT update outputs.
      // parsed -> parsed updates because it might have updated to something else!
      
      // nothing -> error: Constraint[] --> undefined.
      // error -> nothing: undefined --> Constraint[].
      // parsed -> nothing: Constraint[] --> Constraint[] (smaller).
      // parsed -> error:   Constraint[] --> undefined.
      // nothing -> parsed: Constraint[] --> Constraint[] (bigger).
      // error -> parsed:   undefined    --> Constraint[].
      input.on_state_change(async (input_state, last_state) => {
        if (last_state === undefined) {
          throw new Error('SingleInputLogic updates from undefined!')
        } else if (last_state.tag === 'nothing') {
          if (input_state.tag === 'nothing') {
            // diagonal.
          } else if (input_state.tag === 'error') {
            this.outputs.set(undefined)
          } else if (input_state.tag === 'parsed') {
            this.update_outputs()
          } else {
            return fallthrough('InputBlockLogic.constructor input.on_state_change last_state', input_state)
          }
        } else if (last_state.tag === 'error') {
          if (input_state.tag === 'nothing') {
            this.update_outputs()
          } else if (input_state.tag === 'error') {
            // diagonal.
          } else if (input_state.tag === 'parsed') {
            this.update_outputs()
          } else {
            return fallthrough('InputBlockLogic.constructor input.on_state_change last_state', input_state)
          }
        } else if (last_state.tag === 'parsed') {
          if (input_state.tag === 'nothing') {
            this.update_outputs()
          } else if (input_state.tag === 'error') {
            this.outputs.set(undefined)
          } else if (input_state.tag === 'parsed') {
            // Might parse to something different, so we want to update here, too!
            this.update_outputs()
          } else {
            return fallthrough('InputBlockLogic.constructor input.on_state_change last_state', input_state)
          }
        } else {
          return fallthrough('InputBlockLogic.constructor input.on_state_change', last_state)
        }
      })

      // input.text.watch((text) => {
      // })

      if (this.inputs.size() === 1) {
        input.has_siblings.set(false)
      } else {
        this.inputs.at(0)?.has_siblings.set(true)
      }
    })
    this.inputs.watch_remove((input) => {
      if (this.inputs.size() === 2) {
        const p = this.inputs.get_previous(input)
        if (p !== undefined) {
          p.has_siblings.set(false)
        } else {
          const n = this.inputs.get_next(input)
          n?.has_siblings.set(false)
        }
      }
    })
  }

  get_inputs() {
    return this.inputs[Symbol.iterator]()
  }

  private set_outputs(new_outputs: ParseOutput[] | undefined): void {
    const old_outputs = this.get_output()
    if (old_outputs === undefined && new_outputs === undefined) {
      return
    } else {
      this.outputs.set(new_outputs)
    }
  }

  private update_outputs(): void {
    // BOOO I'm going through everything again but it's FINE.
    const all_outputs: ParseOutput[] = []
    for (const input of this.inputs) {
      const output = input.get_output()
      // assert(output.tag !== 'error', 'Trying to update outputs to list even though there\'s an error!')
      if (output.tag === 'error') {
        this.set_outputs(undefined)
        return
      } else if (output.tag === 'parsed') {
        all_outputs.push(output.output)
      }
    }
    this.set_outputs(all_outputs)
  }

  on_insert(f: (inserted: SingleInputLogic<ParseOutput, Associate>, lead?: SingleInputLogic<ParseOutput, Associate>) => void): void {
    this.inputs.watch_insert(f)
  }

  on_remove(f: (to_remove: SingleInputLogic<ParseOutput, Associate>) => void): void {
    this.inputs.watch_remove(f)
  }

  insert_input_after(
    lead_input?: SingleInputLogic<ParseOutput, Associate>,
  ): SingleInputLogic<ParseOutput, Associate> {
    const new_input = new SingleInputLogic(this)
    if (lead_input === undefined || lead_input.is_focused.get()) {
      new_input.set_focused()
    }
    this.inputs.insert_after(lead_input, new_input)
    return new_input
  }

  // Returns the 'replacement' in case we want to focus it.
  remove_input(to_remove: SingleInputLogic<ParseOutput, Associate>): SingleInputLogic<ParseOutput, Associate> | undefined {
    const replacement = this.inputs.get_previous(to_remove) ?? this.inputs.get_next(to_remove)
    if (replacement === undefined) {
      return undefined
    }

    this.inputs.remove(to_remove)
    this.update_outputs()

    return replacement
  }

  // on_line_length(f: (new_line_length: number) => void): Watcher<unknown> {
  //   return this.longest_line_length.watch(f)
  // }

  // undefined when cleared.
  on_ready(f: (outputs: ParseOutput[] | undefined) => undefined): Watcher<unknown> {
    return this.outputs.watch(f)
  }

  get_output(): ParseOutput[] | undefined {
    return this.outputs.get()
  }

  set_focus(input: SingleInputLogic<ParseOutput, Associate> | undefined): void {
    const prev_focused = this.focused.get()
    if (prev_focused !== undefined) {
      prev_focused.is_focused.set(false)
    }
    this.focused.set(input)
    input?.is_focused.set(true)
  }

  focus_previous(): SingleInputLogic<ParseOutput, Associate> | undefined {
    if (this.inputs.size() === 0) {
      return undefined
    }

    const focused = this.focused.get()
    if (focused === undefined) {
      const last = this.inputs.at(this.inputs.size() - 1)
      this.set_focus(last)
      return last
    } else {
      const p = this.inputs.get_previous(focused)
      if (p !== undefined) {
        this.set_focus(p)
      }
      return p
    }
  }

  focus_next(): SingleInputLogic<ParseOutput, Associate> | undefined {
    if (this.inputs.size() === 0) {
      return undefined
    }

    const focused = this.focused.get()
    if (focused === undefined) {
      const first = this.inputs.at(0)
      this.set_focus(first)
      return first
    } else {
      const n = this.inputs.get_next(focused)
      if (n !== undefined) {
        this.set_focus(n)
      }
      return n
    }
  }

  n_inputs(): number {
    return this.inputs.size()
  }

  async set_fields(fields: string[]): Promise<void> {
    const trimmed_fields = fields.map((f) => f.trim())
    for (const [index, input] of this.inputs.entries()) {
      if (index >= trimmed_fields.length) {
        // remove there's too many!
        input.remove()
      } else {
        // we can reuse some!
        const f = assert_exists(trimmed_fields[index], `Field at index ${index} doesn\'t exist so you probably messed up near this assertion!`)
        await input.text.set(f)
      }
    }

    if (this.inputs.size() < trimmed_fields.length) {
      // add there's not enough!
      let last_input = this.inputs.at(this.inputs.size() - 1)
      for (const f of trimmed_fields.slice(this.inputs.size())) {
        last_input = this.insert_input_after(last_input)
        await last_input.text.set(f)
      }
    }

    this.update_outputs()
  }

  get_fields(): string[] {
    const fields: string[] = []
    for (const input of this.inputs) {
      fields.push(input.text.get())
    }
    return fields
  }

  // Probably won't be called a lot.
  destroy(): void {
    for (const input of this.inputs) {
      input.destroy()
    }

    this.inputs.cleanup()
    this.longest_line_length.cleanup()
    this.outputs.cleanup()
  }
}

export class GlobalLogic {
  readonly constraint_input = new EditableDLL<SingleInputLogic<Constraint>>([])
  readonly model_state = new Editable<ModelState>({ tag: 'no-model' })
}

export class BatchInputLogic<ParseOutput extends {}, Associate = undefined> {
  readonly text = new Editable('')
  private readonly is_synced = new Editable(false)

  constructor(private readonly parent_block: InputBlockLogic<ParseOutput, Associate>) {
    this.parent_block.on_insert((inserted) => {
      this.desync()
      inserted.text.watch(async () => {
        this.desync()
      })
    })

    this.parent_block.on_remove(() => {
      this.desync()
    })

    this.text.watch(() => {
      this.desync()
    })
  }

  private desync(): void {
    if (this.is_synced.get()) {
      this.is_synced.set(false)
    }
  }

  on_sync(f: (synced: boolean) => undefined): void {
    this.is_synced.watch(f)
  }

  synced(): boolean {
    return this.is_synced.get()
  }

  async send(): Promise<void> {
    const fields = this.text.get().split('\n')
    await this.parent_block.set_fields(fields)
    this.is_synced.set(true)
  }
}
