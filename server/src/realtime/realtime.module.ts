import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { WorkspacesModule } from '../workspaces/workspaces.module'
import { RealtimeBridge } from './realtime.bridge'
import { RealtimeGateway } from './realtime.gateway'

@Module({
  imports: [AuthModule, WorkspacesModule],
  providers: [RealtimeGateway, RealtimeBridge],
})
export class RealtimeModule {}
