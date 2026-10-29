import { randomInt } from 'node:crypto'

/** URL-safe name: lowercase ASCII, single dashes, at most 40 characters. */
export function slugify(name: string): string {
  const s = name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '')
  return s || 'team'
}

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'
export const slugSuffix = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')
