import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { WorkspacesModule } from '../workspaces/workspaces.module'
import { InsightsController } from './insights.controller'
import { InsightsService } from './insights.service'

@Module({
  imports: [AuthModule, WorkspacesModule],
  controllers: [InsightsController],
  providers: [InsightsService],
})
export class InsightsModule {}
