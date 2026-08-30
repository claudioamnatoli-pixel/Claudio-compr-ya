/**
 * Ajusta el motor de base de datos del esquema de Prisma según la DATABASE_URL.
 *
 * En desarrollo se usa SQLite, que es un archivo y no requiere instalar nada;
 * en un servidor hace falta PostgreSQL, porque el sistema de archivos de un
 * hosting es efímero y varias personas escriben a la vez.
 *
 * Prisma no acepta una variable de entorno en el campo `provider`, así que se
 * ajusta aquí antes de generar el cliente. Se ejecuta solo dentro de `npm run
 * build` y es idempotente: si el motor ya es el correcto, no toca el archivo.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const rutaEsquema = join(raiz, 'prisma', 'schema.prisma');

/**
 * Lee DATABASE_URL de donde esté: primero del entorno —que es como llega en un
 * servidor— y si no, del archivo .env, que es como se trabaja en local. Node no
 * carga .env por su cuenta, y sin esto el esquema quedaría configurado para un
 * motor distinto del que dice la URL.
 */
export function urlDeConexion(entorno = process.env, rutaEnv = join(raiz, '.env')) {
  if (entorno.DATABASE_URL) return entorno.DATABASE_URL;
  if (!existsSync(rutaEnv)) return undefined;

  for (const linea of readFileSync(rutaEnv, 'utf8').split('\n')) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith('#')) continue;
    const separador = limpia.indexOf('=');
    if (separador === -1) continue;
    if (limpia.slice(0, separador).trim() !== 'DATABASE_URL') continue;
    // Se quitan las comillas que se suelen poner alrededor del valor.
    return limpia.slice(separador + 1).trim().replace(/^["']|["']$/g, '');
  }
  return undefined;
}

/** Deduce el motor a partir del esquema de la URL de conexión. */
export function motorDeLaUrl(url) {
  if (!url) return 'sqlite';
  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) return 'postgresql';
  if (url.startsWith('mysql://')) return 'mysql';
  if (url.startsWith('sqlserver://')) return 'sqlserver';
  return 'sqlite';
}

/** Reemplaza el `provider` del bloque `datasource`, sin tocar el `generator`. */
export function conMotor(esquema, motor) {
  return esquema.replace(
    /(datasource\s+db\s*\{[^}]*?provider\s*=\s*")[^"]+(")/,
    `$1${motor}$2`,
  );
}

function main() {
  const motor = motorDeLaUrl(urlDeConexion());
  const original = readFileSync(rutaEsquema, 'utf8');
  const ajustado = conMotor(original, motor);

  if (ajustado === original) {
    console.log(`Esquema ya configurado para ${motor}.`);
    return;
  }
  writeFileSync(rutaEsquema, ajustado);
  console.log(`Esquema configurado para ${motor}.`);
}

// Sólo actúa al ejecutarse directamente; al importarlo se usan sus funciones.
if (process.argv[1] === fileURLToPath(import.meta.url)) main();
