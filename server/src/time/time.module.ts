import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AccessModule } from '../access/access.module'
import { AuthModule } from '../auth/auth.module'
import { NoticesModule } from '../notices/notices.module'
import { WorkspacesModule } from '../workspaces/workspaces.module'
import { TimesheetPeriod } from './timesheet-period.entity'
import { Worklog } from './worklog.entity'
import { TimesheetsController } from './timesheets.controller'
import { TimesheetsService } from './timesheets.service'
import { WorklogsController } from './worklogs.controller'
import { WorklogsService } from './worklogs.service'

@Module({
  imports: [TypeOrmModule.forFeature([Worklog, TimesheetPeriod]), AuthModule, WorkspacesModule, AccessModule, NoticesModule],
  controllers: [WorklogsController, TimesheetsController],
  providers: [WorklogsService, TimesheetsService],
  exports: [WorklogsService],
})
export class TimeModule {}
