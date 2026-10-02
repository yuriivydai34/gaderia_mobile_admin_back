import sharp from 'sharp';
import { isBadgedPicture, renderBadgedPicture } from './picture-badge';

const RED = { r: 0xff, g: 0x21, b: 0x21 };

async function picture(format: 'png' | 'jpeg', width = 800, height = 800): Promise<Buffer> {
  const img = sharp({ create: { width, height, channels: 4, background: { r: 255, g: 255, b: 255, alpha: format === 'png' ? 0 : 1 } } });
  return format === 'png' ? img.png().toBuffer() : img.jpeg().toBuffer();
}

function serve(body: Buffer, status = 200) {
  jest.spyOn(global, 'fetch').mockResolvedValue(new Response(new Uint8Array(body), { status }));
}

async function pixel(data: Buffer, x: number, y: number) {
  const { data: raw, info } = await sharp(data).raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return { r: raw[i], g: raw[i + 1], b: raw[i + 2] };
}

afterEach(() => jest.restoreAllMocks());

describe('renderBadgedPicture', () => {
  it('draws the red label at the left edge and keeps the size and format', async () => {
    serve(await picture('jpeg'));
    const out = await renderBadgedPicture('https://shop/x.jpg', { text: 'Новинка!', color: '#ff2121' });

    expect(out.ext).toBe('jpg');
    const meta = await sharp(out.data).metadata();
    expect([meta.width, meta.height]).toEqual([800, 800]);
    // Label is 8.5% of the width tall, starting 5% down: y 40..108 at x 0.
    const inside = await pixel(out.data, 2, 74);
    expect(Math.abs(inside.r - RED.r) + Math.abs(inside.g - RED.g) + Math.abs(inside.b - RED.b)).toBeLessThan(30);
    expect(await pixel(out.data, 2, 20)).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('keeps a transparent png as png', async () => {
    serve(await picture('png'));
    expect((await renderBadgedPicture('https://shop/x.png', { text: 'Новинка!', color: '#ff2121' })).ext).toBe('png');
  });

  it('refuses something that is not a picture', async () => {
    serve(Buffer.from('<html>not found</html>'));
    await expect(renderBadgedPicture('https://shop/x', { text: 'Новинка!', color: '#ff2121' })).rejects.toThrow('не картинка');
  });

  it('refuses an unreachable picture', async () => {
    serve(Buffer.from(''), 404);
    await expect(renderBadgedPicture('https://shop/x.jpg', { text: 'Новинка!', color: '#ff2121' })).rejects.toThrow('404');
  });
});

it('draws markup characters as text', async () => {
  serve(await picture('jpeg'));
  await expect(
    renderBadgedPicture('https://shop/x.jpg', { text: '<b>A & B</b>', color: '#000' }),
  ).resolves.toMatchObject({ ext: 'jpg' });
});

it('keeps the longest allowed label inside a small picture', async () => {
  serve(await picture('jpeg', 300, 300));
  const out = await renderBadgedPicture('https://shop/x.jpg', { text: 'Новинка! Хіт сезону', color: '#ff2121' });
  // The label must end before the right edge: the last column stays white.
  expect(await pixel(out.data, 299, 30)).toEqual({ r: 255, g: 255, b: 255 });
});

describe('isBadgedPicture', () => {
  it('recognises only addresses under the badge pictures address', () => {
    process.env.BADGE_PICTURES_URL = 'https://cdn.example/badges/';
    expect(isBadgedPicture('https://cdn.example/badges/abc.jpg')).toBe(true);
    expect(isBadgedPicture('https://gaderia.com.ua/wp-content/uploads/x.jpg')).toBe(false);
    expect(isBadgedPicture(null)).toBe(false);
    delete process.env.BADGE_PICTURES_URL;
  });
});
