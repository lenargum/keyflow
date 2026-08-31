import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { API, PROVIDER_HANG_MS } from './env.js';
import {
  configureProviders,
  countEvents,
  countIssuances,
  createOrder,
  db,
  drainProviders,
  orderRow,
  post,
  providerStates,
  refillProvider,
  sleep,
  totalIssued,
  waitForStatus,
} from './helpers.js';

afterAll(async () => {
  await db.end();
});

beforeEach(async () => {
  // Каждый тест сам задаёт поведение поставщиков; начинаем с чистого.
  await configureProviders({ a: { errorRate: 0, timeoutRate: 0 }, b: { errorRate: 0, timeoutRate: 0 } });
});

describe('критерии приёмки', () => {
  it('1. 50 параллельных вебхуков по одному заказу — ровно одна выдача и один ключ', async () => {
    const order = await createOrder();
    const issuedBefore = await totalIssued();

    const { sent } = await post<{ sent: { event_id: string }[] }>(`${API}/api/qa/pay`, {
      order_id: order.id,
      outcome: 'paid',
      times: 50,
    });
    expect(sent).toHaveLength(50);

    const final = await waitForStatus(order.id, ['delivered']);

    expect(await countEvents(order.id)).toBe(50);
    expect(await countIssuances(order.id)).toBe(1);
    expect(final.attempts).toBe(1);
    expect((await totalIssued()) - issuedBefore).toBe(1);
  });

  it('2. повторный вебхук с тем же event_id ничего не меняет', async () => {
    const order = await createOrder();
    const eventId = 'evt_fixed_duplicate';

    await post(`${API}/api/qa/pay`, { order_id: order.id, outcome: 'paid', event_id: eventId });
    const delivered = await waitForStatus(order.id, ['delivered']);

    const snapshot = await db.query('SELECT * FROM issuances WHERE order_id = $1', [order.id]);
    const issuedBefore = await totalIssued();

    // Тот же event_id ещё десять раз, часть параллельно.
    const { sent } = await post<{ sent: { duplicate: boolean }[] }>(`${API}/api/qa/pay`, {
      order_id: order.id,
      outcome: 'paid',
      event_id: eventId,
      times: 10,
    });
    expect(sent.every((s) => s.duplicate)).toBe(true);

    await sleep(1000);

    const after = await orderRow(order.id);
    expect(after.status).toBe('delivered');
    expect(after.attempts).toBe(delivered.attempts);
    expect(await countEvents(order.id)).toBe(1);
    expect(await countIssuances(order.id)).toBe(1);
    expect(await totalIssued()).toBe(issuedBefore);

    const now = await db.query('SELECT * FROM issuances WHERE order_id = $1', [order.id]);
    expect(now.rows[0]).toEqual(snapshot.rows[0]);
  });

  it('3. вебхук раньше заказа — без потери и без дубля', async () => {
    const orderId = `ord_early_${Date.now()}`;
    const issuedBefore = await totalIssued();

    // Заказа ещё нет. Событие принимается и лежит необработанным.
    await post(`${API}/api/qa/pay`, { order_id: orderId, outcome: 'paid', times: 3 });
    await sleep(1000);

    const pending = await db.query('SELECT applied_at FROM payment_events WHERE order_id = $1', [
      orderId,
    ]);
    expect(pending.rowCount).toBe(3);
    expect(pending.rows.every((r) => r.applied_at === null)).toBe(true);

    // Заказ появился — воркер подбирает событие.
    await createOrder('KEY-GTA5', orderId);
    const final = await waitForStatus(orderId, ['delivered']);

    expect(final.attempts).toBe(1);
    expect(await countIssuances(orderId)).toBe(1);
    expect((await totalIssued()) - issuedBefore).toBe(1);
  });

  it('4. пустой пул — восстановимое состояние, после долива ровно один ключ', async () => {
    await drainProviders();
    const order = await createOrder();
    await post(`${API}/api/qa/pay`, { order_id: order.id, outcome: 'paid' });

    // Оба поставщика пусты: заказ уходит в восстановимое состояние, не падает.
    const stuck = await waitForStatus(order.id, ['out_of_stock']);
    expect(stuck.status).toBe('out_of_stock');
    expect(await countIssuances(order.id)).toBe(0);

    const issuedBefore = await totalIssued();
    await refillProvider('a', 5);

    const final = await waitForStatus(order.id, ['delivered']);
    expect(final.status).toBe('delivered');
    expect(await countIssuances(order.id)).toBe(1);
    expect((await totalIssued()) - issuedBefore).toBe(1);
  });
});

describe('ловушка таймаута', () => {
  it('таймаут поставщика не приводит к двойной выдаче: повтор возвращает тот же код', async () => {
    // Поставщик A выдаёт код и «зависает» дольше клиентского таймаута.
    await configureProviders({ a: { timeoutRate: 1, hangMs: PROVIDER_HANG_MS } });

    const order = await createOrder();
    const issuedBefore = await totalIssued();
    await post(`${API}/api/qa/pay`, { order_id: order.id, outcome: 'paid' });

    const final = await waitForStatus(order.id, ['delivered', 'delivery_failed']);
    expect(final.status).toBe('delivered');

    // Ключевое: код был выдан один раз, повтор с тем же request_id вернул его же.
    expect(await countIssuances(order.id)).toBe(1);
    expect((await totalIssued()) - issuedBefore).toBe(1);

    const issuance = await db.query<{ provider: string; request_id: string; code: string }>(
      'SELECT provider, request_id, code FROM issuances WHERE order_id = $1',
      [order.id],
    );
    expect(issuance.rows[0]?.request_id).toBe(`req_${order.id}`);
    // На резервного поставщика после таймаута не уходим.
    expect(issuance.rows[0]?.provider).toBe('a');
  });

  it('явный out_of_stock у A уводит на резервного B', async () => {
    // Предыдущие тесты могли осушить B — восстанавливаем его пул явно.
    await refillProvider('b', 5);
    await drainProviders('a');
    const order = await createOrder();
    const before = await providerStates();
    await post(`${API}/api/qa/pay`, { order_id: order.id, outcome: 'paid' });

    const final = await waitForStatus(order.id, ['delivered']);
    expect(final.status).toBe('delivered');

    const after = await providerStates();
    expect(after.b!.issued - before.b!.issued).toBe(1);
    expect(await countIssuances(order.id)).toBe(1);

    const issuance = await db.query<{ provider: string }>(
      'SELECT provider FROM issuances WHERE order_id = $1',
      [order.id],
    );
    expect(issuance.rows[0]?.provider).toBe('b');
  });
});
