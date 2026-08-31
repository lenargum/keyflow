/** Единые адреса и параметры для тестового прогона. */
export const TEST_DB_NAME = 'keyflow_test';

// Локально Postgres поднимается на 5433 (5432 часто уже занят), в CI — на 5432.
// Базу тесты создают сами, поэтому в переменной только адрес сервера.
const PG_SERVER = process.env.TEST_PG_URL ?? 'postgres://keyflow:keyflow@localhost:5433';

export const ADMIN_DB_URL = `${PG_SERVER}/postgres`;
export const TEST_DB_URL = `${PG_SERVER}/${TEST_DB_NAME}`;

export const API_PORT = 3100;
export const PROVIDERS_PORT = 4101;
export const ADMIN_TOKEN = 'test-admin-token';
export const API = `http://127.0.0.1:${API_PORT}`;
export const PROV = `http://127.0.0.1:${PROVIDERS_PORT}`;

/** Клиентский таймаут меньше зависания заглушки — иначе ловушка не сработает. */
export const PROVIDER_TIMEOUT_MS = 800;
export const PROVIDER_HANG_MS = 2000;

/** Ретраи ускорены, чтобы восстановление проверялось за секунды, а не за полминуты. */
export const RETRY_OUT_OF_STOCK_MS = 1000;
/** Меньше боевых пяти — чтобы заказ парковался за секунды и тест не тянулся. */
export const MAX_DELIVERY_ATTEMPTS = 3;
export const RETRY_DELIVERY_FAILED_MS = 500;
