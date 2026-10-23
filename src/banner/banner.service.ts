import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { PromoBanner } from './banner.entity';
import { normalizeBannerInput } from './banner-input';
import {
  bannerImageUrl,
  removeBannerImage,
  storeBannerImage,
} from './banner-image';
import { AppSetting } from '../app-setting/app-setting.entity';

/** A banner as the panel and the app receive it: the stored row plus the
 *  picture's URL, so neither has to know how the file is named. */
export type BannerView = PromoBanner & { image_url: string };

@Injectable()
export class BannerService {
  constructor(
    @InjectRepository(PromoBanner)
    private readonly banners: Repository<PromoBanner>,
    @InjectRepository(AppSetting)
    private readonly settings: Repository<AppSetting>,
  ) {}

  private view(banner: PromoBanner): BannerView {
    return { ...banner, image_url: bannerImageUrl(banner.image) };
  }

  /** Everything, in display order - the panel shows the switched-off and the
   *  expired ones too, or a manager could not find them again. */
  async findAll(): Promise<BannerView[]> {
    const rows = await this.banners.find({ order: { sort: 'ASC', id: 'ASC' } });
    return rows.map((b) => this.view(b));
  }

  async findOne(id: number): Promise<BannerView> {
    const banner = await this.banners.findOne({ where: { id } });
    if (!banner) throw new NotFoundException(`Банер ${id} не знайдено`);
    return this.view(banner);
  }

  /**
   * What the app shows right now: the carousel switched on, the banner
   * switched on, and today inside its run of dates.
   *
   * A banner pointing at a product that has since been deleted or hidden is
   * still shown, but without the target - a dead tap is worse than none.
   */
  async findActive(): Promise<{ enabled: boolean; items: BannerView[] }> {
    const enabled = await this.settings.findOne({
      where: { key: 'banners_enabled' },
    });
    if (enabled?.value !== true) return { enabled: false, items: [] };

    const now = new Date();
    const rows = await this.banners
      .createQueryBuilder('b')
      .where('b.is_active = true')
      .andWhere('(b.starts_at IS NULL OR b.starts_at <= :now)', { now })
      .andWhere('(b.ends_at IS NULL OR b.ends_at > :now)', { now })
      .orderBy('b.sort', 'ASC')
      .addOrderBy('b.id', 'ASC')
      .getMany();

    const productIds = rows
      .filter((b) => b.target_type === 'product' && b.target_product_id)
      .map((b) => b.target_product_id as number);
    const alive = await this.aliveProducts(productIds);

    return {
      enabled: true,
      items: rows.map((b) => {
        const dead =
          b.target_type === 'product' &&
          !alive.has(b.target_product_id as number);
        return this.view(
          dead ? { ...b, target_type: 'none', target_product_id: null } : b,
        );
      }),
    };
  }

  private async aliveProducts(ids: number[]): Promise<Set<number>> {
    if (ids.length === 0) return new Set();
    const rows: { id: number }[] = await this.banners.manager.query(
      'SELECT id FROM catalog WHERE id = ANY($1) AND is_active = true',
      [ids],
    );
    return new Set(rows.map((r) => r.id));
  }

  async create(
    body: Record<string, unknown>,
    image: Buffer,
  ): Promise<BannerView> {
    const input = normalizeBannerInput(body, { create: true });
    const stored = await storeBannerImage(image);

    // New banners go last, so adding one never pushes the current top banner
    // out of the first slot.
    const last = await this.banners
      .createQueryBuilder('b')
      .select('MAX(b.sort)', 'max')
      .getRawOne<{ max: number | null }>();

    const banner = await this.banners.save(
      this.banners.create({
        ...input,
        image: stored.name,
        sort: input.sort ?? Number(last?.max ?? 0) + 1,
      }),
    );
    return this.view(banner);
  }

  async update(
    id: number,
    body: Record<string, unknown>,
    image?: Buffer,
  ): Promise<BannerView> {
    const current = await this.banners.findOne({ where: { id } });
    if (!current) throw new NotFoundException(`Банер ${id} не знайдено`);

    // Merged with what is stored, so changing one end of the date range is
    // still checked against the other.
    const merged = {
      target_type: current.target_type,
      target_product_id: current.target_product_id,
      target_url: current.target_url,
      starts_at: current.starts_at?.toISOString(),
      ends_at: current.ends_at?.toISOString(),
      ...body,
    };
    const input = normalizeBannerInput(merged, { create: false });

    // The picture is not something the manager types, so it is kept out of
    // the validated input and applied here.
    const patch: Partial<PromoBanner> = { ...(input as Partial<PromoBanner>) };
    const previousImage = current.image;
    if (image) {
      patch.image = (await storeBannerImage(image)).name;
    }

    await this.banners.update(id, patch);
    if (patch.image && patch.image !== previousImage) {
      await this.forgetImage(previousImage, id);
    }
    return this.findOne(id);
  }

  async remove(id: number): Promise<void> {
    const banner = await this.banners.findOne({ where: { id } });
    if (!banner) throw new NotFoundException(`Банер ${id} не знайдено`);
    await this.banners.delete(id);
    await this.forgetImage(banner.image, id);
  }

  /**
   * Deletes a picture file, unless another banner still points at it. File
   * names are the hash of the contents, so the same picture uploaded twice is
   * one file shared by two banners - deleting it with the first would leave
   * the second showing nothing.
   */
  private async forgetImage(
    name: string,
    exceptBannerId: number,
  ): Promise<void> {
    const stillUsed = await this.banners.count({
      where: { image: name, id: Not(exceptBannerId) },
    });
    if (stillUsed === 0) await removeBannerImage(name);
  }

  /** The order the panel dragged them into, saved in one go. */
  async reorder(ids: number[]): Promise<BannerView[]> {
    await this.banners.manager.transaction(async (tx) => {
      for (const [index, id] of ids.entries()) {
        await tx.update(PromoBanner, id, { sort: index + 1 });
      }
    });
    return this.findAll();
  }
}
