import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AuthModule } from '../auth/auth.module'
import { WorkspacesModule } from '../workspaces/workspaces.module'
import { Subtask, Task, TaskActivity, TaskComment } from './task.entity'
import { TasksController } from './tasks.controller'
import { TasksService } from './tasks.service'

@Module({
  imports: [TypeOrmModule.forFeature([Task, Subtask, TaskComment, TaskActivity]), AuthModule, WorkspacesModule],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService, TypeOrmModule],
})
export class TasksModule {}
