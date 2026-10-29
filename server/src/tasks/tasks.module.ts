import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AuthModule } from '../auth/auth.module'
import { WorkspacesModule } from '../workspaces/workspaces.module'
import { Subtask, Task, TaskActivity, TaskComment } from './task.entity'
import { CommentsController } from './comments.controller'
import { SubtasksController } from './subtasks.controller'
import { TaskPartsService } from './task-parts.service'
import { TasksController } from './tasks.controller'
import { TasksService } from './tasks.service'

@Module({
  imports: [TypeOrmModule.forFeature([Task, Subtask, TaskComment, TaskActivity]), AuthModule, WorkspacesModule],
  controllers: [TasksController, SubtasksController, CommentsController],
  providers: [TasksService, TaskPartsService],
  exports: [TasksService, TypeOrmModule],
})
export class TasksModule {}
