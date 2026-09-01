import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PromoPreview } from '../../api.js';
import { describeError } from '../../useAction.js';

/**
 * Промокода в макете нет — там на этом месте кнопка «Ввести промокод»,
 * которая никуда не ведёт. Этап 4 требует рабочий ввод, поэтому кнопка
 * из макета стала настоящей: раскрывает дропдаун с полем.
 *
 * Так промокод остаётся в отведённом ему макетом месте, а не висит
 * отдельной полосой поверх вёрстки.
 */
export function PromoField({
  value,
  onChange,
  preview,
  checking,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  preview: PromoPreview | null;
  checking: boolean;
  error: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<{ top: number; left: number } | null>(null);

  // Ничего не считаем сами: скидка приходит с сервера, здесь только формат.
  const applied = preview?.valid === true;
  const discountLabel =
    preview?.valid === true
      ? preview.type === 'percent'
        ? `${preview.value}%`
        : `${preview.value} ₽`
      : '';
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Блок пополнения лежит в горизонтальном скроллере, а тот обрезает и по
  // вертикали. Поэтому панель живёт в портале и позиционируется от кнопки.
  const place = useCallback(() => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setBox({ top: r.bottom + 8, left: r.left });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (!ref.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative w-fit">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1 rounded-lg px-3 py-1 text-[12px] font-bold leading-[18px] transition-colors ${
          applied ? 'bg-price/15 text-price' : 'bg-promo-tint text-black hover:bg-promo-tint/70'
        }`}
      >
        {applied ? `${value} · −${discountLabel}` : 'Ввести промокод'}
        <img
          src="/figma/icon-chevron.svg"
          alt=""
          className={`size-[12px] transition-transform ${open ? '-rotate-90' : 'rotate-90'}`}
        />
      </button>

      {open &&
        box &&
        createPortal(
          <div
            ref={panelRef}
            style={{ top: box.top, left: box.left }}
            className="fixed z-50 w-[280px] rounded-xl border border-line bg-white p-3 shadow-dropdown"
          >
          <label htmlFor="promo" className="text-[12px] font-bold text-muted">
            Промокод применится к заказу
          </label>
          <div className="mt-2 flex gap-2">
            <input
              id="promo"
              value={value}
              onChange={(e) => onChange(e.target.value.toUpperCase().trim())}
              placeholder="WELCOME10"
              className="w-full rounded-lg bg-surface px-3 py-2 font-mono text-[13px] font-semibold text-ink outline-none placeholder:text-muted focus:ring-2 focus:ring-black/10"
            />
            {value && (
              <button
                type="button"
                onClick={() => onChange('')}
                className="shrink-0 rounded-lg bg-surface px-3 text-[12px] font-bold text-muted transition-colors hover:bg-line"
              >
                Сбросить
              </button>
            )}
          </div>

          <div className="mt-2 text-[12px] font-semibold leading-[16px]">
            {error ? (
              <span className="font-bold text-red-600 first-letter:uppercase">{error}</span>
            ) : checking ? (
              <span className="text-muted">Проверяем на сервере…</span>
            ) : applied ? (
              <span className="font-bold text-price">Промокод действует. Скидка −{discountLabel}</span>
            ) : preview && !preview.valid ? (
              <span className="font-bold text-red-600 first-letter:uppercase">
                {describeError(preview.reason)}
              </span>
            ) : (
              <span className="text-muted">
                Скидку считает сервер. Демо-коды: WELCOME10, GG500, LIMIT3, ONCEONLY.
              </span>
            )}
          </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
