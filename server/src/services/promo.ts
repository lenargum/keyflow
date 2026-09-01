import type pg from 'pg';
import { one, query } from '../db.js';

export type Promocode = {
  code: string;
  type: 'percent' | 'amount';
  value: number;
  max_uses: number;
  used_count: number;
};

export type Discount = { code: string; amount: number };

export class PromoError extends Error {
  constructor(readonly reason: 'promo_not_found' | 'promo_limit_reached') {
    super(reason);
  }
}

/**
 * Списать одно использование промокода.
 *
 * Весь лимит держится одним стейтментом: условие `used_count < max_uses`
 * проверяется той же строкой, которая инкрементит счётчик, под блокировкой
 * этой строки. Никакого «прочитал — проверил — записал», поэтому пятьдесят
 * параллельных заказов по LIMIT3 дадут ровно три применения.
 *
 * Сверху страхует CHECK (used_count <= max_uses): даже ошибка в логике
 * упрётся в отказ базы, а не в перерасход.
 */
export async function consume(client: pg.PoolClient, code: string, base: number): Promise<Discount> {
  const res = await client.query<Promocode>(
    `UPDATE promocodes SET used_count = used_count + 1
     WHERE code = $1 AND used_count < max_uses
     RETURNING *`,
    [code],
  );

  const promo = res.rows[0];
  if (!promo) {
    // Разделяем «нет такого кода» и «лимит исчерпан» — это разные ответы клиенту.
    const exists = await client.query('SELECT 1 FROM promocodes WHERE code = $1', [code]);
    throw new PromoError(exists.rowCount ? 'promo_limit_reached' : 'promo_not_found');
  }

  return { code: promo.code, amount: discountFor(promo, base) };
}

/** Скидка не может увести сумму ниже нуля. */
export function discountFor(promo: Promocode, base: number): number {
  const raw = promo.type === 'percent' ? Math.floor((base * promo.value) / 100) : promo.value;
  return Math.min(raw, base);
}

export type PromoPreview =
  | { valid: false; reason: 'promo_not_found' | 'promo_limit_reached' }
  | {
      valid: true;
      code: string;
      type: 'percent' | 'amount';
      value: number;
      remaining_uses: number;
      prices: Record<string, { base: number; discount: number; total: number }>;
    };

/**
 * Предпросмотр скидки. Нужен ровно затем, чтобы покупатель видел результат
 * ввода промокода, не считая деньги на клиенте: сервер считает — клиент рисует.
 *
 * Ничего не мутирует: ни одного UPDATE, использование не расходуется.
 * Ответ НЕ является обязательством. Между предпросмотром и созданием заказа
 * лимит может исчерпать кто-то другой, поэтому createOrder всё равно списывает
 * использование атомарно и вправе отказать. Считаем той же discountFor,
 * что и боевое списание, чтобы предпросмотр не разошёлся с реальной суммой.
 */
export async function preview(code: string): Promise<PromoPreview> {
  const promo = await one<Promocode>('SELECT * FROM promocodes WHERE code = $1', [code]);
  if (!promo) return { valid: false, reason: 'promo_not_found' };
  if (promo.used_count >= promo.max_uses) return { valid: false, reason: 'promo_limit_reached' };

  const products = await query<{ sku: string; price_rub: number }>(
    'SELECT sku, price_rub FROM products',
  );

  const prices: Record<string, { base: number; discount: number; total: number }> = {};
  for (const { sku, price_rub } of products.rows) {
    const discount = discountFor(promo, price_rub);
    prices[sku] = { base: price_rub, discount, total: price_rub - discount };
  }

  return {
    valid: true,
    code: promo.code,
    type: promo.type,
    value: promo.value,
    remaining_uses: promo.max_uses - promo.used_count,
    prices,
  };
}
