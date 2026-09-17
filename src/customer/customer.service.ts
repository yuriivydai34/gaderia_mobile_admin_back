import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { Customer } from './customer.entity';

@Injectable()
export class CustomerService {
  constructor(
    @InjectRepository(Customer)
    private readonly customers: Repository<Customer>,
  ) {}

  async findAll(
    page: number,
    limit: number,
    search?: string,
    source?: string,
  ): Promise<{ data: Customer[]; total: number; page: number; limit: number }> {
    const qb = this.customers
      .createQueryBuilder('customer')
      .orderBy('customer.id', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    if (source) {
      qb.andWhere('customer.source = :source', { source });
    }

    const term = search?.trim();
    if (term) {
      const pattern = `%${term}%`;
      qb.andWhere(
        new Brackets((b) => {
          b.where('customer.full_name ILIKE :pattern', { pattern })
            .orWhere('customer.email ILIKE :pattern', { pattern })
            .orWhere('customer.number ILIKE :pattern', { pattern })
            .orWhere('customer.name_company ILIKE :pattern', { pattern })
            .orWhere('customer.region ILIKE :pattern', { pattern })
            .orWhere('customer.settlement ILIKE :pattern', { pattern })
            .orWhere('customer.address ILIKE :pattern', { pattern })
            // Every email, phone spelling and address the person ever used is
            // kept in source_data, so one they used once still finds them.
            .orWhere('customer.source_data::text ILIKE :pattern', { pattern });
        }),
      );
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  count(source?: string): Promise<number> {
    return source ? this.customers.count({ where: { source } }) : this.customers.count();
  }
}
