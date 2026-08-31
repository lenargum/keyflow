import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, type Product } from '../api.js';
import { BannerCarousel } from '../components/storefront/BannerCarousel.js';
import { Header } from '../components/storefront/Header.js';
import { ProductSection } from '../components/storefront/ProductSection.js';
import { ServicesRow } from '../components/storefront/ServicesRow.js';
import { SteamTopUp } from '../components/storefront/SteamTopUp.js';

/**
 * Витрина по макету: шапка, баннер, ряд иконок сервисов, блок пополнения
 * Steam, ряд карточек товара. Отзывы, футер и остальные ряды карточек
 * заданием исключены.
 */
export function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [promo, setPromo] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
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
    <div className="min-h-screen bg-page">
      <Header />

      <main className="mx-auto w-full max-w-[1200px] space-y-6 py-6">
        <BannerCarousel />

        <div className="flex flex-col gap-4 rounded-[16px] bg-white p-5 shadow-block">
          <ServicesRow />
          <div className="h-px w-full bg-line" />
          <SteamTopUp />
        </div>

        {/* Промокод в макете не предусмотрен — этап 4 требует его отдельно. */}
        <div className="flex flex-wrap items-center gap-3 rounded-[16px] bg-white p-4 shadow-block">
          <label className="text-[13px] font-bold text-body">
            Промокод
            <input
              value={promo}
              onChange={(e) => setPromo(e.target.value.toUpperCase())}
              placeholder="WELCOME10"
              className="ml-3 w-48 rounded-lg bg-surface px-3 py-2 font-mono text-[13px] font-semibold text-ink outline-none placeholder:text-muted focus:ring-2 focus:ring-black/10"
            />
          </label>
          <span className="text-[12px] font-semibold text-muted">
            Скидку считает сервер. Демо-коды: WELCOME10, GG500, LIMIT3, ONCEONLY.
          </span>
          <Link to="/admin" className="ml-auto text-[12px] font-semibold text-muted hover:text-ink">
            админка →
          </Link>
        </div>

        {error && (
          <div className="rounded-[16px] bg-white p-4 text-[13px] font-bold text-red-600 shadow-block">
            {error}
          </div>
        )}

        <ProductSection products={products} busy={busy} onBuy={buy} />
      </main>
    </div>
  );
}

const PROMO_ERROR: Record<string, string> = {
  promo_not_found: 'Такого промокода нет',
  promo_limit_reached: 'Лимит использований промокода исчерпан',
};
