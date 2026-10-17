import type { Prisma, PrismaClient } from '@prisma/client';
import { periodoDe } from './formato';
import { prisma } from './prisma';

/**
 * Los gastos fijos del mes: lo que se paga pase lo que pase.
 *
 * Dos fuentes, un solo destino. Las plantillas de `GastoRecurrente` —alquiler,
 * internet, limpieza— y la nómina, que sale de `Empleado.salarioBase`. Las dos
 * se escriben como filas normales de `Gasto`, así que el estado de resultados
 * no cambió ni una línea: sigue leyendo `Gasto` y la regla de que cada gasto se
 * cuenta una sola vez, en su lugar natural, queda intacta.
 *
 * Tres decisiones que hay que respetar:
 *
 * - **Un período no se puede generar dos veces.** Cada fila generada lleva una
 *   `claveGeneracion` única; tocar el botón de nuevo no escribe nada. Sin eso,
 *   dos clics cargan el alquiler dos veces y el resultado del mes miente.
 * - **Se genera con un botón, nunca al abrir la pantalla.** Una página que se
 *   mira no debe escribir en la base: con dos personas mirando, o con el
 *   navegador recargando, aparecerían gastos que nadie cargó.
 * - **El aguinaldo es una provisión mensual, no un gasto de diciembre.** Se
 *   devenga todos los meses (un doceavo); si se cargara entero en diciembre,
 *   once meses se verían mejores de lo que son y el último, una catástrofe.
 */

/** Aporte patronal al IPS, en décimas de punto porcentual (165 = 16,5 %). */
export const IPS_PATRONAL_DECIMAS = 165;

/** Meses de aguinaldo por año. Uno, repartido en doce provisiones. */
export const MESES_DE_AGUINALDO = 1;

/** Cuántos períodos atrás se ofrece generar, para que la lista no crezca sola. */
const MAXIMO_PERIODOS_PENDIENTES = 12;

export type RenglonDePeriodo = {
  /// Identidad única de este renglón en este período.
  clave: string;
  categoria: string;
  descripcion: string;
  monto: number;
  fecha: Date;
  recurrenteId: string | null;
  proveedorId: string | null;
  /// Ya existe en la base: no se vuelve a escribir.
  generado: boolean;
};

export type Nomina = Awaited<ReturnType<typeof nominaDelMes>>;

/**
 * Aporte patronal sobre un bruto. Se redondea a la unidad mínima de la moneda
 * porque el dinero es un entero: un decimal acá se arrastra a todo el resto.
 */
export function ipsPatronalSobre(bruto: number): number {
  return Math.round((bruto * IPS_PATRONAL_DECIMAS) / 1000);
}

/** La provisión del mes: un doceavo del aguinaldo anual. */
export function aguinaldoSobre(bruto: number): number {
  return Math.round((bruto * MESES_DE_AGUINALDO) / 12);
}

/** Período anterior a uno dado: "2026-01" → "2025-12". */
export function periodoAnterior(periodo: string): string {
  const [anio, mes] = periodo.split('-').map(Number);
  return mes === 1
    ? `${anio - 1}-12`
    : `${anio}-${String(mes - 1).padStart(2, '0')}`;
}

/** Período siguiente a uno dado: "2026-12" → "2027-01". */
export function periodoSiguiente(periodo: string): string {
  const [anio, mes] = periodo.split('-').map(Number);
  return mes === 12
    ? `${anio + 1}-01`
    : `${anio}-${String(mes + 1).padStart(2, '0')}`;
}

/**
 * Fecha dentro del período en que se paga. El día se limita a 1–28 al cargar el
 * recurrente, así que existe en cualquier mes; se recorta igual por si un dato
 * viejo trae otro valor.
 */
export function fechaDePago(periodo: string, dia: number): Date {
  const [anio, mes] = periodo.split('-').map(Number);
  const ultimo = new Date(anio, mes, 0).getDate();
  const diaValido = Math.min(Math.max(dia, 1), ultimo);
  return new Date(anio, mes - 1, diaValido, 12, 0, 0, 0);
}

/** ¿Este período cae dentro de la vigencia del recurrente? */
export function vigenteEn(
  recurrente: { desde: string; hasta: string | null; activo: boolean },
  periodo: string,
): boolean {
  if (!recurrente.activo) return false;
  if (periodo < recurrente.desde) return false;
  if (recurrente.hasta && periodo > recurrente.hasta) return false;
  return true;
}

/**
 * Lo que cuesta el personal este mes.
 *
 * Sale de `Empleado.salarioBase` de la gente activa: una sola lista, sin copia
 * que se desactualice. El aguinaldo y el IPS patronal se calculan sobre ese
 * bruto, porque son plata que sale aunque no figure en el recibo de sueldo.
 */
export async function nominaDelMes(cliente: PrismaClient | Prisma.TransactionClient = prisma) {
  const empleados = await cliente.empleado.findMany({
    where: { activo: true, salarioBase: { gt: 0 } },
    select: { id: true, nombre: true, rol: true, salarioBase: true },
    orderBy: [{ rol: 'asc' }, { nombre: 'asc' }],
  });

  const bruto = empleados.reduce((suma, e) => suma + e.salarioBase, 0);
  const aguinaldo = aguinaldoSobre(bruto);
  const ips = ipsPatronalSobre(bruto);

  return {
    empleados,
    personas: empleados.length,
    bruto,
    aguinaldo,
    ips,
    /// Lo que de verdad cuesta la planilla: el bruto no alcanza para
    /// presupuestar, porque faltan el aguinaldo y el aporte patronal.
    total: bruto + aguinaldo + ips,
  };
}

