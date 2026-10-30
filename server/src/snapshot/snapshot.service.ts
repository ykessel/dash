import { Injectable } from '@nestjs/common'
import { AccessService } from '../access/access.service'
import { RolesService } from '../access/roles.service'
import { CalendarService } from '../calendar/calendar.service'
import { FocusService } from '../focus/focus.service'
import { NotificationsService } from '../notifications/notifications.service'
import { PrefsService } from '../prefs/prefs.service'
import { ProjectsService } from '../projects/projects.service'
import { TasksService } from '../tasks/tasks.service'
import { MembersService } from '../workspaces/members.service'
import type { Membership } from '../workspaces/membership.entity'

/** The frontend's `DATA_VERSION`: the snapshot has the same shape as its `Data`. */
export const DATA_VERSION = 4

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
    private readonly roles: RolesService,
    private readonly access: AccessService,
  ) {}

  /** Everything the app needs to draw a workspace for one person; their own notices, focus, prefs and permissions only. */
  async get(wsId: string, m: Membership) {
    const userId = m.userId
    const [people, projects, tasks, events, notices, focus, prefs, roles, access] = await Promise.all([
      this.members.list(wsId),
      this.projects.list(wsId, userId),
      this.tasks.list(wsId, {}),
      this.calendar.all(wsId),
      this.notices.list(wsId, userId),
      this.focus.log(wsId, userId),
      this.prefs.get(userId),
      this.roles.list(wsId),
      this.access.byProject(wsId, m),
    ])
    // `look` travels through /me/prefs; `Data.prefs` has none.
    const { look: _look, ...dataPrefs } = prefs
    return { version: DATA_VERSION, me: userId, people, projects, tasks, events, notices, focus, prefs: dataPrefs, roles, access }
  }
}
