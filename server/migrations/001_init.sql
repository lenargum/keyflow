-- Порядок создания важен из-за внешних ключей:
-- products, promocodes -> orders -> payment_events, issuances.

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

-- частичный индекс под выборку воркера выдачи
CREATE INDEX orders_worker_idx ON orders (next_attempt_at)
  WHERE status IN ('paid','out_of_stock','delivery_failed');

-- FK на orders намеренно НЕТ: событие может прийти раньше заказа.
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
