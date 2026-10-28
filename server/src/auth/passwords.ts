import { hash, verify, argon2id } from 'argon2'

export function hashPassword(p: string): Promise<string> {
  return hash(p, { type: argon2id })
}

export async function verifyPassword(hashed: string, p: string): Promise<boolean> {
  try {
    return await verify(hashed, p)
  } catch {
    return false
  }
}
