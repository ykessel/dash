import { Injectable } from '@nestjs/common'
import { CalendarService } from '../calendar/calendar.service'
import { FocusService } from '../focus/focus.service'
import { NotificationsService } from '../notifications/notifications.service'
import { PrefsService } from '../prefs/prefs.service'
import { ProjectsService } from '../projects/projects.service'
import { TasksService } from '../tasks/tasks.service'
import { MembersService } from '../workspaces/members.service'

/** The frontend's `DATA_VERSION`: the snapshot has the same shape as its `Data`. */
export const DATA_VERSION = 3

@Injectable()
export class SnapshotService {
  constructor(
    private readonly members: MembersService,
    private readonly projects: ProjectsService,
    private readonly tasks: TasksService,
    private readonly calendar: CalendarService,
    private readonly notices: NotificationsService,
    private readonly focus: FocusService,
    private readonly prefs: PrefsService,
  ) {}

  /** Everything the app needs to draw a workspace for one person; their own notices, focus and prefs only. */
  async get(wsId: string, userId: string) {
    const [people, projects, tasks, events, notices, focus, prefs] = await Promise.all([
      this.members.list(wsId),
      this.projects.list(wsId, userId),
      this.tasks.list(wsId, {}),
      this.calendar.all(wsId),
      this.notices.list(wsId, userId),
      this.focus.log(wsId, userId),
      this.prefs.get(userId),
    ])
    // `look` travels through /me/prefs; `Data.prefs` has none.
    const { look: _look, ...dataPrefs } = prefs
    return { version: DATA_VERSION, me: userId, people, projects, tasks, events, notices, focus, prefs: dataPrefs }
  }
}
