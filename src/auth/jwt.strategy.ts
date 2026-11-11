import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AccountService } from '../account/account.service';

type Payload = {
  sub: number;
  email: string;
  role: string | null;
  tokenVersion?: number;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly accountService: AccountService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET ?? 'changeme',
    });
  }

  /**
   * Rejects a token whose tokenVersion no longer matches the account's
   * current one - the same single-token revocation app-server added for its
   * own JWT (account.token_version, migrations/026). A token signed before
   * this check existed carries no tokenVersion at all; it is let through
   * rather than logging out every admin at once; it will carry one again
   * once it expires (7d) and the admin logs back in.
   */
  async validate(payload: Payload) {
    if (payload.tokenVersion !== undefined) {
      const account = await this.accountService.findById(payload.sub);
      if (!account || account.token_version !== payload.tokenVersion) {
        throw new UnauthorizedException('Сесію завершено. Увійдіть знову.');
      }
    }
    return { id: payload.sub, email: payload.email, role: payload.role };
  }
}
