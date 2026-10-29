import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AuthModule } from '../auth/auth.module'
import { PrefsController } from './prefs.controller'
import { PrefsService } from './prefs.service'
import { UserPrefs } from './user-prefs.entity'

@Module({
  imports: [TypeOrmModule.forFeature([UserPrefs]), AuthModule],
  controllers: [PrefsController],
  providers: [PrefsService],
  exports: [PrefsService],
})
export class PrefsModule {}
