// Gastos fijos, contra un servidor ya levantado en 127.0.0.1:3116 con una base
// PostgreSQL sembrada.
//
//   npm i -D playwright
//   DATABASE_URL=… NODE_ENV=production PORT=3116 npm run start &
//   node pruebas/gastos-fijos-pantalla.mjs
//
// Dos cosas que esta batería comprueba y conviene no perder:
//
// - **Generar dos veces el mismo mes no duplica nada.** Sin eso, dos clics
//   cargan el alquiler dos veces y el resultado del mes miente sin que nadie
//   sepa por qué.
// - **El mismo gasto fijo no entra dos veces.** Importa más de lo que parece,
//   porque la confirmación en pantalla de los formularios falla de forma
//   intermitente (el dato se guarda y la pantalla no acusa recibo), así que
//   quien carga vuelve a tocar el botón creyendo que no entró.
//
// Por lo mismo, acá **nunca se espera el cartel de confirmación**: se recarga
// la página y se mira el estado, que es lo que de verdad importa y lo único
// que no depende de ese fallo intermitente.
//
// Es repetible: el gasto fijo lleva un nombre único por corrida y todo se mide
// por diferencia, así correrla de nuevo sobre la misma base sigue probando algo.
import { chromium } from 'playwright';
import { readdirSync, existsSync } from 'fs';

const raiz = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
const dir = readdirSync(raiz).filter((d) => d.startsWith('chromium-')).sort().pop();
const exe = `${raiz}/${dir}/chrome-linux/chrome`;
const SITIO = 'http://127.0.0.1:3116';

const nav = await chromium.launch(existsSync(exe) ? { executablePath: exe } : {});
const ctx = await nav.newContext({ viewport: { width: 1280, height: 1000 } });
const p = await ctx.newPage();
const errores = [];
p.on('pageerror', (e) => errores.push(String(e)));
let fallos = 0;
const ok = (d, c, x = '') => {
  console.log(`${c ? '  ok  ' : ' FALLA'} ${d}${x ? ' — ' + x : ''}`);
  if (!c) fallos++;
};
const gs = (t) => Number(String(t).replace(/[^\d]/g, '')) || 0;

async function entrar(email) {
  await ctx.clearCookies();
  await p.goto(SITIO + '/login', { waitUntil: 'domcontentloaded' });
  await p.fill('input[name="email"]', email);
  await p.fill('input[name="password"]', 'demo1234');
  await p.click('button:has-text("Entrar")');
  await p.waitForURL((u) => !u.pathname.includes('login'), { timeout: 20000 });
}

const FIJOS = SITIO + '/gastos/recurrentes';
const irAFijos = () => p.goto(FIJOS, { waitUntil: 'domcontentloaded' });

/** El importe de un indicador, acotado a su tarjeta. */
async function indicador(titulo) {
  const t = await p.locator('div', { has: p.locator(`p:text-is("${titulo}")`) }).last().textContent();
  return gs((String(t).match(/Gs\.\s*([\d.]+)/) ?? [])[1]);
}

const tablaMeses = () => p.locator('table', { has: p.locator('th:has-text("Por generar")') });
const filaDelMes = () => tablaMeses().locator('tbody tr', { hasText: 'mes en curso' });
const tablaFijos = () => p.locator('table', { has: p.locator('th:has-text("Vigencia")') });

const ETIQUETA = `Alquiler de prueba ${Date.now().toString().slice(-6)}`;
const IMPORTE = 10_000_000;

/** Carga el gasto fijo y vuelve a entrar a la pantalla, sin mirar el cartel. */
async function cargarFijo(descripcion, importe) {
  await irAFijos();
  await p.selectOption('select[name="categoria"]', 'ALQUILER');
  await p.fill('input[name="descripcion"]', descripcion);
  await p.fill('input[name="monto"]', String(importe));
  await p.fill('input[name="diaDePago"]', '5');
  await p.click('button:has-text("Cargar gasto fijo")');
  await p.waitForTimeout(2500);
  await irAFijos();
}

// --- Quién no entra ------------------------------------------------------
for (const [correo, rol] of [
  ['lidia@compr-ya.com.py', 'un líder'],
  ['hugo@compr-ya.com.py', 'almacén'],
  ['ana@compr-ya.com.py', 'un vendedor'],
]) {
  await entrar(correo);
  await irAFijos();
  ok(`${rol} no entra a los gastos fijos`,
    new URL(p.url()).pathname !== '/gastos/recurrentes',
    `quedó en ${new URL(p.url()).pathname}`);
}

// --- Administración sí ---------------------------------------------------
await entrar('claudia@compr-ya.com.py');
await irAFijos();
ok('administración entra a los gastos fijos',
  new URL(p.url()).pathname === '/gastos/recurrentes', p.url());

// --- La planilla sale de la nómina, no de una copia ----------------------
const filasNomina = p.locator('table', { has: p.locator('th:has-text("Sueldo base")') })
  .locator('tbody tr');
