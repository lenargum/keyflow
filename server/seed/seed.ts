import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, query } from '../src/db.js';

const seedDir = dirname(fileURLToPath(import.meta.url));

type Product = { sku: string; name: string; type: string; price_rub: number; image: string };
type Promocode = { code: string; type: string; value: number; max_uses: number };

async function readJson<T>(name: string): Promise<T> {
  return JSON.parse(await readFile(join(seedDir, name), 'utf8')) as T;
}

async function main(): Promise<void> {
  const products = await readJson<Product[]>('products.json');
  const promocodes = await readJson<Promocode[]>('promocodes.json');

  await query(
    `INSERT INTO products (sku, name, type, price_rub, image)
     SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::int[], $5::text[])
     ON CONFLICT (sku) DO UPDATE
       SET name = EXCLUDED.name,
           type = EXCLUDED.type,
           price_rub = EXCLUDED.price_rub,
           image = EXCLUDED.image`,
    [
      products.map((p) => p.sku),
      products.map((p) => p.name),
      products.map((p) => p.type),
      products.map((p) => p.price_rub),
      products.map((p) => p.image),
    ],
  );

  // used_count намеренно не трогаем: пересев не должен обнулять расход промокода.
  await query(
    `INSERT INTO promocodes (code, type, value, max_uses)
     SELECT * FROM unnest($1::text[], $2::text[], $3::int[], $4::int[])
     ON CONFLICT (code) DO UPDATE
       SET type = EXCLUDED.type,
           value = EXCLUDED.value,
           max_uses = EXCLUDED.max_uses`,
    [
      promocodes.map((p) => p.code),
      promocodes.map((p) => p.type),
      promocodes.map((p) => p.value),
      promocodes.map((p) => p.max_uses),
    ],
  );

  console.log(`[seed] товаров: ${products.length}, промокодов: ${promocodes.length}`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
