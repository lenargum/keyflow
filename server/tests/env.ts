/** Единые адреса и параметры для тестового прогона. */
export const TEST_DB_NAME = 'keyflow_test';
export const ADMIN_DB_URL = 'postgres://keyflow:keyflow@localhost:5433/postgres';
export const TEST_DB_URL = `postgres://keyflow:keyflow@localhost:5433/${TEST_DB_NAME}`;

export const API_PORT = 3100;
export const PROVIDERS_PORT = 4101;
export const API = `http://127.0.0.1:${API_PORT}`;
export const PROV = `http://127.0.0.1:${PROVIDERS_PORT}`;

/** Клиентский таймаут меньше зависания заглушки — иначе ловушка не сработает. */
export const PROVIDER_TIMEOUT_MS = 800;
export const PROVIDER_HANG_MS = 2000;

/** Ретраи ускорены, чтобы восстановление проверялось за секунды, а не за полминуты. */
export const RETRY_OUT_OF_STOCK_MS = 1000;
export const RETRY_DELIVERY_FAILED_MS = 500;
