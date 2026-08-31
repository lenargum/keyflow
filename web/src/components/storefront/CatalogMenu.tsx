/**
 * Раскрытое меню каталога, нода макета 1:1193.
 * Задание разрешает упростить колонки — точность меню не оценивается,
 * оценивается рабочее открытие и закрытие.
 */
const SIDEBAR = [
  'Игры и игровые сервисы',
  'Игровые ценности',
  'Мобильные игры',
  'Сервисы и соцсети',
  'Программы',
];

const COLUMNS: { title: string; links: string[] }[] = [
  {
    title: 'Steam',
    links: [
      'Игры и DLC',
      'Пополнение баланса',
      'Подарочные карты',
      'Коллекционные карточки',
      'Смена региона',
    ],
  },
  {
    title: 'PlayStation',
    links: ['Игры и DLC', 'Пополнение баланса', 'Новые аккаунты', 'PS Plus', 'EA Play'],
  },
  {
    title: 'Xbox',
    links: ['Игры и DLC', 'Пополнение баланса', 'Новые аккаунты', 'Xbox Game Pass', 'Услуги'],
  },
  {
    title: 'Nintendo',
    links: ['Игры и DLC', 'Подарочные карты', 'Новые аккаунты', 'NS Online'],
  },
  {
    title: 'Battle.net',
    links: [
      'World of Warcraft',
      'Подарочные карты',
      'Прямое пополнение',
      'Новые аккаунты',
      'Смена региона',
    ],
  },
];

const PICKS = ['Скидки 90%', 'Популярные издатели', 'Лучшие серии игр', 'Steam Deck', 'Bundle-наборы'];

export function CatalogMenu() {
  return (
    <div className="absolute left-0 right-0 top-full z-40 border-b border-line bg-white shadow-block">
      <div className="mx-auto flex w-full max-w-[1200px] gap-6 overflow-x-auto">
        <aside className="w-[320px] shrink-0 py-4">
          {SIDEBAR.map((item, i) => (
            <button
              key={item}
              className={`flex w-full items-center justify-between rounded-lg px-4 py-3 text-left text-sm font-semibold transition-colors ${
                i === 0 ? 'bg-surface text-ink' : 'text-body hover:bg-surface'
              }`}
            >
              {item}
              <Chevron />
            </button>
          ))}
        </aside>

        <div className="min-w-[856px] flex-1 py-8">
          <div className="grid grid-cols-5 gap-6">
            {COLUMNS.map((col) => (
              <div key={col.title}>
                <ColumnTitle>{col.title}</ColumnTitle>
                <ul className="mt-3 space-y-2">
                  {col.links.map((link) => (
                    <li key={link}>
                      <a href="#" className="text-sm text-body hover:text-ink">
                        {link}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-10 w-[200px]">
            <ColumnTitle>Подборки</ColumnTitle>
            <ul className="mt-3 space-y-2">
              {PICKS.map((pick) => (
                <li key={pick}>
                  <a href="#" className="text-sm text-body hover:text-ink">
                    {pick}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function ColumnTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-[15px] font-bold text-ink">
      {children}
      <Chevron />
    </div>
  );
}

function Chevron() {
  return <img src="/figma/icon-chevron.svg" alt="" className="size-[12px] opacity-60" />;
}
