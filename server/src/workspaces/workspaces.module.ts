import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AuthModule } from '../auth/auth.module'
import { UsersModule } from '../users/users.module'
import { Membership } from './membership.entity'
import { WorkspaceMemberGuard } from './workspace-member.guard'
import { Workspace } from './workspace.entity'
import { WorkspacesController } from './workspaces.controller'
import { WorkspacesService } from './workspaces.service'

@Module({
  imports: [TypeOrmModule.forFeature([Workspace, Membership]), AuthModule, UsersModule],
  controllers: [WorkspacesController],
  providers: [WorkspacesService, WorkspaceMemberGuard],
  exports: [WorkspacesService, WorkspaceMemberGuard, TypeOrmModule],
})
export class WorkspacesModule {}
