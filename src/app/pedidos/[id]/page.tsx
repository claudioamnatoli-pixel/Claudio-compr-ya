import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BotonAccion, Campo, Formulario } from '@/components/formulario';
import {
  EncabezadoPagina,
  EncabezadoTabla,
  Etiqueta,
  SinDatos,
  Tabla,
  Tarjeta,
  TarjetaTitulo,
} from '@/components/ui';
import {
  ESTADOS_COMISION,
  ESTADOS_ENVIO,
  ESTADOS_PEDIDO,
  METODOS_PAGO,
  TRANSICIONES_PEDIDO,
} from '@/lib/dominio';
import { formatearDinero, formatearFecha, formatearFechaHora } from '@/lib/formato';
import { prisma } from '@/lib/prisma';
import { enlaceWhatsApp, formatearTelefono } from '@/lib/whatsapp';
import { actualizarNotasPedido, cambiarEstadoPedido } from '../acciones';

export const dynamic = 'force-dynamic';

export default async function PedidoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const pedido = await prisma.pedido.findUnique({
    where: { id },
    include: {
      items: { include: { producto: { select: { id: true, nombre: true, sku: true } } } },
      vendedor: { select: { id: true, nombre: true } },
      lead: { select: { id: true, codigo: true } },
      comision: true,
      envio: {
        include: {
          zona: { select: { nombre: true, ciudad: true } },
          repartidor: { select: { id: true, nombre: true } },
        },
      },
    },
  });
  if (!pedido) notFound();

  const siguientes = TRANSICIONES_PEDIDO[pedido.estado] ?? [];

  const mensajeSeguimiento =
    pedido.estado === 'ENVIADO'
      ? `Hola ${pedido.clienteNombre.split(' ')[0]}, tu pedido ${pedido.codigo} ya va en camino 🛵 Ten a la mano ${formatearDinero(
          pedido.total,
        )} para el pago contra entrega. ¡Gracias!`
      : `Hola ${pedido.clienteNombre.split(' ')[0]}, te escribo por tu pedido ${pedido.codigo}.`;

  return (
    <>
      <EncabezadoPagina
        titulo={`Pedido ${pedido.codigo}`}
        descripcion={`${pedido.clienteNombre} · ${formatearTelefono(pedido.telefono)} · creado el ${formatearFecha(
          pedido.createdAt,
        )}`}
        acciones={
          <>
            <Link href="/pedidos" className="boton-secundario">
              Volver
            </Link>
            <a
              href={enlaceWhatsApp(pedido.telefono, mensajeSeguimiento)}
              target="_blank"
              rel="noopener noreferrer"
              className="boton-whatsapp"
            >
              Escribir al cliente
            </a>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Etiqueta tono={ESTADOS_PEDIDO.tono(pedido.estado)}>
          {ESTADOS_PEDIDO.etiqueta(pedido.estado)}
        </Etiqueta>
        <Etiqueta tono={METODOS_PAGO.tono(pedido.metodoPago)}>
          {METODOS_PAGO.etiqueta(pedido.metodoPago)}
        </Etiqueta>
        {pedido.lead ? (
          <Link
            href={`/leads/${pedido.lead.id}`}
            className="text-xs font-medium text-marca-700 hover:underline"
          >
            Prospecto {pedido.lead.codigo}
          </Link>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Tarjeta>
            <TarjetaTitulo titulo="Productos" />
            <Tabla>
              <EncabezadoTabla columnas={['Producto', 'Cantidad', 'Precio', 'Importe']} />
              <tbody className="divide-y divide-slate-100">
                {pedido.items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3">
                      <Link
                        href={`/inventario/${item.producto.id}`}
                        className="font-medium text-slate-900 hover:text-marca-700 hover:underline"
                      >
                        {item.producto.nombre}
                      </Link>
                      <p className="font-mono text-xs text-slate-500">{item.producto.sku}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{item.cantidad}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {formatearDinero(item.precioUnitario)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900">
                      {formatearDinero(item.subtotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
            <dl className="space-y-1.5 border-t border-slate-200 bg-slate-50 px-5 py-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-600">Subtotal</dt>
                <dd className="text-slate-800">{formatearDinero(pedido.subtotal)}</dd>
              </div>
              {pedido.descuento > 0 ? (
                <div className="flex justify-between">
                  <dt className="text-slate-600">Descuento</dt>
                  <dd className="text-slate-800">−{formatearDinero(pedido.descuento)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between">
                <dt className="text-slate-600">Envío</dt>
                <dd className="text-slate-800">{formatearDinero(pedido.costoEnvio)}</dd>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-1.5 text-base font-semibold text-slate-900">
                <dt>Total</dt>
                <dd>{formatearDinero(pedido.total)}</dd>
              </div>
            </dl>
          </Tarjeta>

          <Tarjeta>
            <TarjetaTitulo
              titulo="Envío"
              accion={
                <Link href="/logistica" className="text-xs font-medium text-marca-700 hover:underline">
                  Ir a logística
                </Link>
              }
            />
            {pedido.envio ? (
              <dl className="grid gap-4 p-5 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Estado</dt>
                  <dd className="mt-1">
                    <Etiqueta tono={ESTADOS_ENVIO.tono(pedido.envio.estado)}>
                      {ESTADOS_ENVIO.etiqueta(pedido.envio.estado)}
                    </Etiqueta>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Repartidor</dt>
                  <dd className="mt-1 text-slate-800">
                    {pedido.envio.repartidor ? (
                      <Link
                        href={`/equipo/${pedido.envio.repartidor.id}`}
                        className="hover:text-marca-700 hover:underline"
                      >
                        {pedido.envio.repartidor.nombre}
                      </Link>
                    ) : (
                      <span className="text-amber-600">Sin asignar</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Zona</dt>
                  <dd className="mt-1 text-slate-800">
                    {pedido.envio.zona
                      ? `${pedido.envio.zona.nombre} · ${pedido.envio.zona.ciudad}`
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Programado</dt>
                  <dd className="mt-1 text-slate-800">
                    {formatearFechaHora(pedido.envio.fechaProgramada)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Entregado</dt>
                  <dd className="mt-1 text-slate-800">
                    {formatearFechaHora(pedido.envio.fechaEntrega)}
                    {pedido.envio.intentos > 0 ? (
                      <span className="ml-2 text-xs text-slate-500">
                        {pedido.envio.intentos} intento(s)
                      </span>
                    ) : null}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Cobrado</dt>
                  <dd className="mt-1 text-slate-800">
                    {pedido.envio.montoCobrado === null
                      ? '—'
                      : formatearDinero(pedido.envio.montoCobrado)}
                  </dd>
                </div>
                {pedido.envio.observaciones ? (
                  <div className="sm:col-span-2">
                    <dt className="text-xs uppercase tracking-wide text-slate-500">
                      Observaciones
                    </dt>
                    <dd className="mt-1 text-slate-800">{pedido.envio.observaciones}</dd>
                  </div>
                ) : null}
              </dl>
            ) : (
              <SinDatos mensaje="Este pedido no tiene envío asociado." />
            )}
          </Tarjeta>

          <Tarjeta>
            <TarjetaTitulo titulo="Notas y referencia" />
            <div className="p-5">
              <Formulario accion={actualizarNotasPedido} textoBoton="Guardar">
                <input type="hidden" name="pedidoId" value={pedido.id} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Campo etiqueta="Referencia de entrega">
                    <input
                      name="referencia"
                      defaultValue={pedido.referencia ?? ''}
                      className="campo"
                    />
                  </Campo>
                  <Campo etiqueta="Notas internas">
                    <input name="notas" defaultValue={pedido.notas ?? ''} className="campo" />
                  </Campo>
                </div>
              </Formulario>
            </div>
          </Tarjeta>
        </div>

        <div className="space-y-4">
          <Tarjeta>
            <TarjetaTitulo
              titulo="Avanzar el pedido"
              descripcion="Sólo se ofrecen los pasos válidos desde el estado actual."
            />
            <div className="space-y-2 p-5">
              {siguientes.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Este pedido ya está cerrado; no admite más cambios de estado.
                </p>
              ) : (
                siguientes.map((siguiente) => (
                  <BotonAccion
                    key={siguiente}
                    accion={cambiarEstadoPedido}
                    camposOcultos={{ pedidoId: pedido.id, estado: siguiente }}
                    variante={
                      siguiente === 'CANCELADO' || siguiente === 'DEVUELTO' ? 'peligro' : 'primario'
                    }
                    confirmacion={
                      siguiente === 'CONFIRMADO'
                        ? 'Al confirmar se descuenta el stock y se genera la comisión. ¿Continuar?'
                        : siguiente === 'CANCELADO' || siguiente === 'DEVUELTO'
                          ? 'Se devolverá el stock al inventario y se anulará la comisión. ¿Continuar?'
                          : undefined
                    }
                    className="block"
                  >
                    Marcar como {ESTADOS_PEDIDO.etiqueta(siguiente).toLowerCase()}
                  </BotonAccion>
                ))
              )}
            </div>
          </Tarjeta>

          <Tarjeta>
            <TarjetaTitulo titulo="Entrega" />
            <dl className="space-y-3 p-5 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Dirección</dt>
                <dd className="mt-0.5 text-slate-800">{pedido.direccion}</dd>
                <dd className="text-slate-600">{pedido.ciudad}</dd>
                {pedido.referencia ? (
                  <dd className="mt-0.5 text-xs text-slate-500">{pedido.referencia}</dd>
                ) : null}
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Vendedor</dt>
                <dd className="mt-0.5 text-slate-800">
                  {pedido.vendedor ? (
                    <Link
                      href={`/equipo/${pedido.vendedor.id}`}
                      className="hover:text-marca-700 hover:underline"
                    >
                      {pedido.vendedor.nombre}
                    </Link>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
            </dl>
          </Tarjeta>

          <Tarjeta>
            <TarjetaTitulo titulo="Comisión" />
            <div className="p-5 text-sm">
              {pedido.comision ? (
                <>
                  <p className="text-2xl font-semibold text-slate-900">
                    {formatearDinero(pedido.comision.monto)}
                  </p>
                  <p className="mt-1 text-slate-500">
                    {(pedido.comision.porcentaje * 100).toFixed(1)} % sobre{' '}
                    {formatearDinero(pedido.comision.base)}
                  </p>
                  <p className="mt-2">
                    <Etiqueta tono={ESTADOS_COMISION.tono(pedido.comision.estado)}>
                      {ESTADOS_COMISION.etiqueta(pedido.comision.estado)}
                    </Etiqueta>
                  </p>
                </>
              ) : (
                <p className="text-slate-500">
                  La comisión se genera cuando el pedido se confirma y tiene un vendedor asignado.
                </p>
              )}
            </div>
          </Tarjeta>
        </div>
      </div>
    </>
  );
}
