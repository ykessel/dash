import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AccessModule } from '../access/access.module'
import { AuthModule } from '../auth/auth.module'
import { WorkspacesModule } from '../workspaces/workspaces.module'
import { TimesheetPeriod } from './timesheet-period.entity'
import { Worklog } from './worklog.entity'
import { WorklogsController } from './worklogs.controller'
import { WorklogsService } from './worklogs.service'

@Module({
  imports: [TypeOrmModule.forFeature([Worklog, TimesheetPeriod]), AuthModule, WorkspacesModule, AccessModule],
  controllers: [WorklogsController],
  providers: [WorklogsService],
  exports: [WorklogsService],
})
export class TimeModule {}
