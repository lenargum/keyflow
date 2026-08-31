import { useState } from 'react';

/**
 * Блок пополнения Steam, часть ноды макета 1:494.
 *
 * Точка интерактива №3: переключатель валют меняет активное состояние.
 * Пересчёт суммы задание делать не требует, рассинхрон ₽/$ в макете —
 * заглушка, исправлять его тоже не нужно.
 *
 * Поле логина и кнопка оплаты декоративны: покупка стартует с кнопки
 * «Купить» на карточке товара.
 */
const CURRENCIES = ['$', '₸', '₽'] as const;

export function SteamTopUp() {
  const [currency, setCurrency] = useState<(typeof CURRENCIES)[number]>('$');

  return (
    <div className="grid grid-cols-[285px_minmax(0,1fr)_minmax(0,1.2fr)_200px] items-center gap-4">
      <div className="flex items-center gap-3">
        <span className="block size-[72px] shrink-0 overflow-hidden rounded-[16px] border-2 border-[#1482b3] shadow-icon">
          <img src="/figma/app-steam.png" alt="" className="size-full object-cover" />
        </span>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="whitespace-nowrap text-[16px] font-bold tracking-[-0.48px] text-body">
              Пополнение Steam
            </span>
            <span className="rounded-full bg-badge px-2 py-0.5 text-[11px] font-bold leading-[11px] text-white">
              5%
            </span>
          </div>
          <span className="flex w-fit items-center gap-0.5 rounded-lg bg-promo-tint px-3 py-1 text-[12px] font-bold leading-[18px] text-black">
            Ввести промокод
            <img src="/figma/icon-chevron.svg" alt="" className="size-[12px] rotate-90" />
          </span>
        </div>
      </div>

      <div className="flex h-[64px] max-w-[300px] items-center justify-between rounded-xl bg-surface px-5">
        <span className="flex flex-1 items-center gap-3">
          <img src="/figma/icon-user.svg" alt="" className="size-[20px]" />
          <span className="text-[15px] font-bold text-muted">Логин Steam</span>
        </span>
        <span className="flex size-[20px] items-center justify-center rounded-md bg-[#a0a8b5] text-[12px] font-bold italic leading-[12px] text-white">
          i
        </span>
      </div>

      <div className="flex h-[64px] max-w-[380px] items-center justify-between rounded-xl bg-surface px-4">
        <span className="flex items-center gap-3">
          <img src="/figma/icon-wallet.svg" alt="" className="size-[20px]" />
          <span className="flex flex-col">
            <span className="text-[12px] font-bold leading-[18px] text-muted">Сумма</span>
            <span className="text-[18px] font-bold leading-[18px] text-body">500₽</span>
          </span>
        </span>

        <span className="flex items-center gap-1.5">
          {CURRENCIES.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={c === currency}
              onClick={() => setCurrency(c)}
              className={`size-[36px] rounded-lg text-[16px] font-bold leading-6 transition-colors ${
                c === currency ? 'bg-black text-white' : 'bg-line text-muted hover:bg-line-strong'
              }`}
            >
              {c}
            </button>
          ))}
        </span>
      </div>

      <button
        type="button"
        className="h-[64px] w-[200px] rounded-xl bg-black text-[16px] font-bold leading-[27px] text-white transition-opacity hover:opacity-85"
      >
        Оплатить 500{currency}
      </button>
    </div>
  );
}
