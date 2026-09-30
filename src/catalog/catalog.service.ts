import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Catalog } from './catalog.entity';
import { normalizeCatalogInput } from './catalog-input';

@Injectable()
export class CatalogService {
  constructor(
    @InjectRepository(Catalog)
    private readonly catalogRepository: Repository<Catalog>,
  ) {}

  async findAll(page: number, limit: number, sortBy = 'id', sortOrder: 'ASC' | 'DESC' = 'ASC'): Promise<{ data: Catalog[]; total: number; page: number; limit: number }> {
    const columns = this.catalogRepository.metadata.columns.map((c) => c.propertyName);
    const [data, total] = await this.catalogRepository.findAndCount({
      skip: (page - 1) * limit,
      take: limit,
      // An unknown column or direction used to reach TypeORM and come back as a 500.
      order: {
        [columns.includes(sortBy) ? sortBy : 'id']: String(sortOrder).toUpperCase() === 'DESC' ? 'DESC' : 'ASC',
      },
    });
    return { data, total, page, limit };
  }

  async findOne(id: number): Promise<Catalog> {
    const catalog = await this.catalogRepository.findOne({ where: { id } });
    if (!catalog) throw new NotFoundException('Catalog not found');
    return catalog;
  }

  async create(body: Record<string, unknown>): Promise<Catalog> {
    const input = normalizeCatalogInput(body);
    // A new product goes to the end of the app's list unless placed.
    if (input.id_sort === undefined) {
      const last = await this.catalogRepository
        .createQueryBuilder('c')
        .select('MAX(c.id_sort)', 'max')
        .getRawOne<{ max: number | null }>();
      input.id_sort = Number(last?.max ?? 0) + 1;
    }
    return this.catalogRepository.save(this.catalogRepository.create(input));
  }

  async update(id: number, body: Record<string, unknown>): Promise<Catalog> {
    const current = await this.findOne(id);
    const input = normalizeCatalogInput(body, true, current);
    if (Object.keys(input).length > 0) await this.catalogRepository.update(id, input);
    return this.findOne(id);
  }

  async remove(id: number): Promise<void> {
    const catalog = await this.findOne(id);
    await this.catalogRepository.remove(catalog);
  }
}
