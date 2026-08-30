import { CONFIG, FACTOR_MONEDA } from './config';

/**
 * Formatea un importe guardado en la unidad mínima de la moneda.
 * En guaraníes `formatearDinero(250000)` → "Gs. 250.000".
 * En una moneda con centavos, `formatearDinero(129900)` → "$1,299.00".
 */
export function formatearDinero(minimos: number): string {
  return new Intl.NumberFormat(CONFIG.locale, {
    style: 'currency',
    currency: CONFIG.moneda,
  }).format(minimos / FACTOR_MONEDA);
}

/** Igual que `formatearDinero` pero sin decimales, para cifras grandes. */
export function formatearDineroCorto(minimos: number): string {
  return new Intl.NumberFormat(CONFIG.locale, {
    style: 'currency',
    currency: CONFIG.moneda,
    maximumFractionDigits: 0,
  }).format(minimos / FACTOR_MONEDA);
}

/**
 * Convierte lo que escribe una persona en un formulario a la unidad mínima.
 * En guaraníes "250000" → 250000; en pesos "1299.50" → 129950.
 */
export function aUnidadMinima(valor: string | number): number {
  const numero = typeof valor === 'number' ? valor : Number(String(valor).replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(numero)) return 0;
  return Math.round(numero * FACTOR_MONEDA);
}

/** Convierte un importe guardado al número que espera un <input type="number">. */
export function aUnidades(minimos: number): number {
  return FACTOR_MONEDA === 1 ? Math.round(minimos) : Math.round(minimos) / FACTOR_MONEDA;
}

export function formatearNumero(valor: number): string {
  return new Intl.NumberFormat(CONFIG.locale).format(valor);
}

/** Muestra 0.08 como "8 %". */
export function formatearPorcentaje(fraccion: number, decimales = 1): string {
  return new Intl.NumberFormat(CONFIG.locale, {
    style: 'percent',
    maximumFractionDigits: decimales,
  }).format(fraccion);
}

export function formatearFecha(fecha: Date | string | null | undefined): string {
  if (!fecha) return '—';
  return new Intl.DateTimeFormat(CONFIG.locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(fecha));
}

export function formatearFechaHora(fecha: Date | string | null | undefined): string {
  if (!fecha) return '—';
  return new Intl.DateTimeFormat(CONFIG.locale, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(fecha));
}

/** "hace 3 h", "en 2 días". Útil para saber si un lead lleva tiempo sin contacto. */
export function tiempoRelativo(fecha: Date | string | null | undefined): string {
  if (!fecha) return '—';
  const rtf = new Intl.RelativeTimeFormat(CONFIG.locale, { numeric: 'auto' });
  const diferenciaMs = new Date(fecha).getTime() - Date.now();
  const unidades: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 365 * 24 * 60 * 60 * 1000],
    ['month', 30 * 24 * 60 * 60 * 1000],
    ['day', 24 * 60 * 60 * 1000],
    ['hour', 60 * 60 * 1000],
    ['minute', 60 * 1000],
  ];
  for (const [unidad, ms] of unidades) {
    if (Math.abs(diferenciaMs) >= ms) {
      return rtf.format(Math.round(diferenciaMs / ms), unidad);
    }
  }
  return 'hace un momento';
}

/** Periodo contable AAAA-MM de una fecha. */
export function periodoDe(fecha: Date = new Date()): string {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
}

/** "2026-08" → "agosto de 2026" */
export function formatearPeriodo(periodo: string): string {
  const [anio, mes] = periodo.split('-').map(Number);
  if (!anio || !mes) return periodo;
  return new Intl.DateTimeFormat(CONFIG.locale, {
    month: 'long',
    year: 'numeric',
  }).format(new Date(anio, mes - 1, 1));
}

/** Formatea una fecha para un `<input type="datetime-local">` (AAAA-MM-DDTHH:mm). */
export function paraInputFechaHora(fecha: Date | string | null | undefined): string {
  if (!fecha) return '';
  const d = new Date(fecha);
  const doble = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${doble(d.getMonth() + 1)}-${doble(d.getDate())}T${doble(
    d.getHours(),
  )}:${doble(d.getMinutes())}`;
}

/**
 * Formatea un multiplicador de retorno: "2,4×".
 * Usa el separador decimal del idioma, para no mezclar "2.4" con "2,4" en la
 * misma pantalla.
 */
export function formatearMultiplicador(veces: number): string {
  return `${new Intl.NumberFormat(CONFIG.locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(veces)}×`;
}
