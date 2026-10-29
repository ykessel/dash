import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AuthModule } from '../auth/auth.module'
import { WorkspacesModule } from '../workspaces/workspaces.module'
import { FocusSession } from './focus-session.entity'
import { FocusController } from './focus.controller'
import { FocusService } from './focus.service'

@Module({
  imports: [TypeOrmModule.forFeature([FocusSession]), AuthModule, WorkspacesModule],
  controllers: [FocusController],
  providers: [FocusService],
  exports: [FocusService],
})
export class FocusModule {}
