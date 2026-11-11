import { ServiceUnavailableException } from '@nestjs/common';
import { PushService } from './push.service';
import { PushInput } from './push-input';

const input = (over: Partial<PushInput> = {}): PushInput => ({
  title: 'Заголовок',
  body: 'Текст',
  image: null,
  account_id: null,
  ...over,
});

function mockFetchOk(
  body: unknown = { status: 'OK', code: 200, data: 'Save' },
): jest.Mock<Promise<Response>, [string, RequestInit]> {
  return jest
    .fn<Promise<Response>, [string, RequestInit]>()
    .mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
}

/** What push.service.ts actually sent as the request body. */
function sentBody(
  fetchMock: jest.Mock<Promise<Response>, [string, RequestInit]>,
): unknown {
  return JSON.parse(fetchMock.mock.calls[0][1].body as string) as unknown;
}

describe('PushService.send', () => {
  const env = process.env;
  beforeEach(() => {
    process.env = {
      ...env,
      APP_SERVER_URL: 'https://gaderia.biz/api',
      APP_SERVER_PUSH_TOKEN: 'tok',
    };
  });
  afterEach(() => {
    process.env = env;
    jest.restoreAllMocks();
  });

  it('refuses to start when the app-server URL or token is missing', async () => {
    delete process.env.APP_SERVER_PUSH_TOKEN;
    await expect(new PushService().send(input())).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('posts title/body to app-server, with the bearer token', async () => {
    const fetchMock = mockFetchOk();
    jest.spyOn(global, 'fetch').mockImplementation(fetchMock);

    const result = await new PushService().send(input());

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://gaderia.biz/api/account/push/broadcast',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer tok' }),
      }),
    );
    expect(sentBody(fetchMock)).toEqual({ title: 'Заголовок', body: 'Текст' });
  });

  it('includes image and account_id only when given', async () => {
    const fetchMock = mockFetchOk();
    jest.spyOn(global, 'fetch').mockImplementation(fetchMock);

    await new PushService().send(
      input({ image: 'https://example.com/x.jpg', account_id: 42 }),
    );

    expect(sentBody(fetchMock)).toEqual({
      title: 'Заголовок',
      body: 'Текст',
      image: 'https://example.com/x.jpg',
      account_id: 42,
    });
  });

  it('turns an app-server error reply into its status and a readable message', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'ERROR',
          code: 400,
          error: { title: "Обов'язкове поле" },
        }),
        {
          status: 400,
        },
      ),
    );

    const result = await new PushService().send(input());

    expect(result).toEqual({
      ok: false,
      status: 400,
      message: "Обов'язкове поле",
    });
  });

  it('turns an unreachable app-server into a 502, not a thrown error', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('fetch failed'));

    const result = await new PushService().send(input());

    expect(result).toEqual({
      ok: false,
      status: 502,
      message: 'app-server недоступний',
    });
  });
});
