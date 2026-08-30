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
import { formatearDinero, formatearNumero, formatearPorcentaje } from '@/lib/formato';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Inventario' };

type Parametros = Promise<{ [clave: string]: string | string[] | undefined }>;

export default async function InventarioPage({ searchParams }: { searchParams: Parametros }) {
  const parametros = await searchParams;
  const categoria = primerValor(parametros.categoria);
  const busqueda = primerValor(parametros.q);
  const soloAlertas = primerValor(parametros.alertas) === '1';

  const filtro: Prisma.ProductoWhereInput = {
    ...(categoria ? { categoria } : {}),
    ...(busqueda
      ? { OR: [{ nombre: { contains: busqueda } }, { sku: { contains: busqueda } }] }
      : {}),
  };

  const [productos, categorias] = await Promise.all([
    prisma.producto.findMany({ where: filtro, orderBy: { nombre: 'asc' } }),
    prisma.producto.findMany({
      distinct: ['categoria'],
      select: { categoria: true },
      orderBy: { categoria: 'asc' },
    }),
  ]);

  // El filtro de alertas compara dos columnas, algo que el `where` de Prisma no
  // expresa directamente, así que se aplica aquí sobre el resultado.
  const visibles = soloAlertas
    ? productos.filter((producto) => producto.stock <= producto.stockMinimo)
    : productos;

  const valorInventario = productos.reduce((suma, p) => suma + p.stock * p.costo, 0);
  const valorVenta = productos.reduce((suma, p) => suma + p.stock * p.precio, 0);
  const unidades = productos.reduce((suma, p) => suma + p.stock, 0);
  const enAlerta = productos.filter((p) => p.stock <= p.stockMinimo).length;

  return (
    <>
      <EncabezadoPagina
        titulo="Inventario"
        descripcion="Qué hay en bodega, cuánto vale y qué toca reponer antes de que se agote en pleno live."
        acciones={
          <Link href="/inventario/nuevo" className="boton-primario">
            Nuevo producto
          </Link>
        }
      />

      <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador
          titulo="Unidades en bodega"
          valor={formatearNumero(unidades)}
          detalle={`${productos.length} productos en catálogo`}
          tono="azul"
        />
        <Indicador
          titulo="Valor a costo"
          valor={formatearDinero(valorInventario)}
          detalle="Lo que costó la mercancía parada"
          tono="gris"
        />
        <Indicador
          titulo="Valor a precio de venta"
          valor={formatearDinero(valorVenta)}
          detalle={
            valorInventario > 0
              ? `Margen potencial ${formatearPorcentaje(
                  (valorVenta - valorInventario) / valorVenta,
                )}`
              : undefined
          }
          tono="verde"
        />
        <Indicador
          titulo="Productos en alerta"
          valor={formatearNumero(enAlerta)}
          detalle={enAlerta > 0 ? 'Están en su mínimo o por debajo' : 'Todo por encima del mínimo'}
          tono={enAlerta > 0 ? 'ambar' : 'verde'}
        />
      </section>

      <BarraFiltros accionLimpiar="/inventario">
        <FiltroTexto nombre="q" etiqueta="Buscar" valor={busqueda} marcador="Nombre o SKU" />
        <FiltroSelect
          nombre="categoria"
          etiqueta="Categoría"
          valor={categoria}
          opciones={categorias.map((c) => ({ valor: c.categoria, etiqueta: c.categoria }))}
          textoTodos="Todas"
        />
        <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="alertas"
            value="1"
            defaultChecked={soloAlertas}
            className="h-4 w-4 rounded border-slate-300 text-marca-600 focus:ring-marca-500"
          />
          Sólo los que hay que reponer
        </label>
      </BarraFiltros>

      <Tarjeta>
        {visibles.length === 0 ? (
          <SinDatos mensaje="Ningún producto coincide con estos filtros." />
        ) : (
          <Tabla>
            <EncabezadoTabla
              columnas={['Producto', 'Categoría', 'Costo', 'Precio', 'Margen', 'Stock']}
            />
            <tbody className="divide-y divide-slate-100">
              {visibles.map((producto) => {
                const margen =
                  producto.precio > 0 ? (producto.precio - producto.costo) / producto.precio : 0;
                const agotado = producto.stock === 0;
                const bajo = producto.stock <= producto.stockMinimo;
                return (
                  <tr key={producto.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/inventario/${producto.id}`}
                        className="font-medium text-slate-900 hover:text-marca-700 hover:underline"
                      >
                        {producto.nombre}
                      </Link>
                      <p className="font-mono text-xs text-slate-500">{producto.sku}</p>
                      {!producto.activo ? (
                        <span className="mt-1 inline-block">
                          <Etiqueta tono="gris">Inactivo</Etiqueta>
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{producto.categoria}</td>
                    <td className="px-4 py-3 text-slate-600">{formatearDinero(producto.costo)}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {formatearDinero(producto.precio)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{formatearPorcentaje(margen)}</td>
                    <td className="px-4 py-3">
                      <Etiqueta tono={agotado ? 'rojo' : bajo ? 'ambar' : 'verde'}>
                        {agotado ? 'Agotado' : `${producto.stock} u.`}
                      </Etiqueta>
                      <p className="mt-1 text-xs text-slate-500">mín. {producto.stockMinimo}</p>
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
