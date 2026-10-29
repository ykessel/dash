import type { User } from '../users/user.entity'
import type { Access, Presence, Team } from './enums'
import type { Membership } from './membership.entity'

/** The frontend's `Person`, plus the access role. `role` is the job title, as in the frontend. */
export interface Person {
  id: string
  name: string
  email: string
  skin: number
  role: string
  team: Team
  city: string
  tz: string
  capacity: number
  presence: Presence
  note?: string
  access: Access
}

export function toPerson(m: Membership, u: User): Person {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    skin: u.avatarSkin,
    role: m.title,
    team: m.team,
    city: m.city,
    tz: m.tz,
    capacity: m.capacity,
    presence: m.presence,
    ...(m.presenceNote ? { note: m.presenceNote } : {}),
    access: m.role,
  }
}
