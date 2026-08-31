import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type Product } from '../api.js';

/**
 * Временная витрина этапа 1: список товаров и кнопка «Купить».
 * Вёрстка по макету приезжает на этапе 5.
 */
export function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [promo, setPromo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.products().then((r) => setProducts(r.products));
  }, []);

  async function buy(sku: string) {
    setBusy(sku);
    setError(null);
    try {
      const { order } = await api.createOrder(sku, promo.trim());
      navigate(`/orders/${order.id}`);
    } catch (err) {
      setError(PROMO_ERROR[(err as Error).message] ?? (err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-8">
      <h1 className="mb-4 text-2xl font-bold">Keyflow — каталог</h1>

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <div className="text-neutral-500">Промокод (необязательно)</div>
          <input
            value={promo}
            onChange={(e) => setPromo(e.target.value.toUpperCase())}
            placeholder="WELCOME10"
            className="mt-1 w-48 rounded border border-neutral-300 px-2 py-1 font-mono text-sm"
          />
        </label>
        <div className="text-xs text-neutral-500">
          Скидку считает сервер. Демо-коды: WELCOME10, GG500, LIMIT3, ONCEONLY.
        </div>
      </div>

      {error && <div className="mb-4 text-sm text-red-600">{error}</div>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((p) => (
          <div key={p.sku} className="rounded-lg border border-neutral-200 p-4">
            <div className="text-xs uppercase text-neutral-400">{p.type}</div>
            <div className="mt-1 font-medium">{p.name}</div>
            <div className="mt-2 text-lg font-semibold">{p.price_rub} ₽</div>
            <button
              onClick={() => buy(p.sku)}
              disabled={busy !== null}
              className="mt-3 w-full rounded bg-neutral-900 px-4 py-2 text-white disabled:opacity-40"
            >
              {busy === p.sku ? 'Создаём заказ…' : 'Купить'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

const PROMO_ERROR: Record<string, string> = {
  promo_not_found: 'Такого промокода нет',
  promo_limit_reached: 'Лимит использований промокода исчерпан',
};
