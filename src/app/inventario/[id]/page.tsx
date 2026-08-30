import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Campo, Formulario } from '@/components/formulario';
import {
  EncabezadoPagina,
  EncabezadoTabla,
  Etiqueta,
  Indicador,
  SinDatos,
  Tabla,
  Tarjeta,
  TarjetaTitulo,
} from '@/components/ui';
import { CONFIG } from '@/lib/config';
import { TIPOS_MOVIMIENTO } from '@/lib/dominio';
import { signoDeMovimiento } from '@/lib/inventario';
import {
  aUnidades,
  formatearDinero,
  formatearFechaHora,
  formatearPorcentaje,
} from '@/lib/formato';
import { prisma } from '@/lib/prisma';
import { actualizarProducto, registrarMovimiento } from '../acciones';

export const dynamic = 'force-dynamic';

export default async function ProductoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const producto = await prisma.producto.findUnique({
    where: { id },
    include: {
      movimientos: {
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { empleado: { select: { nombre: true } } },
      },
    },
  });
  if (!producto) notFound();

  const [empleados, vendidos] = await Promise.all([
    prisma.empleado.findMany({
      where: { activo: true },
      select: { id: true, nombre: true },
      orderBy: { nombre: 'asc' },
    }),
    prisma.itemPedido.aggregate({
      where: {
        productoId: producto.id,
        pedido: { estado: { in: ['CONFIRMADO', 'PREPARANDO', 'ENVIADO', 'ENTREGADO'] } },
      },
      _sum: { cantidad: true, subtotal: true },
    }),
  ]);

  const unidadesVendidas = vendidos._sum.cantidad ?? 0;
  const ingresos = vendidos._sum.subtotal ?? 0;
  const margen = producto.precio > 0 ? (producto.precio - producto.costo) / producto.precio : 0;

  return (
    <>
      <EncabezadoPagina
        titulo={producto.nombre}
        descripcion={`${producto.sku} · ${producto.categoria}`}
        acciones={
          <Link href="/inventario" className="boton-secundario">
            Volver
          </Link>
        }
      />

      <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador
          titulo="Stock actual"
          valor={`${producto.stock} u.`}
          detalle={`Mínimo ${producto.stockMinimo}`}
          tono={
            producto.stock === 0 ? 'rojo' : producto.stock <= producto.stockMinimo ? 'ambar' : 'verde'
          }
        />
        <Indicador
          titulo="Margen por pieza"
          valor={formatearDinero(producto.precio - producto.costo)}
          detalle={`${formatearPorcentaje(margen)} sobre el precio`}
          tono="marca"
        />
        <Indicador
          titulo="Unidades vendidas"
          valor={`${unidadesVendidas}`}
          detalle="Pedidos confirmados en adelante"
          tono="azul"
        />
        <Indicador
          titulo="Ingresos generados"
          valor={formatearDinero(ingresos)}
          detalle={`Margen bruto ${formatearDinero(ingresos - producto.costo * unidadesVendidas)}`}
          tono="verde"
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Tarjeta className="lg:col-span-1">
          <TarjetaTitulo titulo="Registrar movimiento" descripcion="Entrada de proveedor, merma, ajuste de conteo…" />
          <div className="p-5">
            <Formulario accion={registrarMovimiento} textoBoton="Registrar">
              <input type="hidden" name="productoId" value={producto.id} />
              <div className="space-y-4">
                <Campo etiqueta="Tipo">
                  <select name="tipo" defaultValue="ENTRADA" className="campo">
                    {TIPOS_MOVIMIENTO.opciones.map((opcion) => (
                      <option key={opcion.valor} value={opcion.valor}>
                        {opcion.etiqueta}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo etiqueta="Cantidad" ayuda="Siempre en positivo; el tipo decide si suma o resta.">
                  <input
                    name="cantidad"
                    type="number"
                    min={1}
                    step={1}
                    required
                    defaultValue={1}
                    className="campo"
                  />
                </Campo>
                <Campo etiqueta="Motivo">
                  <input name="motivo" className="campo" placeholder="Compra a proveedor" />
                </Campo>
                <Campo etiqueta="Referencia">
                  <input name="referencia" className="campo" placeholder="FACT-PROV-0034" />
                </Campo>
                <Campo etiqueta="Responsable">
                  <select name="empleadoId" defaultValue="" className="campo">
                    <option value="">Sin especificar</option>
                    {empleados.map((empleado) => (
                      <option key={empleado.id} value={empleado.id}>
                        {empleado.nombre}
                      </option>
                    ))}
                  </select>
                </Campo>
              </div>
            </Formulario>
          </div>
        </Tarjeta>

        <Tarjeta className="lg:col-span-2">
          <TarjetaTitulo titulo="Datos del producto" />
          <div className="p-5">
            <Formulario accion={actualizarProducto} textoBoton="Guardar cambios">
              <input type="hidden" name="productoId" value={producto.id} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo etiqueta="Nombre">
                  <input name="nombre" required defaultValue={producto.nombre} className="campo" />
                </Campo>
                <Campo etiqueta="Categoría">
                  <input
                    name="categoria"
                    required
                    defaultValue={producto.categoria}
                    className="campo"
                  />
                </Campo>
                <Campo etiqueta={`Costo (${CONFIG.moneda})`}>
                  <input
                    name="costo"
                    type="number"
                    min={0}
                    step="0.01"
                    required
                    defaultValue={aUnidades(producto.costo)}
                    className="campo"
                  />
                </Campo>
                <Campo etiqueta={`Precio (${CONFIG.moneda})`}>
                  <input
                    name="precio"
                    type="number"
                    min={0}
                    step="0.01"
                    required
                    defaultValue={aUnidades(producto.precio)}
                    className="campo"
                  />
                </Campo>
                <Campo etiqueta="Stock mínimo">
                  <input
                    name="stockMinimo"
                    type="number"
                    min={0}
                    step={1}
                    required
                    defaultValue={producto.stockMinimo}
                    className="campo"
                  />
                </Campo>
                <label className="flex items-end gap-2 pb-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    name="activo"
                    defaultChecked={producto.activo}
                    className="h-4 w-4 rounded border-slate-300 text-marca-600 focus:ring-marca-500"
                  />
                  Producto activo en el catálogo
                </label>
                <Campo etiqueta="Descripción" className="sm:col-span-2">
                  <textarea
                    name="descripcion"
                    rows={3}
                    defaultValue={producto.descripcion ?? ''}
                    className="campo"
                  />
                </Campo>
              </div>
            </Formulario>
          </div>
        </Tarjeta>
      </div>

      <Tarjeta className="mt-4">
        <TarjetaTitulo
          titulo="Historial de movimientos"
          descripcion="Cada cambio de stock queda registrado con su responsable y su referencia."
        />
        {producto.movimientos.length === 0 ? (
          <SinDatos mensaje="Este producto todavía no tiene movimientos." />
        ) : (
          <Tabla>
            <EncabezadoTabla
              columnas={['Fecha', 'Tipo', 'Cantidad', 'Stock resultante', 'Motivo', 'Responsable']}
            />
            <tbody className="divide-y divide-slate-100">
              {producto.movimientos.map((movimiento) => {
                const suma = signoDeMovimiento(movimiento.tipo) > 0;
                return (
                  <tr key={movimiento.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-500">
                      {formatearFechaHora(movimiento.createdAt)}
                    </td>
                    <td className="px-4 py-2.5">
                      <Etiqueta tono={TIPOS_MOVIMIENTO.tono(movimiento.tipo)}>
                        {TIPOS_MOVIMIENTO.etiqueta(movimiento.tipo)}
                      </Etiqueta>
                    </td>
                    <td
                      className={`px-4 py-2.5 font-medium ${
                        suma ? 'text-emerald-700' : 'text-red-700'
                      }`}
                    >
                      {suma ? '+' : '−'}
                      {movimiento.cantidad}
                    </td>
                    <td className="px-4 py-2.5 text-slate-700">{movimiento.stockResultante}</td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {movimiento.motivo ?? '—'}
                      {movimiento.referencia ? (
                        <span className="ml-1 font-mono text-xs text-slate-400">
                          {movimiento.referencia}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {movimiento.empleado?.nombre ?? '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Tabla>
        )}
      </Tarjeta>
    </>
  );
}
