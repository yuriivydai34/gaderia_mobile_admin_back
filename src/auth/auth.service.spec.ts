import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { AccountService } from '../account/account.service';
import { Account } from '../account/account.entity';

// Two projects hash passwords for one account table: app-server as
// bcrypt(password + '_gaderia') with the suffix in its code, this admin as
// bcrypt(password + PASSWORD_PEPPER). They agree only while the env value
// equals that constant, and nothing reports it when they drift apart: a
// password set in one simply stops working in the other.
const APP_SERVER_SUFFIX = '_gaderia';

describe('AuthService', () => {
  let accounts: jest.Mocked<Pick<AccountService, 'findByEmail' | 'create'>>;
  let service: AuthService;
  const pepper = process.env.PASSWORD_PEPPER;

  beforeEach(() => {
    process.env.PASSWORD_PEPPER = APP_SERVER_SUFFIX;
    accounts = { findByEmail: jest.fn(), create: jest.fn() };
    const jwt = { sign: jest.fn(() => 'token') } as unknown as JwtService;
    service = new AuthService(accounts as unknown as AccountService, jwt);
  });

  afterAll(() => {
    process.env.PASSWORD_PEPPER = pepper;
  });

  const withHash = (hash: string | null) =>
    ({ id: 1, email: 'a@b.c', role: 'ADMIN', password: hash }) as Account;

  it('accepts a password app-server hashed', async () => {
    const hash = bcrypt.hashSync('secret' + APP_SERVER_SUFFIX, 4);
    accounts.findByEmail.mockResolvedValue(withHash(hash));

    await expect(service.login('a@b.c', 'secret')).resolves.toEqual({ access_token: 'token' });
  });

  it('hashes new passwords so app-server accepts them', async () => {
    accounts.findByEmail.mockResolvedValue(null);
    accounts.create.mockImplementation((data) => Promise.resolve({ id: 2, ...data } as Account));

    await service.register('Ivan', ' Ivan@X.com ', 'secret');

    const { password, email } = accounts.create.mock.calls[0][0];
    expect(bcrypt.compareSync('secret' + APP_SERVER_SUFFIX, password as string)).toBe(true);
    expect(email).toBe('ivan@x.com');
  });

  it.each([
    ['wrong password', withHash(bcrypt.hashSync('secret' + APP_SERVER_SUFFIX, 4)), 'nope'],
    ['no such account', null, 'secret'],
    // Buyers imported without a password must not be let in by an empty one.
    ['account without a password', withHash(null), ''],
  ])('%s -> 401', async (_, account, password) => {
    accounts.findByEmail.mockResolvedValue(account);

    await expect(service.login('a@b.c', password)).rejects.toThrow(UnauthorizedException);
  });

  it('a second registration of the same address -> 409, even when it wins the race to the check', async () => {
    accounts.findByEmail.mockResolvedValue(null);
    accounts.create.mockRejectedValue({ driverError: { code: '23505' } });

    await expect(service.register('Ivan', 'a@b.c', 'secret')).rejects.toThrow(ConflictException);
  });
});
