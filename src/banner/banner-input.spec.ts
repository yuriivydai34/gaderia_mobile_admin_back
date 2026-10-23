import { BadRequestException } from '@nestjs/common';
import { normalizeBannerInput, TITLE_MAX_LENGTH } from './banner-input';

const create = (body: Record<string, unknown>) =>
  normalizeBannerInput(body, { create: true });
const edit = (body: Record<string, unknown>) =>
  normalizeBannerInput(body, { create: false });

describe('banner input', () => {
  describe('title', () => {
    it('is required when creating', () => {
      expect(() => create({})).toThrow(BadRequestException);
      expect(() => create({ title: '   ' })).toThrow(BadRequestException);
    });

    it('is trimmed, and capped', () => {
      expect(create({ title: '  Весняна акція  ' }).title).toBe(
        'Весняна акція',
      );
      expect(() => create({ title: 'x'.repeat(TITLE_MAX_LENGTH + 1) })).toThrow(
        BadRequestException,
      );
    });

    it('is left alone by an edit that does not mention it', () => {
      expect(edit({ sort: 2 })).not.toHaveProperty('title');
    });
  });

  describe('what a tap opens', () => {
    it('defaults to nothing', () => {
      expect(create({ title: 'A' }).target_type).toBe('none');
    });

    it('a product needs a product', () => {
      expect(() => create({ title: 'A', target_type: 'product' })).toThrow(
        BadRequestException,
      );
      expect(() =>
        create({ title: 'A', target_type: 'product', target_product_id: '0' }),
      ).toThrow(BadRequestException);
    });

    it('a product clears any link left over', () => {
      const out = create({
        title: 'A',
        target_type: 'product',
        target_product_id: '81',
        target_url: 'https://gaderia.com.ua',
      });
      expect(out.target_product_id).toBe(81);
      expect(out.target_url).toBeNull();
    });

    it('a link clears any product left over', () => {
      const out = create({
        title: 'A',
        target_type: 'link',
        target_url: 'https://gaderia.com.ua/akciya',
        target_product_id: '81',
      });
      expect(out.target_url).toBe('https://gaderia.com.ua/akciya');
      expect(out.target_product_id).toBeNull();
    });

    it('refuses a link that is not http(s)', () => {
      for (const url of [
        'javascript:alert(1)',
        'data:text/html,<script>',
        'ftp://x/y',
        'gaderia.com.ua',
      ]) {
        expect(() =>
          create({ title: 'A', target_type: 'link', target_url: url }),
        ).toThrow(BadRequestException);
      }
    });

    it('nothing clears both', () => {
      const out = create({
        title: 'A',
        target_type: 'none',
        target_product_id: '81',
      });
      expect(out.target_product_id).toBeNull();
      expect(out.target_url).toBeNull();
    });

    it('refuses an unknown target', () => {
      expect(() => create({ title: 'A', target_type: 'popup' })).toThrow(
        BadRequestException,
      );
    });
  });

  // Multipart carries everything as text; "false" must not read as true.
  describe('switched on, as multipart sends it', () => {
    it('reads the strings a form sends', () => {
      expect(edit({ is_active: 'false' }).is_active).toBe(false);
      expect(edit({ is_active: '0' }).is_active).toBe(false);
      expect(edit({ is_active: '' }).is_active).toBe(false);
      expect(edit({ is_active: 'true' }).is_active).toBe(true);
      expect(edit({ is_active: 'on' }).is_active).toBe(true);
      expect(edit({ is_active: true }).is_active).toBe(true);
      expect(edit({ is_active: false }).is_active).toBe(false);
    });
  });

  describe('dates', () => {
    it('empty means open-ended', () => {
      expect(edit({ starts_at: '', ends_at: null })).toEqual({
        starts_at: null,
        ends_at: null,
      });
    });

    it('refuses what is not a date', () => {
      expect(() => edit({ starts_at: 'завтра' })).toThrow(BadRequestException);
    });

    it('refuses an end before the start', () => {
      expect(() =>
        create({
          title: 'A',
          starts_at: '2026-11-01T00:00:00Z',
          ends_at: '2026-10-01T00:00:00Z',
        }),
      ).toThrow(BadRequestException);
    });

    it('takes a run that makes sense', () => {
      const out = create({
        title: 'A',
        starts_at: '2026-11-01T00:00:00Z',
        ends_at: '2026-11-30T00:00:00Z',
      });
      expect(out.starts_at?.toISOString()).toBe('2026-11-01T00:00:00.000Z');
      expect(out.ends_at?.toISOString()).toBe('2026-11-30T00:00:00.000Z');
    });
  });

  describe('sort', () => {
    it('takes the number a form sends as text', () => {
      expect(edit({ sort: '3' }).sort).toBe(3);
    });

    it('refuses anything else', () => {
      expect(() => edit({ sort: '2.5' })).toThrow(BadRequestException);
      expect(() => edit({ sort: 'перший' })).toThrow(BadRequestException);
    });
  });
});
