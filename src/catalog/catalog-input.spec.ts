import { BadRequestException } from '@nestjs/common';
import { normalizeCatalogInput } from './catalog-input';
import { Catalog } from './catalog.entity';

// Shaped after real products in production (30.09.2026).
const balsamic = {
  header: 'Оцет Gaderia бальзамічний малиновий 0,25 л',
  description: '',
  article: ' 4820270970270 ',
  picture: 'https://gaderia.biz/api/catalog/picture/x.png',
  price: '241',
  is_discount: false,
  price_discount: '0',
  measurement: '0.25',
  type_measurement: 'LITER',
  type_product: 'VINEGAR',
  type_packaging: 'GLASS',
  type_vinegar: 'BALSAMIC',
  shipment_length: '26',
  shipment_width: '8',
  shipment_height: '8',
  shipment_weight: '1',
  is_active: true,
};

const stored = (patch: Partial<Catalog> = {}) =>
  ({
    id: 69, header: 'Оцет грушевий', price: 315, is_discount: false, price_discount: 0,
    type_product: 'VINEGAR', type_juice: 'PEAR', type_vinegar: null, type_apple: null,
    ...patch,
  }) as Catalog;

const rejects = (body: Record<string, unknown>, partial = false, current?: Catalog) =>
  expect(() => normalizeCatalogInput(body, partial, current)).toThrow(BadRequestException);

describe('normalizeCatalogInput', () => {
  it('a full vinegar: numbers are numbers, blanks are null, the other type fields are cleared', () => {
    expect(normalizeCatalogInput(balsamic)).toEqual({
      header: 'Оцет Gaderia бальзамічний малиновий 0,25 л',
      description: null,
      article: '4820270970270',
      picture: 'https://gaderia.biz/api/catalog/picture/x.png',
      price: 241,
      is_discount: false,
      price_discount: 0,
      measurement: 0.25,
      type_measurement: 'LITER',
      type_product: 'VINEGAR',
      type_packaging: 'GLASS',
      type_juice: null,
      type_vinegar: 'BALSAMIC',
      type_apple: null,
      shipment_length: 26,
      shipment_width: 8,
      shipment_height: 8,
      shipment_weight: 1,
      is_active: true,
    });
  });

  // The pear balsamic had type_juice "PEAR" and no type_vinegar, so no
  // vinegar filter in the app found it.
  it('saving the pear vinegar with a vinegar kind drops the stray juice flavour', () => {
    const out = normalizeCatalogInput({ type_product: 'VINEGAR', type_vinegar: 'BALSAMIC', type_juice: 'PEAR' }, true, stored());
    expect(out).toMatchObject({ type_juice: null, type_vinegar: 'BALSAMIC', type_apple: null });
  });

  it('a juice needs a flavour the app knows', () => {
    expect(normalizeCatalogInput({ ...balsamic, type_product: 'JUICE', type_juice: 'APPLEGINGER' })).toMatchObject({
      type_juice: 'APPLEGINGER', type_vinegar: null,
    });
    rejects({ ...balsamic, type_product: 'JUICE', type_juice: 'PEAR' });
    rejects({ ...balsamic, type_product: 'JUICE', type_juice: '' });
  });

  it('honey has one kind: no type field, and any stray one is cleared', () => {
    expect(
      normalizeCatalogInput({ ...balsamic, type_product: 'HONEY', type_measurement: 'KG', type_vinegar: 'BALSAMIC' }),
    ).toMatchObject({ type_product: 'HONEY', type_juice: null, type_vinegar: null, type_apple: null });
    expect(normalizeCatalogInput({ type_product: 'HONEY' }, true, stored())).toMatchObject({
      type_product: 'HONEY', type_juice: null, type_vinegar: null, type_apple: null,
    });
  });

  it('a vinegar needs its kind', () => {
    rejects({ ...balsamic, type_vinegar: '' });
  });

  it.each([
    ['packaging the app does not know', { type_packaging: 'BOTTLE' }],
    ['unit the app does not know', { type_measurement: 'ML' }],
    ['product type the app does not know', { type_product: 'OTHER' }],
    ['no name', { header: '  ' }],
    ['no price', { price: '' }],
    ['zero price', { price: 0 }],
    ['negative weight', { shipment_weight: -1 }],
    ['missing size', { shipment_height: '' }],
  ])('rejects %s', (_, patch) => {
    rejects({ ...balsamic, ...patch });
  });

  describe('sale price', () => {
    it('is a price in hryvnias below the regular one, not a percent capped at 100', () => {
      expect(normalizeCatalogInput({ ...balsamic, is_discount: true, price_discount: '199' })).toMatchObject({
        is_discount: true, price_discount: 199,
      });
    });

    it('must be below the regular price', () => {
      rejects({ ...balsamic, is_discount: true, price_discount: '241' });
    });

    it('is required when the sale is on', () => {
      rejects({ ...balsamic, is_discount: true, price_discount: '' });
    });

    it('is reset when the sale is switched off', () => {
      expect(normalizeCatalogInput({ ...balsamic, is_discount: false, price_discount: '150' })).toMatchObject({
        is_discount: false, price_discount: 0,
      });
    });

    it('lowering the price under a running sale price is refused', () => {
      rejects({ price: 150 }, true, stored({ is_discount: true, price_discount: 199 }));
    });
  });

  it('no body at all -> 400, not a 500', () => {
    rejects(undefined as unknown as Record<string, unknown>);
    expect(normalizeCatalogInput(undefined as unknown as Record<string, unknown>, true, stored())).toEqual({});
  });

  describe('PATCH', () => {
    // What the drag-to-sort dialog sends: nothing else may be required.
    it('only id_sort — nothing else checked or touched', () => {
      expect(normalizeCatalogInput({ id_sort: 3 }, true, stored())).toEqual({ id_sort: 3 });
    });

    it('hiding a product touches only is_active', () => {
      expect(normalizeCatalogInput({ is_active: false }, true, stored())).toEqual({ is_active: false });
    });

    it('marking a product new touches only is_new', () => {
      expect(normalizeCatalogInput({ is_new: true }, true, stored())).toEqual({ is_new: true });
      expect(normalizeCatalogInput({ is_new: false }, true, stored())).toEqual({ is_new: false });
    });

    it('fields outside the product are ignored', () => {
      expect(normalizeCatalogInput({ id: 1, createdAt: 'x', header: 'Нова назва' }, true, stored())).toEqual({
        header: 'Нова назва',
      });
    });
  });
});
