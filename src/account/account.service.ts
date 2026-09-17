import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { Account } from './account.entity';

const PUBLIC_FIELDS = [
  'id', 'full_name', 'email', 'number', 'avatar', 'role',
  'name_company', 'code_company', 'is_email_confirmation',
  'name_bank', 'number_bank', 'region', 'settlement',
  'address', 'type_account_subject', 'createdAt', 'updatedAt',
] as const;

@Injectable()
export class AccountService {
  constructor(
    @InjectRepository(Account)
    private readonly accountRepository: Repository<Account>,
  ) {}

  async findAll(page: number, limit: number, search?: string): Promise<{ data: Omit<Account, 'password'>[]; total: number; page: number; limit: number }> {
    const qb = this.accountRepository
      .createQueryBuilder('account')
      .select(PUBLIC_FIELDS.map((f) => `account.${f}`))
      .orderBy('account.id', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    const term = search?.trim();
    if (term) {
      const pattern = `%${term}%`;
      qb.where(
        new Brackets((b) => {
          b.where('account.full_name ILIKE :pattern', { pattern })
            .orWhere('account.email ILIKE :pattern', { pattern })
            .orWhere('account.number ILIKE :pattern', { pattern })
            .orWhere('account.name_company ILIKE :pattern', { pattern })
            .orWhere('account.name_bank ILIKE :pattern', { pattern })
            .orWhere('account.number_bank ILIKE :pattern', { pattern })
            .orWhere('account.region ILIKE :pattern', { pattern })
            .orWhere('account.settlement ILIKE :pattern', { pattern })
            .orWhere('account.address ILIKE :pattern', { pattern })
            .orWhere('CAST(account.code_company AS TEXT) ILIKE :pattern', { pattern });
        }),
      );
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
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
