import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AuthModule } from '../auth/auth.module'
import { UsersModule } from '../users/users.module'
import { Invitation } from './invitation.entity'
import { AcceptInvitationController, InvitationsController } from './invitations.controller'
import { InvitationsService } from './invitations.service'
import { MembersController } from './members.controller'
import { MembersService } from './members.service'
import { Membership } from './membership.entity'
import { WorkspaceMemberGuard } from './workspace-member.guard'
import { Workspace } from './workspace.entity'
import { WorkspacesController } from './workspaces.controller'
import { WorkspacesService } from './workspaces.service'

@Module({
  imports: [TypeOrmModule.forFeature([Workspace, Membership, Invitation]), AuthModule, UsersModule],
  controllers: [WorkspacesController, MembersController, InvitationsController, AcceptInvitationController],
  providers: [WorkspacesService, MembersService, InvitationsService, WorkspaceMemberGuard],
  exports: [WorkspacesService, MembersService, WorkspaceMemberGuard, TypeOrmModule],
})
export class WorkspacesModule {}
