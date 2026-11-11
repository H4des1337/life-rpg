import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', 'migrations');
const dest = join(here, '..', 'dist', 'migrations');
mkdirSync(dest, { recursive: true });
const { readdirSync } = await import('node:fs');
for (const file of readdirSync(src)) {
  if (file.endsWith('.sql')) copyFileSync(join(src, file), join(dest, file));
}
if (!existsSync(dest)) throw new Error('failed to copy migrations');
console.log('Migrations copied to dist/migrations');
