import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { Account } from './account.entity';

const PUBLIC_FIELDS = [
  'id', 'full_name', 'email', 'number', 'avatar', 'role',
  'name_company', 'code_company', 'is_email_confirmation',
  'name_bank', 'number_bank', 'region', 'settlement',
  'address', 'type_account_subject', 'createdAt', 'updatedAt',
] as const;

// Only these may be written through the admin panel: password, role escalation
// helpers and the confirmation code are deliberately left out.
const EDITABLE_FIELDS = [
  'full_name', 'email', 'number', 'role',
  'name_company', 'code_company', 'type_account_subject',
  'name_bank', 'number_bank', 'region', 'settlement', 'address',
] as const;

/**
 * Postgres reports a unique violation as 23505. Catching it is what actually
 * prevents duplicate accounts: a check-then-insert leaves a window in which two
 * concurrent registrations both pass the check.
 */
export function isDuplicateEmail(error: unknown): boolean {
  const code = (error as { driverError?: { code?: string }; code?: string })?.driverError?.code
    ?? (error as { code?: string })?.code;
  return code === '23505';
}

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

  async updateProfile(id: number, body: Record<string, unknown>): Promise<Omit<Account, 'password'>> {
    const patch: Record<string, string | number | null> = {};

    for (const field of EDITABLE_FIELDS) {
      if (!(field in body)) continue;
      const raw = body[field];
      // The admin form submits empty strings for fields that were cleared.
      const value = raw === '' || raw === undefined ? null : raw;

      if (field === 'code_company') {
        const parsed = value === null ? null : Number(value);
        patch[field] = parsed === null || Number.isNaN(parsed) ? null : parsed;
      } else if (field === 'email') {
        patch[field] = value === null ? null : String(value).trim().toLowerCase();
      } else {
        patch[field] = value === null ? null : String(value);
      }
    }

    if (Object.keys(patch).length > 0) {
      try {
        await this.accountRepository.update(id, patch);
      } catch (error) {
        if (isDuplicateEmail(error)) {
          throw new ConflictException('Email already in use');
        }
        throw error;
      }
    }

    const updated = await this.accountRepository.findOne({
      where: { id },
      select: [...PUBLIC_FIELDS],
    });
    if (!updated) throw new NotFoundException(`Account ${id} not found`);
    return updated;
  }

  /**
   * Case-insensitive on purpose: the unique index is on lower(email), so
   * Ivan@x.com and ivan@x.com are one account and must be found as one.
   */
  findByEmail(email: string): Promise<Account | null> {
    return this.accountRepository
      .createQueryBuilder('account')
      .where('lower(account.email) = lower(:email)', { email: email.trim() })
      .getOne();
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
