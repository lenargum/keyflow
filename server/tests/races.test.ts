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
  promocode,
  providerStates,
  refillProvider,
  reissue,
  sleep,
  stuckOrders,
  totalIssued,
  waitForParked,
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

describe('восстановление через админку', () => {
  it('исчерпав попытки, заказ ждёт ручной выдачи — и она даёт ровно один ключ', async () => {
    await drainProviders();

    const order = await createOrder();
    await post(`${API}/api/qa/pay`, { order_id: order.id, outcome: 'paid' });

    await waitForStatus(order.id, ['out_of_stock']);
    await waitForParked(order.id);

    // Автоматические ретраи остановились: статус не двигается сам по себе.
    const parked = await orderRow(order.id);
    await sleep(1500);
    expect((await orderRow(order.id)).attempts).toBe(parked.attempts);
    expect(await countIssuances(order.id)).toBe(0);

    // Заказ виден в списке «оплачен, но код не выдан».
    expect((await stuckOrders()).map((o) => o.id)).toContain(order.id);

    await refillProvider('a', 5);
    const issuedBefore = await totalIssued();

    expect((await reissue(order.id)).result).toBe('queued');
    const final = await waitForStatus(order.id, ['delivered']);

    expect(final.status).toBe('delivered');
    expect(await countIssuances(order.id)).toBe(1);
    expect((await totalIssued()) - issuedBefore).toBe(1);
    expect((await stuckOrders()).map((o) => o.id)).not.toContain(order.id);
  });

  it('повторная ручная выдача по доставленному заказу ничего не меняет', async () => {
    const order = await createOrder();
    await post(`${API}/api/qa/pay`, { order_id: order.id, outcome: 'paid' });
    await waitForStatus(order.id, ['delivered']);

    const before = await db.query('SELECT * FROM issuances WHERE order_id = $1', [order.id]);
    const issuedBefore = await totalIssued();

    // Пять параллельных нажатий «выдать повторно» — как двойной клик в админке.
    const results = await Promise.all(Array.from({ length: 5 }, () => reissue(order.id)));
    expect(results.every((r) => r.result === 'already_delivered')).toBe(true);

    await sleep(1000);

    const after = await db.query('SELECT * FROM issuances WHERE order_id = $1', [order.id]);
    expect(after.rows).toEqual(before.rows);
    expect(await totalIssued()).toBe(issuedBefore);
    expect((await orderRow(order.id)).status).toBe('delivered');
  });

  it('админка закрыта токеном', async () => {
    const res = await fetch(`${API}/api/admin/orders`);
    expect(res.status).toBe(401);

    const qa = await fetch(`${API}/api/qa/pay`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ order_id: 'ord_x' }),
    });
    expect(qa.status).toBe(401);

    // Вебхук платёжки остаётся открытым: подписи в задании нет, токена у неё тоже.
    const hook = await fetch(`${API}/api/webhooks/payment`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event_id: 'evt_open', order_id: 'ord_none', status: 'paid' }),
    });
    expect(hook.status).toBe(200);
  });
});

describe('промокоды', () => {
  it('5. промокод с лимитом N под параллельными запросами применяется ровно N раз', async () => {
    const attempts = 50;
    const promo = await promocode('LIMIT3');
    expect(promo.max_uses).toBe(3);
    expect(promo.used_count).toBe(0);

    // Пятьдесят заказов стартуют одновременно, каждый пытается списать LIMIT3.
    const results = await Promise.all(
      Array.from({ length: attempts }, () =>
        fetch(`${API}/api/orders`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sku: 'KEY-GTA5', promo_code: 'LIMIT3' }),
        }).then(async (res) => ({ status: res.status, body: await res.json() })),
      ),
    );

    const created = results.filter((r) => r.status === 201);
    const rejected = results.filter((r) => r.status === 409);

    expect(created).toHaveLength(3);
    expect(rejected).toHaveLength(attempts - 3);
    expect(rejected.every((r) => (r.body as { error: string }).error === 'promo_limit_reached')).toBe(
      true,
    );

    // Счётчик в базе и число заказов с этим промокодом сошлись.
    expect((await promocode('LIMIT3')).used_count).toBe(3);
    const withPromo = await db.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM orders WHERE promo_code = 'LIMIT3'`,
    );
    expect(Number(withPromo.rows[0]?.n)).toBe(3);
  });

  it('скидку считает сервер, цену от клиента не принимает', async () => {
    // percent: 25% от 1990 = 497 (округление вниз)
    const percent = await post<{ order: { base_amount: number; discount: number; total_amount: number } }>(
      `${API}/api/orders`,
      { sku: 'KEY-GTA5', promo_code: 'WELCOME10', price_rub: 1, total_amount: 1 },
    );
    expect(percent.order.base_amount).toBe(1990);
    expect(percent.order.discount).toBe(199);
    expect(percent.order.total_amount).toBe(1791);

    // amount: фиксированные 500 ₽
    const amount = await post<{ order: { discount: number; total_amount: number } }>(
      `${API}/api/orders`,
      { sku: 'KEY-GTA5', promo_code: 'GG500' },
    );
    expect(amount.order.discount).toBe(500);
    expect(amount.order.total_amount).toBe(1490);

    // Скидка больше цены не уводит сумму в минус.
    const capped = await post<{ order: { discount: number; total_amount: number } }>(
      `${API}/api/orders`,
      { sku: 'SUB-SPOTIFY-1M', promo_code: 'GG500' },
    );
    expect(capped.order.discount).toBe(299);
    expect(capped.order.total_amount).toBe(0);
  });

  it('неизвестный промокод отклоняется и заказ не создаётся', async () => {
    const before = await db.query<{ n: string }>('SELECT count(*)::text AS n FROM orders');
    const res = await fetch(`${API}/api/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sku: 'KEY-GTA5', promo_code: 'NOPE' }),
    });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe('promo_not_found');

    const after = await db.query<{ n: string }>('SELECT count(*)::text AS n FROM orders');
    expect(after.rows[0]?.n).toBe(before.rows[0]?.n);
  });
});
