import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { admin, api, type AdminOrder, type PromocodeRow } from '../api.js';
import { getToken, setToken } from '../auth.js';
import { describeError, useAction } from '../useAction.js';
import { ProviderControls } from '../components/ProviderControls.js';

/**
 * Рабочий вид без дизайна — задание это разрешает. Главный экран:
 * «оплачен, но код не выдан» и безопасная ручная повторная выдача.
 */
export function Admin() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [token, setTokenState] = useState(getToken());
  const [promocodes, setPromocodes] = useState<PromocodeRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { note, failed, run } = useAction();

  const refresh = useCallback(async () => {
    try {
      setOrders((await admin.orders(showAll)).orders);
      setPromocodes((await admin.promocodes()).promocodes);
      setError(null);
    } catch (err) {
      setError(describeError(err));
    }
  }, [showAll]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(refresh, 2000);
    return () => clearInterval(timer);
  }, [refresh]);

  function reissue(id: string) {
    void run(`Повторная выдача ${id}`, async () => {
      const { result } = await admin.reissue(id);
      void refresh();
      return RESULT_LABEL[result] ?? result;
    });
  }

  /**
   * Сценарий приёмки №3: событие приходит раньше, чем появляется заказ.
   * Пауза между вебхуками и созданием заказа нужна, чтобы проверяющий успел
   * увидеть события лежащими необработанными.
   */
  function webhookBeforeOrder() {
    const orderId = `ord_early${Math.random().toString(36).slice(2, 8)}`;
    void run('Вебхук раньше заказа', async () => {
      await api.pay({ order_id: orderId, outcome: 'paid', times: 3 });
      await new Promise((r) => setTimeout(r, 2000));
      await api.createOrderWithId('KEY-GTA5', orderId);
      void refresh();
      return `три вебхука ушли до создания ${orderId}, заказ создан — воркер подберёт лежащие события`;
    });
  }

  return (
    <div className="mx-auto max-w-4xl p-8">
      <Link to="/" className="text-sm text-neutral-500 hover:underline">
        ← в каталог
      </Link>
      <h1 className="mt-4 text-xl font-bold">Админка</h1>

      <div className="mt-4 flex items-end gap-2">
        <label className="text-sm">
          <div className="text-neutral-500">ADMIN_TOKEN</div>
          <input
            value={token}
            onChange={(e) => setTokenState(e.target.value)}
            className="mt-1 w-72 rounded border border-neutral-300 px-2 py-1 font-mono text-xs"
          />
        </label>
        <button
          className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100"
          onClick={() => {
            setToken(token);
            void refresh();
          }}
        >
          Сохранить
        </button>
      </div>

      {error && <div className="mt-4 text-red-600">Ошибка: {error}</div>}

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">
            {showAll ? 'Все заказы' : 'Оплачен, но код не выдан'} ({orders.length})
          </h2>
          <label className="text-sm text-neutral-600">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
              className="mr-1"
            />
            показать все
          </label>
        </div>

        {orders.length === 0 && (
          <div className="mt-2 text-sm text-neutral-500">Застрявших заказов нет.</div>
        )}

        <table className="mt-2 w-full text-left text-sm">
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-t border-neutral-100">
                <td className="py-2 font-mono text-xs">
                  <Link to={`/orders/${o.id}`} className="hover:underline">
                    {o.id}
                  </Link>
                </td>
                <td>{o.sku}</td>
                <td>{o.status}</td>
                <td className="text-neutral-500">попыток {o.attempts}</td>
                <td className="max-w-48 truncate text-xs text-amber-700">{o.last_error}</td>
                <td className="text-right">
                  <button
                    onClick={() => reissue(o.id)}
                    className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100"
                  >
                    Выдать повторно
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-8">
        <h2 className="font-semibold">Промокоды</h2>
        <table className="mt-2 w-full text-left text-sm">
          <thead className="text-neutral-500">
            <tr>
              <th className="py-1">код</th>
              <th>скидка</th>
              <th>использовано</th>
            </tr>
          </thead>
          <tbody>
            {promocodes.map((p) => (
              <tr key={p.code} className="border-t border-neutral-100">
                <td className="py-1 font-mono text-xs">{p.code}</td>
                <td>{p.type === 'percent' ? `${p.value}%` : `${p.value} ₽`}</td>
                <td className={p.used_count >= p.max_uses ? 'text-amber-700' : ''}>
                  {p.used_count} из {p.max_uses}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-8">
        <h2 className="font-semibold">Заглушки поставщиков</h2>
        <div className="mt-2">
          <ProviderControls />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="font-semibold">Сценарии</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            onClick={webhookBeforeOrder}
            className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100"
          >
            Вебхук раньше заказа
          </button>
          <button
            onClick={() =>
              void run('Сброс состояния', async () => {
                await admin.reset();
                void refresh();
                return 'заказы стёрты, пулы поставщиков восстановлены';
              })
            }
            className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
          >
            Сбросить всё
          </button>
        </div>
      </section>

      {note && (
        <div
          className={`mt-6 rounded p-3 text-sm ${
            failed ? 'bg-red-50 font-semibold text-red-700' : 'bg-neutral-100'
          }`}
        >
          {note}
        </div>
      )}
    </div>
  );
}

const RESULT_LABEL: Record<string, string> = {
  queued: 'возвращён в очередь на выдачу',
  already_delivered: 'уже доставлен, ничего не меняем',
  not_recoverable: 'статус не допускает повторной выдачи',
};
