import { ServiceUnavailableException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { WooSyncService } from './woo-sync.service';
import { WooClient } from './woo.client';
import { Customer } from '../../customer/customer.entity';
import { IntegrationState } from './integration-state.entity';

// On 07.10.2026 the hourly sync went quiet for hours with nothing in the
// panel: a run that never finished kept it "running", and failures went only
// to the log. These pin down what the Settings page now relies on.
describe('WooSyncService', () => {
  let state: { findOne: jest.Mock; find: jest.Mock; save: jest.Mock; delete: jest.Mock };
  let customers: { findOne: jest.Mock; count: jest.Mock; update: jest.Mock; save: jest.Mock; create: jest.Mock };
  let streamOrders: jest.Mock;
  let service: WooSyncService;

  beforeEach(() => {
    state = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
    };
    customers = {
      findOne: jest.fn(), count: jest.fn().mockResolvedValue(9191),
      update: jest.fn(), save: jest.fn(), create: jest.fn((x) => x),
    };
    streamOrders = jest.fn();
    service = new WooSyncService(
      customers as unknown as Repository<Customer>,
      state as unknown as Repository<IntegrationState>,
      { streamOrders } as unknown as WooClient,
    );
  });

  const failing = (error: Error) =>
    streamOrders.mockImplementation(async function* () {
      yield* [];
      throw error;
    });

  it('a failed run records why, and is no longer "running"', async () => {
    failing(new ServiceUnavailableException('WooCommerce did not answer page 3 within 60 s'));

    await expect(service.sync()).rejects.toThrow('did not answer');

    const saved = state.save.mock.calls.map(([row]) => row);
    const error = saved.find((r) => r.key === 'woocommerce.last_error');
    expect(JSON.parse(error.value).message).toBe('WooCommerce did not answer page 3 within 60 s');
    expect(saved.some((r) => r.key === 'woocommerce.last_run_at')).toBe(false);
    expect(service.isRunning).toBe(false);
  });

  it('a successful run clears the recorded error', async () => {
    streamOrders.mockImplementation(async function* () {
      yield { orders: [], strategy: 'modified', page: 1, totalPages: 1 };
    });

    await service.sync();

    expect(state.delete).toHaveBeenCalledWith({ key: 'woocommerce.last_error' });
    expect(state.save).toHaveBeenCalledWith(expect.objectContaining({ key: 'woocommerce.last_run_at' }));
    const result = state.save.mock.calls.map(([r]) => r).find((r) => r.key === 'woocommerce.last_result');
    expect(JSON.parse(result.value)).toMatchObject({ ordersScanned: 0, created: 0, updated: 0 });
  });

  it('status reads the last run and the last error', async () => {
    state.find.mockResolvedValue([
      { key: 'woocommerce.last_run_at', value: '2026-10-09T12:00:00.422Z' },
      { key: 'woocommerce.last_error', value: JSON.stringify({ at: '2026-10-07T11:00:00Z', message: 'timeout' }) },
    ]);

    expect(await service.status()).toEqual({
      running: false,
      lastRunAt: '2026-10-09T12:00:00.422Z',
      lastError: { at: '2026-10-07T11:00:00Z', message: 'timeout' },
      lastResult: null,
      imported: 9191,
    });
  });
});

describe('WooClient', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
    jest.restoreAllMocks();
  });

  it('a page the shop never answers becomes an error, not a sync that hangs', async () => {
    process.env.WOO_URL = 'https://shop.example';
    process.env.WOO_CONSUMER_KEY = 'ck';
    process.env.WOO_CONSUMER_SECRET = 'cs';
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation((_url, init) => {
      // What AbortSignal.timeout does when it fires.
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return Promise.reject(Object.assign(new Error('aborted'), { name: 'TimeoutError' }));
    });

    const run = async () => {
      for await (const batch of new WooClient().streamOrders(null)) void batch;
    };
    await expect(run()).rejects.toThrow(/did not answer page 1 within 60 s/);
    expect(fetchSpy).toHaveBeenCalled();
  });
});
