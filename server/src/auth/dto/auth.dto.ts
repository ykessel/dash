import { z } from 'zod'

// Messages match the ones the sign-in screens already show (src/store.tsx in the frontend).
export const emailField = z.string({ error: 'Enter a valid email address.' })
  .trim()
  .toLowerCase()
  .regex(/^\S+@\S+\.\S+$/, 'Enter a valid email address.')
  .max(254, 'Enter a valid email address.')

export const passwordField = z.string({ error: 'Use at least 8 characters.' })
  .min(8, 'Use at least 8 characters.')
  .max(200, 'Use at most 200 characters.')

export const tokenField = z.string({ error: 'This link isn’t valid.' }).min(1, 'This link isn’t valid.')

export const signupDto = z.object({
  name: z.string({ error: 'Tell us your name.' }).trim().min(2, 'Tell us your name.').max(80, 'Use at most 80 characters.'),
  email: emailField,
  password: passwordField,
})

export const loginDto = z.object({
  email: emailField,
  password: z.string({ error: 'Enter your password.' }).min(1, 'Enter your password.').max(200),
  remember: z.boolean().default(true),
})

export const emailDto = z.object({ email: emailField })
export const tokenDto = z.object({ token: tokenField })
export const resetDto = z.object({ token: tokenField, password: passwordField })
