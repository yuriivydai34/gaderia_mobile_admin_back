import { collapse, mergeSourceData, WooOrder } from './woo-contact';

function order(
  id: number,
  status: string,
  modified: string,
  total = '100.00',
): WooOrder {
  return {
    id,
    status,
    total,
    date_created_gmt: '2026-09-01T10:00:00',
    date_modified_gmt: modified,
    billing: { phone: '0501112233', first_name: 'Іван' },
  };
}

describe('order status updates', () => {
  it('takes the newer copy of an order seen twice in one run', () => {
    const [person] = collapse([
      order(1, 'processing', '2026-09-01T10:00:00'),
      order(1, 'completed', '2026-09-03T10:00:00'),
    ]);
    expect(person.source_data.orders).toHaveLength(1);
    expect(person.source_data.orders[0].status).toBe('completed');
  });

  it('lets a later sync overwrite a stored order status', () => {
    const [first] = collapse([
      order(1, 'processing', '2026-09-01T10:00:00'),
      order(2, 'completed', '2026-09-01T11:00:00'),
    ]);
    const [later] = collapse([
      order(1, 'completed', '2026-09-03T10:00:00', '120.00'),
    ]);

    const merged = mergeSourceData(first.source_data, later.source_data);

    expect(merged.orders.map((o) => [o.id, o.status])).toEqual([
      [1, 'completed'],
      [2, 'completed'],
    ]);
    expect(merged.ordersCount).toBe(2);
    expect(merged.totalSpent).toBe(220);
  });

  it('keeps stored orders the incoming run did not see', () => {
    const [first] = collapse([order(1, 'completed', '2026-09-01T10:00:00')]);
    const [later] = collapse([order(2, 'cancelled', '2026-09-03T10:00:00')]);
    expect(
      mergeSourceData(first.source_data, later.source_data).orders.map(
        (o) => o.id,
      ),
    ).toEqual([1, 2]);
  });
});
