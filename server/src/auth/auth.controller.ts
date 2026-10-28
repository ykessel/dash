import { Body, Controller, HttpCode, Post } from '@nestjs/common'
import { parseBody } from '../common/validate'
import { toPublicUser } from '../users/public-user'
import { AuthService } from './auth.service'
import { emailDto, signupDto, tokenDto } from './dto/auth.dto'

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('signup')
  async signup(@Body() body: unknown) {
    const user = await this.auth.signup(parseBody(signupDto, body))
    return { user: toPublicUser(user) }
  }

  @Post('verify-email')
  @HttpCode(204)
  async verifyEmail(@Body() body: unknown) {
    await this.auth.verifyEmail(parseBody(tokenDto, body).token)
  }

  @Post('verify-email/resend')
  @HttpCode(202)
  async resend(@Body() body: unknown) {
    await this.auth.resendVerification(parseBody(emailDto, body).email)
  }
}
