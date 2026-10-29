import type { TestApp } from './app'
import { signedIn } from './seed'

export type Signed = Awaited<ReturnType<typeof signedIn>>

/**
 * Two workspaces: A ("Pane") with lin as owner and nia as member, B ("Other") with kai as owner.
 * `base` is A's URL prefix.
 */
export async function twoTeams(t: TestApp) {
  const lin = await signedIn(t)
  const nia = await signedIn(t, 'nia@pane.app')
  const kai = await signedIn(t, 'kai@pane.app')
  const wsA = (await t.http.post('/api/v1/workspaces').set(lin.auth).send({ name: 'Pane' })).body.workspace.id as string
  const wsB = (await t.http.post('/api/v1/workspaces').set(kai.auth).send({ name: 'Other' })).body.workspace.id as string
  await t.db.query(`INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, 'member')`, [wsA, nia.user.id])
  return { lin, nia, kai, wsA, wsB, base: `/api/v1/workspaces/${wsA}`, baseB: `/api/v1/workspaces/${wsB}` }
}
