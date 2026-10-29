import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { WorkspacesModule } from '../workspaces/workspaces.module'
import { PRESENCE_GRACE_MS, PresenceService } from './presence.service'
import { RealtimeBridge } from './realtime.bridge'
import { RealtimeGateway } from './realtime.gateway'

@Module({
  imports: [AuthModule, WorkspacesModule],
  providers: [RealtimeGateway, RealtimeBridge, PresenceService, { provide: PRESENCE_GRACE_MS, useValue: 30_000 }],
})
export class RealtimeModule {}
