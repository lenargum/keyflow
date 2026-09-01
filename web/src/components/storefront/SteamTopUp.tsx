import { useState } from 'react';

/**
 * Блок пополнения Steam, часть ноды макета 1:494.
 *
 * Точка интерактива №3: переключатель валют. В макете он только меняет активное
 * состояние, пересчёта задание не требует — поэтому сумма не конвертируется,
 * но выбранная валюта подхватывается и в поле суммы, и в значке слева,
 * и в подписи кнопки оплаты.
 *
 * Поле логина декоративно: задание прямо говорит оставить его как в макете.
 * Покупка стартует с кнопки «Купить» на карточке товара.
 */
const CURRENCIES = ['$', '₸', '₽'] as const;
type Currency = (typeof CURRENCIES)[number];

const MAX_AMOUNT_CHARS = 7;

export function SteamTopUp({ promoSlot }: { promoSlot?: React.ReactNode }) {
  const [currency, setCurrency] = useState<Currency>('₽');
  const [amount, setAmount] = useState('500');

  return (
    // Блок из макета не ужимается ниже 1100px, а вертикальные отступы не дают
    // скролл-контейнеру срезать тень у иконки Steam.
    <div className="-my-2 overflow-x-auto px-0 pb-4 pt-4">
      <div className="grid min-w-[1100px] grid-cols-[285px_minmax(0,1fr)_minmax(0,1.2fr)_200px] items-center gap-4">
        <div className="flex items-center gap-3">
          {/* Обводка отдельным слоем — иначе border съедает 2px и картинка
              перестаёт закрывать контейнер целиком. */}
          <span className="relative block size-[72px] shrink-0 overflow-hidden rounded-[16px] shadow-icon">
            <img src="/figma/app-steam.png" alt="" className="size-full object-cover" />
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-[16px] border-2 border-[#1482b3]"
            />
          </span>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="whitespace-nowrap text-[16px] font-bold tracking-[-0.48px] text-body">
                Пополнение Steam
              </span>
              <span className="flex h-[20px] items-center rounded-full bg-badge px-2 text-[11px] font-bold leading-[11px] text-white">
                5%
              </span>
            </div>
            {promoSlot}
          </div>
        </div>

        <div className="flex h-[64px] max-w-[300px] items-center justify-between rounded-xl bg-surface px-5">
          <span className="flex flex-1 items-center gap-3">
            <img src="/figma/icon-user.svg" alt="" className="size-[20px]" />
            <span className="text-[15px] font-bold text-muted">Логин Steam</span>
          </span>
          <button
            type="button"
            title="Логин нужен, чтобы зачислить средства на нужный аккаунт"
            className="flex size-[20px] items-center justify-center rounded-md bg-[#a0a8b5] font-serif text-[12px] leading-[12px] text-white"
          >
            i
          </button>
        </div>

        <div className="flex h-[64px] max-w-[380px] items-center justify-between rounded-xl bg-surface px-4">
          <span className="flex items-center gap-3">
            <CurrencyBadge currency={currency} />
            <span className="flex flex-col">
              <label
                htmlFor="topup-amount"
                className="text-[12px] font-bold leading-[18px] text-muted"
              >
                Сумма
              </label>
              <span className="flex items-baseline text-[18px] font-bold leading-[18px] text-body">
                <AmountInput value={amount} onChange={setAmount} />
                <span>{currency}</span>
              </span>
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
          Оплатить {amount || 0}
          {currency}
        </button>
      </div>
    </div>
  );
}

/**
 * Значок валюты слева от суммы. В макете это залитый кружок #76829B
 * с вырезанным ₽, но вариантов под $ и ₸ там нет — поэтому рисуем кружок
 * с символом, одинаково для всех трёх.
 */
function CurrencyBadge({ currency }: { currency: Currency }) {
  return (
    <span
      aria-hidden
      className="flex size-[20px] shrink-0 items-center justify-center rounded-full bg-muted-dark text-[11px] font-bold leading-none text-surface"
    >
      {currency}
    </span>
  );
}

/**
 * Ширина поля едет за содержимым, чтобы символ валюты стоял вплотную к сумме.
 *
 * Ширину задаёт скрытый span с ТЕМИ ЖЕ классами, а инпут растянут поверх него.
 * Мерить через getComputedStyle оказалось ненадёжно: у инпута tabular-nums,
 * знакоместа шире пропорциональных цифр, и символ валюты наезжал на сумму.
 * Здесь совпадение шрифта гарантировано — это буквально те же классы.
 */
function AmountInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const text = value || '0';

  return (
    <span className="relative inline-block">
      <span aria-hidden className={`invisible whitespace-pre ${AMOUNT_TEXT}`}>
        {text}
      </span>
      <input
        id="topup-amount"
        value={value}
        inputMode="numeric"
        aria-label="Сумма пополнения"
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '').slice(0, MAX_AMOUNT_CHARS);
          onChange(digits.replace(/^0+(?=\d)/, ''));
        }}
        className={`absolute inset-0 w-full bg-transparent outline-none ${AMOUNT_TEXT}`}
      />
    </span>
  );
}

/** Один источник правды для шрифта: и мерная копия, и сам инпут. */
const AMOUNT_TEXT = 'font-bold tabular-nums text-body';
