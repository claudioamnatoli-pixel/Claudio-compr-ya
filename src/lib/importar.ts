import { FACTOR_MONEDA } from './config';

/**
 * Lectura de un catálogo pegado desde una planilla.
 *
 * No hay subida de archivos en el sistema, así que la vía es copiar las celdas
 * en Excel y pegarlas: el portapapeles las entrega separadas por tabulaciones.
 * También se aceptan punto y coma y comas, que es lo que sale al exportar a CSV
 * según cómo esté configurada la máquina.
 */

export const COLUMNAS = [
  'SKU',
  'Nombre',
  'Categoría',
  'Costo',
  'Precio',
  'Stock',
  'Stock mínimo',
] as const;

export type FilaImportada = {
  linea: number;
  sku: string;
  nombre: string;
  categoria: string;
  costo: number;
  precio: number;
  stock: number;
  stockMinimo: number;
};

export type ErrorDeFila = { linea: number; motivo: string };

/**
 * Convierte un importe escrito por una persona a entero en la unidad mínima.
 *
 * En una moneda sin centavos —el guaraní— cualquier punto o coma es separador
 * de miles: «190.000» son ciento noventa mil, no ciento noventa. Tomarlo como
 * decimal dividiría todos los precios por mil, que es un error que no se nota
 * hasta que alguien vende algo.
 *
 * Con centavos hay que distinguir: el último separador, si deja una o dos
 * cifras detrás, es el decimal; el resto son miles.
 */
export function leerImporte(texto: string): number | null {
  const limpio = texto.trim().replace(/\s|Gs\.?|₲|\$/gi, '');
  if (limpio === '') return null;
  if (!/^-?[\d.,]+$/.test(limpio)) return null;

  if (FACTOR_MONEDA === 1) {
    const digitos = limpio.replace(/[.,]/g, '');
    if (!/^-?\d+$/.test(digitos)) return null;
    return Number(digitos);
  }

  const ultimo = Math.max(limpio.lastIndexOf('.'), limpio.lastIndexOf(','));
  if (ultimo === -1) return Number(limpio) * FACTOR_MONEDA;

  const decimales = limpio.length - ultimo - 1;
  if (decimales > 2) {
    // Más de dos cifras detrás: era separador de miles.
    return Number(limpio.replace(/[.,]/g, '')) * FACTOR_MONEDA;
  }
  const entero = limpio.slice(0, ultimo).replace(/[.,]/g, '');
  const centavos = limpio.slice(ultimo + 1).padEnd(2, '0');
  return Number(entero) * FACTOR_MONEDA + Number(centavos);
}

/** Entero simple: cantidades, que nunca llevan decimales. */
function leerEntero(texto: string): number | null {
  const limpio = texto.trim().replace(/[.\s]/g, '');
  if (limpio === '') return 0;
  if (!/^\d+$/.test(limpio)) return null;
  return Number(limpio);
}

/** Separador que más columnas produce: tabulación, punto y coma o coma. */
function detectarSeparador(primeraLinea: string): string {
  const candidatos = ['\t', ';', ','];
  let mejor = '\t';
  let maximo = 0;
  for (const sep of candidatos) {
    const partes = primeraLinea.split(sep).length;
    if (partes > maximo) {
      maximo = partes;
      mejor = sep;
    }
  }
  return mejor;
}

/**
 * ¿La primera línea son los títulos de las columnas y no un producto?
 *
 * Se compara celda por celda y por igualdad exacta. Buscar «contiene sku»
 * parecía más tolerante y era peor: un producto con código «SKU-0001» se
 * tomaba por encabezado y desaparecía sin aviso. Perder un producto en
 * silencio es mucho peor que pedir que la fila de títulos se llame como
 * corresponde.
 */
function esEncabezado(celdas: readonly string[]): boolean {
  const normal = celdas.map((c) => c.trim().toLowerCase().replace(/^"|"$/g, ''));
  const titulos = ['sku', 'código', 'codigo', 'nombre', 'categoría', 'categoria', 'costo', 'precio', 'stock', 'stock mínimo', 'stock minimo'];
  const coincidencias = normal.filter((c) => titulos.includes(c)).length;
  // Con dos títulos exactos ya es inequívoco: ningún producto se llama
  // «nombre» y vale «precio».
  return coincidencias >= 2;
}

export type Lectura = {
  filas: FilaImportada[];
  errores: ErrorDeFila[];
  /** Duplicados dentro de la misma planilla, que son error del que la armó. */
  repetidos: string[];
};

export function leerPlanilla(texto: string): Lectura {
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim() !== '');
  const filas: FilaImportada[] = [];
  const errores: ErrorDeFila[] = [];
  const vistos = new Set<string>();
  const repetidos: string[] = [];

  if (lineas.length === 0) return { filas, errores, repetidos };

  const separador = detectarSeparador(lineas[0]);
  const desde = esEncabezado(lineas[0].split(separador)) ? 1 : 0;

  for (let i = desde; i < lineas.length; i++) {
    const linea = i + 1;
    const celdas = lineas[i].split(separador).map((c) => c.trim().replace(/^"|"$/g, ''));

    if (celdas.length < 5) {
      errores.push({ linea, motivo: `Tiene ${celdas.length} columnas y hacen falta al menos 5.` });
      continue;
    }

    const [sku, nombre, categoria, costoTexto, precioTexto, stockTexto, minimoTexto] = celdas;
    if (!sku) { errores.push({ linea, motivo: 'Falta el código (SKU).' }); continue; }

    // El duplicado se comprueba antes que el resto a propósito: si se dejara
    // para el final, un código cuya primera aparición fue rechazada por otro
    // motivo no quedaría registrado, y la segunda pasaría como buena.
    if (vistos.has(sku)) {
      repetidos.push(sku);
      errores.push({ linea, motivo: `El código ${sku} aparece más de una vez en la planilla.` });
      continue;
    }
    vistos.add(sku);
    if (!nombre) { errores.push({ linea, motivo: 'Falta el nombre.' }); continue; }
    if (!categoria) { errores.push({ linea, motivo: 'Falta la categoría.' }); continue; }

    const costo = leerImporte(costoTexto ?? '');
    const precio = leerImporte(precioTexto ?? '');
    if (costo === null) { errores.push({ linea, motivo: `No entiendo el costo «${costoTexto}».` }); continue; }
    if (precio === null) { errores.push({ linea, motivo: `No entiendo el precio «${precioTexto}».` }); continue; }
    if (costo < 0 || precio < 0) { errores.push({ linea, motivo: 'El costo y el precio no pueden ser negativos.' }); continue; }
    if (precio < costo) {
      errores.push({ linea, motivo: 'El precio de venta es menor que el costo.' });
      continue;
    }

    const stock = leerEntero(stockTexto ?? '');
    const stockMinimo = leerEntero(minimoTexto ?? '');
    if (stock === null) { errores.push({ linea, motivo: `No entiendo el stock «${stockTexto}».` }); continue; }
    if (stockMinimo === null) { errores.push({ linea, motivo: `No entiendo el stock mínimo «${minimoTexto}».` }); continue; }

    filas.push({ linea, sku, nombre, categoria, costo, precio, stock, stockMinimo });
  }

  return { filas, errores, repetidos };
}
