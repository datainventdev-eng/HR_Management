import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from '../common/decorators/public.decorator';
import { AuthenticatedRequest } from '../common/auth/authenticated-request.interface';
import { ChangePasswordDto, CreateUserDto, LoginDto, RefreshDto } from './auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() body: LoginDto) {
    return this.authService.login(body);
  }

  @Public()
  @Post('refresh')
  refresh(@Body() body: RefreshDto) {
    return this.authService.refresh(body);
  }

  @Post('logout')
  logout(@Req() req: AuthenticatedRequest) {
    return this.authService.logout(req.user!.id);
  }

  @Post('users')
  createUser(@Req() req: AuthenticatedRequest, @Body() body: CreateUserDto) {
    return this.authService.createUserByAdmin({ id: req.user!.id, role: req.user!.role }, body);
  }

  @Post('change-password')
  changePassword(@Req() req: AuthenticatedRequest, @Body() body: ChangePasswordDto) {
    return this.authService.changePassword(req.user!.id, body);
  }

  @Get('me')
  me(@Req() req: AuthenticatedRequest) {
    return this.authService.getMe(req.user!.id);
  }
}
