import { requerirPagina } from '@/lib/guardias';
import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { BarraFiltros, FiltroSelect, FiltroTexto, primerValor } from '@/components/filtros';
import {
  EncabezadoPagina,
  Etiqueta,
  Indicador,
  SinDatos,
  Tarjeta,
} from '@/components/ui';
import {
  ACCIONES_AUDITADAS,
  CAMPOS_DE_DINERO,
  CAMPOS_DE_PORCENTAJE,
  etiquetaDeAccion,
  GRUPOS_AUDITORIA,
  leerCambios,
  NOMBRES_DE_CAMPO,
  tonoDeAccion,
} from '@/lib/auditoria';
import {
  formatearDinero,
  formatearFechaHora,
  formatearNumero,
  formatearPorcentaje,
  tiempoRelativo,
} from '@/lib/formato';
import { inicioDelDia } from '@/lib/consultas';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Auditoría' };

type Parametros = Promise<{ [clave: string]: string | string[] | undefined }>;

/** Presenta el valor de un campo según lo que sea: dinero, porcentaje, sí/no… */
function valorLegible(campo: string, valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return '—';
  if (typeof valor === 'boolean') return valor ? 'Sí' : 'No';
  if (typeof valor === 'number') {
    if (CAMPOS_DE_DINERO.has(campo)) return formatearDinero(valor);
    if (CAMPOS_DE_PORCENTAJE.has(campo)) return formatearPorcentaje(valor);
    return formatearNumero(valor);
  }
  return String(valor);
}

export default async function AuditoriaPage({ searchParams }: { searchParams: Parametros }) {
  await requerirPagina('auditoria.ver');
  const parametros = await searchParams;
  const accion = primerValor(parametros.accion);
  const grupo = primerValor(parametros.grupo);
  const busqueda = primerValor(parametros.q);

  const accionesDelGrupo = grupo ? GRUPOS_AUDITORIA[grupo]?.acciones : undefined;

  const filtro: Prisma.AuditoriaWhereInput = {
    ...(accion ? { accion } : accionesDelGrupo ? { accion: { in: accionesDelGrupo } } : {}),
    ...(busqueda
      ? { OR: [{ resumen: { contains: busqueda } }, { actor: { contains: busqueda } }] }
      : {}),
  };

  const [entradas, hoy, fallidos, total] = await Promise.all([
    prisma.auditoria.findMany({
      where: filtro,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { empleado: { select: { id: true, nombre: true } } },
    }),
    prisma.auditoria.count({ where: { createdAt: { gte: inicioDelDia() } } }),
    prisma.auditoria.count({
      where: {
        accion: 'sesion.fallida',
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
    }),
    prisma.auditoria.count(),
  ]);

  return (
    <>
      <EncabezadoPagina
        titulo="Registro de auditoría"
        descripcion="Quién cambió un sueldo, un precio o una comisión, quién dio acceso a quién y quién intentó entrar sin conseguirlo."
      />

      <section className="mb-6 grid gap-4 sm:grid-cols-3">
        <Indicador
          titulo="Movimientos hoy"
          valor={formatearNumero(hoy)}
          detalle="Desde las 00:00"
          tono="azul"
        />
        <Indicador
          titulo="Accesos fallidos"
          valor={formatearNumero(fallidos)}
          detalle="En los últimos 7 días"
          tono={fallidos > 10 ? 'rojo' : fallidos > 0 ? 'ambar' : 'verde'}
        />
        <Indicador
          titulo="Total registrado"
          valor={formatearNumero(total)}
          detalle="Desde que existe el registro"
          tono="gris"
        />
      </section>

      <div className="mb-4 flex flex-wrap gap-2">
        {[{ clave: '', etiqueta: 'Todo' }, ...Object.entries(GRUPOS_AUDITORIA).map(([clave, datos]) => ({ clave, etiqueta: datos.etiqueta }))].map(
          (opcion) => {
            const activo = (grupo ?? '') === opcion.clave;
            return (
              <Link
                key={opcion.clave || 'todo'}
                href={opcion.clave ? `/auditoria?grupo=${opcion.clave}` : '/auditoria'}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  activo
                    ? 'border-marca-600 bg-marca-600 text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                }`}
              >
                {opcion.etiqueta}
              </Link>
            );
          },
        )}
      </div>

      <BarraFiltros accionLimpiar="/auditoria">
        <FiltroTexto nombre="q" etiqueta="Buscar" valor={busqueda} marcador="Persona o descripción" />
        <FiltroSelect
          nombre="accion"
          etiqueta="Tipo"
          valor={accion}
          opciones={Object.entries(ACCIONES_AUDITADAS).map(([valor, datos]) => ({
            valor,
            etiqueta: datos.etiqueta,
          }))}
        />
      </BarraFiltros>

      <Tarjeta>
        {entradas.length === 0 ? (
          <SinDatos mensaje="No hay movimientos que coincidan con estos filtros." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {entradas.map((entrada) => {
              const cambios = leerCambios(entrada.cambios);
              return (
                <li key={entrada.id} className="px-5 py-3.5">
                  <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
                    <Etiqueta tono={tonoDeAccion(entrada.accion)}>
                      {etiquetaDeAccion(entrada.accion)}
                    </Etiqueta>
                    <p className="min-w-0 flex-1 text-sm text-slate-800">{entrada.resumen}</p>
                    <p className="whitespace-nowrap text-xs text-slate-500">
                      {formatearFechaHora(entrada.createdAt)}
                      <span className="ml-2 text-slate-400">
                        {tiempoRelativo(entrada.createdAt)}
                      </span>
                    </p>
                  </div>

                  <p className="mt-1 text-xs text-slate-500">
                    Por{' '}
                    {entrada.empleado ? (
                      <Link
                        href={`/equipo/${entrada.empleado.id}`}
                        className="font-medium text-marca-700 hover:underline"
                      >
                        {entrada.actor}
                      </Link>
                    ) : (
                      <span className="font-medium">{entrada.actor}</span>
                    )}
                  </p>

                  {cambios ? (
                    <ul className="mt-2 space-y-1 rounded-lg bg-slate-50 px-3 py-2 text-xs">
                      {Object.entries(cambios).map(([campo, cambio]) => (
                        <li key={campo} className="flex flex-wrap items-baseline gap-x-2">
                          <span className="font-medium text-slate-600">
                            {NOMBRES_DE_CAMPO[campo] ?? campo}
                          </span>
                          <span className="text-slate-500 line-through">
                            {valorLegible(campo, cambio.antes)}
                          </span>
                          <span className="text-slate-400">→</span>
                          <span className="font-semibold text-slate-800">
                            {valorLegible(campo, cambio.despues)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Tarjeta>

      {entradas.length === 200 ? (
        <p className="mt-3 text-xs text-slate-500">
          Se muestran los 200 movimientos más recientes. Afina los filtros para ver más atrás.
        </p>
      ) : null}
    </>
  );
}
