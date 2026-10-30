import { Module } from '@nestjs/common'
import { AccessModule } from '../access/access.module'
import { AuthModule } from '../auth/auth.module'
import { CalendarModule } from '../calendar/calendar.module'
import { FocusModule } from '../focus/focus.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { PrefsModule } from '../prefs/prefs.module'
import { ProjectsModule } from '../projects/projects.module'
import { TasksModule } from '../tasks/tasks.module'
import { WorkspacesModule } from '../workspaces/workspaces.module'
import { SnapshotController } from './snapshot.controller'
import { SnapshotService } from './snapshot.service'

@Module({
  imports: [AuthModule, WorkspacesModule, AccessModule, ProjectsModule, TasksModule, CalendarModule, NotificationsModule, FocusModule, PrefsModule],
  controllers: [SnapshotController],
  providers: [SnapshotService],
})
export class SnapshotModule {}
