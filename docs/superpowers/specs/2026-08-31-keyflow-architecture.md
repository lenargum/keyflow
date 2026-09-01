# Магазин цифровых товаров — дизайн-документ

Дата: 2026-08-31
Статус: утверждён, готов к имплементации
Источник требований: `docs/private/` — вне репозитория

Этот документ самодостаточен. Новая сессия начинает работу с него, исходные требования перечитывает только при расхождениях.

---

## 1. Что оценивают

Из пяти критериев приёмки все пять — про бэкенд. К вёрстке требование одно: структурная близость к макету, без пиксель-перфекта.

| № | Сценарий приёмки | Чем закрываем |
|---|---|---|
| 1 | 50 параллельных вебхуков по одному заказу → ровно одна выдача | `payment_events.event_id` PK + условный переход статуса + `issuances.order_id` UNIQUE |
| 2 | Повторный вебхук с тем же `event_id` ничего не меняет | `INSERT ... ON CONFLICT DO NOTHING` |
| 3 | Вебхук раньше заказа или не по порядку → без потери и дубля | событие пишется без FK, воркер подберёт позже |
| 4 | Пустой пул → восстановимое состояние, после долива ровно один ключ | статусы `out_of_stock` / `delivery_failed` + детерминированный `request_id` |
| 5 | Промокод с лимитом N под параллельными запросами | атомарный `UPDATE ... WHERE used_count < max_uses` |

Сквозной принцип: **никаких «прочитал — проверил — записал»**. Каждый переход состояния — один атомарный SQL-стейтмент, и каждая гарантия продублирована констрейнтом в БД. Баг в коде приложения должен упираться в отказ базы, а не в задвоенный ключ.

---

## 2. Стек

| Слой | Выбор |
|---|---|
| API | Node 22 + TypeScript + Fastify |
| БД | PostgreSQL 16 |
| Доступ к БД | голый SQL через `pg`, нумерованные `.sql`-миграции |
| Тесты | Vitest против живого Postgres |
| Фронт | Vite + React + TypeScript + Tailwind |
| Деплой | Docker Compose + Caddy на VPS, один поддомен |

**Без ORM** — сознательно. Оценивают контроль над конкурентностью; `FOR UPDATE SKIP LOCKED` в чистом SQL проверяющий читает и сразу видит гарантию.

**React вместо ванильного JS.** Требования поощряют отказ от тяжёлых фреймворков. Берём Vite + React без Next.js и объясняем выбор абзацем в README: рантайм ~50 КБ, SSR и роутинг-фреймворк не подключаем.

---

## 3. Структура репозитория

```
keyflow/
├── docker-compose.yml
├── README.md
├── docs/
├── server/
│   ├── src/
│   │   ├── index.ts            запуск API + воркера
│   │   ├── config.ts           env, таймауты, интервалы
│   │   ├── db.ts               пул pg, хелпер транзакций
│   │   ├── routes/
│   │   │   ├── products.ts
│   │   │   ├── orders.ts
│   │   │   ├── webhooks.ts
│   │   │   ├── qa.ts           эмулятор платёжки
│   │   │   └── admin.ts        за токеном
│   │   ├── services/
│   │   │   ├── orders.ts       создание, расчёт цены
│   │   │   ├── payments.ts     применение событий оплаты
│   │   │   ├── delivery.ts     выдача, фолбэк, ретраи
│   │   │   └── promo.ts
│   │   └── worker.ts           два цикла-поллера
│   ├── migrations/001_init.sql
│   ├── seed/
│   │   ├── products.json       из приложения к заданию
│   │   ├── keys.json           50 ключей, режется между A и B
│   │   ├── promocodes.json
│   │   └── seed.ts             идемпотентный
│   └── tests/races.test.ts
├── providers/                  заглушки поставщиков, отдельный процесс
│   └── src/index.ts            /a/issue и /b/issue
└── web/
    ├── src/components/         Header, Banner, ServiceIcons, SteamTopUp, ProductCard
    ├── src/pages/              Home, OrderStatus, Admin
    └── src/api.ts
```

