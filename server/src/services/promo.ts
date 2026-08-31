import type pg from 'pg';

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
