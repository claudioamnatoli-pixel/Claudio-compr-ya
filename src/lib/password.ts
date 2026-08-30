import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * Hash y verificación de contraseñas.
 *
 * Vive aparte de `auth.ts` porque es criptografía pura, sin nada del servidor
 * web: así lo puede usar también el script que siembra la base.
 */

/**
 * Deriva la contraseña con scrypt, que está pensado para ser costoso de
 * calcular y hace inviable probar millones de combinaciones. Cada contraseña
 * lleva su propia sal, así que dos personas con la misma clave no comparten
 * hash.
 */
export function hashearPassword(password: string): string {
  const sal = randomBytes(16);
  const derivada = scryptSync(password.normalize('NFKC'), sal, 64);
  return `scrypt$${sal.toString('hex')}$${derivada.toString('hex')}`;
}

/** Comprueba una contraseña en tiempo constante contra el hash guardado. */
export function verificarPassword(password: string, guardado: string | null): boolean {
  if (!guardado) return false;
  const [algoritmo, salHex, hashHex] = guardado.split('$');
  if (algoritmo !== 'scrypt' || !salHex || !hashHex) return false;

  const esperado = Buffer.from(hashHex, 'hex');
  if (esperado.length === 0) return false;
  const calculado = scryptSync(
    password.normalize('NFKC'),
    Buffer.from(salHex, 'hex'),
    esperado.length,
  );
  // La comparación es en tiempo constante para no filtrar información por lo
  // que tarda en fallar.
  return timingSafeEqual(esperado, calculado);
}

/** Reglas mínimas de contraseña. Devuelve el problema, o null si está bien. */
export function revisarPassword(password: string): string | null {
  if (password.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
  if (password.length > 200) return 'La contraseña es demasiado larga.';
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return 'La contraseña debe combinar letras y números.';
  }
  return null;
}
