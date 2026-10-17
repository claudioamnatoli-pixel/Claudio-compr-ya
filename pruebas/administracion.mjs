// Circuito de administración, contabilidad y suministros, contra un servidor
// ya levantado en 127.0.0.1:3114 con una base sembrada.
//
//   npm i -D playwright
//   DATABASE_URL=… NODE_ENV=production PORT=3112 npm run start &
//   node pruebas/administracion.mjs
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

/** Costo y stock de un producto, leídos de la tabla de inventario. */
async function filaInventario(nombre) {
  await p.goto(SITIO + '/inventario', { waitUntil: 'domcontentloaded' });
  const texto = ((await p.locator('tr', { hasText: nombre }).first().textContent()) ?? '')
    .replace(/\s+/g, ' ');
  return {
    costo: gs((texto.match(/Gs\.\s*([\d.]+)/) ?? [])[1]),
    stock: Number((texto.match(/(\d+)\s*u\./) ?? [])[1] ?? -1),
  };
}

async function entrar(email) {
  await ctx.clearCookies();
  await p.goto(SITIO + '/login', { waitUntil: 'domcontentloaded' });
  await p.fill('input[name="email"]', email);
  await p.fill('input[name="password"]', 'demo1234');
  await p.click('button:has-text("Entrar")');
  await p.waitForURL((u) => !u.pathname.includes('login'), { timeout: 20000 });
}

// --- Permisos: el módulo es sólo de administración -----------------------
await entrar('ana@compr-ya.com.py');
for (const ruta of ['/compras', '/proveedores', '/gastos', '/contabilidad']) {
  const res = await p.goto(SITIO + ruta, { waitUntil: 'domcontentloaded' });
  const quedo = new URL(p.url()).pathname;
  ok(`una vendedora no entra a ${ruta}`, quedo !== ruta, `quedó en ${quedo} (HTTP ${res.status()})`);
}
await entrar('hugo@compr-ya.com.py');
const resAlmacen = await p.goto(SITIO + '/compras', { waitUntil: 'domcontentloaded' });
ok('almacén tampoco ve las compras (llevan el costo)', new URL(p.url()).pathname !== '/compras',
  `quedó en ${new URL(p.url()).pathname} (HTTP ${resAlmacen.status()})`);

// --- El circuito, como administración ------------------------------------
await entrar('claudia@compr-ya.com.py');

await p.goto(SITIO + '/proveedores', { waitUntil: 'domcontentloaded' });
await p.fill('input[name="nombre"]', 'Importadora del Este');
await p.fill('input[name="ruc"]', '80012345-6');
await p.click('button:has-text("Dar de alta")');
await p.waitForTimeout(900);
ok('se da de alta un proveedor', (await p.textContent('body')).includes('Importadora del Este'));

// Stock y costo antes de comprar.
await p.goto(SITIO + '/inventario', { waitUntil: 'domcontentloaded' });
const antes = await p.evaluate(() => {
  const fila = [...document.querySelectorAll('tr')].find((t) => t.textContent.includes('SKU'));
  return document.body.textContent.length;
});

await p.goto(SITIO + '/compras', { waitUntil: 'domcontentloaded' });
await p.selectOption('select[name="proveedorId"]', { label: 'Importadora del Este' });
await p.fill('input[name="factura"]', '001-001-0009999');
const primerProducto = await p.evaluate(() => {
  const s = document.querySelectorAll('select[name="productoId"]')[0];
  return { value: s.options[1].value, label: s.options[1].text };
});
await p.selectOption('select[name="productoId"] >> nth=0', primerProducto.value);
await p.fill('input[name="cantidad"] >> nth=0', '12');
// El costo nuevo se deriva del que el producto tiene ahora, para que siempre
// sea distinto: con un número fijo, repetir la prueba sobre la misma base la
// haría pasar sin que nada cambiara.
const previo = await filaInventario(primerProducto.label);
const stockPrevio = previo.stock;
const COSTO_NUEVO = previo.costo + 7000;
await p.goto(SITIO + '/compras', { waitUntil: 'domcontentloaded' });
await p.selectOption('select[name="proveedorId"]', { label: 'Importadora del Este' });
await p.fill('input[name="factura"]', '001-001-0009999');
await p.selectOption('select[name="productoId"] >> nth=0', primerProducto.value);
await p.fill('input[name="cantidad"] >> nth=0', '12');
await p.fill('input[name="costoUnitario"] >> nth=0', String(COSTO_NUEVO));
await p.click('button:has-text("Registrar borrador")');
await p.waitForTimeout(1500);