const personas = await filasNomina.count();
ok('la planilla lista a la gente con sueldo cargado', personas > 0, `${personas} personas`);

let brutoSumado = 0;
for (let i = 0; i < personas; i++) {
  const t = (await filasNomina.nth(i).textContent()) ?? '';
  brutoSumado += gs((t.match(/Gs\.\s*([\d.]+)/) ?? [])[1]);
}
const resumen = p.locator('dl').filter({ hasText: 'Sueldos brutos' });
const leerResumen = async (clave) => {
  const t = (await resumen.locator('div', { has: p.locator(`dt:text-is("${clave}")`) })
    .first().textContent()) ?? '';
  return gs((t.match(/Gs\.\s*([\d.]+)/) ?? [])[1]);
};
const bruto = await leerResumen('Sueldos brutos');
const aguinaldo = await leerResumen('Aguinaldo devengado');
const ips = await leerResumen('IPS patronal (16,5 %)');
const costoPlanilla = await leerResumen('Costo real de la planilla');

ok('el bruto es la suma de los sueldos listados', bruto === brutoSumado,
  `${bruto} contra ${brutoSumado}`);
ok('el aguinaldo es un doceavo del bruto', aguinaldo === Math.round(bruto / 12),
  `${aguinaldo} contra ${Math.round(bruto / 12)}`);
ok('el IPS patronal es el 16,5 % del bruto', ips === Math.round((bruto * 165) / 1000),
  `${ips} contra ${Math.round((bruto * 165) / 1000)}`);
ok('el costo de la planilla suma las tres cosas', costoPlanilla === bruto + aguinaldo + ips,
  `${costoPlanilla} contra ${bruto + aguinaldo + ips}`);

// --- Los sueldos no se pueden cargar como gasto fijo ---------------------
const opciones = await p.locator('select[name="categoria"] option').evaluateAll(
  (nodos) => nodos.map((n) => n.value));
ok('el formulario no ofrece la categoría de sueldos', !opciones.includes('SUELDOS'),
  opciones.filter(Boolean).join(', '));

// --- Cargar el alquiler --------------------------------------------------
const fijoAntes = await indicador('Costo fijo mensual');
await cargarFijo(ETIQUETA, IMPORTE);

const filaFijo = () => tablaFijos().locator('tr', { hasText: ETIQUETA });
ok('el gasto fijo queda en la lista', (await filaFijo().count()) === 1,
  `${await filaFijo().count()} filas`);
ok('se ve de qué día es el pago', ((await filaFijo().first().textContent()) ?? '').includes('el 5'));

const fijoDespues = await indicador('Costo fijo mensual');
ok('el costo fijo mensual sube exactamente el importe cargado',
  fijoDespues - fijoAntes === IMPORTE, `subió ${fijoDespues - fijoAntes}`);

// --- El mismo gasto fijo no entra dos veces -----------------------------
await cargarFijo(ETIQUETA.toUpperCase(), 99_000_000);
ok('el mismo gasto fijo no se puede cargar dos veces', (await filaFijo().count()) === 1,
  `${await filaFijo().count()} filas con ese nombre`);
ok('el costo fijo mensual no se movió con el intento repetido',
  (await indicador('Costo fijo mensual')) === fijoDespues);

// --- Generar el mes ------------------------------------------------------
ok('el mes en curso aparece con renglones por generar',
  ((await filaDelMes().first().textContent()) ?? '').includes('por cargar'));

await p.goto(SITIO + '/gastos', { waitUntil: 'domcontentloaded' });
const gastadoAntes = await indicador('Gastado este mes');
ok('la pantalla de gastos avisa que falta generar el mes',
  ((await p.locator('body').textContent()) ?? '').includes('Falta generar los gastos fijos'));

await irAFijos();
await filaDelMes().first().locator('button:has-text("Generar")').click();
await p.waitForTimeout(2500);

await p.goto(SITIO + '/gastos', { waitUntil: 'domcontentloaded' });
const gastadoDespues = await indicador('Gastado este mes');
const filasGasto = () => p.locator('table', { has: p.locator('th:has-text("Concepto")') })
  .locator('tr', { hasText: ETIQUETA });
ok('el gasto del mes quedó cargado en la lista de gastos', (await filasGasto().count()) === 1,
  `${await filasGasto().count()} filas`);
ok('el renglón lleva el período al que corresponde',
  /\d{4}-\d{2}/.test((await filasGasto().first().textContent()) ?? ''));
ok('lo gastado este mes sube al menos el alquiler generado',
  gastadoDespues - gastadoAntes >= IMPORTE, `subió ${gastadoDespues - gastadoAntes}`);
ok('ya no avisa que falte generar el mes',
  !((await p.locator('body').textContent()) ?? '').includes('Falta generar los gastos fijos'));

// --- La comprobación que importa: el mes no se genera dos veces ----------
await irAFijos();
ok('el mes ya generado se muestra completo',
  ((await filaDelMes().first().textContent()) ?? '').includes('completo'));
