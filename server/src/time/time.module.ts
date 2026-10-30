import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TimesheetPeriod } from './timesheet-period.entity'
import { Worklog } from './worklog.entity'

@Module({
  imports: [TypeOrmModule.forFeature([Worklog, TimesheetPeriod])],
})
export class TimeModule {}
