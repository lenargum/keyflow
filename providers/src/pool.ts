/**
 * Пул кодов одного поставщика.
 *
 * Ключевое требование контракта: повтор с тем же request_id обязан вернуть
 * ТОТ ЖЕ код. Поэтому владелец соответствия request_id -> code — поставщик,
 * а не клиент. Хранится в памяти процесса, как и положено заглушке.
 */
export class ProviderPool {
  readonly name: string;
  private available: string[];
  private readonly byRequest = new Map<string, string>();

  errorRate = 0;
  timeoutRate = 0;
  hangMs = 10_000;

  constructor(name: string, keys: string[]) {
    this.name = name;
    this.available = [...keys];
  }

  /** Уже выданный по этому request_id код, если он есть. */
  lookup(requestId: string): string | undefined {
    return this.byRequest.get(requestId);
  }

  /**
   * Забрать код под request_id. Повтор возвращает тот же код и НЕ тратит пул.
   * null — пул пуст.
   */
  take(requestId: string): string | null {
    const existing = this.byRequest.get(requestId);
    if (existing !== undefined) return existing;

    const code = this.available.shift();
    if (code === undefined) return null;

    this.byRequest.set(requestId, code);
    return code;
  }

  refill(codes: string[]): number {
    this.available.push(...codes);
    return this.available.length;
  }

  /** Вернуть пул в исходное состояние: коды на месте, история выдач забыта. */
  reset(keys: string[]): void {
    this.available = [...keys];
    this.byRequest.clear();
    this.errorRate = 0;
    this.timeoutRate = 0;
  }

  /** Опустошить пул — сценарий приёмки №4. */
  drain(): number {
    const n = this.available.length;
    this.available = [];
    return n;
  }

  state() {
    return {
      provider: this.name,
      remaining: this.available.length,
      issued: this.byRequest.size,
      errorRate: this.errorRate,
      timeoutRate: this.timeoutRate,
      hangMs: this.hangMs,
      issuedCodes: [...this.byRequest.values()],
    };
  }
}