ok('un mes completo no ofrece el botón de generar',
  (await filaDelMes().first().locator('button:has-text("Generar")').count()) === 0);

await p.goto(SITIO + '/gastos', { waitUntil: 'domcontentloaded' });
ok('el alquiler figura una sola vez, no dos', (await filasGasto().count()) === 1,
  `${await filasGasto().count()} filas`);
ok('lo gastado este mes no se movió al volver a mirar',
  (await indicador('Gastado este mes')) === gastadoDespues);

// --- Un gasto fijo nuevo a mitad de mes: se genera sólo lo que falta -----
//
// Acá se ejercita de verdad el segundo pasado por el mismo mes. Si se quitara
// el filtro de lo ya generado, el índice único haría fallar la transacción
// entera y este renglón nuevo no entraría: la prueba lo acusa.
const SEGUNDO = `Internet de prueba ${Date.now().toString().slice(-6)}`;
const IMPORTE_SEGUNDO = 2_000_000;
await irAFijos();
await p.selectOption('select[name="categoria"]', 'SERVICIOS');
await p.fill('input[name="descripcion"]', SEGUNDO);
await p.fill('input[name="monto"]', String(IMPORTE_SEGUNDO));
await p.click('button:has-text("Cargar gasto fijo")');
await p.waitForTimeout(2500);
await irAFijos();
ok('el mes vuelve a tener un renglón por cargar',
  ((await filaDelMes().first().textContent()) ?? '').includes('1 por cargar'),
  (await filaDelMes().first().textContent() ?? '').replace(/\s+/g, ' ').slice(0, 80));

await filaDelMes().first().locator('button:has-text("Generar")').click();
await p.waitForTimeout(2500);

await p.goto(SITIO + '/gastos', { waitUntil: 'domcontentloaded' });
const filasSegundo = p.locator('table', { has: p.locator('th:has-text("Concepto")') })
  .locator('tr', { hasText: SEGUNDO });
ok('el renglón nuevo del mes se generó', (await filasSegundo.count()) === 1,
  `${await filasSegundo.count()} filas`);
ok('el alquiler ya generado no se duplicó en el segundo pasado',
  (await filasGasto().count()) === 1, `${await filasGasto().count()} filas`);
ok('lo gastado este mes subió exactamente el renglón nuevo',
  (await indicador('Gastado este mes')) - gastadoDespues === IMPORTE_SEGUNDO,
  `subió ${(await indicador('Gastado este mes')) - gastadoDespues}`);

// --- Llega al estado de resultados --------------------------------------
await p.goto(SITIO + '/contabilidad', { waitUntil: 'domcontentloaded' });
// Se acota a la tarjeta de gastos por categoría: el estado de resultados de al
// lado también nombra categorías y leer la página entera no probaría nada.
// Se sube desde el título hasta la tarjeta que lo contiene: el estado de
// resultados de al lado también nombra categorías, y leer la página entera no
// probaría nada.
const tarjetaCategorias = p
  .locator('h2:text-is("Gastos por categoría")')
  .locator('xpath=ancestor::div[contains(@class,"rounded")][1]');
const textoCategorias = (await tarjetaCategorias.textContent()) ?? '';
ok('el alquiler generado aparece en los gastos por categoría de la contabilidad',
  textoCategorias.includes('Alquiler'), textoCategorias.replace(/\s+/g, ' ').slice(0, 100));
ok('los sueldos generados también llegan a la contabilidad',
  textoCategorias.includes('Sueldos'), 'falta la categoría de sueldos');

// --- Dar de baja deja de generar ----------------------------------------
await irAFijos();
p.once('dialog', (d) => d.accept());
await filaFijo().first().locator('button:has-text("Dar de baja")').click();
await p.waitForTimeout(2500);
await irAFijos();
// Queda vigente el segundo gasto fijo que cargó esta corrida, así que el costo
// fijo baja sólo el alquiler.
const esperadoTrasBaja = fijoAntes + IMPORTE_SEGUNDO;
ok('dar de baja saca ese gasto del costo fijo mensual',
  (await indicador('Costo fijo mensual')) === esperadoTrasBaja,
  `${await indicador('Costo fijo mensual')} contra ${esperadoTrasBaja}`);
ok('el gasto fijo sigue en la lista, marcado de baja',
  ((await filaFijo().first().textContent()) ?? '').includes('de baja'));

await p.goto(SITIO + '/gastos', { waitUntil: 'domcontentloaded' });
ok('el gasto ya cargado del mes no se borra al dar de baja el fijo',
  (await filasGasto().count()) === 1);

ok('ningún error de JavaScript en la pantalla', errores.length === 0, errores.join(' | '));

await nav.close();
console.log(fallos === 0 ? '\nTodas las comprobaciones pasaron.' : `\n${fallos} comprobaciones fallaron.`);
process.exit(fallos === 0 ? 0 : 1);
