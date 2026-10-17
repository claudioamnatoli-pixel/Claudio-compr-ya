import { requerirPagina } from '@/lib/guardias';
import {
  EncabezadoPagina,
  Indicador,
  SinDatos,
  Tarjeta,
  TarjetaTitulo,
} from '@/components/ui';
import { estadoDeResultados, mesDe } from '@/lib/contabilidad';
import { formatearDinero, formatearPorcentaje } from '@/lib/formato';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Contabilidad' };

/** Un renglón del estado de resultados. */
function Renglon({
  concepto,
  detalle,
  monto,
  negativo = false,
  fuerte = false,
}: {
  concepto: string;
  detalle?: string;
  monto: number;
  negativo?: boolean;
  fuerte?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 px-5 py-2.5 ${
        fuerte ? 'border-t border-slate-200 font-semibold' : ''
      }`}
    >
      <div>
        <span className={fuerte ? 'text-slate-900' : 'text-slate-700'}>{concepto}</span>
        {detalle ? <div className="text-xs text-slate-500">{detalle}</div> : null}
      </div>
      <span
        className={`tabular-nums whitespace-nowrap ${
          negativo ? 'text-rose-700' : fuerte ? 'text-slate-900' : 'text-slate-800'
        }`}
      >
        {negativo && monto > 0 ? '−' : ''}
        {formatearDinero(monto)}
      </span>
    </div>
  );
}

export default async function ContabilidadPage() {
  await requerirPagina('contabilidad.ver');
  const { desde, hasta } = mesDe(new Date());
  const r = await estadoDeResultados(desde, hasta);

  const gano = r.resultado >= 0;
  const mes = new Intl.DateTimeFormat('es-PY', { month: 'long', year: 'numeric' }).format(desde);

  return (
    <>
      <EncabezadoPagina
        titulo="Contabilidad"
        descripcion={`Lo que entró, lo que salió y lo que quedó en ${mes}.`}
      />

      <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador titulo="Ingresos" valor={formatearDinero(r.ingresos.total)} detalle={`${r.pedidos} pedidos entregados`} tono="marca" />
        <Indicador titulo="Egresos" valor={formatearDinero(r.egresos.total)} detalle="todo lo que costó" tono="ambar" />
        <Indicador
          titulo={gano ? 'Ganancia' : 'Pérdida'}
          valor={formatearDinero(Math.abs(r.resultado))}
          detalle={r.margen === null ? 'sin ventas este mes' : `${formatearPorcentaje(r.margen)} de margen`}
          tono={gano ? 'verde' : 'rojo'}
        />
        <Indicador
          titulo="Movimiento de caja"
          valor={formatearDinero(r.caja.movimiento)}
          detalle="cobrado en ruta − reposición − gastos"
          tono={r.caja.movimiento >= 0 ? 'verde' : 'rojo'}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Tarjeta>
          <TarjetaTitulo
            titulo="Estado de resultados"
            descripcion="Cada cifra se lee de donde ya vive: nada se carga dos veces."
          />
          {r.pedidos === 0 && r.egresos.total === 0 ? (
            <SinDatos mensaje="Todavía no hay movimientos este mes." />
          ) : (
            <div className="pb-3">
              <Renglon concepto="Ventas" detalle="pedidos entregados" monto={r.ingresos.ventas} />
              {r.ingresos.descuentos > 0 ? (
                <Renglon concepto="Descuentos" monto={r.ingresos.descuentos} negativo />
              ) : null}
              <Renglon concepto="Envíos cobrados" monto={r.ingresos.enviosCobrados} />
              <Renglon concepto="Ingresos" monto={r.ingresos.total} fuerte />

              <Renglon
                concepto="Costo de la mercadería vendida"
                detalle="lo que costó lo que salió del depósito"
                monto={r.egresos.mercaderiaVendida}
                negativo
              />
              <Renglon concepto="Comisiones de vendedores" monto={r.egresos.comisiones} negativo />
              <Renglon concepto="Campañas de TikTok" monto={r.egresos.campanas} negativo />
              <Renglon concepto="Costo real de los envíos" monto={r.egresos.envios} negativo />
              <Renglon concepto="Gastos" detalle="alquiler, servicios, banco…" monto={r.egresos.gastos} negativo />
              <Renglon concepto="Egresos" monto={r.egresos.total} fuerte negativo />

              <Renglon concepto={gano ? 'Ganancia del mes' : 'Pérdida del mes'} monto={Math.abs(r.resultado)} fuerte />
            </div>
          )}
        </Tarjeta>

        <div className="space-y-6">
          <Tarjeta>
            <TarjetaTitulo titulo="Gastos por categoría" />
            {r.egresos.porCategoria.length === 0 ? (
              <SinDatos mensaje="Sin gastos cargados este mes." />
            ) : (
              <div className="pb-3">
                {r.egresos.porCategoria.map((g) => (
                  <Renglon key={g.categoria} concepto={g.etiqueta} monto={g.monto} />
                ))}
              </div>
            )}
          </Tarjeta>

          <Tarjeta>
            <TarjetaTitulo
              titulo="Caja"
              descripcion="Otra pregunta distinta: cuánta plata se movió de verdad."
            />
            <div className="pb-3">
              <Renglon concepto="Cobrado contra entrega" monto={r.caja.cobradoEnRuta} />
              <Renglon concepto="Rendido por los repartidores" monto={r.caja.rendido} />
              {r.caja.enLaCalle !== 0 ? (
                <Renglon
                  concepto="Todavía en la calle"
                  detalle="cobrado y sin rendir"
                  monto={r.caja.enLaCalle}
                />
              ) : null}
              {r.caja.diferenciaRendiciones !== 0 ? (
                <Renglon
                  concepto={r.caja.diferenciaRendiciones < 0 ? 'Faltantes de caja' : 'Sobrantes de caja'}
                  monto={Math.abs(r.caja.diferenciaRendiciones)}
                  negativo={r.caja.diferenciaRendiciones < 0}
                />
              ) : null}
              <Renglon concepto="Mercadería repuesta" monto={r.caja.comprasRecibidas} negativo />
              <Renglon concepto="Gastos pagados" monto={r.egresos.gastos} negativo />
              <Renglon concepto="Movimiento" monto={Math.abs(r.caja.movimiento)} fuerte />
            </div>
            <p className="px-5 pb-4 text-xs text-slate-500">
              Un mes en que reponés mucho stock da caja negativa aunque el negocio vaya bien: la
              mercadería sigue siendo tuya, sólo que en el depósito en vez de en el bolsillo.
            </p>
          </Tarjeta>
        </div>
      </div>
    </>
  );
}
