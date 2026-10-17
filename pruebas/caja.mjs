// Caja y rendiciones, contra un servidor ya levantado en 127.0.0.1:3114 con
// una base sembrada.
//
//   npm i -D playwright
//   DATABASE_URL=… NODE_ENV=production PORT=3114 npm run start &
//   node pruebas/caja.mjs
import { chromium } from 'playwright';
import { readdirSync, existsSync } from 'fs';

const raiz = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
const dir = readdirSync(raiz).filter((d) => d.startsWith('chromium-')).sort().pop();
const exe = `${raiz}/${dir}/chrome-linux/chrome`;
const SITIO = 'http://127.0.0.1:3114';

const nav = await chromium.launch(existsSync(exe) ? { executablePath: exe } : {});
const ctx = await nav.newContext({ viewport: { width: 1280, height: 950 } });
const p = await ctx.newPage();
const errores = []; p.on('pageerror', (e) => errores.push(String(e)));
let fallos = 0;
const ok = (d, c, x = '') => { console.log(`${c ? '  ok  ' : ' FALLA'} ${d}${x ? ' — ' + x : ''}`); if (!c) fallos++; };
const gs = (t) => Number(String(t).replace(/[^\d]/g, '')) || 0;

async function entrar(email) {
  await ctx.clearCookies();
  await p.goto(SITIO + '/login', { waitUntil: 'domcontentloaded' });
  await p.fill('input[name="email"]', email);
  await p.fill('input[name="password"]', 'demo1234');
  await p.click('button:has-text("Entrar")');
  await p.waitForURL((u) => !u.pathname.includes('login'), { timeout: 20000 });
}

/**
 * Lo que la tabla de pendientes dice que alguien debe traer, o 0 si no figura.
 *
 * Se acota a esa tabla a propósito: la de cierres anteriores también nombra al
 * repartidor y lleva importes, y leer la primera fila que coincida devolvía el
 * faltante del cierre en lugar de lo pendiente.
 */
async function debeTraer(nombre) {
  await p.goto(SITIO + '/caja', { waitUntil: 'domcontentloaded' });
  const tabla = p.locator('table', { has: p.locator('th:has-text("Debe traer")') });
  if ((await tabla.count()) === 0) return 0;
  const fila = tabla.locator('tr', { hasText: nombre });
  if ((await fila.count()) === 0) return 0;
  const t = ((await fila.first().textContent()) ?? '').replace(/\s+/g, ' ');
  return gs((t.match(/Gs\.\s*([\d.]+)/) ?? [])[1]);
}

// --- El reparto no ve la caja -------------------------------------------
await entrar('marco@compr-ya.com.py');
await p.goto(SITIO + '/caja', { waitUntil: 'domcontentloaded' });
ok('un repartidor no entra a la caja', new URL(p.url()).pathname !== '/caja',
  `quedó en ${new URL(p.url()).pathname}`);

// --- Administración cierra una caja --------------------------------------
await entrar('claudia@compr-ya.com.py');
await p.goto(SITIO + '/caja', { waitUntil: 'domcontentloaded' });
const pendientesAntes = await p.locator('table', { has: p.locator('th:has-text("Debe traer")') })
  .locator('tbody tr').count();
ok('la caja lista a quienes tienen plata sin rendir', pendientesAntes > 0,
  `${pendientesAntes} repartidores`);

// Se elige al primero de la lista para cerrarle la caja.
const quien = await p.evaluate(() => {
  const s = document.querySelector('select[name="repartidorId"]');
  return s && s.options.length > 1 ? { value: s.options[1].value, texto: s.options[1].text } : null;
});
ok('hay alguien con plata pendiente', quien !== null, quien?.texto ?? '');
const nombre = (quien?.texto ?? '').split(' — ')[0];
const esperado = gs((quien?.texto ?? '').split('debe')[1]);
ok('la lista dice cuánto debe traer', esperado > 0, `${nombre}: ${esperado}`);

// Entrega 100.000 menos: tiene que quedar asentado como faltante.
const FALTANTE = 100000;
await p.selectOption('select[name="repartidorId"]', quien.value);
await p.fill('input[name="declarado"]', String(esperado - FALTANTE));
await p.fill('textarea[name="notas"]', 'Pagó un flete con la plata del día.');
await p.click('button:has-text("Registrar rendición")');
await p.waitForTimeout(1500);

await p.goto(SITIO + '/caja', { waitUntil: 'domcontentloaded' });
const trasCerrar = await p.textContent('body');
ok('el cierre queda registrado con su número', /REN-\d{4}/.test(trasCerrar),
  (trasCerrar.match(/REN-\d{4}/) ?? [''])[0]);
ok('y marca el faltante exacto', trasCerrar.includes('Faltó') && trasCerrar.includes('100.000'));

// Lo que importa: esa plata ya no figura como pendiente.
ok('el repartidor deja de deber lo rendido', (await debeTraer(nombre)) === 0,
  `sigue debiendo ${await debeTraer(nombre)}`);
const pendientesDespues = await p.locator('table', { has: p.locator('th:has-text("Debe traer")') })
  .locator('tbody tr').count();
ok('sale de la lista de pendientes', pendientesDespues === pendientesAntes - 1,
  `${pendientesAntes} → ${pendientesDespues}`);

// Y, lo que más importa: no tocó la plata de los demás.
const otros = await p.locator('table', { has: p.locator('th:has-text("Debe traer")') })
  .locator('tbody tr').allTextContents();
ok('la plata de los demás queda intacta',
  otros.every((t) => !t.includes(nombre)) && otros.length === pendientesAntes - 1,
  otros.map((t) => t.replace(/\s+/g, ' ').trim()).join(' | ') || 'nadie más debe');

// --- No se puede rendir dos veces la misma plata -------------------------
await p.goto(SITIO + '/caja', { waitUntil: 'domcontentloaded' });
const sigueOfrecido = await p.evaluate((v) => {
  const s = document.querySelector('select[name="repartidorId"]');
  return s ? [...s.options].some((o) => o.value === v) : false;
}, quien.value);
ok('ya no se lo puede volver a rendir', !sigueOfrecido);

// --- La contabilidad distingue cobrado de rendido ------------------------
await p.goto(SITIO + '/contabilidad', { waitUntil: 'domcontentloaded' });
const cont = await p.textContent('body');
ok('la contabilidad muestra lo rendido', cont.includes('Rendido por los repartidores'));
ok('y lo que sigue en la calle', cont.includes('Todavía en la calle'));
ok('y el faltante de caja', cont.includes('Faltantes de caja'));

ok('sin errores de JavaScript', errores.length === 0, errores[0] || '');
await nav.close();
console.log(fallos === 0 ? '\nLa caja funciona.' : `\n${fallos} fallo(s).`);
process.exit(fallos === 0 ? 0 : 1);
