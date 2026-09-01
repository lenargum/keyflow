-- Двойной клик «Купить» — такая же гонка, как повторный вебхук, и закрывается
-- тем же приёмом: ключ идемпотентности с UNIQUE, а не проверкой в коде.
--
-- Колонка nullable: заказ можно создать и без ключа (например, из QA-ручки),
-- а UNIQUE в Postgres не мешает нескольким NULL.
ALTER TABLE orders ADD COLUMN idempotency_key TEXT;

CREATE UNIQUE INDEX orders_idempotency_key_idx ON orders (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
