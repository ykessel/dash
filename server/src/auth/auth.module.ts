import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'
import { TypeOrmModule } from '@nestjs/typeorm'
import type { Env } from '../config/env'
import { MeController } from '../users/me.controller'
import { UsersModule } from '../users/users.module'
import { AuthToken } from './auth-token.entity'
import { AuthTokensService } from './auth-tokens.service'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { JwtAuthGuard } from './jwt-auth.guard'
import { GithubStrategy } from './oauth/github.strategy'
import { GoogleStrategy } from './oauth/google.strategy'
import { IdentityLinker } from './oauth/identity-linker.service'
import { OAuthController } from './oauth/oauth.controller'
import { RefreshSession } from './refresh-session.entity'
import { SessionService } from './session.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([AuthToken, RefreshSession]),
    UsersModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (c: ConfigService<Env, true>) => ({
        secret: c.get('JWT_SECRET', { infer: true }),
        signOptions: { algorithm: 'HS256' },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
  ],
  // MeController lives with users but needs the session guard, so it is mounted here to avoid a module cycle.
  controllers: [AuthController, OAuthController, MeController],
  providers: [AuthService, AuthTokensService, SessionService, JwtAuthGuard, IdentityLinker, GoogleStrategy, GithubStrategy],
  exports: [AuthTokensService, SessionService, JwtAuthGuard],
})
export class AuthModule {}