// ¿La lista se refresca sola tras la acción, o hay que recargar? Se informa,
// no se exige: es el comportamiento que ya tienen las demás pantallas.
const sinRecargar = await p.textContent('body');
console.log(
  `  nota  la lista ${/CMP-\d{4}/.test(sinRecargar) ? 'se refresca sola' : 'sólo se ve al recargar'}`,
);
await p.goto(SITIO + '/compras', { waitUntil: 'domcontentloaded' });
const trasCrear = await p.textContent('body');
ok('la compra nace como borrador', /CMP-\d{4}/.test(trasCrear) && trasCrear.includes('Borrador'),
  (trasCrear.match(/CMP-\d{4}/) ?? [''])[0]);
const totalEsperado = (12 * COSTO_NUEVO).toLocaleString('es-PY');
ok(`y suma el total de las líneas (12 × ${COSTO_NUEVO.toLocaleString('es-PY')})`,
  trasCrear.includes(totalEsperado), totalEsperado);

// El borrador no toca el inventario: el stock entra recién al recibir.
const enBorrador = await filaInventario(primerProducto.label);
ok('el borrador no movió el stock', enBorrador.stock === stockPrevio,
  `${stockPrevio} → ${enBorrador.stock}`);
ok('ni tocó el costo', enBorrador.costo !== COSTO_NUEVO, `costo ${enBorrador.costo}`);
await p.goto(SITIO + '/compras', { waitUntil: 'domcontentloaded' });

// Recibir: entra el stock y cambia el costo.
p.on('dialog', (d) => d.accept());
await p.click('button:has-text("Recibida")');
await p.waitForTimeout(2000);
const trasRecibir = await p.textContent('body');
ok('al recibirla queda como recibida', trasRecibir.includes('Recibida') || trasRecibir.includes('Pagada'));

const recibida = await filaInventario(primerProducto.label);
ok('al recibir entran las 12 unidades', recibida.stock === stockPrevio + 12,
  `${stockPrevio} → ${recibida.stock}`);
ok('y el costo pasa a ser el pagado en esta compra', recibida.costo === COSTO_NUEVO,
  `costo ${recibida.costo}`);

// --- Gastos ---------------------------------------------------------------
await p.goto(SITIO + '/gastos', { waitUntil: 'domcontentloaded' });
const gastadoAntes = gs((((await p.textContent('body')) ?? '').match(/Gastado este mes[^0-9]*([\d.]+)/) ?? [])[1]);
await p.selectOption('select[name="categoria"]', 'ALQUILER');
await p.fill('input[name="descripcion"]', 'Alquiler del depósito');
await p.fill('input[name="monto"]', '2500000');
await p.click('button:has-text("Registrar gasto")');
await p.waitForTimeout(1200);
// Se relee la pantalla: el indicador del mes puede ir un paso atrás del envío.
await p.goto(SITIO + '/gastos', { waitUntil: 'domcontentloaded' });
const trasGasto = await p.textContent('body');
ok('se registra un gasto', trasGasto.includes('Alquiler del depósito'));
const gastadoDespues = gs((trasGasto.match(/Gastado este mes[^0-9]*([\d.]+)/) ?? [])[1]);
ok('y suma exactamente ese importe al mes', gastadoDespues - gastadoAntes === 2500000,
  `${gastadoAntes} → ${gastadoDespues}`);

// --- Contabilidad ---------------------------------------------------------
await p.goto(SITIO + '/contabilidad', { waitUntil: 'domcontentloaded' });
const cont = await p.textContent('body');
ok('el estado de resultados abre', cont.includes('Estado de resultados'));
const gastosEnBalance = gs((cont.match(/alquiler, servicios, banco[^0-9]*([\d.]+)/) ?? [])[1]);
ok('el total de gastos del balance coincide con la pantalla de gastos',
  gastosEnBalance === gastadoDespues, `balance ${gastosEnBalance} vs gastos ${gastadoDespues}`);
ok('distingue resultado de caja', cont.includes('Movimiento de caja') && cont.includes('Caja'));
ok('no cuenta las campañas como gasto suelto',
  !/Gastos por categoría[\s\S]{0,400}Campa/.test(cont));
ok('la reposición pega en la caja, no en el resultado',
  /Mercadería repuesta/.test(cont) && /Costo de la mercadería vendida/.test(cont));

ok('sin errores de JavaScript en todo el circuito', errores.length === 0, errores[0] || '');
await nav.close();
console.log(fallos === 0 ? '\nEl módulo de administración funciona.' : `\n${fallos} fallo(s).`);
process.exit(fallos === 0 ? 0 : 1);
