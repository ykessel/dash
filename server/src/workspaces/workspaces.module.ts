import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AuthModule } from '../auth/auth.module'
import { UsersModule } from '../users/users.module'
import { MembersController } from './members.controller'
import { MembersService } from './members.service'
import { Membership } from './membership.entity'
import { WorkspaceMemberGuard } from './workspace-member.guard'
import { Workspace } from './workspace.entity'
import { WorkspacesController } from './workspaces.controller'
import { WorkspacesService } from './workspaces.service'

@Module({
  imports: [TypeOrmModule.forFeature([Workspace, Membership]), AuthModule, UsersModule],
  controllers: [WorkspacesController, MembersController],
  providers: [WorkspacesService, MembersService, WorkspaceMemberGuard],
  exports: [WorkspacesService, MembersService, WorkspaceMemberGuard, TypeOrmModule],
})
export class WorkspacesModule {}
