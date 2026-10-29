import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { Repository } from 'typeorm'
import { normalizeEmail } from './email'
import { User } from './user.entity'

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private readonly repo: Repository<User>) {}

  findByEmail(email: string): Promise<User | null> {
    return this.repo.findOneBy({ email: normalizeEmail(email) })
  }

  findById(id: string): Promise<User | null> {
    return this.repo.findOneBy({ id })
  }

  create(input: { email: string; name: string; passwordHash?: string; emailVerified: boolean }): Promise<User> {
    return this.repo.save(this.repo.create({
      email: normalizeEmail(input.email),
      name: input.name.trim(),
      passwordHash: input.passwordHash ?? null,
      emailVerifiedAt: input.emailVerified ? new Date() : null,
      avatarSkin: Math.floor(Math.random() * 6),
    }))
  }

  /** Keeps the first verification time if the address was already verified. */
  async markVerified(id: string): Promise<void> {
    await this.repo.createQueryBuilder().update()
      .set({ emailVerifiedAt: () => 'now()' })
      .where('id = :id AND email_verified_at IS NULL', { id })
      .execute()
  }

  async setPassword(id: string, hash: string | null): Promise<void> {
    await this.repo.update({ id }, { passwordHash: hash })
  }
}
