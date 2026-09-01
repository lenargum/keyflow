import { useState } from 'react';

/**
 * Обвязка для действий админки и QA-панели.
 *
 * Смысл — чтобы кнопка не могла молча ничего не сделать. Самый частый отказ
 * здесь не сетевой, а 401 из-за неверного ADMIN_TOKEN, и он обязан быть виден:
 * иначе проверяющий жмёт «Оплатить», видит бодрую подпись и не понимает,
 * почему статус заказа не меняется.
 */
export function useAction() {
  const [note, setNote] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  /** fn может вернуть строку — она станет подробностью в подписи. */
  async function run(label: string, fn: () => Promise<string | void>): Promise<void> {
    setBusy(true);
    setFailed(false);
    setNote(`${label}…`);
    try {
      const detail = await fn();
      setFailed(false);
      setNote(detail ? `${label}: ${detail}` : `${label}: готово`);
    } catch (err) {
      setFailed(true);
      setNote(`${label} — ${describeError(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return { note, failed, busy, run, setNote };
}

/** Коды ошибок API в человеческие фразы. */
export function describeError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return API_ERRORS[message] ?? message;
}

const API_ERRORS: Record<string, string> = {
  unauthorized: 'нужен верный ADMIN_TOKEN, задайте его в админке',
  order_not_found: 'заказ не найден',
  unknown_sku: 'такого товара нет',
  sku_required: 'не передан товар',
  promo_not_found: 'такого промокода нет',
  promo_limit_reached: 'лимит использований промокода исчерпан',
};
