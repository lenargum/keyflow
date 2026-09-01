import { useCallback, useEffect, useState } from 'react';
import { admin, type ProviderState } from '../api.js';
import { describeError, useAction } from '../useAction.js';

/**
 * Управление заглушками поставщиков: доли ошибок и зависаний, долив и
 * опустошение пула. Нужно, чтобы сценарии приёмки воспроизводились кликами.
 */
export function ProviderControls() {
  const [providers, setProviders] = useState<ProviderState[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { note, failed, run } = useAction();

  const refresh = useCallback(async () => {
    try {
      setProviders((await admin.providers()).providers);
      setError(null);
    } catch (err) {
      setError(describeError(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(refresh, 2000);
    return () => clearInterval(timer);
  }, [refresh]);

  async function change(provider: string, field: 'errorRate' | 'timeoutRate', value: number) {
    const previous = providers;
    // Двигаем ползунок сразу, но откатываем, если сервер не принял: иначе
    // ползунок показывал бы долю, которой у поставщика нет.
    setProviders((prev) =>
      prev.map((p) => (p.provider === provider ? { ...p, [field]: value } : p)),
    );
    try {
      await admin.configure({ [provider]: { [field]: value } });
    } catch (err) {
      setProviders(previous);
      setError(describeError(err));
    }
  }

  function act(label: string, fn: () => Promise<unknown>) {
    void run(label, async () => {
      await fn();
      void refresh();
    });
  }

  if (error && providers.length === 0) {
    return <div className="text-sm text-red-600">Поставщики недоступны: {error}</div>;
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
      {providers.map((p) => (
        <div key={p.provider} className="rounded border border-neutral-200 p-3">
          <div className="flex items-baseline justify-between">
            <div className="font-semibold uppercase">Поставщик {p.provider}</div>
            <div className="text-sm text-neutral-500">
              в пуле {p.remaining}, выдано {p.issued}
            </div>
          </div>

          <Slider
            label="доля ошибок"
            value={p.errorRate}
            onChange={(v) => change(p.provider, 'errorRate', v)}
          />
          <Slider
            label="доля зависаний"
            value={p.timeoutRate}
            onChange={(v) => change(p.provider, 'timeoutRate', v)}
          />

          <div className="mt-2 flex gap-2">
            <button
              className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100"
              onClick={() => act(`пул ${p.provider} опустошён`, () => admin.drain(p.provider))}
            >
              Опустошить пул
            </button>
            <button
              className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100"
              onClick={() => act(`в пул ${p.provider} долито 5`, () => admin.refill(p.provider, 5))}
            >
              Долить 5 ключей
            </button>
          </div>
        </div>
      ))}
      </div>

      {note && (
        <div className={`mt-2 text-sm ${failed ? 'font-semibold text-red-600' : 'text-neutral-600'}`}>
          {note}
        </div>
      )}
    </>
  );
}

function Slider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="mt-2 block text-xs text-neutral-600">
      <span>
        {label}: {Math.round(value * 100)}%
      </span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full"
      />
    </label>
  );
}
