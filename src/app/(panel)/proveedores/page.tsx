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
import { COMPRAS_EN_FIRME } from '@/lib/dominio';
import { formatearDinero, formatearFecha } from '@/lib/formato';
import { prisma } from '@/lib/prisma';
import { cambiarEstadoProveedor, crearProveedor } from './acciones';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Proveedores' };

export default async function ProveedoresPage() {
  const usuario = await requerirPagina('compras.ver');
  const puedeGestionar = puede(usuario.rol, 'compras.gestionar');

  const proveedores = await prisma.proveedor.findMany({
    orderBy: [{ activo: 'desc' }, { nombre: 'asc' }],
    include: {
      compras: {
        where: { estado: { in: [...COMPRAS_EN_FIRME] } },
        select: { total: true, recibidaAt: true },
      },
    },
  });

  const conTotales = proveedores.map((p) => ({
    ...p,
    comprado: p.compras.reduce((suma, c) => suma + c.total, 0),
    ultima: p.compras
      .map((c) => c.recibidaAt)
      .filter((f): f is Date => f !== null)
      .sort((a, b) => b.getTime() - a.getTime())[0],
  }));

  const activos = conTotales.filter((p) => p.activo).length;
  const comprado = conTotales.reduce((suma, p) => suma + p.comprado, 0);

  return (
    <>
      <EncabezadoPagina
        titulo="Proveedores"
        descripcion="A quién le comprás la mercadería y cuánto le llevás comprado."
      />

      <section className="mb-6 grid gap-4 sm:grid-cols-3">
        <Indicador titulo="Proveedores activos" valor={String(activos)} detalle={`${conTotales.length} en total`} />
        <Indicador titulo="Comprado" valor={formatearDinero(comprado)} detalle="mercadería recibida" tono="marca" />
        <Indicador
          titulo="Con RUC"
          valor={String(conTotales.filter((p) => p.ruc).length)}
          detalle="hace falta para deducir el gasto"
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Tarjeta>
          <TarjetaTitulo titulo="Lista de proveedores" />
          {conTotales.length === 0 ? (
            <SinDatos mensaje="Todavía no cargaste ningún proveedor." />
          ) : (
            <Tabla>
              <EncabezadoTabla columnas={['Proveedor', 'Contacto', 'Comprado', 'Última compra', '']} />
              <tbody>
                {conTotales.map((p) => (
                  <tr key={p.id} className="border-t border-slate-100">
                    <td className="px-5 py-3">
                      <div className="font-medium text-slate-900">{p.nombre}</div>
                      <div className="text-xs text-slate-500">{p.ruc ? `RUC ${p.ruc}` : 'Sin RUC'}</div>
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {p.contacto || '—'}
                      {p.telefono ? <div className="text-xs text-slate-500">{p.telefono}</div> : null}
                    </td>
                    <td className="px-5 py-3 tabular-nums">{formatearDinero(p.comprado)}</td>
                    <td className="px-5 py-3 text-slate-600">
                      {p.ultima ? formatearFecha(p.ultima) : '—'}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {p.activo ? null : <Etiqueta tono="rojo">De baja</Etiqueta>}
                      {puedeGestionar ? (
                        <BotonAccion
                          accion={cambiarEstadoProveedor}
                          camposOcultos={{ id: p.id }}
                          variante={p.activo ? 'peligro' : 'secundario'}
                        >
                          {p.activo ? 'Dar de baja' : 'Reactivar'}
                        </BotonAccion>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
        </Tarjeta>

        {puedeGestionar ? (
          <Tarjeta>
            <TarjetaTitulo titulo="Nuevo proveedor" descripcion="El RUC hace falta para que el gasto sea deducible." />
            <div className="p-5">
              <Formulario accion={crearProveedor} textoBoton="Dar de alta">
                <div className="space-y-4">
                  <Campo etiqueta="Nombre">
                    <input name="nombre" required className="campo" placeholder="Importadora del Este" />
                  </Campo>
                  <Campo etiqueta="RUC">
                    <input name="ruc" className="campo" placeholder="80012345-6" />
                  </Campo>
                  <Campo etiqueta="Contacto">
                    <input name="contacto" className="campo" placeholder="Nombre de quien te atiende" />
                  </Campo>
                  <Campo etiqueta="Teléfono">
                    <input name="telefono" inputMode="tel" className="campo" placeholder="0981 123 456" />
                  </Campo>
                  <Campo etiqueta="Notas">
                    <textarea name="notas" rows={2} className="campo" placeholder="Plazos, mínimos, condiciones" />
                  </Campo>
                </div>
              </Formulario>
            </div>
          </Tarjeta>
        ) : null}
      </div>
    </>
  );
}
