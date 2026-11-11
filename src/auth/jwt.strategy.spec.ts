import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';
import { AccountService } from '../account/account.service';
import { Account } from '../account/account.entity';

describe('JwtStrategy.validate', () => {
  let accounts: jest.Mocked<Pick<AccountService, 'findById'>>;
  let strategy: JwtStrategy;

  beforeEach(() => {
    accounts = { findById: jest.fn() };
    strategy = new JwtStrategy(accounts as unknown as AccountService);
  });

  it('a token with no tokenVersion (issued before this check existed) is let through', async () => {
    const user = await strategy.validate({
      sub: 1,
      email: 'a@b.c',
      role: 'ADMIN',
    });

    expect(user).toEqual({ id: 1, email: 'a@b.c', role: 'ADMIN' });
    expect(accounts.findById).not.toHaveBeenCalled();
  });

  it('matching tokenVersion -> accepted', async () => {
    accounts.findById.mockResolvedValue({ token_version: 2 } as Account);

    const user = await strategy.validate({
      sub: 1,
      email: 'a@b.c',
      role: 'ADMIN',
      tokenVersion: 2,
    });

    expect(user).toEqual({ id: 1, email: 'a@b.c', role: 'ADMIN' });
  });

  it('a password change bumped token_version since -> rejected, not silently let in', async () => {
    accounts.findById.mockResolvedValue({ token_version: 3 } as Account);

    await expect(
      strategy.validate({
        sub: 1,
        email: 'a@b.c',
        role: 'ADMIN',
        tokenVersion: 2,
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('the account no longer exists -> rejected, whatever the payload claims', async () => {
    accounts.findById.mockResolvedValue(null);

    await expect(
      strategy.validate({
        sub: 1,
        email: 'a@b.c',
        role: 'ADMIN',
        tokenVersion: 0,
      }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
