// La aritmética de los gastos fijos, sin navegador ni base:
//
//   npx tsx pruebas/gastos-fijos.mjs
//
// Son las cuentas que no se pueden mirar a ojo. Un día de pago que no existe en
// febrero, un período que cruza el año, una vigencia que se pasa por un mes: si
// alguna de estas falla, los gastos del mes salen en la fecha equivocada o no
// salen, y eso recién se nota cuando el estado de resultados no cuadra.
process.env.DATABASE_URL ??= 'file:./dev.db';

const {
  aguinaldoSobre,
  fechaDePago,
  ipsPatronalSobre,
  periodoAnterior,
  periodoSiguiente,
  vigenteEn,
} = await import('../src/lib/recurrentes.ts');

let fallos = 0;
const ok = (d, c, x = '') => {
  console.log(`${c ? '  ok  ' : ' FALLA'} ${d}${x ? ' — ' + x : ''}`);
  if (!c) fallos++;
};

console.log('\nPeríodos');
ok('diciembre pasa a enero del año siguiente', periodoSiguiente('2026-12') === '2027-01',
  periodoSiguiente('2026-12'));
ok('el mes siguiente lleva cero adelante', periodoSiguiente('2026-01') === '2026-02',
  periodoSiguiente('2026-01'));
ok('enero retrocede a diciembre del año anterior', periodoAnterior('2026-01') === '2025-12',
  periodoAnterior('2026-01'));
ok('el mes anterior lleva cero adelante', periodoAnterior('2026-03') === '2026-02',
  periodoAnterior('2026-03'));
ok('los períodos se ordenan como texto', ['2026-10', '2026-02', '2025-12'].sort().join() ===
  '2025-12,2026-02,2026-10');

console.log('\nFecha de pago');
const feb = fechaDePago('2026-02', 28);
ok('el 28 existe en febrero', feb.getDate() === 28 && feb.getMonth() === 1,
  feb.toISOString().slice(0, 10));
const feb31 = fechaDePago('2027-02', 31);
ok('un día 31 se recorta al último de febrero', feb31.getDate() === 28,
  `cayó el ${feb31.getDate()}`);
const bisiesto = fechaDePago('2024-02', 31);
ok('en año bisiesto se recorta al 29, no al 28', bisiesto.getDate() === 29,
  `cayó el ${bisiesto.getDate()}`);
const oct = fechaDePago('2026-10', 5);
ok('el mes no se corre en uno', oct.getMonth() === 9 && oct.getFullYear() === 2026,
  oct.toISOString().slice(0, 10));
ok('la fecha queda al mediodía, para que el huso no la mueva de mes', oct.getHours() === 12);
const cero = fechaDePago('2026-10', 0);
ok('un día 0 se corrige al primero', cero.getDate() === 1, `cayó el ${cero.getDate()}`);

console.log('\nVigencia');
const base = { desde: '2026-03', hasta: null, activo: true };
ok('un recurrente de baja no genera', !vigenteEn({ ...base, activo: false }, '2026-05'));
ok('antes del mes de inicio no genera', !vigenteEn(base, '2026-02'));
ok('el mes de inicio sí genera', vigenteEn(base, '2026-03'));
ok('sin fecha de fin sigue generando un año después', vigenteEn(base, '2027-03'));
const acotado = { ...base, hasta: '2026-06' };
ok('el mes de fin se incluye', vigenteEn(acotado, '2026-06'));
ok('después del mes de fin no genera', !vigenteEn(acotado, '2026-07'));

console.log('\nAguinaldo e IPS patronal');
ok('el aguinaldo es un doceavo del bruto', aguinaldoSobre(45_000_000) === 3_750_000,
  String(aguinaldoSobre(45_000_000)));
ok('el IPS patronal es el 16,5 %', ipsPatronalSobre(45_000_000) === 7_425_000,
  String(ipsPatronalSobre(45_000_000)));
ok('un bruto no divisible por doce da un entero', Number.isInteger(aguinaldoSobre(3_100_000)),
  String(aguinaldoSobre(3_100_000)));
ok('el IPS de un importe impar da un entero', Number.isInteger(ipsPatronalSobre(3_100_001)),
  String(ipsPatronalSobre(3_100_001)));
ok('sin planilla no se devenga nada', aguinaldoSobre(0) === 0 && ipsPatronalSobre(0) === 0);
ok('la planilla cuesta más que el bruto', 45_000_000 + aguinaldoSobre(45_000_000) +
  ipsPatronalSobre(45_000_000) === 56_175_000);

console.log(fallos === 0 ? '\nTodas las comprobaciones pasaron.' : `\n${fallos} comprobaciones fallaron.`);
process.exit(fallos === 0 ? 0 : 1);
