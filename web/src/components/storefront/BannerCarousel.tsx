import { useCallback, useEffect, useState } from 'react';

/**
 * Баннер-карусель, нода макета 1:641.
 *
 * Точка интерактива №1: автопереключение, стрелки, активная точка-индикатор.
 * Слайдов в макете шесть — по числу индикаторов.
 */
const SLIDES = [
  { title: 'Пополнение Steam без комиссии', note: 'Зачисление за 5 минут' },
  { title: 'Ключи Steam и Xbox', note: 'Мгновенная выдача из пула' },
  { title: 'Подписки на год', note: 'Discord Nitro, YouTube, Spotify' },
  { title: 'Подарочные карты', note: 'PlayStation, Xbox, Roblox' },
  { title: 'Игровая валюта', note: 'Robux, UC, Battle Pass' },
  { title: 'Промокоды недели', note: 'WELCOME10 и GG500' },
];

const AUTOPLAY_MS = 5000;

export function BannerCarousel() {
  const [index, setIndex] = useState(0);

  const go = useCallback((delta: number) => {
    setIndex((prev) => (prev + delta + SLIDES.length) % SLIDES.length);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => go(1), AUTOPLAY_MS);
    return () => clearInterval(timer);
  }, [go, index]);

  const slide = SLIDES[index]!;

  return (
    <section className="relative h-[263px] w-full">
      {/* Форма из макета: скруглённый прямоугольник с вырезом под стрелки. */}
      <img src="/figma/banner-shape.svg" alt="" className="absolute inset-0 size-full" />

      <div className="absolute inset-0 flex flex-col justify-center px-12 text-white">
        <div className="text-[32px] font-extrabold leading-tight">{slide.title}</div>
        <div className="mt-2 text-[16px] font-semibold text-white/60">{slide.note}</div>
      </div>

      <div className="absolute right-0 top-0 flex h-[40px] w-[90px] items-center justify-between rounded-[48px] border border-line-soft bg-surface p-1">
        <button
          type="button"
          aria-label="Предыдущий слайд"
          onClick={() => go(-1)}
          className="flex size-[32px] items-center justify-center rounded-full transition-colors hover:bg-line"
        >
          <img src="/figma/icon-arrow-prev.svg" alt="" className="size-[18px]" />
        </button>
        <button
          type="button"
          aria-label="Следующий слайд"
          onClick={() => go(1)}
          className="flex size-[32px] items-center justify-center rounded-full transition-colors hover:bg-line"
        >
          <img src="/figma/icon-arrow-next.svg" alt="" className="size-[18px]" />
        </button>
      </div>

      <div className="absolute bottom-4 right-4 flex items-center gap-1">
        {SLIDES.map((s, i) => (
          <button
            key={s.title}
            type="button"
            aria-label={`Слайд ${i + 1}`}
            aria-current={i === index}
            onClick={() => setIndex(i)}
            className={`h-[4px] w-[20px] rounded-[12px] transition-colors ${
              i === index ? 'bg-white' : 'bg-white/45 hover:bg-white/70'
            }`}
          />
        ))}
      </div>
    </section>
  );
}
