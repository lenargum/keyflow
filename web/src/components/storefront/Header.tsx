import { useEffect, useRef, useState } from 'react';
import { CatalogMenu } from './CatalogMenu.js';

/**
 * Шапка витрины, нода макета 1:598.
 *
 * Точка интерактива №2: кнопка «Каталог» открывает меню, повторный клик
 * или клик вне меню его закрывает.
 */
export function Header() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
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
    <header ref={ref} className="relative border-b border-page bg-white">
      <div className="mx-auto flex h-[80px] w-full max-w-[1200px] items-center gap-6">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex shrink-0 items-center gap-2 rounded-[10px] bg-black px-5 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-85"
        >
          <img src="/figma/icon-catalog.svg" alt="" className="size-[20px]" />
          Каталог
        </button>

        <div className="flex h-[36px] flex-1 items-center gap-2 rounded-[10px] bg-black p-1">
          <div className="flex h-full flex-1 items-center rounded-[8px] bg-white px-3">
            <span className="text-[12px] font-semibold tracking-[-0.36px] text-muted-dark">
              Игра, приложение или услуга...
            </span>
          </div>
          <span className="flex size-[28px] items-center justify-center rounded-[6px] bg-surface-alt">
            <img src="/figma/icon-favorite.svg" alt="Избранное" className="h-[13px] w-[14px]" />
          </span>
          <span className="flex size-[28px] items-center justify-center">
            <img src="/figma/icon-search.svg" alt="Поиск" className="size-[16px]" />
          </span>
        </div>

        <div className="flex size-[36px] shrink-0 items-center justify-center rounded-[10px] bg-page">
          <span className="relative block size-[20px]">
            <img
              src="/figma/icon-profile-head.svg"
              alt=""
              className="absolute left-[30%] top-[9%] h-[40%] w-[40%]"
            />
            <img
              src="/figma/icon-profile-body.svg"
              alt="Профиль"
              className="absolute left-[18%] top-[53%] h-[35%] w-[65%]"
            />
          </span>
        </div>
      </div>

      {open && <CatalogMenu />}
    </header>
  );
}