Плоско: `routes` → `services` → `db`. Никаких DI-контейнеров, репозиториев и гексагональной архитектуры.

---

## 4. Схема БД

Пять таблиц. Порядок создания важен из-за внешних ключей: `products`, `promocodes`, затем `orders`, затем остальные.

```sql
CREATE TABLE products (
  sku       TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  type      TEXT NOT NULL,
  price_rub INTEGER NOT NULL CHECK (price_rub > 0),
  image     TEXT
);

CREATE TABLE promocodes (
  code       TEXT PRIMARY KEY,
  type       TEXT NOT NULL CHECK (type IN ('percent','amount')),
  value      INTEGER NOT NULL,
  max_uses   INTEGER NOT NULL,
  used_count INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT promo_limit CHECK (used_count <= max_uses)
);

CREATE TYPE order_status AS ENUM (
  'created','paid','delivering','delivered',
  'payment_failed','out_of_stock','delivery_failed'
);

CREATE TABLE orders (
  id              TEXT PRIMARY KEY,              -- ord_<nanoid>
  sku             TEXT NOT NULL REFERENCES products(sku),
  base_amount     INTEGER NOT NULL,
  promo_code      TEXT REFERENCES promocodes(code),
  discount        INTEGER NOT NULL DEFAULT 0,
  total_amount    INTEGER NOT NULL CHECK (total_amount >= 0),
  status          order_status NOT NULL DEFAULT 'created',
  attempts        INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX orders_worker_idx ON orders (next_attempt_at)
  WHERE status IN ('paid','out_of_stock','delivery_failed');

-- FK на orders намеренно НЕТ: событие может прийти раньше заказа
CREATE TABLE payment_events (
  event_id    TEXT PRIMARY KEY,
  order_id    TEXT NOT NULL,
  status      TEXT NOT NULL,
  amount      INTEGER,
  currency    TEXT,
  payload     JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_at  TIMESTAMPTZ
);

CREATE INDEX payment_events_pending_idx ON payment_events (received_at)
  WHERE applied_at IS NULL;

CREATE TABLE issuances (
  id         BIGSERIAL PRIMARY KEY,
  order_id   TEXT NOT NULL UNIQUE REFERENCES orders(id),
  request_id TEXT NOT NULL UNIQUE,
  provider   TEXT NOT NULL,
  code       TEXT NOT NULL,
  issued_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Три констрейнта, на которых всё держится:

- `issuances.order_id UNIQUE` — заказ физически не может получить две выдачи
- `payment_events.event_id PRIMARY KEY` — повтор вебхука отсекается базой
- `promo_limit CHECK` — перерасход промокода не запишется, даже если логика ошибётся

Владелец пула ключей — **заглушки поставщиков**, не наша БД. Контракт поставщика прямо говорит, что коды выдают они и они же возвращают `out_of_stock`. 50 ключей из приложения режем на непересекающиеся куски: A получает 1–35, B получает 36–50. Один код не может быть выдан обоими.

---

## 5. Ключевые SQL-приёмы

**Захват события оплаты.** `JOIN orders` означает: событие для несуществующего заказа просто остаётся необработанным и подберётся, когда заказ появится.

```sql
UPDATE payment_events SET applied_at = now()
WHERE event_id = (
  SELECT e.event_id FROM payment_events e
  JOIN orders o ON o.id = e.order_id
  WHERE e.applied_at IS NULL
  ORDER BY e.received_at
  FOR UPDATE SKIP LOCKED LIMIT 1
)
RETURNING *;
```

**Применение статуса оплаты.** Правило разрешения конфликта: `paid` побеждает `failed` независимо от порядка прихода, потому что деньги реально прошли.

```sql
-- paid
UPDATE orders SET status='paid', updated_at=now()
WHERE id=$1 AND status IN ('created','payment_failed');

