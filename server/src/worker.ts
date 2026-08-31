import { config } from './config.js';
import { claimOrder, deliver } from './services/delivery.js';
import { applyEvent, claimEvent } from './services/payments.js';

let running = false;

/** Цикл крутится, пока есть работа, потом засыпает на интервал поллинга. */
async function loop(name: string, intervalMs: number, step: () => Promise<boolean>): Promise<void> {
  while (running) {
    let worked = false;
    try {
      worked = await step();
    } catch (err) {
      console.error(`[worker:${name}]`, err);
    }
    if (!worked) await new Promise((r) => setTimeout(r, intervalMs));
  }
}

/** Цикл 1: payment_events -> статус заказа. */
async function paymentsStep(): Promise<boolean> {
  const event = await claimEvent();
  if (!event) return false;
  const changed = await applyEvent(event);
  console.log(
    `[worker:payments] ${event.event_id} ${event.order_id} ${event.status}` +
      (changed ? ' -> применено' : ' -> без изменений'),
  );
  return true;
}

/** Цикл 2: оплаченный заказ -> код от поставщика. */
async function deliveryStep(): Promise<boolean> {
  const order = await claimOrder();
  if (!order) return false;
  await deliver(order);
  return true;
}

export function startWorker(): void {
  if (running) return;
  running = true;
  void loop('payments', config.paymentsPollMs, paymentsStep);
  void loop('delivery', config.deliveryPollMs, deliveryStep);
  console.log('[worker] запущен: два цикла-поллера');
}

export function stopWorker(): void {
  running = false;
}
