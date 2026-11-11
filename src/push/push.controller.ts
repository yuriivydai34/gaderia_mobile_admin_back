import {
  Body,
  Controller,
  HttpException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { PushService } from './push.service';
import { normalizePushInput } from './push-input';

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('push')
export class PushController {
  constructor(private readonly pushService: PushService) {}

  /**
   * Broadcasts to every install (app-server's "all" topic), or - with
   * account_id - resends the same text to one person. See push.service.ts
   * for why this calls app-server instead of Firebase directly.
   */
  @Post('broadcast')
  async broadcast(@Body() body: Record<string, unknown>) {
    const input = normalizePushInput(body);
    const result = await this.pushService.send(input);
    if (!result.ok) {
      // app-server's own status where there is one (400/403/...), 502 only
      // when it could not be reached at all.
      throw new HttpException(result.message, result.status);
    }
    return { sent: true };
  }
}