-- failed
UPDATE orders SET status='payment_failed', updated_at=now()
WHERE id=$1 AND status='created';
```

`rowCount = 0` → заказ уже ушёл дальше, тихо выходим. Это и есть идемпотентность.

**Захват заказа на выдачу.** Заказ сам себе задача, отдельной таблицы очереди нет.

```sql
UPDATE orders SET status='delivering', attempts=attempts+1, updated_at=now()
WHERE id = (
  SELECT id FROM orders
  WHERE status IN ('paid','out_of_stock','delivery_failed')
    AND next_attempt_at <= now()
  ORDER BY next_attempt_at
  FOR UPDATE SKIP LOCKED LIMIT 1
)
RETURNING *;
```

**Запись выдачи.**

```sql
INSERT INTO issuances (order_id, request_id, provider, code)
VALUES ($1,$2,$3,$4)
ON CONFLICT (order_id) DO NOTHING
RETURNING *;
```

**Промокод.** Одним стейтментом, без чтения-проверки-записи.

```sql
UPDATE promocodes SET used_count = used_count + 1
WHERE code = $1 AND used_count < max_uses
RETURNING *;
```

`rowCount = 0` → лимит исчерпан, заказ отклоняем.

---

## 6. Поток выдачи

```
POST /api/orders            → created
POST /api/qa/pay            эмулятор шлёт вебхук
POST /api/webhooks/payment  INSERT ON CONFLICT DO NOTHING → 200 OK
                            (быстро, до всякого похода к поставщику)
   ↓
воркер, цикл 1: применяет payment_events → orders.status = paid
   ↓
воркер, цикл 2: захватывает заказ → delivering
   ↓
   request_id = `req_${order_id}`   ← детерминированный, один на заказ навсегда
   ↓
   поставщик A, таймаут 3с
   ├─ 200            → INSERT issuance → delivered
   ├─ таймаут        → переспросить A тем же request_id (до 2 раз)
   │                    всё ещё таймаут → delivery_failed, next_attempt_at = now() + 15с
   │                    НА B НЕ УХОДИМ
   ├─ out_of_stock   → поставщик B, та же логика
   └─ оба пусты      → out_of_stock, next_attempt_at = now() + 30с
