import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Account } from './account.entity';

@Injectable()
export class AccountService {
  constructor(
    @InjectRepository(Account)
    private readonly accountRepository: Repository<Account>,
  ) {}

  findAll(): Promise<Omit<Account, 'password'>[]> {
    return this.accountRepository.find({
      select: [
        'id', 'full_name', 'email', 'number', 'avatar', 'role',
        'name_company', 'code_company', 'is_email_confirmation',
        'name_bank', 'number_bank', 'region', 'settlement',
        'address', 'type_account_subject', 'createdAt', 'updatedAt',
      ],
    });
  }

  findByEmail(email: string): Promise<Account | null> {
    return this.accountRepository.findOne({ where: { email } });
  }

  findById(id: number): Promise<Account | null> {
    return this.accountRepository.findOne({ where: { id } });
  }

  create(data: Partial<Account>): Promise<Account> {
    const account = this.accountRepository.create(data);
    return this.accountRepository.save(account);
  }

  async update(id: number, data: Partial<Account>): Promise<Account | null> {
    await this.accountRepository.update(id, data);
    return this.findById(id);
  }
}
