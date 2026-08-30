import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { BarraFiltros, FiltroSelect, FiltroTexto, primerValor } from '@/components/filtros';
import {
  EncabezadoPagina,
  EncabezadoTabla,
  Etiqueta,
  SinDatos,
  Tabla,
  Tarjeta,
} from '@/components/ui';
import { EMBUDO_LEAD, ESTADOS_LEAD, ORIGENES_LEAD } from '@/lib/dominio';
import { formatearDinero, tiempoRelativo } from '@/lib/formato';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Prospectos' };

type Parametros = Promise<{ [clave: string]: string | string[] | undefined }>;

export default async function LeadsPage({ searchParams }: { searchParams: Parametros }) {
  const parametros = await searchParams;
  const estado = primerValor(parametros.estado);
  const origen = primerValor(parametros.origen);
  const vendedorId = primerValor(parametros.vendedorId);
  const busqueda = primerValor(parametros.q);

  const filtro: Prisma.LeadWhereInput = {
    ...(estado ? { estado } : {}),
    ...(origen ? { origen } : {}),
    ...(vendedorId ? { vendedorId } : {}),
    ...(busqueda
      ? {
          OR: [
            { nombre: { contains: busqueda } },
            { telefono: { contains: busqueda } },
            { codigo: { contains: busqueda } },
          ],
        }
      : {}),
  };

  const [leads, vendedores, conteos] = await Promise.all([
    prisma.lead.findMany({
      where: filtro,
      orderBy: [{ createdAt: 'desc' }],
      take: 200,
      include: {
        vendedor: { select: { nombre: true } },
        productoInteres: { select: { nombre: true, precio: true } },
        campana: { select: { nombre: true } },
        _count: { select: { mensajes: true, pedidos: true } },
      },
    }),
    prisma.empleado.findMany({
      where: { rol: { in: ['VENDEDOR', 'LIDER'] }, activo: true },
      select: { id: true, nombre: true },
      orderBy: { nombre: 'asc' },
    }),
    prisma.lead.groupBy({ by: ['estado'], _count: { _all: true } }),
  ]);

  const porEstado = new Map(conteos.map((fila) => [fila.estado, fila._count._all]));

  return (
    <>
      <EncabezadoPagina
        titulo="Prospectos"
        descripcion="Cada persona que escribió por un video, un live o un anuncio de TikTok. El objetivo es que ninguna se quede sin respuesta."
        acciones={
          <Link href="/leads/nuevo" className="boton-primario">
            Registrar prospecto
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {EMBUDO_LEAD.map((etapa) => {
          const activo = estado === etapa;
          return (
            <Link
              key={etapa}
              href={activo ? '/leads' : `/leads?estado=${etapa}`}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                activo
                  ? 'border-marca-600 bg-marca-600 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
              }`}
            >
              {ESTADOS_LEAD.etiqueta(etapa)}
              <span className={activo ? 'ml-1.5 text-white/80' : 'ml-1.5 text-slate-400'}>
                {porEstado.get(etapa) ?? 0}
              </span>
            </Link>
          );
        })}
      </div>

      <BarraFiltros accionLimpiar="/leads">
        <FiltroTexto nombre="q" etiqueta="Buscar" valor={busqueda} marcador="Nombre o teléfono" />
        <FiltroSelect
          nombre="estado"
          etiqueta="Etapa"
          valor={estado}
          opciones={ESTADOS_LEAD.opciones}
          textoTodos="Todas"
        />
        <FiltroSelect
          nombre="origen"
          etiqueta="Origen"
          valor={origen}
          opciones={ORIGENES_LEAD.opciones}
        />
        <FiltroSelect
          nombre="vendedorId"
          etiqueta="Responsable"
          valor={vendedorId}
          opciones={vendedores.map((v) => ({ valor: v.id, etiqueta: v.nombre }))}
        />
      </BarraFiltros>

      <Tarjeta>
        {leads.length === 0 ? (
          <SinDatos mensaje="Ningún prospecto coincide con estos filtros." />
        ) : (
          <Tabla>
            <EncabezadoTabla
              columnas={[
                'Prospecto',
                'Origen',
                'Interés',
                'Responsable',
                'Etapa',
                'Último contacto',
              ]}
            />
            <tbody className="divide-y divide-slate-100">
              {leads.map((lead) => (
                <tr key={lead.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/leads/${lead.id}`}
                      className="font-medium text-slate-900 hover:text-marca-700 hover:underline"
                    >
                      {lead.nombre}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {lead.codigo} · {lead.telefono}
                      {lead.ciudad ? ` · ${lead.ciudad}` : ''}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <Etiqueta tono={ORIGENES_LEAD.tono(lead.origen)}>
                      {ORIGENES_LEAD.etiqueta(lead.origen)}
                    </Etiqueta>
                    {lead.campana ? (
                      <p className="mt-1 max-w-[14rem] truncate text-xs text-slate-500">
                        {lead.campana.nombre}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {lead.productoInteres ? (
                      <>
                        <p className="max-w-[14rem] truncate">{lead.productoInteres.nombre}</p>
                        <p className="text-xs text-slate-500">
                          {formatearDinero(lead.productoInteres.precio)}
                        </p>
                      </>
                    ) : (
                      <span className="text-slate-400">Sin definir</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {lead.vendedor?.nombre ?? (
                      <span className="text-amber-600">Sin asignar</span>
                    )}
                    <p className="text-xs text-slate-500">
                      {lead._count.mensajes} mensajes · {lead._count.pedidos} pedidos
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <Etiqueta tono={ESTADOS_LEAD.tono(lead.estado)}>
                      {ESTADOS_LEAD.etiqueta(lead.estado)}
                    </Etiqueta>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                    {lead.ultimoContactoAt ? tiempoRelativo(lead.ultimoContactoAt) : 'Nunca'}
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </Tarjeta>
    </>
  );
}
