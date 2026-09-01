import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type Product, type PromoPreview } from '../api.js';
import { describeError } from '../useAction.js';
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

    // Флаг отмены нужен на весь эффект, а не на колбэк таймера: ответ на
    // «WELCOME1» может прийти позже ответа на «WELCOME10» и перетереть свежий.
    let cancelled = false;
    setChecking(true);

    const timer = setTimeout(() => {
      api
        .previewPromo(promo)
        .then((r) => {
          if (!cancelled) setPreview(r);
        })
        .catch(() => {
          if (!cancelled) setPreview(null);
        })
        .finally(() => {
          if (!cancelled) setChecking(false);
        });
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [promo]);

  /**
   * Ключ идемпотентности живёт на намерение купить конкретный товар и
   * переживает двойной клик. После успешного заказа сбрасывается: осознанная
   * вторая покупка того же товара должна создать новый заказ, а не вернуть старый.
   */
  const keys = useRef(new Map<string, string>());
  // Синхронный замок: state обновляется к следующей перерисовке, а второй клик
  // двойного клика прилетает раньше неё.
  const inFlight = useRef(false);

  async function buy(sku: string) {
    if (inFlight.current) return;
    inFlight.current = true;

    let key = keys.current.get(sku);
    if (!key) {
      key = crypto.randomUUID();
      keys.current.set(sku, key);
    }

    setBusy(sku);
    setError(null);
    try {
      const { order } = await api.createOrder(sku, promo, key);
      keys.current.delete(sku);
      navigate(`/orders/${order.id}`);
    } catch (err) {
      setError(describeError(err));
    } finally {
      inFlight.current = false;
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