```

Три решения, которые надо уметь объяснить на защите:

1. **200 отдаётся до похода к поставщику.** Иначе зависший поставщик роняет ответ вебхуку, платёжка ретраит по контракту at-least-once, и мы сами себе устраиваем шторм параллельных вебхуков.

2. **`request_id` детерминирован от `order_id`**, а не счётчик попыток. Сколько бы раз ни ретраили — поставщик обязан вернуть тот же код.

3. **После таймаута уходить на B нельзя.** Таймаут значит «возможно, уже выдал»: поставщик мог отдать код, а ответ не дошёл. Фолбэк на B — только на явный `out_of_stock`. Иначе два потраченных кода на один заказ.

Автоматические ретраи останавливаются после 5 попыток — дальше заказ ждёт ручной повторной выдачи из админки. Ручная выдача идемпотентна по построению: сбрасывает `status='paid'` и `next_attempt_at=now()`, а `issuances.order_id UNIQUE` плюс тот же `request_id` не дадут задвоиться.

---

## 7. API

| Метод | Путь | Назначение |
|---|---|---|
| GET | `/api/products` | каталог из БД |
| POST | `/api/orders` | `{sku, promo_code?}` → заказ. Цену клиент не присылает |
| GET | `/api/orders/:id` | статус, код при `delivered`, лог событий |
| POST | `/api/webhooks/payment` | контракт из задания, всегда 200 |
| POST | `/api/qa/pay` | эмулятор платёжки: `{order_id, outcome, times?}` |
| GET | `/api/admin/orders` | фильтр: оплачен, но код не выдан |
| POST | `/api/admin/orders/:id/reissue` | ручная повторная выдача |
| POST | `/api/admin/providers/config` | доли ошибок и таймаутов у A и B |
| POST | `/api/admin/providers/refill` | долив пула |
| POST | `/api/admin/reset` | миграции + сид заново |

Всё под `/api/admin/*` и мутирующие ручки QA-панели — за статическим bearer-токеном (`ADMIN_TOKEN` в env). Проверка одним префиксным хуком Fastify. Пользовательской авторизации нет, задание её снимает.

Расчёт цены только на сервере: приходит `sku` и опциональный промокод, цена берётся из `products`, скидка считается тут же. Данным от клиента не доверяем.

---

## 8. Заглушки поставщиков

Отдельный процесс, порт 4001, роуты `/a/issue` и `/b/issue`. У каждого поставщика:

- свой непересекающийся кусок пула ключей
- своя мапа `request_id → code` в памяти: повтор с тем же `request_id` возвращает **тот же** код, а не новый
- настраиваемые доли отказов и таймаутов (`errorRate`, `timeoutRate`), меняются через админку на лету
- «зависание» — реальная задержка дольше клиентского таймаута, а не мгновенная ошибка

Ответы строго по контракту задания: `{status:"ok", request_id, code}` или `{status:"error", reason:"out_of_stock"}`.

---

## 9. Фронтенд

**Объём вёрстки** — только верх витрины, ноды макета `FvqZhoweBeePOboFRZiOJ7`:

| Секция | Node ID |
|---|---|
| Шапка | `1:598` |
| Баннер-карусель | `1:641` |
| Ряд иконок сервисов + блок пополнения Steam | `1:494` |
| Один ряд карточек товара | `1:145` |
| Раскрытое меню каталога | `1:1193` |

Отзывы, футер, второй и третий ряды карточек, мобильная и тёмная версии — исключены самим заданием.

Дизайн-токенов в макете нет (`get_variable_defs` вернул только две тени), поэтому цвета и отступы снимаем через `get_design_context` посекционно и собираем свои CSS-переменные в конфиге Tailwind.

**Обязательный интерактив, пять точек:**

1. Баннер-карусель: автопереключение и стрелки, активные точки-индикаторы
2. Кнопка «Каталог»: открытие/закрытие, закрытие по клику вне
3. Переключатель валют `$ / ₸ / ₽`: меняет активное состояние, пересчёт не нужен
4. Иконки сервисов: плавное выделение при наведении
5. Карточки товара: подъём тенью при наведении

Страницы: `Home`, `OrderStatus`, `Admin`. Две последние — рабочий вид без дизайна, задание это разрешает.

---

## 10. QA-панель

Живёт на странице статуса заказа. Смысл: проверяющий воспроизводит все пять сценариев приёмки кликами, не собирая curl-запросы.

| Кнопка | Сценарий |
|---|---|
| Оплатить успешно / неуспешно | основной флоу и `payment_failed` |
| Отправить вебхук повторно | №2 |
| Отправить 50 вебхуков разом | №1 |
| Отправить вебхук до создания заказа | №3 |
| Опустошить пул поставщика | №4 |
| Ползунки долей ошибок и таймаутов A и B | ловушка таймаута |

Рядом — живой лог по заказу: пришедшие вебхуки, попытки выдачи, переходы статусов. Проверяющий **видит**, что 50 вебхуков дали одну выдачу.

---

## 11. Тесты гонок

`npm run test:races` — Vitest против живого Postgres, реальные HTTP-запросы через `Promise.all`. Пять кейсов, один в один с критериями приёмки:

1. 50 параллельных вебхуков по одному заказу → ровно одна строка в `issuances`, ровно один код израсходован у поставщика
2. Повтор `event_id` → состояние не изменилось
3. Вебхук раньше заказа → после создания заказа выдача проходит, ровно одна
4. Пустой пул → `out_of_stock`, после долива и `reissue` ровно один ключ
5. `LIMIT3` под 50 параллельными заказами → ровно 3 применения

Юнит-тесты на каждый модуль не пишем. Эти пять и есть рубрика.

---

## 12. Деплой и DNS

Один поддомен обслуживает и фронт, и API — так CORS не нужен вовсе. Статика отдаётся Caddy, `/api/*` проксируется в контейнер Node.

**DNS-записи:**

| Тип | Имя | Значение | TTL |
|---|---|---|---|
| A | `shop` | IPv4 твоей VPS | 300 |
| AAAA | `shop` | IPv6 VPS, если есть | 300 |

Больше ничего не нужно: ни CNAME, ни MX, ни TXT. TTL 300 на время настройки, потом можно поднять.

Три вещи, на которых обычно спотыкаются:

- Caddy выпускает сертификат через ACME HTTP-01, значит **порты 80 и 443 должны быть открыты**, и A-запись должна уже резолвиться до первого старта. Иначе получишь ошибку выпуска и Let's Encrypt временно залимитит.
- Если домен за Cloudflare — на время первого выпуска ставь запись в **DNS-only** (серое облако). С оранжевым облаком HTTP-01 не пройдёт, придётся возиться с DNS-01.
- Если на VPS уже живут другие сервисы, проверь, что 80 и 443 свободны и что исходящий трафик доходит до Let's Encrypt.

**Caddyfile:**

```
shop.example.com {
    handle /api/* {
        reverse_proxy api:3000
    }
    handle {
        root * /srv/web
        try_files {path} /index.html
        file_server
    }
}
```

`docker-compose.yml`: сервисы `db` (postgres:16), `api`, `providers`, `caddy`. Локальный запуск по README — та же команда, без Caddy.

---

## 13. Порядок работ

Одна сессия — один этап, чтобы не жечь контекст.

| Этап | Содержание | Проверка готовности |
|---|---|---|
| 0 | `git init`, скелет репозитория, docker-compose, миграции, сид | `db:reset` отрабатывает, `GET /api/products` отдаёт 12 товаров |
| 1 | Заказы, вебхук, воркер, заглушки поставщиков, страница статуса | сквозной флоу: купил → оплатил → получил код |
| 2 | Тесты гонок, доводка идемпотентности | `test:races` зелёный на всех пяти кейсах |
| 3 | Восстановление, админка, QA-панель | сценарии 4 и 5 воспроизводятся кликами |
| 4 | Промокоды | лимит держится под параллельной нагрузкой |
| 5 | Вёрстка витрины по макету, пять точек интерактива | визуально близко к `1:4` |
| 6 | Деплой на VPS, README, ответы на пять вопросов заказчика | живая ссылка открывается по HTTPS |

Порядок намеренно такой: бэкенд вперёд, вёрстка после. Если время кончится — недоделанная вёрстка стоит дешевле, чем недоделанные гарантии.

Время считаем по таймстемпам коммитов, в ответе указываем фактическое.

---

## 14. Что осознанно не делаем

- Redis, BullMQ, RabbitMQ — поллер живёт в том же процессе
- пользовательскую авторизацию — только статический токен для админки
- DI-контейнеры, репозитории, гексагональную архитектуру
- экспоненциальный бэкофф с джиттером — фиксированные интервалы
- метрики, трейсинг, структурные логи — `console.log` с `order_id`
- проверку подписи вебхука — задание её снимает
- пересчёт валют — переключатель только меняет активное состояние
- юнит-тесты на каждый модуль
- отзывы, футер, мобильную и тёмную версии

**Опционально, решение отложено:** анонимная кука с random id для списка «мои заказы» без логина. Строк двадцать, приложение выглядит цельнее. По умолчанию выключено.

---

## 15. Что отдаём в ответе

Задание требует пять пунктов:

1. Ссылка на живую версию — поддомен на VPS
2. Исходники — репозиторий на GitHub
3. Как воспроизвести проверку гонок — `npm run test:races` плюс кликабельная QA-панель
4. Пара строк про однократную выдачу — три констрейнта из раздела 4 и детерминированный `request_id`
5. Фактически потраченное время
