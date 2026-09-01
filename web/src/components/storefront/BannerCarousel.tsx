import { useCallback, useEffect, useRef, useState } from 'react';

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
const SLIDE_MS = 500;

/**
 * Лента с клонами по краям: [последний, ...слайды, первый]. Реальные слайды
 * занимают позиции 1..N, позиции 0 и N+1 — клоны. Доехав до клона, лента
 * молча, без анимации, переставляется на его настоящего двойника.
 *
 * Так переход с последнего слайда на первый выглядит шагом вперёд,
 * а не перемоткой через всю ленту назад.
 */
const TRACK = [SLIDES[SLIDES.length - 1]!, ...SLIDES, SLIDES[0]!];
const FIRST = 1;
const LAST = SLIDES.length;

export function BannerCarousel() {
  const [pos, setPos] = useState(FIRST);
  const [animate, setAnimate] = useState(true);
  const paused = useRef(false);

  const go = useCallback((delta: number) => setPos((p) => p + delta), []);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!paused.current) go(1);
    }, AUTOPLAY_MS);
    return () => clearInterval(timer);
  }, [go]);

  // Перестановка с клона на двойника: сначала без анимации, потом возвращаем её
  // следующим кадром — иначе браузер успеет анимировать и сам прыжок.
  useEffect(() => {
    if (pos !== FIRST - 1 && pos !== LAST + 1) return;
    const timer = setTimeout(() => {
      setAnimate(false);
      setPos(pos === FIRST - 1 ? LAST : FIRST);
    }, SLIDE_MS);
    return () => clearTimeout(timer);
  }, [pos]);

  useEffect(() => {
    if (animate) return;
    const frame = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(frame);
  }, [animate]);

  const active = (pos - FIRST + SLIDES.length) % SLIDES.length;

  return (
    <section
      className="relative h-[263px] w-full"
      onMouseEnter={() => (paused.current = true)}
      onMouseLeave={() => (paused.current = false)}
    >
      {/* Форма из макета: скруглённый прямоугольник с вырезом под стрелки. */}
      <img src="/figma/banner-shape.svg" alt="" className="absolute inset-0 size-full" />

      <div className="absolute inset-0 overflow-hidden rounded-[16px]">
        <div
          className={`flex h-full ${animate ? 'transition-transform ease-out' : ''}`}
          style={{
            width: `${TRACK.length * 100}%`,
            transform: `translateX(-${pos * (100 / TRACK.length)}%)`,
            transitionDuration: animate ? `${SLIDE_MS}ms` : undefined,
          }}
        >
          {TRACK.map((slide, i) => (
            <div
              key={`${slide.title}-${i}`}
              className="flex h-full flex-col justify-center px-12 text-white"
              style={{ width: `${100 / TRACK.length}%` }}
              aria-hidden={i !== pos}
            >
              <div className="text-[32px] font-extrabold leading-tight">{slide.title}</div>
              <div className="mt-2 text-[16px] font-semibold text-white/60">{slide.note}</div>
            </div>
          ))}
        </div>
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

      {/* Сама полоска 20x4 как в макете, но кликабельная область вокруг неё
          крупнее — целиться в четыре пикселя неудобно. */}
      <div className="absolute bottom-1 right-2 flex items-center">
        {SLIDES.map((slide, i) => (
          <button
            key={slide.title}
            type="button"
            aria-label={`Слайд ${i + 1}`}
            aria-current={i === active}
            onClick={() => setPos(FIRST + i)}
            className="group flex h-[24px] w-[26px] items-center justify-center"
          >
            <span
              className={`h-[4px] w-[20px] rounded-[12px] transition-colors ${
                i === active ? 'bg-white' : 'bg-white/45 group-hover:bg-white/70'
              }`}
            />
          </button>
        ))}
      </div>
    </section>
  );
}
