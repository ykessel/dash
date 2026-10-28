import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { OAuthAccount } from './oauth-account.entity'
import { User } from './user.entity'
import { UsersService } from './users.service'

@Module({
  imports: [TypeOrmModule.forFeature([User, OAuthAccount])],
  providers: [UsersService],
  exports: [UsersService, TypeOrmModule],
})
export class UsersModule {}
