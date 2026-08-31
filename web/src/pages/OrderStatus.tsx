import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { admin, api, type OrderView } from '../api.js';
import { ProviderControls } from '../components/ProviderControls.js';

const STATUS_LABEL: Record<string, string> = {
  created: 'создан, ждёт оплаты',
  paid: 'оплачен, запускается выдача',
  delivering: 'идёт получение кода',
  delivered: 'код выдан',
  payment_failed: 'оплата не прошла',
  out_of_stock: 'оплачен, кода нет в наличии',
  delivery_failed: 'поставщик не смог выдать',
};

/**
 * Страница статуса заказа с QA-панелью. Смысл панели: проверяющий
 * воспроизводит сценарии приёмки кликами, не собирая curl-запросы.
 */
export function OrderStatus() {
  const { id = '' } = useParams();
  const [view, setView] = useState<OrderView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setView(await api.order(id));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [id]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(refresh, 1000);
    return () => clearInterval(timer);
  }, [refresh]);

  async function act(label: string, body: Parameters<typeof api.pay>[0]) {
    setNote(`${label}…`);
    const { sent } = await api.pay(body);
    const duplicates = sent.filter((s) => s.duplicate).length;
    setNote(`${label}: отправлено ${sent.length}, дублей отсечено ${duplicates}`);
    void refresh();
  }

  if (error) return <div className="p-8 text-red-600">Ошибка: {error}</div>;
  if (!view) return <div className="p-8">Загрузка…</div>;

  const { order, code, issuance, events } = view;
  const lastEventId = events.at(-1)?.event_id;

  return (
    <div className="mx-auto max-w-3xl p-8">
      <div className="flex justify-between text-sm text-neutral-500">
        <Link to="/" className="hover:underline">
          ← в каталог
        </Link>
        <Link to="/admin" className="hover:underline">
          админка →
        </Link>
      </div>

      <h1 className="mt-4 text-xl font-bold">Заказ {order.id}</h1>
      <div className="mt-2 text-neutral-600">
        {order.sku} ·{' '}
        {order.discount > 0 ? (
          <>
            <span className="line-through">{order.base_amount} ₽</span>{' '}
            <span className="font-semibold">{order.total_amount} ₽</span>{' '}
            <span className="text-sm text-emerald-700">
              промокод {order.promo_code}, −{order.discount} ₽
            </span>
          </>
        ) : (
          <>{order.total_amount} ₽</>
        )}
      </div>

      <div className="mt-4 rounded-lg border border-neutral-200 p-4">
        <div className="text-sm text-neutral-500">Статус</div>
        <div className="text-lg font-semibold">
          {order.status} — {STATUS_LABEL[order.status] ?? ''}
        </div>
        {order.last_error && (
          <div className="mt-1 text-sm text-amber-700">последняя ошибка: {order.last_error}</div>
        )}
        <div className="mt-1 text-sm text-neutral-500">попыток выдачи: {order.attempts}</div>
      </div>

      {code && (
        <div className="mt-4 rounded-lg border-2 border-emerald-500 bg-emerald-50 p-4">
          <div className="text-sm text-emerald-700">Ваш код</div>
          <div className="font-mono text-2xl font-bold tracking-wider">{code}</div>
          <div className="mt-1 text-xs text-emerald-700">
            поставщик {issuance?.provider}, request_id {issuance?.request_id}
          </div>
        </div>
      )}

      <div className="mt-6 rounded-lg border border-dashed border-neutral-300 p-4">
        <div className="font-semibold">QA-панель</div>
        <div className="mt-1 text-sm text-neutral-500">
          Эмулятор платёжной системы. Кнопки шлют настоящие вебхуки на наш эндпоинт.
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Btn onClick={() => act('Оплата успешна', { order_id: id, outcome: 'paid' })}>
            Оплатить успешно
          </Btn>
          <Btn onClick={() => act('Оплата не прошла', { order_id: id, outcome: 'failed' })}>
            Оплатить неуспешно
          </Btn>
          <Btn
            disabled={!lastEventId}
            onClick={() =>
              act('Повтор вебхука', { order_id: id, outcome: 'paid', event_id: lastEventId })
            }
          >
            Повторить последний вебхук
          </Btn>
          <Btn onClick={() => act('50 вебхуков разом', { order_id: id, outcome: 'paid', times: 50 })}>
            50 вебхуков разом
          </Btn>
          <Btn
            onClick={async () => {
              const { result } = await admin.reissue(id);
              setNote(`Повторная выдача: ${result}`);
              void refresh();
            }}
          >
            Выдать повторно
          </Btn>
        </div>

        <div className="mt-4 border-t border-neutral-200 pt-3">
          <div className="mb-2 text-sm font-medium">Поставщики</div>
          <ProviderControls onAction={setNote} />
        </div>

        {note && <div className="mt-3 text-sm text-neutral-700">{note}</div>}
      </div>

      <div className="mt-6">
        <div className="font-semibold">Лог вебхуков ({events.length})</div>
        <table className="mt-2 w-full text-left text-sm">
          <thead className="text-neutral-500">
            <tr>
              <th className="py-1">event_id</th>
              <th>статус</th>
              <th>получен</th>
              <th>применён</th>
            </tr>
          </thead>
          <tbody className="font-mono text-xs">
            {events.map((e) => (
              <tr key={e.event_id} className="border-t border-neutral-100">
                <td className="py-1">{e.event_id}</td>
                <td>{e.status}</td>
                <td>{new Date(e.received_at).toLocaleTimeString()}</td>
                <td>{e.applied_at ? new Date(e.applied_at).toLocaleTimeString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Btn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 disabled:opacity-40"
    >
      {children}
    </button>
  );
}
