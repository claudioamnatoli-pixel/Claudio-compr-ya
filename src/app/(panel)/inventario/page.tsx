import { requerirPagina } from '@/lib/guardias';
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
import { Paginacion } from '@/components/paginacion';
import { formatearDinero, formatearNumero, formatearPorcentaje } from '@/lib/formato';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Inventario' };

/**
 * Cuántas filas se dibujan por página.
 *
 * El catálogo real puede andar por los 3.000 productos y antes se pintaban
 * todos de una: cerca de un megabyte de página, lento en un celular con datos.
 */
const POR_PAGINA = 50;

type Parametros = Promise<{ [clave: string]: string | string[] | undefined }>;

export default async function InventarioPage({ searchParams }: { searchParams: Parametros }) {
  await requerirPagina('inventario.ver');
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

  const pagina = Math.max(1, Number(primerValor(parametros.pagina) ?? '1') || 1);

  // Los totales y las alertas se calculan sobre el catálogo entero, pero
  // pidiendo sólo las cuatro cifras que hacen falta: con 3.000 productos son
  // unos pocos kilobytes, mientras que dibujar las 3.000 filas no lo era.
  const [cifras, categorias] = await Promise.all([
    prisma.producto.findMany({
      where: filtro,
      select: { id: true, stock: true, costo: true, precio: true, stockMinimo: true },
    }),
    prisma.producto.findMany({
      distinct: ['categoria'],
      select: { categoria: true },
      orderBy: { categoria: 'asc' },
    }),
  ]);

  const valorInventario = cifras.reduce((suma, p) => suma + p.stock * p.costo, 0);
  const valorVenta = cifras.reduce((suma, p) => suma + p.stock * p.precio, 0);
  const unidades = cifras.reduce((suma, p) => suma + p.stock, 0);
  // Comparar dos columnas es lo único que el `where` de Prisma no expresa, así
  // que la alerta se resuelve acá y se pagina por los identificadores.
  const idsEnAlerta = cifras.filter((p) => p.stock <= p.stockMinimo).map((p) => p.id);
  const enAlerta = idsEnAlerta.length;

  const filtroPagina: Prisma.ProductoWhereInput = soloAlertas
    ? { ...filtro, id: { in: idsEnAlerta } }
    : filtro;
  const total = soloAlertas ? enAlerta : cifras.length;

  const visibles = await prisma.producto.findMany({
    where: filtroPagina,
    orderBy: { nombre: 'asc' },
    take: POR_PAGINA,
    skip: (pagina - 1) * POR_PAGINA,
  });

  return (
    <>
      <EncabezadoPagina
        titulo="Inventario"
        descripcion="Qué hay en bodega, cuánto vale y qué toca reponer antes de que se agote en pleno live."
        acciones={
          <div className="flex gap-2">
            <Link href="/inventario/importar" className="boton-secundario">
              Cargar planilla
            </Link>
            <Link href="/inventario/nuevo" className="boton-primario">
              Nuevo producto
            </Link>
          </div>
        }
      />

      <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador
          titulo="Unidades en bodega"
          valor={formatearNumero(unidades)}
          detalle={`${formatearNumero(cifras.length)} productos en catálogo`}
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
        <Paginacion
          pagina={pagina}
          porPagina={POR_PAGINA}
          total={total}
          parametros={parametros}
        />
      </Tarjeta>
    </>
  );
}
