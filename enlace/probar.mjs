import { chromium } from 'playwright';
import { existsSync, readdirSync } from 'fs';

// Playwright trae su propio Chromium; en este entorno ya viene instalado.
function navegador() {
  const raiz = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!existsSync(raiz)) return {};
  const dir = readdirSync(raiz).filter((d) => d.startsWith('chromium-')).sort().pop();
  const exe = dir && `${raiz}/${dir}/chrome-linux/chrome`;
  return exe && existsSync(exe) ? { executablePath: exe } : {};
}

const ruta = new URL('./compra-ya.html', import.meta.url).href;
let fallos = 0;
const ok = (d, c, extra = '') => { console.log(`${c ? '  ok  ' : ' FALLA'} ${d}${extra ? ' — ' + extra : ''}`); if (!c) fallos++; };

// Almacenamiento simulado: implementa sólo lo que la página usa.
const stub = () => {
  const nombres = ['productos', 'prospectos', 'pedidos', 'campanas', 'equipo', 'plantillas'];
  const tiendas = {}; const oyentes = {};
  nombres.forEach((n) => { tiendas[n] = new Map(); oyentes[n] = []; });
  let n = 0;
  const snap = (nombre) => ({
    docs: [...tiendas[nombre].entries()].map(([id, data]) => ({ id, data: () => ({ ...data }), exists: true })),
  });
  const avisa = (nombre) => oyentes[nombre].forEach((f) => f(snap(nombre)));
  const col = (nombre) => ({
    onSnapshot(next) { oyentes[nombre].push(next); next(snap(nombre)); return () => {}; },
    async add(data) { const id = 'x' + (++n); tiendas[nombre].set(id, data); avisa(nombre); return { id }; },
  });
  window.__tiendas = tiendas;
  window.__avisa = avisa;   // sembrar sin recargar: recargar reinicia el simulador
  window.claude = {
    use: async (name) => name === 'db' ? {
      collection: col,
      doc: (r) => {
        const [nombre, id] = r.split('/');
        return {
          async set(data) { tiendas[nombre].set(id, data); avisa(nombre); },
          async delete() { tiendas[nombre].delete(id); avisa(nombre); },
        };
      },
    } : null,
  };
  const ayer = new Date(Date.now() - 864e5).toISOString();
  tiendas.productos.set('p1', { nombre: 'Auriculares Pro', sku: 'AUR-001', precio: 250000, costo: 150000, stock: 5, minimo: 3, movimientos: [] });
  tiendas.campanas.set('c1', { nombre: 'Vivo del viernes', tipo: 'VIVO', fecha: '2026-09-05', inversion: 200000, notas: '' });
  tiendas.equipo.set('v1', { nombre: 'Ana Giménez', rol: 'VENDEDOR', comision: 0.1, telefono: '0982111222', activo: true, ingreso: ayer });
  tiendas.plantillas.set('t1', { nombre: 'Primer saludo', etapa: 'NUEVO', cuerpo: '¡Hola {{cliente}}! Te escribo por {{producto}}, sale {{precio}}.' });
  tiendas.prospectos.set('l1', { nombre: 'María Duarte', telefono: '0981234567', ciudad: 'Asunción', productoId: 'p1', campanaId: 'c1', vendedorId: 'v1', estado: 'NUEVO', creado: ayer });
  tiendas.prospectos.set('l2', { nombre: 'Jorge Benítez', telefono: '0971555444', ciudad: 'Asunción', productoId: 'p1', campanaId: 'c1', vendedorId: 'v1', estado: 'CONTACTADO', creado: ayer });
};

const nav = await chromium.launch(navegador());
const abre = async (opts = {}) => {
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, ...opts });
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', (e) => errores.push(String(e)));
  await p.addInitScript(stub);
  await p.goto(ruta);
  await p.waitForTimeout(800);
  return { ctx, p, errores };
};

