import { requerirPagina } from '@/lib/guardias';
import { puede } from '@/lib/permisos';
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
import { PASO_MONEDA } from '@/lib/config';
import { pendientesPorRepartidor } from '@/lib/caja';
import { formatearDinero, formatearFecha } from '@/lib/formato';
import { prisma } from '@/lib/prisma';
import { registrarRendicion } from './acciones';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Caja' };

export default async function CajaPage() {
  const usuario = await requerirPagina('caja.ver');
  const puedeGestionar = puede(usuario.rol, 'caja.gestionar');

  const [pendientes, repartidores, rendiciones] = await Promise.all([
    pendientesPorRepartidor(),
    prisma.empleado.findMany({
      where: { rol: 'REPARTIDOR', activo: true },
      orderBy: { nombre: 'asc' },
      select: { id: true, nombre: true },
    }),
    prisma.rendicion.findMany({
      orderBy: { fecha: 'desc' },
      take: 30,
      include: {
        repartidor: { select: { nombre: true } },
        recibidoPor: { select: { nombre: true } },
        _count: { select: { envios: true } },
      },
    }),
  ]);

  const enLaCalle = [...pendientes.values()].reduce((suma, p) => suma + p.total, 0);
  const conPlata = [...pendientes.values()].filter((p) => p.total > 0).length;
  const faltantes = rendiciones.filter((r) => r.diferencia < 0);
  const faltanteTotal = faltantes.reduce((suma, r) => suma + r.diferencia, 0);

  const conNombre = repartidores.map((r) => ({
    ...r,
    pendiente: pendientes.get(r.id) ?? { total: 0, entregas: 0, desde: null },
  }));

  return (
    <>
      <EncabezadoPagina
        titulo="Caja"
        descripcion="El efectivo que se cobró contra entrega y todavía no llegó al negocio."
      />

      <section className="mb-6 grid gap-4 sm:grid-cols-3">
        <Indicador
          titulo="En la calle"
          valor={formatearDinero(enLaCalle)}
          detalle={`${conPlata} ${conPlata === 1 ? 'repartidor' : 'repartidores'} con plata sin rendir`}
          tono={enLaCalle > 0 ? 'ambar' : 'verde'}
        />
        <Indicador titulo="Rendiciones" valor={String(rendiciones.length)} detalle="últimos cierres" />
        <Indicador
          titulo="Faltantes acumulados"
          valor={formatearDinero(Math.abs(faltanteTotal))}
          detalle={faltantes.length === 0 ? 'ninguna diferencia' : `en ${faltantes.length} cierres`}
          tono={faltanteTotal < 0 ? 'rojo' : 'verde'}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Tarjeta>
            <TarjetaTitulo
              titulo="Pendiente de rendir"
              descripcion="Lo que cada repartidor cobró en la calle y todavía no entregó."
            />
            {conNombre.every((r) => r.pendiente.total === 0) ? (
              <SinDatos mensaje="Nadie tiene efectivo sin rendir. La caja está al día." />
            ) : (
              <Tabla>
                <EncabezadoTabla columnas={['Repartidor', 'Entregas', 'Desde', 'Debe traer']} />
                <tbody>
                  {conNombre
                    .filter((r) => r.pendiente.total > 0)
                    .map((r) => (
                      <tr key={r.id} className="border-t border-slate-100">
                        <td className="px-5 py-3 font-medium text-slate-900">{r.nombre}</td>
                        <td className="px-5 py-3 text-slate-600">{r.pendiente.entregas}</td>
                        <td className="px-5 py-3 text-slate-600">
                          {r.pendiente.desde ? formatearFecha(r.pendiente.desde) : '—'}
                        </td>
                        <td className="px-5 py-3 tabular-nums font-medium">
                          {formatearDinero(r.pendiente.total)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </Tabla>
            )}
          </Tarjeta>

          <Tarjeta>
            <TarjetaTitulo titulo="Cierres anteriores" />
            {rendiciones.length === 0 ? (
              <SinDatos mensaje="Todavía no se cerró ninguna caja." />
            ) : (
              <Tabla>
                <EncabezadoTabla columnas={['Cierre', 'Repartidor', 'Esperado', 'Entregó', 'Diferencia']} />
                <tbody>
                  {rendiciones.map((r) => (
                    <tr key={r.id} className="border-t border-slate-100">
                      <td className="px-5 py-3">
                        <div className="font-mono text-xs text-slate-500">{r.numero}</div>
                        <div className="text-xs text-slate-500">
                          {formatearFecha(r.fecha)} · {r._count.envios} entregas
                        </div>
                      </td>
                      <td className="px-5 py-3 text-slate-700">
                        {r.repartidor.nombre}
                        {r.recibidoPor ? (
                          <div className="text-xs text-slate-500">recibió {r.recibidoPor.nombre}</div>
                        ) : null}
                      </td>
                      <td className="px-5 py-3 tabular-nums text-slate-600">{formatearDinero(r.esperado)}</td>
                      <td className="px-5 py-3 tabular-nums">{formatearDinero(r.declarado)}</td>
                      <td className="px-5 py-3">
                        {r.diferencia === 0 ? (
                          <Etiqueta tono="verde">Sin diferencia</Etiqueta>
                        ) : (
                          <Etiqueta tono={r.diferencia < 0 ? 'rojo' : 'ambar'}>
                            {r.diferencia < 0 ? 'Faltó ' : 'Sobró '}
                            {formatearDinero(Math.abs(r.diferencia))}
                          </Etiqueta>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Tabla>
            )}
          </Tarjeta>
        </div>

        {puedeGestionar ? (
          <Tarjeta>
            <TarjetaTitulo
              titulo="Cerrar caja"
              descripcion="Contá la plata que te entregó y escribí el total. El sistema calcula la diferencia."
            />
            <div className="p-5">
              {conNombre.filter((r) => r.pendiente.total > 0).length === 0 ? (
                <SinDatos mensaje="No hay nada que rendir ahora mismo." />
              ) : (
                <Formulario accion={registrarRendicion} textoBoton="Registrar rendición">
                  <div className="space-y-4">
                    <Campo etiqueta="Repartidor">
                      <select name="repartidorId" required className="campo" defaultValue="">
                        <option value="" disabled>Elegí uno</option>
                        {conNombre
                          .filter((r) => r.pendiente.total > 0)
                          .map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.nombre} — debe {formatearDinero(r.pendiente.total)}
                            </option>
                          ))}
                      </select>
                    </Campo>
                    <Campo etiqueta="Entregó" ayuda="Lo que contaste de verdad, en guaraníes.">
                      <input
                        name="declarado"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={PASO_MONEDA}
                        required
                        className="campo"
                      />
                    </Campo>
                    <Campo etiqueta="Notas" ayuda="Si hay diferencia, por qué.">
                      <textarea name="notas" rows={2} className="campo" placeholder="Pagó un flete, quedó un vuelto…" />
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
