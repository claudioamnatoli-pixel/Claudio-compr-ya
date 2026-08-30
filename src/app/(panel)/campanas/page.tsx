import { requerirPagina } from '@/lib/guardias';
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
import { CONFIG, PASO_MONEDA } from '@/lib/config';
import { TIPOS_CAMPANA } from '@/lib/dominio';
import { rendimientoDeCampanas } from '@/lib/consultas';
import {
  formatearDinero,
  formatearMultiplicador,
  formatearDineroCorto,
  formatearFecha,
  formatearNumero,
  formatearPorcentaje,
} from '@/lib/formato';
import { cambiarEstadoCampana, crearCampana } from './acciones';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Campañas' };

export default async function CampanasPage() {
  await requerirPagina('campanas.ver');
  const campanas = await rendimientoDeCampanas();

  const inversion = campanas.reduce((suma, campana) => suma + campana.presupuesto, 0);
  const ingresos = campanas.reduce((suma, campana) => suma + campana.ingresos, 0);
  const leads = campanas.reduce((suma, campana) => suma + campana.leads, 0);
  const ganados = campanas.reduce((suma, campana) => suma + campana.ganados, 0);

  return (
    <>
      <EncabezadoPagina
        titulo="Campañas de TikTok"
        descripcion="Cada video, live o anuncio con los prospectos que trajo y el dinero que terminó entrando por ellos."
      />

      <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador
          titulo="Prospectos generados"
          valor={formatearNumero(leads)}
          detalle={`${ganados} terminaron en venta`}
          tono="azul"
        />
        <Indicador
          titulo="Conversión global"
          valor={leads > 0 ? formatearPorcentaje(ganados / leads) : '—'}
          detalle="Prospectos que acabaron comprando"
          tono="marca"
        />
        <Indicador
          titulo="Inversión publicitaria"
          valor={formatearDineroCorto(inversion)}
          detalle="Sólo campañas pagadas"
          tono="gris"
        />
        <Indicador
          titulo="Ingresos atribuidos"
          valor={formatearDineroCorto(ingresos)}
          detalle={
            inversion > 0 ? `${formatearMultiplicador(ingresos / inversion)} la inversión` : 'Todo orgánico'
          }
          tono="verde"
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Tarjeta className="lg:col-span-2">
          <TarjetaTitulo
            titulo="Rendimiento por campaña"
            descripcion="Los ingresos se atribuyen a la campaña que originó el prospecto."
          />
          {campanas.length === 0 ? (
            <SinDatos mensaje="Todavía no hay campañas registradas." />
          ) : (
            <Tabla>
              <EncabezadoTabla
                columnas={['Campaña', 'Prospectos', 'Cierre', 'Inversión', 'Ingresos', 'Retorno', '']}
              />
              <tbody className="divide-y divide-slate-100">
                {campanas.map((campana) => (
                  <tr key={campana.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{campana.nombre}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <Etiqueta tono={TIPOS_CAMPANA.tono(campana.tipo)}>
                          {TIPOS_CAMPANA.etiqueta(campana.tipo)}
                        </Etiqueta>
                        <span>desde {formatearFecha(campana.fechaInicio)}</span>
                        {!campana.activa ? <Etiqueta tono="gris">Cerrada</Etiqueta> : null}
                      </p>
                      {campana.hashtags ? (
                        <p className="mt-1 text-xs text-marca-700">{campana.hashtags}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {campana.leads}
                      <span className="ml-1 text-xs text-slate-400">({campana.ganados})</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {formatearPorcentaje(campana.conversion)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {campana.presupuesto > 0 ? formatearDinero(campana.presupuesto) : '—'}
                      {campana.costoPorLead ? (
                        <p className="text-xs text-slate-500">
                          {formatearDinero(campana.costoPorLead)} por prospecto
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      {formatearDineroCorto(campana.ingresos)}
                    </td>
                    <td className="px-4 py-3">
                      {campana.retorno === null ? (
                        <span className="text-xs text-slate-400">Orgánica</span>
                      ) : (
                        <Etiqueta tono={campana.retorno >= 2 ? 'verde' : campana.retorno >= 1 ? 'ambar' : 'rojo'}>
                          {formatearMultiplicador(campana.retorno)}
                        </Etiqueta>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <BotonAccion
                        accion={cambiarEstadoCampana}
                        camposOcultos={{
                          campanaId: campana.id,
                          activa: campana.activa ? '0' : '1',
                        }}
                      >
                        {campana.activa ? 'Cerrar' : 'Reactivar'}
                      </BotonAccion>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
        </Tarjeta>

        <Tarjeta>
          <TarjetaTitulo
            titulo="Nueva campaña"
            descripcion="Registra cada pieza de contenido para saber cuál vende de verdad."
          />
          <div className="p-5">
            <Formulario accion={crearCampana} textoBoton="Crear campaña">
              <div className="space-y-4">
                <Campo etiqueta="Nombre">
                  <input
                    name="nombre"
                    required
                    className="campo"
                    placeholder="¿Audífonos de $600 valen la pena?"
                  />
                </Campo>
                <Campo etiqueta="Tipo">
                  <select name="tipo" defaultValue="VIDEO" className="campo">
                    {TIPOS_CAMPANA.opciones.map((opcion) => (
                      <option key={opcion.valor} value={opcion.valor}>
                        {opcion.etiqueta}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo etiqueta="Enlace del video">
                  <input
                    name="urlVideo"
                    type="url"
                    className="campo"
                    placeholder="https://www.tiktok.com/@tu.tienda/video/…"
                  />
                </Campo>
                <Campo etiqueta="Hashtags">
                  <input name="hashtags" className="campo" placeholder="#audifonos #gadgets" />
                </Campo>
                <Campo
                  etiqueta={`Presupuesto (${CONFIG.moneda})`}
                  ayuda="Déjalo en cero si es contenido orgánico."
                >
                  <input
                    name="presupuesto"
                    type="number"
                    min={0}
                    step={PASO_MONEDA}
                    defaultValue={0}
                    className="campo"
                  />
                </Campo>
              </div>
            </Formulario>
          </div>
        </Tarjeta>
      </div>
    </>
  );
}
