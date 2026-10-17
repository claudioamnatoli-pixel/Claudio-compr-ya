// La carga masiva, de punta a punta, contra un servidor en 127.0.0.1:3115.
//
//   npm i -D playwright
//   DATABASE_URL=… NODE_ENV=production PORT=3115 npm run start &
//   node pruebas/importar-catalogo.mjs
import { chromium } from 'playwright';
import { readdirSync, existsSync } from 'fs';

const raiz = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
const dir = readdirSync(raiz).filter((d) => d.startsWith('chromium-')).sort().pop();
const exe = `${raiz}/${dir}/chrome-linux/chrome`;
const SITIO = 'http://127.0.0.1:3115';

const nav = await chromium.launch(existsSync(exe) ? { executablePath: exe } : {});
const ctx = await nav.newContext({ viewport: { width: 1280, height: 950 } });
const p = await ctx.newPage();
const errores = []; p.on('pageerror', (e) => errores.push(String(e)));
let fallos = 0;
const ok = (d, c, x = '') => { console.log(`${c ? '  ok  ' : ' FALLA'} ${d}${x ? ' — ' + x : ''}`); if (!c) fallos++; };

async function entrar(email) {
  await ctx.clearCookies();
  await p.goto(SITIO + '/login', { waitUntil: 'domcontentloaded' });
  await p.fill('input[name="email"]', email);
  await p.fill('input[name="password"]', 'demo1234');
  await p.click('button:has-text("Entrar")');
  await p.waitForURL((u) => !u.pathname.includes('login'), { timeout: 20000 });
}

/**
 * Cuántas filas tiene la tabla del inventario.
 *
 * Se cuentan filas y no se busca un código en el texto: el buscador repite en
 * la página lo que se escribió, así que «¿aparece MAL-001?» da que sí aunque
 * el producto no exista. Contar no se deja engañar.
 */
async function cuantosProductos() {
  await p.goto(SITIO + '/inventario', { waitUntil: 'domcontentloaded' });
  return p.locator('table tbody tr').count();
}

// --- Una vendedora no puede cargar catálogo ------------------------------
await entrar('ana@compr-ya.com.py');
await p.goto(SITIO + '/inventario/importar', { waitUntil: 'domcontentloaded' });
ok('una vendedora no entra a cargar catálogo', new URL(p.url()).pathname !== '/inventario/importar',
  `quedó en ${new URL(p.url()).pathname}`);

await entrar('claudia@compr-ya.com.py');

// --- Una planilla con un error no carga NADA -----------------------------
const antes = await cuantosProductos();
await p.goto(SITIO + '/inventario/importar', { waitUntil: 'domcontentloaded' });
await p.fill('textarea[name="planilla"]', [
  'MAL-001\tBuena\tPrueba\t10.000\t25.000\t5\t2',
  'MAL-002\tMala\tPrueba\t30.000\t10.000\t5\t2',   // precio menor que el costo
].join('\n'));
await p.click('button:has-text("Cargar catálogo")');
await p.waitForTimeout(1500);
const avisoError = ((await p.textContent('body')) ?? '').replace(/\s+/g, ' ');
ok('con una línea mala no carga nada', avisoError.includes('No se cargó nada'),
  (avisoError.match(/No se cargó nada[^.]*\./) ?? [''])[0]);
ok('y dice en qué línea está el problema', /Línea 2/.test(avisoError),
  (avisoError.match(/Línea \d+: [^.]*\./) ?? [''])[0].slice(0, 70));

const despuesDelError = await cuantosProductos();
ok('ni siquiera la línea buena entró', despuesDelError === antes,
  `${antes} antes, ${despuesDelError} después`);

// --- 3.000 productos de verdad -------------------------------------------
const CUANTOS = 3000;
const planilla = ['SKU\tNombre\tCategoría\tCosto\tPrecio\tStock\tStock mínimo']
  .concat(Array.from({ length: CUANTOS }, (_, i) =>
    `MAS-${String(i).padStart(4, '0')}\tProducto masivo ${i}\tCosmética\t18.000\t35.000\t10\t3`))
  .join('\n');

await p.goto(SITIO + '/inventario/importar', { waitUntil: 'domcontentloaded' });
await p.fill('textarea[name="planilla"]', planilla);
const arranque = Date.now();
await p.click('button:has-text("Cargar catálogo")');
await p.waitForSelector('text=/Listo: \\d+ productos nuevos/', { timeout: 180000 });
const tardo = Math.round((Date.now() - arranque) / 1000);
const aviso = ((await p.textContent('body')) ?? '').replace(/\s+/g, ' ');
ok(`carga ${CUANTOS} productos de una vez`, aviso.includes(`${CUANTOS} productos nuevos`),
  (aviso.match(/Listo:[^.]*\./) ?? [''])[0]);
ok('y tarda algo razonable', tardo < 120, `${tardo} s`);
ok('sin errores de JavaScript', errores.length === 0, errores[0] || '');

// La regla del proyecto: el stock nunca entra sin su historial. Cada producto
// cargado con existencias tiene que haber dejado su movimiento.
await p.goto(SITIO + '/inventario', { waitUntil: 'domcontentloaded' });
const unoCargado = p.locator('tr', { hasText: 'Producto masivo 7' }).first();
ok('los productos cargados aparecen en el inventario', (await unoCargado.count()) > 0);
const filaTexto = ((await unoCargado.textContent()) ?? '').replace(/\s+/g, ' ');
ok('con su stock puesto', /10\s*u\./.test(filaTexto), filaTexto.slice(0, 90));

// --- Volver a cargar la misma planilla no duplica ------------------------
await p.goto(SITIO + '/inventario/importar', { waitUntil: 'domcontentloaded' });
await p.fill('textarea[name="planilla"]', planilla);
await p.click('button:has-text("Cargar catálogo")');
await p.waitForSelector('text=/Listo:/', { timeout: 180000 });
const segunda = ((await p.textContent('body')) ?? '').replace(/\s+/g, ' ');
ok('cargarla otra vez no duplica: actualiza', segunda.includes(`${CUANTOS} actualizados`),
  (segunda.match(/Listo:[^.]*\./) ?? [''])[0]);
ok('y avisa que no tocó el stock', segunda.includes('no se les tocó el stock'));

await nav.close();
console.log(fallos === 0 ? '\nLa carga masiva funciona.' : `\n${fallos} fallo(s).`);
process.exit(fallos === 0 ? 0 : 1);
