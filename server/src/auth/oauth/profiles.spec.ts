import { githubProfile, googleProfile } from './profiles'

describe('provider profiles', () => {
  it('google: uses email_verified from the id token claims', () => {
    expect(googleProfile({ id: 'g1', displayName: 'Lin Zhao', emails: [{ value: 'Lin@Pane.app' }], _json: { email_verified: true } })).toEqual({
      provider: 'google', providerUserId: 'g1', email: 'lin@pane.app', emailVerified: true, name: 'Lin Zhao',
    })
    expect(googleProfile({ id: 'g1', displayName: 'Lin', emails: [{ value: 'lin@pane.app' }], _json: { email_verified: false } }).emailVerified).toBe(false)
  })

  it('github: picks the primary verified email', () => {
    const p = githubProfile({
      id: '42', displayName: '', username: 'lin',
      emails: [{ value: 'old@pane.app', verified: true }, { value: 'Lin@Pane.app', primary: true, verified: true }],
    })
    expect(p).toEqual({ provider: 'github', providerUserId: '42', email: 'lin@pane.app', emailVerified: true, name: 'lin' })
  })

  it('github: no verified primary email means unverified', () => {
    const p = githubProfile({ id: '42', displayName: 'Lin', username: 'lin', emails: [{ value: 'lin@pane.app', primary: true, verified: false }] })
    expect(p.emailVerified).toBe(false)
  })

  it('github: no email at all is unverified with an empty email', () => {
    expect(githubProfile({ id: '42', displayName: 'Lin', username: 'lin' })).toMatchObject({ email: '', emailVerified: false })
  })
})
