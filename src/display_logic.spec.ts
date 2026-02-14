import { describe, expect, test } from "vitest"
import { constraint_builder, real_expr_builder } from "./pr_sat"
import { parse_constraint } from "./parser"
import { BatchInputLogic, InputBlockLogic, SingleInputLogic } from "./display_logic"
import { PrSat } from "./types"

type Constraint = PrSat['Constraint']

const { eq } = constraint_builder
const { lit } = real_expr_builder

type CallInfo<Input> =
  | { tag: 'not-called' }
  | { tag: 'called-with', input: Input, count: number }
const watch_f = <Input, Output>(f: (input: Input) => Output): { calls: CallInfo<Input>, f: (input: Input) => Output } => {
  const self = {
    calls: { tag: 'not-called' } as CallInfo<Input>,
    f: (input: Input): Output => {
      self.calls = { tag: 'called-with', input, count: self.calls.tag === 'not-called' ? 1 : self.calls.count + 1 }
      return f(input)
    },
  }
  return self
}

const make_block = () => new InputBlockLogic(parse_constraint, () => undefined)

describe('display logic', () => {
  describe('SingleInputController', () => {
    describe('text and output', () => {
      test('-> nothing', () => {
        const logic = new SingleInputLogic(make_block())
        expect(logic.text.get()).toEqual('')
        expect(logic.get_output()).toEqual({ tag: 'nothing' })
      })
      test('nothing -> error', async () => {
        const logic = new SingleInputLogic(make_block())
        const text = '1'
        await logic.text.set(text)
        expect(logic.text.get()).toEqual(text)
        expect(logic.get_output().tag).toEqual('error')  // I don't care what the message is.
      })
      test('nothing -> parsed', async () => {
        const logic = new SingleInputLogic(make_block())
        const text = '1 = 1'
        await logic.text.set(text)
        expect(logic.text.get()).toEqual(text)
        expect(logic.get_output()).toEqual({ tag: 'parsed', output: eq(lit(1), lit(1)) })
      })
    })
    test('error -> nothing', async () => {
      const logic = new SingleInputLogic(make_block())
      const text = '1'

      await logic.text.set(text)
      expect(logic.text.get()).toEqual(text)
      expect(logic.get_output().tag).toEqual('error')
      
      await logic.text.set('')
      expect(logic.text.get()).toEqual('')
      expect(logic.get_output()).toEqual({ tag: 'nothing' })
    })
    test('parsed -> nothing', async () => {
      const logic = new SingleInputLogic(make_block())
      const text = '1 = 1'

      await logic.text.set(text)
      expect(logic.text.get()).toEqual(text)
      expect(logic.get_output()).toEqual({ tag: 'parsed', output: eq(lit(1), lit(1)) })

      await logic.text.set('')
      expect(logic.text.get()).toEqual('')
      expect(logic.get_output()).toEqual({ tag: 'nothing' })
    })
  })

  describe('InputBlockLogic', () => {
    test('initial doesn\'t trigger', () => {
      const block = make_block()
      const f = watch_f((_: Constraint[] | undefined) => undefined)
      block.on_ready(f.f)

      expect(f.calls).toEqual({ tag: 'not-called' })
      expect(block.get_output()).toEqual(undefined)
    })
    test('adding single input', () => {
      const block = make_block()
      const f = watch_f((_: Constraint[] | undefined) => undefined)
      block.on_ready(f.f)

      const first = block.insert_input_after()
      expect(first.is_focused.get()).toBeTruthy()

      expect(f.calls).toEqual({ tag: 'not-called' })
      expect(block.get_output()).toEqual(undefined)
    })
    test('adding a bunch of empty doesn\'t trigger', () => {
      const block = new InputBlockLogic(parse_constraint, () => undefined)
      const f = watch_f((_: Constraint[] | undefined) => undefined)
      block.on_ready(f.f)

      expect(f.calls).toEqual({ tag: 'not-called' })
      expect(block.get_output()).toEqual(undefined)

      let last_input = block.insert_input_after(undefined)
      block.insert_input_after(last_input)
      block.insert_input_after(last_input)
      block.insert_input_after(last_input)
      block.insert_input_after(last_input)

      expect(f.calls).toEqual({ tag: 'not-called' })
      expect(block.get_output()).toEqual(undefined)
    })
    test('single error triggers', async () => {
      const block = make_block()
      const f = watch_f((_: Constraint[] | undefined) => undefined)
      block.on_ready(f.f)

      expect(f.calls).toEqual({ tag: 'not-called' })
      expect(block.get_output()).toEqual(undefined)

      const input = block.insert_input_after(undefined)
      await input.text.set('1')

      expect(f.calls).toEqual({ tag: 'called-with', output: undefined, count: 1 })
      expect(block.get_output()).toEqual(undefined)
    })
    test('single parse triggers', async () => {
      const block = make_block()
      const f = watch_f((_: Constraint[] | undefined) => undefined)
      block.on_ready(f.f)

      expect(f.calls).toEqual({ tag: 'not-called' })
      expect(block.get_output()).toEqual(undefined)

      const input = block.insert_input_after(undefined)
      await input.text.set('1 = 1')

      const output = [eq(lit(1), lit(1))]
      expect(f.calls).toEqual({ tag: 'called-with', input: output, count: 1 })
      expect(block.get_output()).toEqual(output)
    })
    test('gradually filling in entries triggers each time', async () => {
      const block = make_block()
      const f = watch_f((_: Constraint[] | undefined) => undefined)
      block.on_ready(f.f)

      expect(f.calls).toEqual({ tag: 'not-called' })
      expect(block.get_output()).toEqual(undefined)

      const inputs: SingleInputLogic<Constraint>[] = []
      inputs.push(block.insert_input_after(undefined))
      inputs.push(block.insert_input_after(inputs[0]))
      inputs.push(block.insert_input_after(inputs[1]))
      inputs.push(block.insert_input_after(inputs[2]))
      inputs.push(block.insert_input_after(inputs[3]))
      expect(f.calls).toEqual({ tag: 'not-called' })
      expect(block.get_output()).toEqual(undefined)

      const output: Constraint[] = []

      await inputs[0].text.set('0 = 0')
      output.push(eq(lit(0), lit(0)))
      expect(f.calls).toEqual({ tag: 'called-with', input: output, count: 1 })
      expect(block.get_output()).toEqual(output)

      await inputs[1].text.set('1 = 1')
      output.push(eq(lit(1), lit(1)))
      expect(f.calls).toEqual({ tag: 'called-with', input: output, count: 2 })
      expect(block.get_output()).toEqual(output)

      await inputs[2].text.set('2 = 2')
      output.push(eq(lit(2), lit(2)))
      expect(f.calls).toEqual({ tag: 'called-with', input: output, count: 3 })
      expect(block.get_output()).toEqual(output)

      await inputs[3].text.set('3 = 3')
      output.push(eq(lit(3), lit(3)))
      expect(f.calls).toEqual({ tag: 'called-with', input: output, count: 4 })
      expect(block.get_output()).toEqual(output)
    })
    test('turning one entry into an error invalidates output', async () => {
      const block = make_block()
      const f = watch_f((_: Constraint[] | undefined) => undefined)
      block.on_ready(f.f)
      expect(f.calls).toEqual({ tag: 'not-called' })
      expect(block.get_output()).toEqual(undefined)

      const inputs: SingleInputLogic<Constraint>[] = []
      inputs.push(block.insert_input_after(undefined))
      inputs.push(block.insert_input_after(inputs[0]))
      inputs.push(block.insert_input_after(inputs[1]))
      inputs.push(block.insert_input_after(inputs[2]))
      inputs.push(block.insert_input_after(inputs[3]))
      expect(f.calls).toEqual({ tag: 'not-called' })
      expect(block.get_output()).toEqual(undefined)

      const output: Constraint[] = []

      await inputs[0].text.set('0 = 0')
      output.push(eq(lit(0), lit(0)))
      await inputs[1].text.set('1 = 1')
      output.push(eq(lit(1), lit(1)))
      await inputs[2].text.set('2 = 2')
      output.push(eq(lit(2), lit(2)))
      await inputs[3].text.set('3 = 3')
      output.push(eq(lit(3), lit(3)))
      expect(f.calls).toEqual({ tag: 'called-with', input: output, count: 4 })
      expect(block.get_output()).toEqual(output)

      await inputs[1].text.set('1')
      expect(f.calls).toEqual({ tag: 'called-with', input: undefined, count: 5 })
      expect(block.get_output()).toEqual(undefined)
    })
    test('removing error', async () => {
      const block = make_block()
      const f = watch_f((_: Constraint[] | undefined) => undefined)
      block.on_ready(f.f)
      expect(f.calls).toEqual({ tag: 'not-called' })
      expect(block.get_output()).toEqual(undefined)

      const inputs: SingleInputLogic<Constraint>[] = []
      inputs.push(block.insert_input_after())
      inputs.push(inputs[0].then_insert())
      inputs.push(inputs[1].then_insert())
      inputs.push(inputs[2].then_insert())

      await inputs[0].text.set('0 = 0')
      await inputs[1].text.set('1 = 1')
      await inputs[2].text.set('2 = ')  // error!
      await inputs[3].text.set('3 = 3')
      expect(f.calls).toEqual({ tag: 'called-with', input: undefined, count: 3 })

      inputs[2].remove()
      expect(f.calls).toEqual({ tag: 'called-with', input: [
        eq(lit(0), lit(0)),
        eq(lit(1), lit(1)),
        eq(lit(3), lit(3)),
      ], count: 4 })
    })
    test('removing 1 of multiple errors', async () => {
      const block = make_block()
      const f = watch_f((_: Constraint[] | undefined) => undefined)
      block.on_ready(f.f)
      expect(f.calls).toEqual({ tag: 'not-called' })
      expect(block.get_output()).toEqual(undefined)

      const inputs: SingleInputLogic<Constraint>[] = []
      inputs.push(block.insert_input_after())
      inputs.push(inputs[0].then_insert())
      inputs.push(inputs[1].then_insert())
      inputs.push(inputs[2].then_insert())

      await inputs[0].text.set('0 = 0')
      await inputs[1].text.set('1 = ')  // error!
      await inputs[2].text.set('2 = ')  // error!
      await inputs[3].text.set('3 = 3')
      expect(f.calls).toEqual({ tag: 'called-with', input: undefined, count: 3 })

      inputs[2].remove()
      expect(f.calls).toEqual({ tag: 'called-with', input: undefined, count: 3 })  // don't update because the status stayed the same!
    })
    describe('has_siblings', () => {
      test('single input has no siblings', () => {
        const block = new InputBlockLogic(parse_constraint, () => undefined)
        const input = block.insert_input_after(undefined)
        expect(input.has_siblings.get()).toBeFalsy()
      })
    })
    describe('focus', () => {
      // These tests mimic an order of calls I expect to implement on the frontend.
      test('adding single', () => {
        const block = new InputBlockLogic(parse_constraint, () => undefined)
        const input = block.insert_input_after(undefined)
        const on_focus = watch_f((_: boolean) => undefined)
        input.on_focus(on_focus.f)
        input.set_focused()
        // Should be 1 but is 2.
        expect(on_focus.calls).toEqual({ tag: 'called-with', input: true, count: 2 })
      })
      test('adding multiple', () => {
        const block = new InputBlockLogic(parse_constraint, () => undefined)

        const input0 = block.insert_input_after(undefined)
        const on_input0_focus = watch_f((_: boolean) => undefined)
        input0.on_focus(on_input0_focus.f)
        input0.set_focused()
        // Should be 1 but is 2.
        expect(on_input0_focus.calls).toEqual({ tag: 'called-with', input: true, count: 2 })

        const input1 = block.insert_input_after(input0)
        const on_input1_focus = watch_f((_: boolean) => undefined)
        input1.on_focus(on_input1_focus.f)
        input1.set_focused()
        // Should be 2 but is 3.
        expect(on_input0_focus.calls).toEqual({ tag: 'called-with', input: false, count: 3 })
        // Should be 1 but is 2.
        expect(on_input1_focus.calls).toEqual({ tag: 'called-with', input: true, count: 2 })

        const input2 = block.insert_input_after(input1)
        const on_input2_focus = watch_f((_: boolean) => undefined)
        input2.on_focus(on_input2_focus.f)
        input2.set_focused()
        // Should be 2 but is 3.
        expect(on_input0_focus.calls).toEqual({ tag: 'called-with', input: false, count: 3 })
        expect(on_input1_focus.calls).toEqual({ tag: 'called-with', input: false, count: 3 })
        // Should be 1 but is 2.
        expect(on_input2_focus.calls).toEqual({ tag: 'called-with', input: true, count: 2 })
      })
      test('focus previous/next', () => {
        const block = make_block()

        const input0 = block.insert_input_after(undefined)
        const on_input0_focus = watch_f((_: boolean) => undefined)
        input0.on_focus(on_input0_focus.f)
        input0.set_focused()
        // Should be 1 but its 2.
        expect(on_input0_focus.calls).toEqual({ tag: 'called-with', input: true, count: 2 })

        const input1 = block.insert_input_after(input0)
        const on_input1_focus = watch_f((_: boolean) => undefined)
        input1.on_focus(on_input1_focus.f)
        input1.set_focused()
        // Should be 2 but its 3.
        expect(on_input0_focus.calls).toEqual({ tag: 'called-with', input: false, count: 3 })
        // Should be 1 but its 2.
        expect(on_input1_focus.calls).toEqual({ tag: 'called-with', input: true, count: 2 })

        const input2 = block.insert_input_after(input1)
        const on_input2_focus = watch_f((_: boolean) => undefined)
        input2.on_focus(on_input2_focus.f)
        input2.set_focused()
        // Should be 2 but its 3.
        expect(on_input0_focus.calls).toEqual({ tag: 'called-with', input: false, count: 3 })
        // Should be 2 but its 3.
        expect(on_input1_focus.calls).toEqual({ tag: 'called-with', input: false, count: 3 })
        // Should be 1 but is 2.
        expect(on_input2_focus.calls).toEqual({ tag: 'called-with', input: true, count: 2 })

        input2.focus_previous()
        // Should be 2 but is 3.
        expect(on_input0_focus.calls).toEqual({ tag: 'called-with', input: false, count: 3 })
        // Should be 3 but is 4.
        expect(on_input1_focus.calls).toEqual({ tag: 'called-with', input: true, count: 4 })
        // Should be 2 but is 3.
        expect(on_input2_focus.calls).toEqual({ tag: 'called-with', input: false, count: 3 })

        input1.focus_previous()
        // Should be 3 but is 4.
        expect(on_input0_focus.calls).toEqual({ tag: 'called-with', input: true, count: 4 })
        // Should be 4 but is 5.
        expect(on_input1_focus.calls).toEqual({ tag: 'called-with', input: false, count: 5 })
        // Should be 2 but is 3.
        expect(on_input2_focus.calls).toEqual({ tag: 'called-with', input: false, count: 3 })

        input0.focus_previous()  // Can't focus previous anymore so don't!
        // Should be 3 but is 4.
        expect(on_input0_focus.calls).toEqual({ tag: 'called-with', input: true, count: 4 })
        // Should be 4 but is 5.
        expect(on_input1_focus.calls).toEqual({ tag: 'called-with', input: false, count: 5 })
        // Should be 2 but is 3.
        expect(on_input2_focus.calls).toEqual({ tag: 'called-with', input: false, count: 3 })

        // Going back the other way.

        input0.focus_next()
        // Should be 4 but is 5.
        expect(on_input0_focus.calls).toEqual({ tag: 'called-with', input: false, count: 5 })
        // Should be 5 but is 6
        expect(on_input1_focus.calls).toEqual({ tag: 'called-with', input: true, count: 6 })
        // Should be 2 but is 3.
        expect(on_input2_focus.calls).toEqual({ tag: 'called-with', input: false, count: 3 })

        input1.focus_next()
        // Should be 4 but is 5.
        expect(on_input0_focus.calls).toEqual({ tag: 'called-with', input: false, count: 5 })
        // Should be 6 but is 7.
        expect(on_input1_focus.calls).toEqual({ tag: 'called-with', input: false, count: 7 })
        // Should be 3 but is 4.
        expect(on_input2_focus.calls).toEqual({ tag: 'called-with', input: true, count: 4 })

        input2.focus_next()  // Can't focus next anymore so don't!
        // Should be 4 but is 5.
        expect(on_input0_focus.calls).toEqual({ tag: 'called-with', input: false, count: 5 })
        // Should be 6 but is 7.
        expect(on_input1_focus.calls).toEqual({ tag: 'called-with', input: false, count: 7 })
        // Should be 3 but is 4.
        expect(on_input2_focus.calls).toEqual({ tag: 'called-with', input: true, count: 4 })
      })
    })
    describe('set_fields', () => {
      test('empty', async () => {
        const block = new InputBlockLogic(parse_constraint, () => undefined)
        const on_ready = watch_f((_: Constraint[] | undefined) => undefined)
        block.on_ready(on_ready.f)
        await block.set_fields([])
        expect(on_ready.calls).toEqual({ tag: 'called-with', input: [], count: 1 })
        expect(block.n_inputs()).toEqual(0)
      })
      test('non-empty parseable', async () => {
        const block = new InputBlockLogic(parse_constraint, () => undefined)
        const on_ready = watch_f((_: Constraint[] | undefined) => undefined)
        block.on_ready(on_ready.f)
        await block.set_fields([
          '0 = 0',
          '1 = 1',
          '2 = 2',
        ])
        expect(on_ready.calls).toEqual({ tag: 'called-with', input: [
          eq(lit(0), lit(0)),
          eq(lit(1), lit(1)),
          eq(lit(2), lit(2)),
        ], count: 4 })  // ideally this updates once but that'll complicate things more than I care to at the moment.
        expect(block.n_inputs()).toEqual(3)
      })
    })
    // I don't think the complexity of making sure all the field lengths change in lock-step is worth it for the moment.
    // describe('line_length', () => {
    //   test('1 input', () => {
    //     const block = make_block()
    //     const input = block.insert_input_after()
    //     const on_line_length = watch_f((_: number) => {})
    //     block.on_line_length(on_line_length.f)

    //     const text1 = 'something'
    //     input.text.set(text1)
    //     expect(on_line_length.calls).toEqual({ tag: 'called-with', input: text1.length, count: 1 })

    //     const text2 = 'else'
    //     input.text.set(text2)
    //     expect(on_line_length.calls).toEqual({ tag: 'called-with', input: text2.length, count: 2 })
    //   })
    //   test('2 inputs', () => {
    //     const block = make_block()
    //     const input1 = block.insert_input_after()
    //     const input2 = input1.then_insert()
    //     const on_line_length = watch_f((_: number) => {})
    //     block.on_line_length(on_line_length.f)

    //     // input1: <empty>
    //     // input2: <empty>

    //     const text11 = 'something'
    //     input1.text.set(text11)
    //     // input1: 'something'
    //     // input2: <empty>
    //     expect(on_line_length.calls).toEqual({ tag: 'called-with', input: text11.length, count: 1 })

    //     const text21 = 'else'
    //     input2.text.set(text21)
    //     // input1: 'something'
    //     // input2: 'else'
    //     // doesn't change because 'something' is still bigger than 'else'.
    //     expect(on_line_length.calls).toEqual({ tag: 'called-with', input: text11.length, count: 1 })

    //     const text12 = 'is'
    //     input1.text.set(text12)
    //     // input1: 'is'
    //     // input2: 'else'
    //     // changes because 'is' is smaller than 'else'.
    //     expect(on_line_length.calls).toEqual({ tag: 'called-with', input: text21.length, count: 2 })  

    //     const text22 = 'happening'
    //   })
    // })
    test('introducing an error in a bunch of parseables', async () => {
      const block = make_block()
      const on_ready = watch_f((_: Constraint[] | undefined) => undefined)
      block.on_ready(on_ready.f)
      await block.set_fields([
        '0 = 0',
        '1 = 1',
        '2 = 2',
      ])
      await block.set_fields([
        '0 = 0',
        '1 =',
        '2 = 2',
      ])
      expect(on_ready.calls).toEqual({ tag: 'called-with', input: undefined, count: 6 })  // 8 updates is absolutely absurd but I'll fix it later.
      expect(block.n_inputs()).toEqual(3)
    })
    test('emptying one out of a bunch of parseables', async () => {
      const block = make_block()
      const on_ready = watch_f((_: Constraint[] | undefined) => undefined)
      block.on_ready(on_ready.f)
      await block.set_fields([
        '0 = 0',
        '1 = 1',
        '2 = 2',
      ])
      await block.set_fields([
        '0 = 0',
        '',
        '2 = 2',
      ])
      expect(on_ready.calls).toEqual({ tag: 'called-with', input: [
        eq(lit(0), lit(0)),
        eq(lit(2), lit(2)),
      ], count: 8 })  // 8 updates is horrible!
      expect(block.n_inputs()).toEqual(3)
    })
    test('removing constraint calls on-ready', async () => {
      const block = make_block()
      const on_ready = watch_f((_: Constraint[] | undefined) => undefined)
      block.on_ready(on_ready.f)

      const input0 = block.insert_input_after()
      const input1 = input0.then_insert()
      const input2 = input1.then_insert()

      await input0.text.set('0 = 0')
      await input1.text.set('1 = 1')
      await input2.text.set('2 = 2')

      expect(on_ready.calls).toEqual({ tag: 'called-with', input: [
        eq(lit(0), lit(0)),
        eq(lit(1), lit(1)),
        eq(lit(2), lit(2)),
      ], count: 3 })

      input1.remove()

      expect(on_ready.calls).toEqual({ tag: 'called-with', input: [
        eq(lit(0), lit(0)),
        eq(lit(2), lit(2)),
      ], count: 4 })

      expect(block.n_inputs()).toEqual(2)
    })
  })

  describe('BatchInputLogic', () => {
    test('initial', () => {
      const block = make_block()
      const batch = new BatchInputLogic(block)
      const on_sync = watch_f((_: boolean) => undefined)
      batch.on_sync(on_sync.f)
      expect(batch.text.get()).toEqual('')
      expect(batch.synced()).toBeFalsy()
      expect(on_sync.calls).toEqual({ tag: 'not-called' })
    })
    test('sending on empty syncs', async () => {
      const block = make_block()
      const batch = new BatchInputLogic(block)
      const on_sync = watch_f((_: boolean) => undefined)
      batch.on_sync(on_sync.f)
      await batch.send()
      expect(batch.text.get()).toEqual('')
      expect(batch.synced()).toBeTruthy()
      expect(on_sync.calls).toEqual({ tag: 'called-with', input: true, count: 1 })
    })
    test('a bunch of new parseable lines', async () => {
      const block = make_block()
      const batch = new BatchInputLogic(block)
      const on_sync = watch_f((_: boolean) => undefined)
      batch.on_sync(on_sync.f)
      batch.text.set('0 = 0\n1 = 1\n2 = 2\n3 = 3')
      await batch.send()
      expect(batch.synced()).toBeTruthy()
      expect(on_sync.calls).toEqual({ tag: 'called-with', input: true, count: 1 })
      expect(block.get_output()).toEqual([
        eq(lit(0), lit(0)),
        eq(lit(1), lit(1)),
        eq(lit(2), lit(2)),
        eq(lit(3), lit(3)),
      ])
    })
    test('inserting in parent desyncs', async () => {
      const block = make_block()
      const batch = new BatchInputLogic(block)
      const on_sync = watch_f((_: boolean) => undefined)
      batch.on_sync(on_sync.f)
      await batch.send()  // increment sync count by 1!

      block.insert_input_after(undefined)
      expect(on_sync.calls).toEqual({ tag: 'called-with', input: false, count: 2 })
    })
    test('editing input in parent desyncs', async () => {
      const block = make_block()
      const batch = new BatchInputLogic(block)
      const on_sync = watch_f((_: boolean) => undefined)
      batch.on_sync(on_sync.f)
      await batch.send()  // increment sync count by 1!

      const input = block.insert_input_after(undefined)
      expect(on_sync.calls).toEqual({ tag: 'called-with', input: false, count: 2 })

      await batch.send()
      expect(on_sync.calls).toEqual({ tag: 'called-with', input: true, count: 3 })

      await input.text.set('1 = 1')
      expect(on_sync.calls).toEqual({ tag: 'called-with', input: false, count: 4 })
    })
    test('removing input in parent desyncs', async () => {
      const block = make_block()
      const batch = new BatchInputLogic(block)
      const on_sync = watch_f((_: boolean) => undefined)
      batch.on_sync(on_sync.f)
      await batch.send()  // increment sync count by 1!

      const input = block.insert_input_after()
      expect(on_sync.calls).toEqual({ tag: 'called-with', input: false, count: 2 })

      batch.text.set('1 = 1')
      await batch.send()  // increment sync count by 1!
      expect(on_sync.calls).toEqual({ tag: 'called-with', input: true, count: 3 })

      const removed = input.remove()  // can't remove the first element so don't have anything happen!
      expect(removed).toBeUndefined()
      expect(on_sync.calls).toEqual({ tag: 'called-with', input: true, count: 3 })
    })
    test('dumb bug', async () => {
      const block = make_block()
      const batch = new BatchInputLogic(block)

      const input = block.insert_input_after()
      batch.text.set('0 = 0\n1 = 1\n2 = 2')
      await batch.send()
      expect(input.text.get()).toEqual('0 = 0')
      expect(block.n_inputs()).toEqual(3)
    })
  })
})
