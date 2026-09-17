import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AccountService, isDuplicateEmail } from '../account/account.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly accountService: AccountService,
    private readonly jwtService: JwtService,
  ) {}

  private pepperPassword(password: string): string {
    return password + process.env.PASSWORD_PEPPER;
  }

  async register(full_name: string, email: string, password: string) {
    const address = email.trim().toLowerCase();

    const existing = await this.accountService.findByEmail(address);
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const hashed = await bcrypt.hash(this.pepperPassword(password), 10);

    let account: Awaited<ReturnType<AccountService['create']>>;
    try {
      account = await this.accountService.create({ full_name, email: address, password: hashed });
    } catch (error) {
      // The check above can be overtaken by a second registration of the same
      // address; the unique index is what actually decides.
      if (isDuplicateEmail(error)) {
        throw new ConflictException('Email already in use');
      }
      throw error;
    }
    const access_token = this.jwtService.sign({ sub: account.id, email: account.email, role: account.role });
    return { access_token };
  }

  async login(email: string, password: string) {
    const account = await this.accountService.findByEmail(email);
    if (!account || !account.password || !(await bcrypt.compare(this.pepperPassword(password), account.password))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const access_token = this.jwtService.sign({ sub: account.id, email: account.email, role: account.role });
    return { access_token };
  }
}
