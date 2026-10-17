// El lector de planillas, sin navegador ni base. Son las comprobaciones que
// más barato sale repetir, así que no dependen de nada.
import { leerPlanilla, leerImporte } from '../src/lib/importar.ts';

let fallos = 0;
const ok = (d, c, x = '') => { console.log(`${c ? '  ok  ' : ' FALLA'} ${d}${x ? ' — ' + x : ''}`); if (!c) fallos++; };

// --- Importes: la trampa de los miles ------------------------------------
ok('«190.000» son ciento noventa mil, no ciento noventa', leerImporte('190.000') === 190000,
  String(leerImporte('190.000')));
ok('«190000» también', leerImporte('190000') === 190000, String(leerImporte('190000')));
ok('«1.250.000» se lee entero', leerImporte('1.250.000') === 1250000, String(leerImporte('1.250.000')));
ok('«Gs. 85.000» ignora el símbolo', leerImporte('Gs. 85.000') === 85000, String(leerImporte('Gs. 85.000')));
ok('«190,000» con coma también', leerImporte('190,000') === 190000, String(leerImporte('190,000')));
ok('vacío no es cero: no se puede adivinar', leerImporte('') === null);
ok('texto suelto se rechaza', leerImporte('ocho mil') === null);

// --- Planilla pegada desde Excel (tabulaciones) --------------------------
const pegado = [
  'SKU\tNombre\tCategoría\tCosto\tPrecio\tStock\tStock mínimo',
  'COS-001\tLabial mate rojo\tCosmética\t18.000\t35.000\t120\t20',
  'COS-002\tBase líquida tono 2\tCosmética\t42.000\t79.000\t40\t10',
].join('\n');
const r1 = leerPlanilla(pegado);
ok('se saltea la fila de títulos', r1.filas.length === 2, `${r1.filas.length} filas`);
ok('y lee bien los importes', r1.filas[0].costo === 18000 && r1.filas[0].precio === 35000,
  `${r1.filas[0].costo} / ${r1.filas[0].precio}`);
ok('sin errores', r1.errores.length === 0, r1.errores.map((e) => e.motivo).join(' | '));

// --- Sin encabezado, con punto y coma (CSV de Excel en español) ----------
const csv = 'HOG-010;Termo de acero;Hogar;95.000;160.000;15;5';
const r2 = leerPlanilla(csv);
ok('sin títulos, toma la primera fila como producto', r2.filas.length === 1);
ok('y detecta el punto y coma', r2.filas[0].sku === 'HOG-010', r2.filas[0]?.sku ?? '');

// --- Lo que tiene que rechazar -------------------------------------------
// Una fila buena entre cuatro malas: lo que importa es que la buena entre y
// las malas no arrastren al resto.
const malas = [
  'A-0\tBuena\tRubro\t10.000\t25.000\t3\t1',    // válida
  'A-1\tCosa\tRubro\t10.000\t5.000\t1\t1',      // precio menor que el costo
  'A-2\tOtra\tRubro\tocho mil\t20.000\t1\t1',   // costo ilegible
  '\tSin código\tRubro\t1.000\t2.000\t1\t1',    // sin SKU
  'A-0\tRepetida\tRubro\t1.000\t2.000\t1\t1',   // repite a la buena
].join('\n');
const r3 = leerPlanilla(malas);
ok('la fila buena entra y las cuatro malas no', r3.filas.length === 1 && r3.errores.length === 4,
  `${r3.filas.length} buenas, ${r3.errores.length} errores`);
ok('y la que entró es la correcta', r3.filas[0]?.sku === 'A-0', r3.filas[0]?.sku ?? '');
ok('avisa del precio menor al costo', r3.errores.some((e) => e.motivo.includes('menor que el costo')));
ok('avisa del importe ilegible', r3.errores.some((e) => e.motivo.includes('No entiendo el costo')));
ok('avisa del código repetido', r3.errores.some((e) => e.motivo.includes('más de una vez')));
ok('y dice en qué línea', r3.errores.every((e) => e.linea > 0), r3.errores.map((e) => e.linea).join(','));

// --- El bug que costó un producto en silencio ----------------------------
const conSkuLiteral = leerPlanilla('SKU-0001\tPrimero\tRubro\t10.000\t25.000\t1\t1');
ok('un código que empieza con «SKU-» no se confunde con la fila de títulos',
  conSkuLiteral.filas.length === 1, `${conSkuLiteral.filas.length} filas`);
const conTitulos = leerPlanilla('SKU\tNombre\tPrecio\nA-1\tCosa\tRubro\t1.000\t2.000\t1\t1');
ok('pero una fila de títulos de verdad sí se saltea', conTitulos.filas.length === 1,
  `${conTitulos.filas.length} filas`);

// --- Escala: 3.000 productos ---------------------------------------------
const muchas = Array.from({ length: 3000 }, (_, i) =>
  `SKU-${String(i).padStart(4, '0')}\tProducto ${i}\tRubro\t10.000\t25.000\t5\t2`).join('\n');
const arranque = Date.now();
const r4 = leerPlanilla(muchas);
const tardo = Date.now() - arranque;
ok('lee 3.000 productos', r4.filas.length === 3000, `${r4.filas.length}`);
ok('y lo hace rápido', tardo < 2000, `${tardo} ms`);

console.log(fallos === 0 ? '\nEl lector de planillas funciona.' : `\n${fallos} fallo(s).`);
process.exit(fallos === 0 ? 0 : 1);
