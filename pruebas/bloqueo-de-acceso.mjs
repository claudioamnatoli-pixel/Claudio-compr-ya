// Comprueba el freno a la prueba de contraseñas, contra un servidor ya
// levantado en 127.0.0.1:3111 con una base sembrada.
//
//   npm i -D playwright     (no es dependencia del proyecto)
//   DATABASE_URL=… NODE_ENV=production PORT=3111 npm run start &
//   node pruebas/bloqueo-de-acceso.mjs
//
// Importa: se validó rompiéndola. Con INTENTOS_PERMITIDOS puesto en 100000,
// tres comprobaciones fallan, entre ellas «la contraseña correcta tampoco
// entra», que es la única que de verdad dice si el bloqueo sirve.
import { chromium } from 'playwright';
import { readdirSync, existsSync } from 'fs';
const raiz = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
const dir = readdirSync(raiz).filter((d) => d.startsWith('chromium-')).sort().pop();
const exe = `${raiz}/${dir}/chrome-linux/chrome`;
const nav = await chromium.launch(existsSync(exe) ? { executablePath: exe } : {});
const ctx = await nav.newContext({ viewport: { width: 420, height: 940 } });
const p = await ctx.newPage();
const errores = []; p.on('pageerror', (e) => errores.push(String(e)));
let fallos = 0;
const ok = (d, c, x = '') => { console.log(`${c ? '  ok  ' : ' FALLA'} ${d}${x ? ' — ' + x : ''}`); if (!c) fallos++; };
const SITIO = 'http://127.0.0.1:3111';

async function probar(email, password) {
  await p.goto(SITIO + '/login', { waitUntil: 'domcontentloaded' });
  await p.fill('input[name="email"]', email);
  await p.fill('input[name="password"]', password);
  await p.click('button[type="submit"]');
  await p.waitForTimeout(450);
  if (!new URL(p.url()).pathname.includes('login')) {
    // Si entró, la sesión abierta haría que el siguiente intento ni vea el
    // formulario: se cierra acá para que un fallo se informe en vez de hacer
    // caer la prueba entera.
    await ctx.clearCookies();
    return { entro: true, mensaje: '' };
  }
  return { entro: false, mensaje: (await p.textContent('body')).replace(/\s+/g, ' ') };
}

// 1. La contraseña buena entra. Se comprueba primero, para saber que el
//    bloqueo que venga después es del bloqueo y no de otra cosa.
ok('con la contraseña correcta se entra', (await probar('claudia@compr-ya.com.py', 'demo1234')).entro);
await ctx.clearCookies();

// 2. Nueve fallos no bloquean: el límite es diez.
let r;
for (let i = 1; i <= 9; i++) r = await probar('claudia@compr-ya.com.py', 'noesesta' + i);
ok('tras 9 fallos todavía dice sólo «incorrectos»',
  r.mensaje.includes('Correo o contraseña incorrectos') && !r.mensaje.includes('Demasiados'),
  r.mensaje.match(/(Correo o contraseña[^.]*\.|Demasiados[^.]*\.)/)?.[0] ?? '');

// 3. El décimo cruza el límite y el siguiente ya queda bloqueado.
await probar('claudia@compr-ya.com.py', 'noesesta10');
r = await probar('claudia@compr-ya.com.py', 'noesesta11');
ok('al pasar el límite, bloquea', r.mensaje.includes('Demasiados intentos fallidos'),
  r.mensaje.match(/Demasiados[^.]*\./)?.[0] ?? r.mensaje.slice(0, 80));
ok('y dice cuánto hay que esperar', /en \d+ minutos?\./.test(r.mensaje),
  r.mensaje.match(/en \d+ minutos?\./)?.[0] ?? '');

// 4. Lo que de verdad importa: la contraseña BUENA tampoco pasa mientras dure.
r = await probar('claudia@compr-ya.com.py', 'demo1234');
ok('la contraseña correcta tampoco entra mientras está bloqueado',
  !r.entro && r.mensaje.includes('Demasiados'), r.entro ? 'ENTRÓ — el bloqueo no sirve' : '');

// 5. El bloqueo es por correo: otra cuenta sigue pudiendo entrar.
r = await probar('ana@compr-ya.com.py', 'demo1234');
ok('otra persona no queda bloqueada por culpa de la primera', r.entro);
await ctx.clearCookies();

// 6. Un correo inventado se frena igual, para no delatar qué cuentas existen.
for (let i = 1; i <= 10; i++) await probar('nadie@compr-ya.com.py', 'x' + i);
r = await probar('nadie@compr-ya.com.py', 'x11');
ok('un correo que no existe se bloquea igual (no delata cuáles existen)',
  r.mensaje.includes('Demasiados intentos fallidos'),
  r.mensaje.match(/Demasiados[^.]*\.|Correo o[^.]*\./)?.[0] ?? '');

ok('sin errores de JavaScript', errores.length === 0, errores[0] || '');
await nav.close();
console.log(fallos === 0 ? '\nEl bloqueo por intentos fallidos funciona.' : `\n${fallos} fallo(s).`);
process.exit(fallos === 0 ? 0 : 1);
