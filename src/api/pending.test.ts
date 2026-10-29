import { describe, expect, it } from 'vitest'
import { PendingIds, replaceById } from './pending'

describe('replaceById', () => {
  const a = { id: 'a', v: 1 }
  const b = { id: 'b', v: 1 }
  it('swaps the temp for the real item in place', () => {
    expect(replaceById([a, { id: 'tmp-1', v: 0 }, b], { id: 'r', v: 2 }, 'tmp-1', 'start')).toEqual([a, { id: 'r', v: 2 }, b])
  })
  it('never keeps two copies when a snapshot already brought the real one', () => {
    expect(replaceById([{ id: 'r', v: 1 }, { id: 'tmp-1', v: 0 }, a], { id: 'r', v: 2 }, 'tmp-1', 'start')).toEqual([{ id: 'r', v: 2 }, a])
  })
  it('adds it at the given end when neither is there', () => {
    expect(replaceById([a], b, 'tmp-x', 'start')).toEqual([b, a])
    expect(replaceById([a], b, 'tmp-x', 'end')).toEqual([a, b])
  })
  it('updates in place without a temp', () => {
    expect(replaceById([a, b], { id: 'a', v: 9 }, 'a', 'start')).toEqual([{ id: 'a', v: 9 }, b])
  })
})

describe('PendingIds', () => {
  it('passes real ids straight through', async () => {
    const p = new PendingIds()
    expect(await p.real('abc')).toBe('abc')
  })
  it('waits for the create behind a temp id', async () => {
    const p = new PendingIds()
    let done!: (id: string | null) => void
    p.track('tmp-1', new Promise(r => { done = r }))
    const got = p.real('tmp-1')
    done('real-1')
    expect(await got).toBe('real-1')
    expect(await p.real('tmp-1')).toBe('real-1')
  })
  it('null when the create failed', async () => {
    const p = new PendingIds()
    p.track('tmp-2', Promise.resolve(null))
    expect(await p.real('tmp-2')).toBeNull()
  })
  it('an unknown temp id is null', async () => {
    expect(await new PendingIds().real('tmp-nope')).toBeNull()
  })
})
