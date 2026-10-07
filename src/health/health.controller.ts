import { Controller, Get, Header, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { HealthService } from './health.service';

/**
 * Unauthenticated on purpose: a monitoring agent has no token, and a check that
 * needs credentials is a check nobody sets up. The payload is therefore kept to
 * states and timings - no host names, no versions, no counts.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /**
   * 200 while the API can serve requests, 503 once it cannot. Monitoring can
   * alert on the status code alone, and read the body for the reason.
   */
  @Get()
  @Header('Cache-Control', 'no-store')
  async check(@Res({ passthrough: true }) res: Response) {
    const result = await this.health.check();
    res.status(result.status === 'down' ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.OK);
    return result;
  }

  /**
   * For agents that are easier to configure against a single number than
   * against JSON: 1 healthy, 0 not.
   */
  @Get('live')
  @Header('Cache-Control', 'no-store')
  async live(@Res({ passthrough: true }) res: Response) {
    const result = await this.health.check();
    res.status(result.status === 'down' ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.OK);
    res.type('text/plain');
    return result.status === 'down' ? '0' : '1';
  }
}
