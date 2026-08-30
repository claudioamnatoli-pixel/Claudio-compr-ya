import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { BarraFiltros, FiltroSelect, FiltroTexto, primerValor } from '@/components/filtros';
import {
  EncabezadoPagina,
  EncabezadoTabla,
  Etiqueta,
  Indicador,
  SinDatos,
  Tabla,
  Tarjeta,
} from '@/components/ui';
import { ESTADOS_ENVIO, ESTADOS_PEDIDO, METODOS_PAGO } from '@/lib/dominio';
import { ESTADOS_VENTA, inicioDelMes } from '@/lib/consultas';
import { formatearDinero, formatearNumero, tiempoRelativo } from '@/lib/formato';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Pedidos' };

type Parametros = Promise<{ [clave: string]: string | string[] | undefined }>;

export default async function PedidosPage({ searchParams }: { searchParams: Parametros }) {
  const parametros = await searchParams;
  const estado = primerValor(parametros.estado);
  const metodoPago = primerValor(parametros.metodoPago);
  const vendedorId = primerValor(parametros.vendedorId);
  const busqueda = primerValor(parametros.q);

  const filtro: Prisma.PedidoWhereInput = {
    ...(estado ? { estado } : {}),
    ...(metodoPago ? { metodoPago } : {}),
    ...(vendedorId ? { vendedorId } : {}),
    ...(busqueda
      ? {
          OR: [
            { codigo: { contains: busqueda } },
            { clienteNombre: { contains: busqueda } },
            { telefono: { contains: busqueda } },
          ],
        }
      : {}),
  };

  const desdeEsteMes = inicioDelMes();
  const [pedidos, vendedores, ventasMes, porCobrar] = await Promise.all([
    prisma.pedido.findMany({
      where: filtro,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        vendedor: { select: { nombre: true } },
        envio: { select: { estado: true } },
        _count: { select: { items: true } },
      },
    }),
    prisma.empleado.findMany({
      where: { rol: { in: ['VENDEDOR', 'LIDER'] }, activo: true },
      select: { id: true, nombre: true },
      orderBy: { nombre: 'asc' },
    }),
    prisma.pedido.aggregate({
      where: { estado: { in: ESTADOS_VENTA }, createdAt: { gte: desdeEsteMes } },
      _sum: { total: true },
      _count: true,
    }),
    prisma.pedido.aggregate({
      where: {
        metodoPago: 'CONTRA_ENTREGA',
        estado: { in: ['CONFIRMADO', 'PREPARANDO', 'ENVIADO'] },
      },
      _sum: { total: true },
      _count: true,
    }),
  ]);

  const totalFiltrado = pedidos.reduce((suma, pedido) => suma + pedido.total, 0);

  return (
    <>
      <EncabezadoPagina
        titulo="Pedidos"
        descripcion="Desde que el cliente dice «lo quiero» hasta que el dinero entra. El stock se descuenta al confirmar."
        acciones={
          <Link href="/pedidos/nuevo" className="boton-primario">
            Nuevo pedido
          </Link>
        }
      />

      <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador
          titulo="Ventas del mes"
          valor={formatearDinero(ventasMes._sum.total ?? 0)}
          detalle={`${ventasMes._count} pedidos que cuentan como venta`}
          tono="verde"
        />
        <Indicador
          titulo="Por cobrar contra entrega"
          valor={formatearDinero(porCobrar._sum.total ?? 0)}
          detalle={`${porCobrar._count} pedidos en la calle`}
          tono="ambar"
        />
        <Indicador
          titulo="Pedidos listados"
          valor={formatearNumero(pedidos.length)}
          detalle="Con los filtros aplicados"
          tono="azul"
        />
        <Indicador
          titulo="Importe listado"
          valor={formatearDinero(totalFiltrado)}
          detalle="Suma de los pedidos visibles"
          tono="gris"
        />
      </section>

      <BarraFiltros accionLimpiar="/pedidos">
        <FiltroTexto nombre="q" etiqueta="Buscar" valor={busqueda} marcador="Código o cliente" />
        <FiltroSelect
          nombre="estado"
          etiqueta="Estado"
          valor={estado}
          opciones={ESTADOS_PEDIDO.opciones}
        />
        <FiltroSelect
          nombre="metodoPago"
          etiqueta="Pago"
          valor={metodoPago}
          opciones={METODOS_PAGO.opciones}
        />
        <FiltroSelect
          nombre="vendedorId"
          etiqueta="Vendedor"
          valor={vendedorId}
          opciones={vendedores.map((v) => ({ valor: v.id, etiqueta: v.nombre }))}
        />
      </BarraFiltros>

      <Tarjeta>
        {pedidos.length === 0 ? (
          <SinDatos mensaje="Ningún pedido coincide con estos filtros." />
        ) : (
          <Tabla>
            <EncabezadoTabla
              columnas={['Pedido', 'Cliente', 'Vendedor', 'Pago', 'Estado', 'Envío', 'Total']}
            />
            <tbody className="divide-y divide-slate-100">
              {pedidos.map((pedido) => (
                <tr key={pedido.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/pedidos/${pedido.id}`}
                      className="font-mono text-xs font-semibold text-marca-700 hover:underline"
                    >
                      {pedido.codigo}
                    </Link>
                    <p className="text-xs text-slate-500">{tiempoRelativo(pedido.createdAt)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{pedido.clienteNombre}</p>
                    <p className="text-xs text-slate-500">
                      {pedido.ciudad} · {pedido._count.items} producto(s)
                    </p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {pedido.vendedor?.nombre ?? <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <Etiqueta tono={METODOS_PAGO.tono(pedido.metodoPago)}>
                      {METODOS_PAGO.etiqueta(pedido.metodoPago)}
                    </Etiqueta>
                  </td>
                  <td className="px-4 py-3">
                    <Etiqueta tono={ESTADOS_PEDIDO.tono(pedido.estado)}>
                      {ESTADOS_PEDIDO.etiqueta(pedido.estado)}
                    </Etiqueta>
                  </td>
                  <td className="px-4 py-3">
                    {pedido.envio ? (
                      <Etiqueta tono={ESTADOS_ENVIO.tono(pedido.envio.estado)}>
                        {ESTADOS_ENVIO.etiqueta(pedido.envio.estado)}
                      </Etiqueta>
                    ) : (
                      <span className="text-xs text-slate-400">Sin envío</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">
                    {formatearDinero(pedido.total)}
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
