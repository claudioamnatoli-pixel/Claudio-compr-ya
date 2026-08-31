/**
 * Deja el proyecto listo para usarse, de una sola vez.
 *
 * Existe para que arrancar no requiera seguir una lista de pasos: crea el .env
 * si falta —con una clave de sesión propia, no la de ejemplo—, instala las
 * dependencias, prepara la base de datos y la siembra. Es seguro repetirlo:
 * cada paso comprueba antes si hace falta.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const NODE_MINIMO = 18;

const paso = (n, texto) => console.log(`\n[${n}/4] ${texto}`);
const listo = (texto) => console.log(`      ✓ ${texto}`);

function correr(comando, argumentos) {
  execFileSync(comando, argumentos, { cwd: raiz, stdio: 'inherit', shell: process.platform === 'win32' });
}

function comprobarNode() {
  const mayor = Number(process.versions.node.split('.')[0]);
  if (mayor >= NODE_MINIMO) return;
  console.error(
    `\nEste proyecto necesita Node.js ${NODE_MINIMO} o superior, y tenés la ${process.versions.node}.\n` +
      'Descargá la versión LTS desde https://nodejs.org y volvé a intentarlo.\n',
  );
  process.exit(1);
}

function prepararEnv() {
  const env = join(raiz, '.env');
  if (existsSync(env)) {
    listo('el archivo .env ya existe, no se toca');
    return;
  }
  copyFileSync(join(raiz, '.env.example'), env);

  // La clave de sesión del ejemplo es pública: cada instalación necesita la suya.
  const propia = randomBytes(32).toString('base64');
  const contenido = readFileSync(env, 'utf8').replace(
    /^SESSION_SECRET=.*$/m,
    `SESSION_SECRET="${propia}"`,
  );
  writeFileSync(env, contenido);
  listo('.env creado con una clave de sesión propia');
}

function instalarDependencias() {
  if (existsSync(join(raiz, 'node_modules', 'next'))) {
    listo('las dependencias ya estaban instaladas');
    return;
  }
  console.log('      (esto tarda un minuto la primera vez)');
  correr('npm', ['install', '--no-audit', '--no-fund']);
}

function prepararBase() {
  correr('npm', ['run', '--silent', 'db:preparar']);
}

function sembrar() {
  correr('npx', ['--yes', 'tsx', 'prisma/seed.ts', '--solo-si-vacia']);
}

comprobarNode();
console.log('Preparando Compr-Ya…');
paso(1, 'Configuración');
prepararEnv();
paso(2, 'Dependencias');
instalarDependencias();
paso(3, 'Base de datos');
prepararBase();
paso(4, 'Datos de ejemplo');
sembrar();

console.log(`
──────────────────────────────────────────────
  Todo listo.

  Arrancá el programa con:   npm run dev
  Y abrí:                    http://localhost:3000

  Entrá con:
    Usuario     claudia@compr-ya.com.py
    Contraseña  demo1234
──────────────────────────────────────────────
`);
