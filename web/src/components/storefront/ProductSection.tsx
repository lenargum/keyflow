import { useMemo, useState } from 'react';
import type { Product } from '../../api.js';
import { ProductCard } from './ProductCard.js';

/**
 * Ряд карточек товара с заголовком и табами, нода макета 1:145.
 *
 * Первым идёт таб «Все», он же активен по умолчанию: витрина открывается
 * на всём каталоге, а не прячет три четверти товаров за случайно выбранной
 * вкладкой. Иконка у него — сетка 2x2 с кнопки «Каталог» из этого же макета:
 * подходит по смыслу и не выдумана.
 *
 * В каталоге из приложения к заданию четыре типа, а табов в макете семь —
 * под «Предметы» и «Аккаунты» товаров просто нет, такие вкладки показывают
 * пустое состояние. «Другое» подбирает всё, что не попало ни в одну вкладку:
 * если в каталоге заведут новый тип, он не пропадёт с витрины.
 */
const ALL = 'Все';

const TABS = [
  { label: ALL, icon: '/figma/tab-all.svg', types: [] },
  { label: 'Донат', icon: '/figma/tab-donate.svg', types: ['topup'] },
  { label: 'Подписки', icon: '/figma/tab-subscribes.svg', types: ['subscription'] },
  { label: 'Предметы', icon: '/figma/tab-items.svg', types: [] },
  { label: 'Аккаунты', icon: '/figma/tab-accounts.svg', types: [] },
  { label: 'Ключи', icon: '/figma/tab-keys.svg', types: ['key'] },
  { label: 'Игровая валюта', icon: '/figma/tab-currency.svg', types: ['giftcard'] },
  { label: 'Другое', icon: '/figma/tab-other.svg', types: [] },
] as const;

const CLAIMED_TYPES = new Set(TABS.flatMap((t) => t.types as readonly string[]));

export function ProductSection({
  products,
  prices,
  busy,
  onBuy,
}: {
  products: Product[];
  /** Цены со скидкой, посчитанные СЕРВЕРОМ под введённый промокод. */
  prices: Record<string, { base: number; discount: number; total: number }> | null;
  busy: string | null;
  onBuy: (sku: string) => void;
}) {
  const [active, setActive] = useState<string>(ALL);

  const visible = useMemo(() => {
    if (active === ALL) return products;
    const tab = TABS.find((t) => t.label === active);
    if (!tab) return products;
    if (tab.label === 'Другое') return products.filter((p) => !CLAIMED_TYPES.has(p.type));
    return products.filter((p) => (tab.types as readonly string[]).includes(p.type));
  }, [products, active]);

  return (
    <section>
      <div className="flex items-center justify-between gap-4">
        <h2 className="whitespace-nowrap text-[20px] font-bold leading-[30px] text-heading">
          Популярные товары
        </h2>

        <div className="flex gap-2 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.label}
              type="button"
              aria-pressed={active === tab.label}
              onClick={() => setActive(tab.label)}
              className={`flex h-[34px] shrink-0 items-center gap-2 rounded-[10px] px-3.5 text-[13px] font-bold leading-[19.5px] transition-colors ${
                active === tab.label ? 'bg-black text-white' : 'bg-surface text-muted hover:bg-line'
              }`}
            >
              {/* Все семь иконок выгружены одним серым #8A94A6, а на активном
                  чёрном табе перекрашиваются в белый фильтром — иначе пришлось
                  бы держать по два ассета на каждый таб. */}
              <img
                src={tab.icon}
                alt=""
                className={`size-[14px] ${
                  active === tab.label ? 'brightness-0 invert' : 'opacity-50'
                }`}
              />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {visible.length > 0 ? (
        <div className="mt-4 grid grid-cols-5 gap-4">
          {visible.map((product) => (
            <ProductCard
              key={product.sku}
              product={product}
              price={prices?.[product.sku] ?? null}
              busy={busy === product.sku}
              onBuy={onBuy}
            />
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-[16px] bg-white px-5 py-10 text-center text-[14px] font-semibold text-muted shadow-block">
          В категории «{active}» пока нет товаров
        </div>
      )}
    </section>
  );
}
