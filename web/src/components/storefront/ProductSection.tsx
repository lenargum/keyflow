import { useState } from 'react';
import type { Product } from '../../api.js';
import { ProductCard } from './ProductCard.js';

/**
 * Ряд карточек товара с заголовком и табами, нода макета 1:145.
 * Табы визуальные — фильтрация категорий заданием не требуется.
 */
const TABS = [
  { label: 'Донат', icon: '/figma/tab-donate.svg' },
  { label: 'Подписки', icon: '/figma/tab-subscribes.svg' },
  { label: 'Предметы', icon: '/figma/tab-items.svg' },
  { label: 'Аккаунты', icon: '/figma/tab-accounts.svg' },
  { label: 'Ключи', icon: '/figma/tab-keys.svg' },
  { label: 'Игровая валюта', icon: '/figma/tab-currency.svg' },
  { label: 'Другое', icon: '/figma/tab-other.svg' },
];

export function ProductSection({
  products,
  busy,
  onBuy,
}: {
  products: Product[];
  busy: string | null;
  onBuy: (sku: string) => void;
}) {
  const [active, setActive] = useState('Донат');

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
              onClick={() => setActive(tab.label)}
              className={`flex h-[34px] shrink-0 items-center gap-2 rounded-[10px] px-3.5 text-[13px] font-bold leading-[19.5px] transition-colors ${
                active === tab.label ? 'bg-black text-white' : 'bg-surface text-muted hover:bg-line'
              }`}
            >
              <img
                src={tab.icon}
                alt=""
                className={`size-[14px] ${active === tab.label ? '' : 'opacity-50'}`}
              />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-5 gap-4">
        {products.map((product) => (
          <ProductCard
            key={product.sku}
            product={product}
            busy={busy === product.sku}
            onBuy={onBuy}
          />
        ))}
      </div>
    </section>
  );
}
