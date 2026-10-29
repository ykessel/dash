import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { Repository } from 'typeorm'
import { type Look, type Notify, type PrefsView, toPrefsView, UserPrefs } from './user-prefs.entity'

export interface PrefsPatch {
  notify?: Partial<Notify>
  session?: number
  pause?: number
  look?: Partial<Look>
}

@Injectable()
export class PrefsService {
  constructor(@InjectRepository(UserPrefs) private readonly repo: Repository<UserPrefs>) {}

  async get(userId: string): Promise<PrefsView> {
    return toPrefsView(await this.repo.findOneBy({ userId }))
  }

  /** Partial merge, including inside `notify` and `look`. */
  async update(userId: string, patch: PrefsPatch): Promise<PrefsView> {
    const cur = await this.repo.findOneBy({ userId })
    await this.repo.upsert(
      {
        userId,
        notify: { ...cur?.notify, ...patch.notify },
        sessionMin: patch.session ?? cur?.sessionMin ?? null,
        pauseMin: patch.pause ?? cur?.pauseMin ?? null,
        look: { ...cur?.look, ...patch.look },
      },
      ['userId'],
    )
    return this.get(userId)
  }
}