/**
 * Los renglones que corresponden a un período, marcando los que ya se
 * escribieron. No escribe nada: es lo que la pantalla muestra antes de generar.
 */
export async function renglonesDePeriodo(
  periodo: string,
  cliente: PrismaClient | Prisma.TransactionClient = prisma,
): Promise<RenglonDePeriodo[]> {
  const [recurrentes, nomina, existentes] = await Promise.all([
    cliente.gastoRecurrente.findMany({ orderBy: { descripcion: 'asc' } }),
    nominaDelMes(cliente),
    cliente.gasto.findMany({
      where: { periodo },
      select: { claveGeneracion: true },
    }),
  ]);

  const yaEstan = new Set(existentes.map((g) => g.claveGeneracion).filter(Boolean) as string[]);
  const renglones: RenglonDePeriodo[] = [];

  for (const r of recurrentes) {
    if (!vigenteEn(r, periodo)) continue;
    const clave = `recurrente:${r.id}:${periodo}`;
    renglones.push({
      clave,
      categoria: r.categoria,
      descripcion: r.descripcion,
      monto: r.monto,
      fecha: fechaDePago(periodo, r.diaDePago),
      recurrenteId: r.id,
      proveedorId: r.proveedorId,
      generado: yaEstan.has(clave),
    });
  }

  if (nomina.bruto > 0) {
    // El último día del mes: el sueldo se devenga por el mes trabajado.
    const fecha = fechaDePago(periodo, 28);
    const personas = `${nomina.personas} ${nomina.personas === 1 ? 'persona' : 'personas'}`;
    const deNomina = [
      { sufijo: 'sueldos', texto: `Sueldos · ${personas}`, monto: nomina.bruto },
      { sufijo: 'aguinaldo', texto: `Aguinaldo devengado · ${personas}`, monto: nomina.aguinaldo },
      { sufijo: 'ips', texto: `IPS patronal · ${personas}`, monto: nomina.ips },
    ];
    for (const linea of deNomina) {
      if (linea.monto <= 0) continue;
      const clave = `${linea.sufijo}:${periodo}`;
      renglones.push({
        clave,
        categoria: 'SUELDOS',
        descripcion: linea.texto,
        monto: linea.monto,
        fecha,
        recurrenteId: null,
        proveedorId: null,
        generado: yaEstan.has(clave),
      });
    }
  }

  return renglones;
}

/**
 * Escribe los gastos que faltan de un período y devuelve qué escribió.
 *
 * Se filtra en TypeScript lo que ya está porque `skipDuplicates` de
 * `createMany` no funciona en SQLite, y el proyecto corre sobre los dos
 * motores. El índice único sigue siendo la garantía de verdad: si dos personas
 * generan el mismo período a la vez, la transacción falla en voz alta en lugar
 * de duplicar el alquiler en silencio.
 */
export async function generarPeriodo(
  tx: Prisma.TransactionClient,
  periodo: string,
  empleadoId: string,
): Promise<{ escritos: number; total: number; descripciones: string[] }> {
  const renglones = await renglonesDePeriodo(periodo, tx);
  const faltantes = renglones.filter((r) => !r.generado);
  if (faltantes.length === 0) return { escritos: 0, total: 0, descripciones: [] };

  await tx.gasto.createMany({
    data: faltantes.map((r) => ({
      categoria: r.categoria,
      descripcion: `${r.descripcion} · ${periodo}`,
      monto: r.monto,
      fecha: r.fecha,
      claveGeneracion: r.clave,
      periodo,
      recurrenteId: r.recurrenteId,
      proveedorId: r.proveedorId,
      empleadoId,
    })),
  });

  return {
    escritos: faltantes.length,
    total: faltantes.reduce((suma, r) => suma + r.monto, 0),
    descripciones: faltantes.map((r) => r.descripcion),
  };
}

/**
 * Períodos que tienen algo por generar, del más viejo al más nuevo.
 *
 * Arranca en el `desde` más antiguo de los recurrentes vigentes y llega hasta
 * el mes actual, con un techo para que una fecha de inicio muy vieja no
 * devuelva una lista interminable.
 */
export async function periodosPendientes(hoy: Date = new Date()) {
  const actual = periodoDe(hoy);
  const recurrentes = await prisma.gastoRecurrente.findMany({
    where: { activo: true },
    select: { desde: true },
    orderBy: { desde: 'asc' },
    take: 1,
  });

  let periodo = recurrentes[0]?.desde ?? actual;
  if (periodo > actual) periodo = actual;

  const periodos: string[] = [];
  while (periodo <= actual && periodos.length < MAXIMO_PERIODOS_PENDIENTES + 1) {
    periodos.push(periodo);
    periodo = periodoSiguiente(periodo);
  }
  const ultimos = periodos.slice(-MAXIMO_PERIODOS_PENDIENTES);

  const resumen = await Promise.all(
    ultimos.map(async (p) => {
      const renglones = await renglonesDePeriodo(p);
      const faltantes = renglones.filter((r) => !r.generado);
      return {
        periodo: p,
        renglones,
        faltantes: faltantes.length,
        aGenerar: faltantes.reduce((suma, r) => suma + r.monto, 0),
        yaGenerado: renglones
          .filter((r) => r.generado)
          .reduce((suma, r) => suma + r.monto, 0),
      };
    }),
  );

  return resumen.filter((p) => p.renglones.length > 0);
}
