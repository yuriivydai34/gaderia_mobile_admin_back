import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Catalog } from './catalog.entity';

@Injectable()
export class CatalogService {
  constructor(
    @InjectRepository(Catalog)
    private readonly catalogRepository: Repository<Catalog>,
  ) {}

  async findAll(page: number, limit: number, sortBy = 'id', sortOrder: 'ASC' | 'DESC' = 'ASC'): Promise<{ data: Catalog[]; total: number; page: number; limit: number }> {
    const [data, total] = await this.catalogRepository.findAndCount({
      skip: (page - 1) * limit,
      take: limit,
      order: { [sortBy]: sortOrder },
    });
    return { data, total, page, limit };
  }

  async findOne(id: number): Promise<Catalog> {
    const catalog = await this.catalogRepository.findOne({ where: { id } });
    if (!catalog) throw new NotFoundException('Catalog not found');
    return catalog;
  }

  create(data: Partial<Catalog>): Promise<Catalog> {
    const catalog = this.catalogRepository.create(data);
    return this.catalogRepository.save(catalog);
  }

  async update(id: number, data: Partial<Catalog>): Promise<Catalog> {
    await this.catalogRepository.update(id, data);
    return this.findOne(id);
  }

  async remove(id: number): Promise<void> {
    const catalog = await this.findOne(id);
    await this.catalogRepository.remove(catalog);
  }
}
