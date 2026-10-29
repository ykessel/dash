import { describe, expect, it } from 'vitest'
import { ApiError } from './client'
import { mergeWorkspaces, pickWorkspace, toAuthResult } from './session'

describe('toAuthResult', () => {
  it('keeps the field the API named', () => {
    expect(toAuthResult(new ApiError(400, 'invalid', 'Use at least 8 characters.', 'password'))).toEqual({ ok: false, field: 'password', error: 'Use at least 8 characters.' })
    expect(toAuthResult(new ApiError(400, 'invalid', 'Tell us your name.', 'name'))).toEqual({ ok: false, field: 'name', error: 'Tell us your name.' })
  })

  it('puts anything else on the email field', () => {
    expect(toAuthResult(new ApiError(401, 'invalid_credentials', 'That email or password isn’t right.'))).toEqual({ ok: false, field: 'email', error: 'That email or password isn’t right.' })
    expect(toAuthResult(new ApiError(400, 'invalid', 'Bad team.', 'team'))).toEqual({ ok: false, field: 'email', error: 'Bad team.' })
  })

  it('a network failure says so', () => {
    expect(toAuthResult(new TypeError('Failed to fetch'))).toEqual({ ok: false, field: 'email', error: 'Can’t reach Pane. Check your connection.' })
  })
})

describe('pickWorkspace', () => {
  const list = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]
  it('keeps the last one when it is still mine', () => expect(pickWorkspace(list, 'b')).toBe('b'))
  it('falls back to the first', () => expect(pickWorkspace(list, 'gone')).toBe('a'))
  it('null when I have none', () => expect(pickWorkspace([], 'a')).toBeNull())
})

describe('mergeWorkspaces', () => {
  it('keeps what I had, renames, and adds the new ones at the end', () => {
    expect(mergeWorkspaces([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], [{ id: 'b', name: 'B2' }, { id: 'c', name: 'C' }]))
      .toEqual([{ id: 'a', name: 'A' }, { id: 'b', name: 'B2' }, { id: 'c', name: 'C' }])
  })
})
