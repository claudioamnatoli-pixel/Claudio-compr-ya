// Las pantallas con un catálogo de verdad (3.000 productos), contra un
// servidor en 127.0.0.1:3116.
import { chromium } from 'playwright';
import { readdirSync, existsSync } from 'fs';

const raiz = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
const dir = readdirSync(raiz).filter((d) => d.startsWith('chromium-')).sort().pop();
const exe = `${raiz}/${dir}/chrome-linux/chrome`;
const SITIO = 'http://127.0.0.1:3116';

const nav = await chromium.launch(existsSync(exe) ? { executablePath: exe } : {});
const ctx = await nav.newContext({ viewport: { width: 1280, height: 950 } });
const p = await ctx.newPage();
const errores = []; p.on('pageerror', (e) => errores.push(String(e)));
let fallos = 0;
const ok = (d, c, x = '') => { console.log(`${c ? '  ok  ' : ' FALLA'} ${d}${x ? ' — ' + x : ''}`); if (!c) fallos++; };

await p.goto(SITIO + '/login', { waitUntil: 'domcontentloaded' });
await p.fill('input[name="email"]', 'claudia@compr-ya.com.py');
await p.fill('input[name="password"]', 'demo1234');
await p.click('button:has-text("Entrar")');
await p.waitForURL((u) => !u.pathname.includes('login'), { timeout: 20000 });

/** Cuánto pesa el HTML de una página y cuántas filas dibuja. */
async function medir(ruta) {
  const arranque = Date.now();
  await p.goto(SITIO + ruta, { waitUntil: 'domcontentloaded' });
  const ms = Date.now() - arranque;
  const bytes = (await p.content()).length;
  const filas = await p.locator('table tbody tr').count();
  const opciones = await p.locator('option').count();
  return { ms, kb: Math.round(bytes / 1024), filas, opciones };
}

// --- Inventario -----------------------------------------------------------
const inv = await medir('/inventario');
ok('el inventario no dibuja las 3.000 filas', inv.filas <= 50, `${inv.filas} filas`);
ok('y la página pesa poco', inv.kb < 400, `${inv.kb} KB en ${inv.ms} ms`);
// El total se lee del indicador y no del cuerpo entero: en textContent las
// cifras de dos tarjetas vecinas quedan pegadas («30.6283.014») y una búsqueda
// suelta se confunde.
const detalleCatalogo = ((await p.locator('text=/productos en catálogo/').first().textContent()) ?? '').trim();
ok('pero los totales siguen contando el catálogo entero',
  detalleCatalogo.startsWith('3.014'), detalleCatalogo);

const cuerpo = await p.textContent('body');
ok('y ofrece pasar de página', cuerpo.includes('Página 1 de'),
  (cuerpo.match(/Página 1 de \d+/) ?? [''])[0]);

await p.click('a:has-text("Siguiente")');
await p.waitForURL(/pagina=2/, { timeout: 15000 });
ok('la segunda página trae otros productos', (await p.textContent('body')).includes('Página 2 de'));

// --- Los formularios ya no llevan el catálogo dentro ----------------------
for (const [ruta, nombre] of [['/compras', 'compras'], ['/pedidos/nuevo', 'armar pedido'], ['/leads/nuevo', 'nuevo prospecto']]) {
  const m = await medir(ruta);
  ok(`${nombre}: sin desplegable gigante`, m.opciones < 100, `${m.opciones} opciones`);
  ok(`${nombre}: página liviana`, m.kb < 400, `${m.kb} KB en ${m.ms} ms`);
}

// --- El buscador encuentra de verdad --------------------------------------
await p.goto(SITIO + '/compras', { waitUntil: 'domcontentloaded' });
await p.fill('input[role="combobox"] >> nth=0', 'masivo 1777');
await p.locator('ul[role="listbox"] li').first().waitFor({ timeout: 15000 });
const opcion = p.locator('[role="option"]').first();
ok('el buscador encuentra un producto entre 3.000', (await opcion.count()) > 0,
  ((await opcion.textContent()) ?? '').replace(/\s+/g, ' ').slice(0, 60));
await opcion.click();
ok('y al elegirlo queda puesto', (await p.inputValue('input[name="productoId"]')) !== '',
  await p.inputValue('input[name="productoId"]'));

ok('sin errores de JavaScript', errores.length === 0, errores[0] || '');
await nav.close();
console.log(fallos === 0 ? '\nLas pantallas aguantan 3.000 productos.' : `\n${fallos} fallo(s).`);
process.exit(fallos === 0 ? 0 : 1);
