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
  const navigate = useNavigate();

  useEffect(() => {
    api.products().then((r) => setProducts(r.products));
  }, []);

  async function buy(sku: string) {
    setBusy(sku);
    try {
      const { order } = await api.createOrder(sku);
      navigate(`/orders/${order.id}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-8">
      <h1 className="mb-6 text-2xl font-bold">Keyflow — каталог</h1>
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
