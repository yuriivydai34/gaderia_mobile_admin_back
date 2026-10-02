import { BadRequestException } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { Catalog } from './catalog.entity';
import * as badge from './picture-badge';

const CLEAN = 'https://gaderia.com.ua/wp-content/uploads/juice.jpg';
const BADGED = 'https://cdn.example/badges/abc.jpg';

function service(current: Partial<Catalog>) {
  const saved: Record<string, unknown>[] = [];
  const repo = {
    findOne: jest.fn().mockResolvedValue({ id: 1, ...current }),
    update: jest.fn((_id: number, input: Record<string, unknown>) => saved.push(input)),
  };
  return { svc: new CatalogService(repo as never), saved };
}

beforeEach(() => {
  process.env.BADGE_PICTURES_URL = 'https://cdn.example/badges';
  jest.spyOn(badge, 'storeBadgedPicture').mockResolvedValue(BADGED);
});
afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.BADGE_PICTURES_URL;
});

describe('product badge', () => {
  it('puts the badged copy in picture and keeps the clean one', async () => {
    const { svc, saved } = service({ picture: CLEAN });
    await svc.update(1, { badge: 'Новинка!' });
    expect(badge.storeBadgedPicture).toHaveBeenCalledWith(CLEAN, { text: 'Новинка!', color: '#ff2121' });
    expect(saved[0]).toMatchObject({ badge: 'Новинка!', badge_color: '#ff2121', picture: BADGED, picture_original: CLEAN });
  });

  it('restores the clean picture when the badge is removed', async () => {
    const { svc, saved } = service({ picture: BADGED, picture_original: CLEAN, badge: 'Новинка!', badge_color: '#ff2121' });
    await svc.update(1, { badge: '' });
    expect(saved[0]).toMatchObject({ badge: null, badge_color: null, picture: CLEAN, picture_original: null });
  });

  it('redraws on a new picture while keeping the badge', async () => {
    const { svc, saved } = service({ picture: BADGED, picture_original: CLEAN, badge: 'Хіт', badge_color: '#00aa00' });
    await svc.update(1, { picture: 'https://gaderia.com.ua/new.jpg' });
    expect(badge.storeBadgedPicture).toHaveBeenCalledWith('https://gaderia.com.ua/new.jpg', { text: 'Хіт', color: '#00aa00' });
    expect(saved[0]).toMatchObject({ picture: BADGED, picture_original: 'https://gaderia.com.ua/new.jpg' });
  });

  it('never draws a badge on top of a badged copy', async () => {
    const { svc } = service({ picture: BADGED, picture_original: CLEAN, badge: 'Новинка!', badge_color: '#ff2121' });
    await svc.update(1, { picture: BADGED, badge: 'Новинка!' });
    expect(badge.storeBadgedPicture).toHaveBeenCalledWith(CLEAN, { text: 'Новинка!', color: '#ff2121' });
  });

  it('leaves the picture alone when neither changes', async () => {
    const { svc, saved } = service({ picture: BADGED, picture_original: CLEAN, badge: 'Новинка!' });
    await svc.update(1, { id_sort: 3 });
    expect(badge.storeBadgedPicture).not.toHaveBeenCalled();
    expect(saved[0]).toEqual({ id_sort: 3 });
  });

  it('redraws when only the colour changes', async () => {
    const { svc, saved } = service({ picture: BADGED, picture_original: CLEAN, badge: 'Новинка!', badge_color: '#ff2121' });
    await svc.update(1, { badge_color: '#00AA00' });
    expect(badge.storeBadgedPicture).toHaveBeenCalledWith(CLEAN, { text: 'Новинка!', color: '#00aa00' });
    expect(saved[0]).toMatchObject({ badge_color: '#00aa00' });
  });

  it('refuses a badge without a picture, a bad colour and an overlong text', async () => {
    await expect(service({}).svc.update(1, { badge: 'Новинка!' })).rejects.toThrow(BadRequestException);
    await expect(service({ picture: CLEAN }).svc.update(1, { badge: 'Хіт', badge_color: 'red' })).rejects.toThrow('Колір');
    await expect(service({ picture: CLEAN }).svc.update(1, { badge: 'Новинка! Новинка! Новинка!' })).rejects.toThrow('символів');
  });
});
