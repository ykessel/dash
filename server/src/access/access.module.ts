import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AuthModule } from '../auth/auth.module'
import { WorkspacesModule } from '../workspaces/workspaces.module'
import { AccessController } from './access.controller'
import { AccessService } from './access.service'
import { ProjectRole } from './project-role.entity'
import { RolesController } from './roles.controller'
import { RolesService } from './roles.service'

@Module({
  imports: [TypeOrmModule.forFeature([ProjectRole]), AuthModule, WorkspacesModule],
  controllers: [RolesController, AccessController],
  providers: [RolesService, AccessService],
  exports: [RolesService, AccessService],
})
export class AccessModule {}
