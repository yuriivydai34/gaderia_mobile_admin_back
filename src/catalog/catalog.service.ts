import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Catalog } from './catalog.entity';
import { CatalogInput, normalizeCatalogInput } from './catalog-input';
import { DEFAULT_BADGE_COLOR, isBadgedPicture, storeBadgedPicture } from './picture-badge';

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
    await this.applyBadge(input);
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
    await this.applyBadge(input, current);
    if (Object.keys(input).length > 0) await this.catalogRepository.update(id, input);
    return this.findOne(id);
  }

  /**
   * Draws the badge onto the picture when either changes. The form always
   * sends the clean picture; `picture` ends up as the badged copy the app
   * shows and `picture_original` as the clean one.
   */
  private async applyBadge(input: CatalogInput, current?: Catalog): Promise<void> {
    if (!('picture' in input) && !('badge' in input) && !('badge_color' in input)) return;

    const badge = 'badge' in input ? input.badge ?? null : current?.badge ?? null;
    const color = ('badge_color' in input ? input.badge_color : current?.badge_color) ?? DEFAULT_BADGE_COLOR;
    let original = 'picture' in input
      ? input.picture ?? null
      : current?.picture_original ?? current?.picture ?? null;

    // The badged copy sent back unchanged, e.g. by an older form: draw on
    // the clean picture again, never on top of an existing badge.
    if (isBadgedPicture(original)) {
      original = current?.picture_original ?? null;
      if (!original) throw new BadRequestException('Вкажіть картинку без бейджа');
    }

    if (badge && !original) throw new BadRequestException('Бейдж потребує картинки товару');

    input.badge = badge;
    input.badge_color = badge ? color : null;
    input.picture = badge ? await storeBadgedPicture(original!, { text: badge, color }) : original;
    input.picture_original = badge ? original : null;
  }

  async remove(id: number): Promise<void> {
    const catalog = await this.findOne(id);
    await this.catalogRepository.remove(catalog);
  }
}
