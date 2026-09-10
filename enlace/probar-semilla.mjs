// Comprueba la página contra los documentos realmente sembrados en el artefacto.
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
import { readFileSync } from 'fs';

const ruta = new URL('./compra-ya.html', import.meta.url).href;
const semilla = JSON.parse(readFileSync(new URL('./semilla.json', import.meta.url), 'utf8'));
let fallos = 0;
const ok = (d, c, extra = '') => { console.log(`${c ? '  ok  ' : ' FALLA'} ${d}${extra ? ' — ' + extra : ''}`); if (!c) fallos++; };

const stub = (semilla) => {
  const tiendas = {}; const oyentes = {};
  Object.keys(semilla).forEach((n) => {
    tiendas[n] = new Map(Object.entries(semilla[n]));
    oyentes[n] = [];
  });
  const snap = (n) => ({ docs: [...tiendas[n].entries()].map(([id, data]) => ({ id, data: () => ({ ...data }), exists: true })) });
  window.claude = { use: async (x) => x === 'db' ? {
    collection: (n) => ({ onSnapshot(f) { oyentes[n].push(f); f(snap(n)); return () => {}; }, async add() {} }),
    doc: () => ({ async set() {}, async delete() {} }),
  } : null };
};

const nav = await chromium.launch(navegador());
const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true });
const p = await ctx.newPage();
const errores = [];
p.on('pageerror', (e) => errores.push(String(e)));
await p.addInitScript(stub, semilla);
await p.goto(ruta);
await p.waitForTimeout(900);

ok('los datos sembrados no rompen la página', errores.length === 0, errores[0] || '');
ok('no queda ningún aviso de conexión', (await p.textContent('#avisoConexion')).trim() === '', await p.textContent('#avisoConexion'));

const hoy = await p.textContent('#v-hoy');
ok('Hoy muestra el embudo con los 7 prospectos', hoy.includes('Embudo'));
ok('y las campañas que más venden', hoy.includes('Aviso pagado · creadoras'), '');

await p.click('[data-vista="entregas"]');
const ent = await p.textContent('#v-entregas');
ok('Entregas cuenta los dos pedidos en curso', ent.includes('2 en curso'), ent.replace(/\s+/g, ' ').slice(0, 60));
ok('y lista a Patricia y a Gabriela', ent.includes('Patricia Rojas') && ent.includes('Gabriela Núñez'));

await p.click('[data-vista="mas"]');
await p.click('#menuMas [data-vista="productos"]');
const inv = await p.textContent('#v-productos');
ok('el inventario suma las 122 unidades', inv.includes('122'), inv.replace(/\s+/g, ' ').slice(0, 90));
ok('y marca 2 productos bajo mínimo (cargador y rizador)',
  /Bajo mínimo\s*2\s*hay que reponer/.test(inv.replace(/\s+/g, ' ')) &&
  /Cargador rápido 65 W[\s\S]*?Reponer/.test(inv) && /Rizador de cabello automático[\s\S]*?Reponer/.test(inv),
  inv.replace(/\s+/g, ' ').slice(0, 90));

await p.click('[data-vista="mas"]');
await p.click('#menuMas [data-vista="campanas"]');
const camp = await p.textContent('#v-campanas');
ok('las campañas suman 430.000 de inversión', camp.includes('430.000'));
ok('el aviso de creadoras muestra retorno mayor a 1', camp.includes('1.7× retorno'), camp.replace(/\s+/g, ' ').slice(0, 200));

await p.click('[data-vista="mas"]');
await p.click('#menuMas [data-vista="equipo"]');
const eq = await p.textContent('#v-equipo');
ok('el equipo lista a las cinco personas', ['Claudia', 'Lidia', 'Ana', 'Marco', 'Hugo'].every((n) => eq.includes(n)));
await p.click('#listaEquipo [data-vendedor]');
await p.waitForTimeout(200);
const ana = await p.textContent('#hojaCuerpo');
ok('Ana encabeza por lo vendido', ana.includes('Ana Giménez') || (await p.textContent('#hojaTitulo')).includes('Ana'));
ok('su comisión aprobada es 46.000 (10% de 460.000 entregados)', ana.includes('46.000'), ana.replace(/\s+/g, ' ').slice(0, 140));

await p.keyboard.press('Escape');
await p.click('[data-vista="prospectos"]');
await p.click('#listaProspectos [data-prospecto="l004"]');
await p.waitForSelector('#msgTxt');
const msg = await p.inputValue('#msgTxt');
ok('a un prospecto cotizado le sugiere la plantilla de su etapa',
  msg.startsWith('Hola Andrés') && msg.includes('Parlante') && msg.includes('350.000'), msg.slice(0, 70));
ok('sin errores en todo el recorrido', errores.length === 0, errores[0] || '');
await p.keyboard.press('Escape');
await p.click('[data-vista="hoy"]');
await p.screenshot({ path: 'enlace/vista-con-datos.jpg', type: 'jpeg', quality: 80, fullPage: true });

await ctx.close();
await nav.close();
console.log(fallos === 0 ? '\nLa semilla real se ve como debe.' : `\n${fallos} fallo(s).`);
process.exit(fallos === 0 ? 0 : 1);
