import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type Product, type PromoPreview } from '../api.js';
import { BannerCarousel } from '../components/storefront/BannerCarousel.js';
import { Header } from '../components/storefront/Header.js';
import { ProductSection } from '../components/storefront/ProductSection.js';
import { PromoField } from '../components/storefront/PromoField.js';
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
  const [preview, setPreview] = useState<PromoPreview | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.products().then((r) => setProducts(r.products));
  }, []);

  // Скидку считает сервер: спрашиваем его о результате ввода и просто рисуем
  // ответ. Дребезг гасим, чтобы не дёргать ручку на каждую букву.
  useEffect(() => {
    if (!promo) {
      setPreview(null);
      setChecking(false);
      return;
    }
    setChecking(true);
    const timer = setTimeout(() => {
      let cancelled = false;
      api
        .previewPromo(promo)
        .then((r) => !cancelled && setPreview(r))
        .catch(() => !cancelled && setPreview(null))
        .finally(() => !cancelled && setChecking(false));
      return () => (cancelled = true);
    }, 350);
    return () => clearTimeout(timer);
  }, [promo]);

  async function buy(sku: string) {
    setBusy(sku);
    setError(null);
    try {
      const { order } = await api.createOrder(sku, promo);
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
          <SteamTopUp
            promoSlot={
              <PromoField
                value={promo}
                onChange={(v) => {
                  setPromo(v);
                  setError(null);
                }}
                preview={preview}
                checking={checking}
                error={error}
              />
            }
          />
        </div>

        <ProductSection
          products={products}
          prices={preview?.valid ? preview.prices : null}
          busy={busy}
          onBuy={buy}
        />
      </main>
    </div>
  );
}

const PROMO_ERROR: Record<string, string> = {
  promo_not_found: 'Такого промокода нет',
  promo_limit_reached: 'Лимит использований промокода исчерпан',
};
