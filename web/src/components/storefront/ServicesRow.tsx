/**
 * Ряд иконок сервисов, часть ноды макета 1:494.
 *
 * Точка интерактива №4: плавное выделение при наведении.
 */
type Service = { name: string; icon: string; ring: string };

const SERVICES: Service[] = [
  { name: 'Steam', icon: '/figma/app-steam.png', ring: '#1482b3' },
  { name: 'Telegram', icon: '/figma/app-telegram.png', ring: '#45baee' },
  { name: 'Roblox', icon: '/figma/app-roblox.png', ring: '#b8c5ff' },
  { name: 'Brawl Stars', icon: '/figma/app-brawlstars.png', ring: '#e86eff' },
  { name: 'PUBG Mob...', icon: '/figma/app-pubg.png', ring: '#000000' },
  { name: 'App Store', icon: '/figma/app-appstore.png', ring: '#4acdff' },
  { name: 'ChatGPT', icon: '/figma/app-chatgpt.png', ring: '#38d4ad' },
  { name: 'PlayStation', icon: '/figma/app-playstation.png', ring: '#117fda' },
  { name: 'TikTok', icon: '/figma/app-tiktok-glyph.png', ring: '#454545' },
  { name: 'Mobile Leg..', icon: '/figma/app-mobilelegends.png', ring: '#ffffff73' },
];

export function ServicesRow() {
  // В макете у этого ряда overflow-auto: при нехватке ширины он скроллится,
  // а не ломается. Иконки фиксированные, ужимать их нельзя.
  //
  // overflow-x подразумевает и обрезку по вертикали — CSS не даёт сделать
  // видимой только одну ось. Поэтому подъём и тень на ховере живут внутри
  // собственных отступов контейнера, а отрицательные поля возвращают ряд
  // на прежнее место.
  return (
    <div className="-mx-2 -my-2 flex min-w-full items-start justify-between gap-4 overflow-x-auto px-2 pb-6 pt-4">
      {SERVICES.map((service) => (
        <button
          key={service.name}
          type="button"
          className="group flex w-[76px] shrink-0 flex-col items-center gap-2"
        >
          {/* Обводка нарисована отдельным слоем поверх картинки, а не border'ом
              контейнера: border съедал бы по 2px с каждой стороны, картинка
              становилась 68px вместо 72 и по краям светились белые поля. */}
          <span className="relative block size-[72px] overflow-hidden rounded-[16px] shadow-icon transition-all duration-200 group-hover:-translate-y-1 group-hover:shadow-icon-hover">
            <img
              src={service.icon}
              alt=""
              className="size-full object-cover transition-transform duration-200 group-hover:scale-105"
            />
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-[16px] border-2"
              style={{ borderColor: service.ring }}
            />
          </span>
          <span className="whitespace-nowrap text-[16px] font-bold tracking-[-0.16px] text-body transition-colors group-hover:text-ink">
            {service.name}
          </span>
        </button>
      ))}

      <button type="button" className="group flex w-[76px] shrink-0 flex-col items-center gap-2">
        <span className="flex size-[72px] items-center justify-center rounded-[16px] border-2 border-line-strong bg-page shadow-icon transition-all duration-200 group-hover:-translate-y-1 group-hover:shadow-icon-hover">
          <img src="/figma/icon-more.svg" alt="" className="size-[28px]" />
        </span>
        <span className="whitespace-nowrap text-[16px] font-bold tracking-[-0.16px] text-muted">
          еще 841
        </span>
      </button>
    </div>
  );
}
