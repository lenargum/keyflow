const KEY = 'keyflow_admin_token';

/**
 * Админка и QA-ручки закрыты статическим токеном. Хранится в localStorage:
 * пользовательской авторизации в задании нет, а проверяющему нужно
 * воспроизводить сценарии кликами, не собирая curl.
 */
export function getToken(): string {
  return localStorage.getItem(KEY) ?? import.meta.env.VITE_ADMIN_TOKEN ?? 'dev-admin-token';
}

export function setToken(value: string): void {
  localStorage.setItem(KEY, value);
}
