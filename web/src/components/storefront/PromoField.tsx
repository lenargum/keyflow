import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

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
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  error: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<{ top: number; left: number } | null>(null);
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
          value ? 'bg-price/15 text-price' : 'bg-promo-tint text-black hover:bg-promo-tint/70'
        }`}
      >
        {value ? `Промокод ${value}` : 'Ввести промокод'}
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
            className="fixed z-50 w-[280px] rounded-xl bg-white p-3 shadow-block"
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

          {error ? (
            <div className="mt-2 text-[12px] font-bold text-red-600">{error}</div>
          ) : (
            <div className="mt-2 text-[12px] font-semibold text-muted">
              Скидку считает сервер. Демо-коды: WELCOME10, GG500, LIMIT3, ONCEONLY.
            </div>
          )}
          </div>,
          document.body,
        )}
    </div>
  );
}