// --- Presentación ------------------------------------------------------
for (const tema of ['light', 'dark']) {
  const { ctx, p, errores } = await abre({ colorScheme: tema });
  ok(`[${tema}] sin errores de JavaScript`, errores.length === 0, errores[0] || '');
  const fondo = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const color = await p.evaluate(() => getComputedStyle(document.body).color);
  ok(`[${tema}] el cuerpo pinta su fondo y contrasta`, fondo !== 'rgba(0, 0, 0, 0)' && fondo !== color, `${fondo} / ${color}`);
  ok(`[${tema}] no se desplaza de costado`, !(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
  ok(`[${tema}] los importes salen en guaraníes`, (await p.textContent('#hoyDatos')).includes('Gs'));
  await p.screenshot({ path: `enlace/vista-${tema}.jpg`, type: 'jpeg', quality: 80 });
  await ctx.close();
}

// --- Navegación --------------------------------------------------------
{
  const { ctx, p, errores } = await abre();
  for (const v of ['prospectos', 'pedidos', 'entregas', 'mas']) {
    await p.click(`[data-vista="${v}"]`);
    ok(`la pestaña ${v} muestra su sección`, await p.isVisible(`#v-${v}`));
  }
  for (const v of ['productos', 'campanas', 'equipo', 'plantillas']) {
    await p.click('[data-vista="mas"]');
    await p.click(`#menuMas [data-vista="${v}"]`);
    ok(`Más lleva a ${v}`, await p.isVisible(`#v-${v}`));
  }
  ok('sin errores al recorrer las ocho secciones', errores.length === 0, errores[0] || '');
  await ctx.close();
}

// --- Prospecto, plantilla y WhatsApp -----------------------------------
{
  const { ctx, p, errores } = await abre();
  await p.click('[data-vista="prospectos"]');
  await p.click('#listaProspectos [data-prospecto]');
  await p.waitForSelector('#msgTxt');
  const msg = await p.inputValue('#msgTxt');
  ok('la plantilla se rellena con el nombre, el producto y el precio',
    msg.includes('María') && msg.includes('Auriculares Pro') && msg.includes('250.000'), msg.slice(0, 60));
  const wa = await p.getAttribute('#btnWa', 'href');
  ok('el enlace de WhatsApp normaliza el 0981 a 595981', wa.startsWith('https://wa.me/595981234567'), wa.slice(0, 40));
  await p.fill('#msgTxt', 'Texto propio');
  await p.waitForTimeout(150);
  const wa2 = await p.getAttribute('#btnWa', 'href');
  ok('editar el mensaje actualiza el enlace', decodeURIComponent(wa2).includes('Texto propio'));

  await p.selectOption('#etapaSel', 'COTIZADO');
  await p.waitForTimeout(400);
  ok('cambiar la etapa se guarda', (await p.evaluate(() => window.__tiendas.prospectos.get('l1').estado)) === 'COTIZADO');
  ok('sin errores en la ficha del prospecto', errores.length === 0, errores[0] || '');
  await ctx.close();
}

// --- Circuito completo del pedido --------------------------------------
{
  const { ctx, p, errores } = await abre();
  await p.click('[data-vista="prospectos"]');
  await p.click('#listaProspectos [data-prospecto]');
  await p.waitForSelector('[data-nuevo-pedido]');
  await p.click('[data-nuevo-pedido]');
  await p.waitForSelector('#oDireccion');
  await p.fill('#oDireccion', 'Avda. España 123');
  await p.fill('#oCantidad', '2');
  await p.waitForTimeout(250);
  const resumen = await p.textContent('#oResumen');
  ok('el total se calcula en vivo (2 × 250.000 + 25.000 de envío)', resumen.includes('525.000'), resumen.replace(/\s+/g, ' ').trim().slice(0, 90));
  ok('y muestra la comisión del vendedor (10% de 500.000)', resumen.includes('50.000'));

  await p.click('[data-guarda-pedido]');
  await p.waitForTimeout(600);
  let ped = await p.evaluate(() => [...window.__tiendas.pedidos.entries()][0]);
  ok('el pedido se guardó con su código', ped && /^CY-\d{4}$/.test(ped[1].codigo), ped && ped[1].codigo);
  ok('con el total correcto', ped[1].total === 525000, String(ped[1].total));
  ok('el precio queda congelado en la línea', ped[1].items[0].precio === 250000);
  ok('nace pendiente y sin descontar stock', ped[1].estado === 'PENDIENTE' && ped[1].stockDescontado === false);
  ok('el prospecto queda ganado', (await p.evaluate(() => window.__tiendas.prospectos.get('l1').estado)) === 'GANADO');
  ok('el stock sigue intacto antes de confirmar', (await p.evaluate(() => window.__tiendas.productos.get('p1').stock)) === 5);

  const mueve = async (a) => {
    await p.click('[data-vista="pedidos"]');
    await p.click('#listaPedidos [data-pedido]');
    await p.waitForSelector(`[data-mover][data-a="${a}"]`);
    await p.click(`[data-mover][data-a="${a}"]`);
    await p.waitForTimeout(600);
  };

  await mueve('CONFIRMADO');
  ok('confirmar descuenta 2 unidades', (await p.evaluate(() => window.__tiendas.productos.get('p1').stock)) === 3);
  await p.click('[data-vista="entregas"]');
  ok('el pedido confirmado aparece en Entregas', (await p.textContent('#listaEntregas')).includes('María'));

  await mueve('ENVIADO');
  await mueve('ENTREGADO');
  ped = await p.evaluate(() => [...window.__tiendas.pedidos.values()][0]);
  ok('entregar cobra el contra entrega', ped.cobrado === 525000, String(ped.cobrado));
  ok('y queda la fecha de entrega', !!ped.entregadoAt);
  ok('un pedido entregado ya no ofrece marcha atrás', (await p.evaluate(() => {
    document.querySelector('#listaPedidos [data-pedido]').click();
    return document.querySelectorAll('[data-mover]').length;
  })) === 0);
  await p.keyboard.press('Escape');

  // Segundo pedido: se devuelve y el stock vuelve.
  await p.click('[data-vista="prospectos"]');
  await p.click('[data-fp=""]');
  await p.click('#listaProspectos [data-prospecto="l2"]');
  await p.waitForSelector('[data-nuevo-pedido]');
  await p.click('[data-nuevo-pedido]');
  await p.waitForSelector('#oDireccion');
  await p.fill('#oDireccion', 'Ruta 2 km 12');
  await p.click('[data-guarda-pedido]');
  await p.waitForTimeout(600);
  const segundo = await p.evaluate(() => [...window.__tiendas.pedidos.values()].filter((x) => x.cliente === 'Jorge Benítez')[0]);
  ok('el segundo pedido numera correlativo', segundo.codigo === 'CY-0002', segundo.codigo);

  const mueveA = async (cliente, a) => {
    await p.click('[data-vista="pedidos"]');
    await p.click('[data-fpe=""]');
    const id = await p.evaluate((c) => [...window.__tiendas.pedidos.entries()].filter(([, x]) => x.cliente === c)[0][0], cliente);
    await p.click(`#listaPedidos [data-pedido="${id}"]`);
    await p.waitForSelector(`[data-mover][data-a="${a}"]`);
    await p.click(`[data-mover][data-a="${a}"]`);
    await p.waitForTimeout(600);
  };
  await mueveA('Jorge Benítez', 'CONFIRMADO');
  ok('el segundo confirmado deja 2 en stock', (await p.evaluate(() => window.__tiendas.productos.get('p1').stock)) === 2);
  await mueveA('Jorge Benítez', 'ENVIADO');
  await mueveA('Jorge Benítez', 'DEVUELTO');
  ok('devolver repone el stock', (await p.evaluate(() => window.__tiendas.productos.get('p1').stock)) === 3);
  ok('y deja de estar descontado', (await p.evaluate(() => [...window.__tiendas.pedidos.values()].filter((x) => x.cliente === 'Jorge Benítez')[0].stockDescontado)) === false);
  ok('sin errores durante todo el circuito', errores.length === 0, errores[0] || '');
  await ctx.close();
}

// --- Inventario --------------------------------------------------------
{
  const { ctx, p, errores } = await abre();
  await p.click('[data-vista="mas"]');
  await p.click('#menuMas [data-vista="productos"]');
  ok('el inventario avisa que hay stock bajo (5 con mínimo 3 no lo está)', (await p.textContent('#inventarioDatos')).includes('todo cubierto'));

  await p.click('#listaProductos [data-producto]');
  await p.waitForSelector('#entra');
  await p.fill('#entra', '10');
  await p.fill('#motivo', 'Compra al proveedor');
  await p.click('[data-mueve-stock]');
  await p.waitForTimeout(600);
  const prod = await p.evaluate(() => window.__tiendas.productos.get('p1'));
  ok('el movimiento suma al stock', prod.stock === 15, String(prod.stock));
  ok('y queda registrado con su motivo', prod.movimientos.length === 1 && prod.movimientos[0].motivo === 'Compra al proveedor');

  await p.click('#listaProductos [data-producto]');
  await p.waitForSelector('#sale');
  await p.fill('#sale', '99');
  await p.click('[data-mueve-stock]');
  await p.waitForTimeout(400);
  ok('no deja sacar más de lo que hay', (await p.evaluate(() => window.__tiendas.productos.get('p1').stock)) === 15);

  await p.keyboard.press('Escape');
  await p.click('#btnNuevoProducto');
  await p.waitForSelector('#pNombre');
  await p.fill('#pNombre', 'Reloj deportivo');
  await p.fill('#pPrecio', '320000');
  await p.fill('#pStock', '4');
  await p.click('[data-guarda-producto]');
  await p.waitForTimeout(600);
  const nuevo = await p.evaluate(() => [...window.__tiendas.productos.values()].filter((x) => x.nombre === 'Reloj deportivo')[0]);
  ok('un producto nuevo nace con su carga inicial anotada', nuevo && nuevo.stock === 4 && nuevo.movimientos[0].motivo === 'carga inicial');
  ok('sin errores en inventario', errores.length === 0, errores[0] || '');
  await ctx.close();
}

// --- Campañas ----------------------------------------------------------
{
  const { ctx, p, errores } = await abre();
  await p.click('[data-vista="mas"]');
  await p.click('#menuMas [data-vista="campanas"]');
  ok('la campaña lista los prospectos que trajo', (await p.textContent('#listaCampanas')).includes('2 prospectos'));
  await p.click('#listaCampanas [data-campana]');
  await p.waitForTimeout(200);
  const ficha = await p.textContent('#hojaCuerpo');
  ok('la ficha muestra la inversión', ficha.includes('200.000'));
  ok('y cuelga de ella sus prospectos', ficha.includes('María') && ficha.includes('Jorge'));

  await p.keyboard.press('Escape');
  await p.click('#btnNuevaCampana');
  await p.waitForSelector('#cNombre');
  await p.fill('#cNombre', 'Aviso del lunes');
  await p.selectOption('#cTipo', 'AVISO');
  await p.fill('#cInversion', '350000');
  await p.click('[data-guarda-campana]');
  await p.waitForTimeout(600);
  const camp = await p.evaluate(() => [...window.__tiendas.campanas.values()].filter((x) => x.nombre === 'Aviso del lunes')[0]);
  ok('la campaña nueva se guarda con su inversión', camp && camp.inversion === 350000 && camp.tipo === 'AVISO');
  ok('sin errores en campañas', errores.length === 0, errores[0] || '');
  await ctx.close();
}

// --- Equipo y comisiones ------------------------------------------------
{
  const { ctx, p, errores } = await abre();
  // Un pedido entregado a nombre de Ana: la comisión debe quedar aprobada.
  await p.evaluate(() => window.__tiendas.pedidos.set('o1', {
    codigo: 'CY-0001', cliente: 'María Duarte', telefono: '0981234567', vendedorId: 'v1',
    items: [{ productoId: 'p1', nombre: 'Auriculares Pro', precio: 250000, cantidad: 2 }],
    envio: 25000, total: 525000, metodoPago: 'CONTRA_ENTREGA', estado: 'ENTREGADO',
    stockDescontado: true, creado: new Date().toISOString(),
  }));
  await p.evaluate(() => window.__avisa('pedidos'));
  await p.waitForTimeout(300);
  await p.click('[data-vista="mas"]');
  await p.click('#menuMas [data-vista="equipo"]');
  ok('el equipo ordena por lo vendido', (await p.textContent('#listaEquipo')).includes('Ana Giménez'));
  await p.click('#listaEquipo [data-vendedor]');
  await p.waitForTimeout(200);
  const ficha = await p.textContent('#hojaCuerpo');
  ok('la comisión se calcula sin el envío (10% de 500.000)', ficha.includes('50.000'), ficha.replace(/\s+/g, ' ').slice(0, 120));
  ok('y aparece como comisión a pagar', ficha.includes('Comisión a pagar'));

  await p.keyboard.press('Escape');
  await p.click('#btnNuevoVendedor');
  await p.waitForSelector('#vNombre');
  await p.fill('#vNombre', 'Marco Ruiz');
  await p.selectOption('#vRol', 'REPARTIDOR');
  await p.fill('#vComision', '5');
  await p.click('[data-guarda-vendedor]');
  await p.waitForTimeout(600);
  const v = await p.evaluate(() => [...window.__tiendas.equipo.values()].filter((x) => x.nombre === 'Marco Ruiz')[0]);
  ok('la persona nueva guarda su rol y su tasa', v && v.rol === 'REPARTIDOR' && Math.abs(v.comision - 0.05) < 1e-9);
  ok('sin errores en equipo', errores.length === 0, errores[0] || '');
  await ctx.close();
}

// --- Plantillas --------------------------------------------------------
{
  const { ctx, p, errores } = await abre();
  await p.click('[data-vista="mas"]');
  await p.click('#menuMas [data-vista="plantillas"]');
  await p.click('#listaPlantillas [data-plantilla]');
  await p.waitForTimeout(200);
  const vista = await p.textContent('#hojaCuerpo');
  ok('la ficha muestra la plantilla tal cual se guardó', vista.includes('{{cliente}}'));
  ok('y debajo, cómo queda con datos reales', vista.includes('Hola María!') && vista.includes('Auriculares inalámbricos'));

  await p.keyboard.press('Escape');
  await p.click('#btnNuevaPlantilla');
  await p.waitForSelector('#tNombre');
  await p.fill('#tNombre', 'Recordatorio');
  await p.selectOption('#tEtapa', 'COTIZADO');
  await p.fill('#tCuerpo', 'Hola {{cliente}}, ¿seguimos con {{producto}}?');
  await p.click('[data-guarda-plantilla]');
  await p.waitForTimeout(600);
  const t = await p.evaluate(() => [...window.__tiendas.plantillas.values()].filter((x) => x.nombre === 'Recordatorio')[0]);
  ok('la plantilla nueva se guarda en su etapa', t && t.etapa === 'COTIZADO');

  // Y se ofrece como sugerida en un prospecto cotizado.
  await p.evaluate(() => {
    const l = window.__tiendas.prospectos.get('l1');
    window.__tiendas.prospectos.set('l1', { ...l, estado: 'COTIZADO' });
    window.__avisa('prospectos');
  });
  await p.waitForTimeout(300);
  await p.click('[data-vista="prospectos"]');
  await p.click('#listaProspectos [data-prospecto="l1"]');
  await p.waitForSelector('#plantSel');
  const primera = await p.textContent('#plantSel option:first-child');
  ok('la plantilla de la etapa se ofrece primero', primera.includes('Recordatorio') && primera.includes('sugerida'), primera);
  ok('sin errores en plantillas', errores.length === 0, errores[0] || '');
  await ctx.close();
}

// --- Sin almacenamiento -------------------------------------------------
{
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', (e) => errores.push(String(e)));
  await p.goto(ruta);
  await p.waitForTimeout(600);
  ok('sin capacidad de guardar, la página avisa en vez de fingir', (await p.textContent('#avisoConexion')).includes('no recuerda'));
  ok('y aun así se dibuja sin romperse', errores.length === 0, errores[0] || '');
  await ctx.close();
}

await nav.close();
console.log(fallos === 0 ? '\nLa aplicación pasa todas las comprobaciones.' : `\n${fallos} fallo(s).`);
process.exit(fallos === 0 ? 0 : 1);
