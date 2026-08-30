/**
 * Configuración pública de la tienda, con valores por defecto pensados para
 * Paraguay. Todo se puede cambiar desde el archivo .env.
 */

const moneda = process.env.NEXT_PUBLIC_MONEDA || 'PYG';
const locale = process.env.NEXT_PUBLIC_LOCALE || 'es-PY';

/**
 * Cuántos decimales usa la moneda. El guaraní no tiene centavos (0), el peso
 * mexicano sí (2). Se le pregunta a `Intl` en lugar de asumirlo, para que
 * cambiar de moneda en .env no obligue a tocar código.
 */
function decimalesDeLaMoneda(): number {
  try {
    return (
      new Intl.NumberFormat(locale, { style: 'currency', currency: moneda }).resolvedOptions()
        .maximumFractionDigits ?? 2
    );
  } catch {
    // Moneda o locale mal escritos en .env: se asume el caso más común.
    return 2;
  }
}

const decimales = decimalesDeLaMoneda();

export const CONFIG = {
  nombreTienda: process.env.NEXT_PUBLIC_NOMBRE_TIENDA || 'Compr-Ya',
  /// Prefijo telefónico del país, sin "+". Paraguay es 595.
  prefijoPais: process.env.NEXT_PUBLIC_PREFIJO_PAIS || '595',
  moneda,
  locale,
  decimales,
} as const;

/**
 * Cuántas unidades mínimas hay en una unidad de la moneda.
 *
 * Los importes se guardan siempre como enteros en la unidad mínima, para no
 * arrastrar los errores de redondeo de los decimales de coma flotante. En
 * guaraníes el factor es 1 (₲ 250.000 se guarda como 250000); en una moneda con
 * centavos es 100 ($599,00 se guarda como 59900).
 */
export const FACTOR_MONEDA = 10 ** decimales;

/**
 * Valor del atributo `step` de un <input type="number"> de dinero: en una
 * moneda sin decimales no tiene sentido dejar escribir "1000,50".
 */
export const PASO_MONEDA = decimales > 0 ? '0.01' : '1';
