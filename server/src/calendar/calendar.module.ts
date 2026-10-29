import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AuthModule } from '../auth/auth.module'
import { WorkspacesModule } from '../workspaces/workspaces.module'
import { CalEvent, EventAttendee } from './cal-event.entity'
import { CalendarController } from './calendar.controller'
import { CalendarService } from './calendar.service'

@Module({
  imports: [TypeOrmModule.forFeature([CalEvent, EventAttendee]), AuthModule, WorkspacesModule],
  controllers: [CalendarController],
  providers: [CalendarService],
  exports: [CalendarService],
})
export class CalendarModule {}
