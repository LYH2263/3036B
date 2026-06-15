import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';

import { CurrentUser, CurrentUserPayload } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';

import { UserService } from './user.service';
import { ChangePasswordDto } from './change-password.dto';
import { UpdatePreferencesDto } from './update-preferences.dto';
import { UpdateProfileDto } from './update-profile.dto';

@UseGuards(JwtAuthGuard)
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('profile')
  getProfile(@CurrentUser() user: CurrentUserPayload) {
    return this.userService.getProfile(user.sub);
  }

  @Patch('profile')
  updateProfile(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateProfileDto
  ) {
    return this.userService.updateProfile(user.sub, dto);
  }

  @Get('preferences')
  getPreferences(@CurrentUser() user: CurrentUserPayload) {
    return this.userService.getPreferences(user.sub);
  }

  @Patch('preferences')
  updatePreferences(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdatePreferencesDto
  ) {
    return this.userService.updatePreferences(user.sub, dto);
  }

  @Post('change-password')
  changePassword(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: ChangePasswordDto
  ) {
    return this.userService.changePassword(user.sub, dto.oldPassword, dto.newPassword);
  }
}
