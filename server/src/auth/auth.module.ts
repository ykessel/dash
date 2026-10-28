import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { UsersModule } from '../users/users.module'
import { AuthToken } from './auth-token.entity'
import { AuthTokensService } from './auth-tokens.service'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { RefreshSession } from './refresh-session.entity'

@Module({
  imports: [TypeOrmModule.forFeature([AuthToken, RefreshSession]), UsersModule],
  controllers: [AuthController],
  providers: [AuthService, AuthTokensService],
  exports: [AuthTokensService],
})
export class AuthModule {}
