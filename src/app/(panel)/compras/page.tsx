import { requerirPagina } from '@/lib/guardias';
import { puede } from '@/lib/permisos';
import { BotonAccion, Campo, Formulario } from '@/components/formulario';
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
import { siguientesEstados } from '@/lib/compras';
import { COMPRAS_EN_FIRME, ESTADOS_COMPRA } from '@/lib/dominio';
import { formatearDinero, formatearFecha } from '@/lib/formato';
import { prisma } from '@/lib/prisma';
import { buscarProductos } from '../inventario/acciones';
import { LineasCompra } from './lineas-compra';
import { crearCompra, moverCompra } from './acciones';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Compras' };

export default async function ComprasPage() {
  const usuario = await requerirPagina('compras.ver');
  const puedeGestionar = puede(usuario.rol, 'compras.gestionar');

  const [compras, proveedores, cuantosProductos] = await Promise.all([
    prisma.compra.findMany({
      orderBy: { fecha: 'desc' },
      take: 50,
      include: {
        proveedor: { select: { nombre: true } },
        items: { include: { producto: { select: { nombre: true, sku: true } } } },
      },
    }),
    prisma.proveedor.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } }),
    // Sólo hace falta saber si hay alguno, no traerlos todos: las líneas de la
    // compra se buscan escribiendo.
    prisma.producto.count({ where: { activo: true } }),
  ]);

  const enFirme = compras.filter((c) => COMPRAS_EN_FIRME.has(c.estado));
  const invertido = enFirme.reduce((suma, c) => suma + c.total, 0);
  const porPagar = compras
    .filter((c) => c.estado === 'RECIBIDA')
    .reduce((suma, c) => suma + c.total, 0);
  const borradores = compras.filter((c) => c.estado === 'BORRADOR').length;

  return (
    <>
      <EncabezadoPagina
        titulo="Compras a proveedores"
        descripcion="Lo que pagás por la mercadería. La entrada al depósito ocurre al recibir, no al cargar el borrador."
      />

      <section className="mb-6 grid gap-4 sm:grid-cols-3">
        <Indicador titulo="Comprado" valor={formatearDinero(invertido)} detalle="mercadería recibida" tono="marca" />
        <Indicador titulo="Pendiente de pago" valor={formatearDinero(porPagar)} detalle="recibida y sin pagar" tono="ambar" />
        <Indicador titulo="Borradores" valor={String(borradores)} detalle="sin recibir todavía" />
      </section>

      <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
        <Tarjeta>
          <TarjetaTitulo titulo="Compras registradas" />
          {compras.length === 0 ? (
            <SinDatos mensaje="Todavía no registraste ninguna compra." />
          ) : (
            <Tabla>
              <EncabezadoTabla columnas={['Compra', 'Proveedor', 'Total', 'Estado', '']} />
              <tbody>
                {compras.map((c) => (
                  <tr key={c.id} className="border-t border-slate-100 align-top">
                    <td className="px-5 py-3">
                      <div className="font-mono text-xs text-slate-500">{c.numero}</div>
                      <div className="text-xs text-slate-500">{formatearFecha(c.fecha)}</div>
                      <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
                        {c.items.map((i) => (
                          <li key={i.id}>
                            {i.cantidad} × {i.producto.nombre}{' '}
                            <span className="tabular-nums text-slate-400">
                              {formatearDinero(i.costoUnitario)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="px-5 py-3 text-slate-700">
                      {c.proveedor.nombre}
                      {c.factura ? <div className="text-xs text-slate-500">{c.factura}</div> : null}
                    </td>
                    <td className="px-5 py-3 tabular-nums font-medium">{formatearDinero(c.total)}</td>
                    <td className="px-5 py-3">
                      <Etiqueta tono={ESTADOS_COMPRA.tono(c.estado)}>
                        {ESTADOS_COMPRA.etiqueta(c.estado)}
                      </Etiqueta>
                    </td>
                    <td className="px-5 py-3 text-right">
                      {puedeGestionar
                        ? siguientesEstados(c.estado).map((estado) => (
                            <BotonAccion
                              key={estado}
                              accion={moverCompra}
                              camposOcultos={{ id: c.id, estado }}
                              variante={estado === 'ANULADA' ? 'peligro' : 'primario'}
                              confirmacion={
                                estado === 'RECIBIDA'
                                  ? '¿Dar por recibida? La mercadería entra al depósito y el costo de cada producto pasa a ser el de esta compra.'
                                  : estado === 'ANULADA'
                                    ? '¿Anular esta compra? Si ya estaba recibida, la mercadería sale del depósito.'
                                    : undefined
                              }
                              className="ml-2"
                            >
                              {ESTADOS_COMPRA.etiqueta(estado)}
                            </BotonAccion>
                          ))
                        : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
        </Tarjeta>

        {puedeGestionar ? (
          <Tarjeta>
            <TarjetaTitulo
              titulo="Nueva compra"
              descripcion="Nace como borrador. Al recibirla entra el stock y se actualiza el costo."
            />
            <div className="p-5">
              {proveedores.length === 0 || cuantosProductos === 0 ? (
                <SinDatos mensaje="Cargá al menos un proveedor y un producto antes de registrar una compra." />
              ) : (
                <Formulario accion={crearCompra} textoBoton="Registrar borrador">
                  <div className="space-y-4">
                    <Campo etiqueta="Proveedor">
                      <select name="proveedorId" required className="campo" defaultValue="">
                        <option value="" disabled>Elegí uno</option>
                        {proveedores.map((p) => (
                          <option key={p.id} value={p.id}>{p.nombre}</option>
                        ))}
                      </select>
                    </Campo>
                    <Campo etiqueta="Factura del proveedor" ayuda="Opcional.">
                      <input name="factura" className="campo" placeholder="001-001-0001234" />
                    </Campo>

                    <LineasCompra buscar={buscarProductos} />

                    <Campo etiqueta="Notas">
                      <textarea name="notas" rows={2} className="campo" placeholder="Condiciones, plazo de pago" />
                    </Campo>
                  </div>
                </Formulario>
              )}
            </div>
          </Tarjeta>
        ) : null}
      </div>
    </>
  );
}
