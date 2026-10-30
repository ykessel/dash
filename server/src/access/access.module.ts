import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AuthModule } from '../auth/auth.module'
import { WorkspacesModule } from '../workspaces/workspaces.module'
import { ProjectRole } from './project-role.entity'
import { RolesController } from './roles.controller'
import { RolesService } from './roles.service'

@Module({
  imports: [TypeOrmModule.forFeature([ProjectRole]), AuthModule, WorkspacesModule],
  controllers: [RolesController],
  providers: [RolesService],
  exports: [RolesService],
})
export class AccessModule {}
