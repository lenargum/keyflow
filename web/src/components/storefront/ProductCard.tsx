import type { Product } from '../../api.js';

/**
 * Карточка товара, нода макета 1:223.
 *
 * Точка интерактива №5: подъём с усилением тени при наведении.
 *
 * Картинка одна на все карточки — та же, что в макете. Задание прямо
 * говорит, что наполнение витрины не оценивается, а в каталоге из
 * приложения реальных изображений нет.
 */
export function ProductCard({
  product,
  price,
  busy,
  onBuy,
}: {
  product: Product;
  /**
   * Цена со скидкой, если введён промокод. Считает её СЕРВЕР — карточка
   * только показывает готовые числа и ничего не перемножает сама.
   */
  price: { base: number; discount: number; total: number } | null;
  busy: boolean;
  onBuy: (sku: string) => void;
}) {
  const discounted = price !== null && price.discount > 0;
  return (
    // Вся карточка кликабельна: действие у неё одно, и курсор-указатель
    // не должен обманывать — раз он появился, клик должен срабатывать.
    <article
      onClick={() => !busy && onBuy(product.sku)}
      className="flex cursor-pointer flex-col overflow-hidden rounded-[16px] bg-white shadow-card transition-all duration-200 hover:-translate-y-1 hover:shadow-card-hover"
    >
      <img src="/figma/product-pubg.png" alt="" className="h-[152px] w-full object-cover" />

      <div className="flex flex-1 flex-col gap-3 px-[13px] pb-[15px] pt-[12px]">
        <h3 className="min-h-[30px] text-[11px] font-extrabold leading-[14px] text-ink">
          {product.name}
        </h3>

        {/* Перечёркнутая цена в макете уже есть — с промокодом она наконец
            наполняется смыслом: слева итог от сервера, справа исходная цена. */}
        <div className="flex items-baseline gap-2">
          <span className="text-[20px] font-bold leading-5 text-price">
            {discounted ? price.total : product.price_rub} ₽
          </span>
          {discounted ? (
            <span className="text-[11px] font-bold text-strike line-through">
              {price.base} ₽
            </span>
          ) : (
            <span className="text-[11px] font-bold uppercase text-strike">{product.type}</span>
          )}
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onBuy(product.sku);
          }}
          disabled={busy}
          className="mt-auto h-[42px] rounded-[11px] bg-black text-[12px] font-extrabold text-white transition-opacity hover:opacity-85 disabled:opacity-40"
        >
          {busy ? 'Создаём заказ…' : 'Купить'}
        </button>
      </div>
    </article>
  );
}
