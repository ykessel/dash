import type { User } from './user.entity'

export interface PublicUser {
  id: string
  email: string
  name: string
  emailVerified: boolean
  avatarSkin: number
}

export function toPublicUser(u: User): PublicUser {
  return { id: u.id, email: u.email, name: u.name, emailVerified: !!u.emailVerifiedAt, avatarSkin: u.avatarSkin }
}
