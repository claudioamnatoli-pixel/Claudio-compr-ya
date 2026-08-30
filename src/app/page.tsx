import Link from 'next/link';
import {
  EncabezadoPagina,
  Etiqueta,
  Indicador,
  Progreso,
  SinDatos,
  Tarjeta,
  TarjetaTitulo,
} from '@/components/ui';
import {
  EMBUDO_LEAD,
  ESTADOS_LEAD,
  ESTADOS_PEDIDO,
  METODOS_PAGO,
  TIPOS_CAMPANA,
} from '@/lib/dominio';
import {
  embudoDeLeads,
  productosConStockBajo,
  productosMasVendidos,
  rendimientoDeCampanas,
  rendimientoDeVendedores,
  resumenDelNegocio,
} from '@/lib/consultas';
import {
  formatearDinero,
  formatearDineroCorto,
  formatearNumero,
  formatearPorcentaje,
  periodoDe,
  tiempoRelativo,
} from '@/lib/formato';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function PanelPage() {
  const periodo = periodoDe();
  const [resumen, embudo, campanas, vendedores, stockBajo, masVendidos, pedidosRecientes] =
    await Promise.all([
      resumenDelNegocio(),
      embudoDeLeads(),
      rendimientoDeCampanas(),
      rendimientoDeVendedores(periodo),
      productosConStockBajo(5),
      productosMasVendidos(5),
      prisma.pedido.findMany({
        take: 8,
        orderBy: { createdAt: 'desc' },
        include: { vendedor: { select: { nombre: true } } },
      }),
    ]);

  const totalEmbudo = EMBUDO_LEAD.reduce((suma, etapa) => suma + (embudo.get(etapa) ?? 0), 0);
  const campanasOrdenadas = [...campanas].sort((a, b) => b.ingresos - a.ingresos).slice(0, 5);

  return (
    <>
      <EncabezadoPagina
        titulo="Panel de operación"
        descripcion="Cómo va el mes: qué trae TikTok, qué se cierra por WhatsApp y qué falta entregar."
        acciones={
          <>
            <Link href="/leads/nuevo" className="boton-secundario">
              Registrar prospecto
            </Link>
            <Link href="/pedidos/nuevo" className="boton-primario">
              Nuevo pedido
            </Link>
          </>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador
          titulo="Ventas del mes"
          valor={formatearDineroCorto(resumen.ventasMes)}
          tono={resumen.variacion !== null && resumen.variacion >= 0 ? 'verde' : 'rojo'}
          detalle={
            resumen.variacion === null
              ? 'Sin mes anterior con el que comparar'
              : `${resumen.variacion >= 0 ? '▲' : '▼'} ${formatearPorcentaje(
                  Math.abs(resumen.variacion),
                )} contra el mes pasado`
          }
        />
        <Indicador
          titulo="Pedidos del mes"
          valor={formatearNumero(resumen.pedidosMes)}
          tono="azul"
          detalle={`Ticket promedio ${formatearDinero(resumen.ticketPromedio)}`}
        />
        <Indicador
          titulo="Conversión de prospectos"
          valor={formatearPorcentaje(resumen.conversion)}
          tono="marca"
          detalle={`${resumen.leadsGanadosMes} cerrados de ${resumen.leadsMes} prospectos`}
        />
        <Indicador
          titulo="Entregas en curso"
          valor={formatearNumero(resumen.entregasPendientes)}
          tono={resumen.productosStockBajo > 0 ? 'ambar' : 'verde'}
          detalle={
            resumen.productosStockBajo > 0
              ? `${resumen.productosStockBajo} producto(s) con stock bajo`
              : 'Inventario sin alertas'
          }
        />
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-3">
        <Tarjeta className="lg:col-span-1">
          <TarjetaTitulo
            titulo="Embudo de prospectos"
            descripcion="Todos los prospectos registrados, por etapa."
            accion={
              <Link href="/leads" className="text-xs font-medium text-marca-700 hover:underline">
                Ver todos
              </Link>
            }
          />
          <div className="space-y-3 p-5">
            {EMBUDO_LEAD.map((etapa) => {
              const cantidad = embudo.get(etapa) ?? 0;
              return (
                <div key={etapa}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                    <Etiqueta tono={ESTADOS_LEAD.tono(etapa)}>
                      {ESTADOS_LEAD.etiqueta(etapa)}
                    </Etiqueta>
                    <span className="font-medium text-slate-700">{cantidad}</span>
                  </div>
                  <Progreso fraccion={totalEmbudo > 0 ? cantidad / totalEmbudo : 0} />
                </div>
              );
            })}
          </div>
        </Tarjeta>

        <Tarjeta className="lg:col-span-2">
          <TarjetaTitulo
            titulo="Campañas de TikTok que más venden"
            descripcion="Ingresos atribuidos a los prospectos que originó cada campaña."
            accion={
              <Link href="/campanas" className="text-xs font-medium text-marca-700 hover:underline">
                Ver todas
              </Link>
            }
          />
          {campanasOrdenadas.length === 0 ? (
            <SinDatos mensaje="Todavía no hay campañas registradas." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {campanasOrdenadas.map((campana) => (
                <li key={campana.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{campana.nombre}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <Etiqueta tono={TIPOS_CAMPANA.tono(campana.tipo)}>
                        {TIPOS_CAMPANA.etiqueta(campana.tipo)}
                      </Etiqueta>
                      <span>{campana.leads} prospectos</span>
                      <span>·</span>
                      <span>{formatearPorcentaje(campana.conversion)} de cierre</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-900">
                      {formatearDineroCorto(campana.ingresos)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {campana.retorno === null
                        ? 'Orgánica'
                        : `${campana.retorno.toFixed(1)}× la inversión`}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <Tarjeta>
          <TarjetaTitulo
            titulo="Vendedores este mes"
            descripcion="Avance contra la meta individual."
            accion={
              <Link href="/equipo" className="text-xs font-medium text-marca-700 hover:underline">
                Ver equipo
              </Link>
            }
          />
          {vendedores.length === 0 ? (
            <SinDatos mensaje="No hay vendedores dados de alta." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {vendedores.map((vendedor) => (
                <li key={vendedor.id} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <Link
                      href={`/equipo/${vendedor.id}`}
                      className="font-medium text-slate-900 hover:text-marca-700 hover:underline"
                    >
                      {vendedor.nombre}
                    </Link>
                    <span className="font-semibold text-slate-900">
                      {formatearDineroCorto(vendedor.ventas)}
                    </span>
                  </div>
                  <div className="mt-1.5">
                    <Progreso fraccion={vendedor.avanceMeta ?? 0} />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {vendedor.avanceMeta === null
                      ? 'Sin meta asignada'
                      : `${formatearPorcentaje(vendedor.avanceMeta)} de ${formatearDineroCorto(
                          vendedor.metaMensual,
                        )}`}
                    {' · '}
                    {vendedor.pedidos} pedidos · comisión {formatearDinero(vendedor.comisiones)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>

        <div className="space-y-4">
          <Tarjeta>
            <TarjetaTitulo
              titulo="Reponer inventario"
              descripcion="Productos en su nivel mínimo o por debajo."
              accion={
                <Link
                  href="/inventario"
                  className="text-xs font-medium text-marca-700 hover:underline"
                >
                  Ir a inventario
                </Link>
              }
            />
            {stockBajo.length === 0 ? (
              <SinDatos mensaje="Ningún producto está por debajo de su mínimo." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {stockBajo.map((producto) => (
                  <li
                    key={producto.id}
                    className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">{producto.nombre}</p>
                      <p className="text-xs text-slate-500">{producto.sku}</p>
                    </div>
                    <Etiqueta tono={producto.stock === 0 ? 'rojo' : 'ambar'}>
                      {producto.stock} / mín. {producto.stockMinimo}
                    </Etiqueta>
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>

          <Tarjeta>
            <TarjetaTitulo
              titulo="Más vendidos"
              descripcion="Unidades acumuladas y margen bruto estimado."
            />
            {masVendidos.length === 0 ? (
              <SinDatos mensaje="Aún no hay ventas registradas." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {masVendidos.map((producto) => (
                  <li
                    key={producto.id}
                    className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">{producto.nombre}</p>
                      <p className="text-xs text-slate-500">
                        {producto.unidades} unidades · margen {formatearDineroCorto(producto.margen)}
                      </p>
                    </div>
                    <span className="font-medium text-slate-700">
                      {formatearDineroCorto(producto.ingresos)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>
        </div>
      </section>

      <section className="mt-6">
        <Tarjeta>
          <TarjetaTitulo
            titulo="Últimos pedidos"
            accion={
              <Link href="/pedidos" className="text-xs font-medium text-marca-700 hover:underline">
                Ver todos
              </Link>
            }
          />
          {pedidosRecientes.length === 0 ? (
            <SinDatos mensaje="Todavía no se ha registrado ningún pedido." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {pedidosRecientes.map((pedido) => (
                <li key={pedido.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                  <Link
                    href={`/pedidos/${pedido.id}`}
                    className="font-mono text-xs font-semibold text-marca-700 hover:underline"
                  >
                    {pedido.codigo}
                  </Link>
                  <span className="min-w-0 flex-1 truncate text-slate-800">
                    {pedido.clienteNombre}
                    <span className="ml-2 text-xs text-slate-500">
                      {pedido.vendedor?.nombre ?? 'Sin vendedor'} · {tiempoRelativo(pedido.createdAt)}
                    </span>
                  </span>
                  <Etiqueta tono={METODOS_PAGO.tono(pedido.metodoPago)}>
                    {METODOS_PAGO.etiqueta(pedido.metodoPago)}
                  </Etiqueta>
                  <Etiqueta tono={ESTADOS_PEDIDO.tono(pedido.estado)}>
                    {ESTADOS_PEDIDO.etiqueta(pedido.estado)}
                  </Etiqueta>
                  <span className="w-24 text-right font-semibold text-slate-900">
                    {formatearDinero(pedido.total)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
      </section>
    </>
  );
}
