import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AuthModule } from '../auth/auth.module'
import { CalendarModule } from '../calendar/calendar.module'
import { WorkspacesModule } from '../workspaces/workspaces.module'
import { Milestone, Project, ProjectMember, ProjectPrefs } from './project.entity'
import { ProjectsController } from './projects.controller'
import { ProjectsService } from './projects.service'

@Module({
  imports: [TypeOrmModule.forFeature([Project, ProjectMember, ProjectPrefs, Milestone]), AuthModule, WorkspacesModule, CalendarModule],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
