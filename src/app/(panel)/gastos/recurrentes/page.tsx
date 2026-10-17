import Link from 'next/link';
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
import { PASO_MONEDA } from '@/lib/config';
import { CATEGORIAS_GASTO, CATEGORIAS_RECURRENTE, ROLES } from '@/lib/dominio';
import { formatearDinero, formatearPeriodo, periodoDe } from '@/lib/formato';
import { requerirPagina } from '@/lib/guardias';
import { prisma } from '@/lib/prisma';
import {
  IPS_PATRONAL_DECIMAS,
  nominaDelMes,
  periodosPendientes,
  vigenteEn,
} from '@/lib/recurrentes';
import {
  crearGastoRecurrente,
  darDeBajaGastoRecurrente,
  generarGastosDelPeriodo,
} from './acciones';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Gastos fijos' };

export default async function GastosRecurrentesPage() {
  await requerirPagina('gastos.gestionar');

  const actual = periodoDe();
  const [recurrentes, proveedores, nomina, periodos] = await Promise.all([
    prisma.gastoRecurrente.findMany({
      orderBy: [{ activo: 'desc' }, { monto: 'desc' }],
      include: { proveedor: { select: { nombre: true } } },
    }),
    prisma.proveedor.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } }),
    nominaDelMes(),
    periodosPendientes(),
  ]);

  const vigentes = recurrentes.filter((r) => vigenteEn(r, actual));
  const totalRecurrentes = vigentes.reduce((suma, r) => suma + r.monto, 0);
  const fijoMensual = totalRecurrentes + nomina.total;
  const pendientes = periodos.filter((p) => p.faltantes > 0);
  const ips = (IPS_PATRONAL_DECIMAS / 10).toLocaleString('es-PY');

  return (
    <>
      <EncabezadoPagina
        titulo="Gastos fijos"
        descripcion="Lo que se paga todos los meses pase lo que pase. Se cargan una vez acá y después se generan con un botón; los sueldos salen de la nómina del equipo."
        acciones={
          <Link href="/gastos" className="boton-secundario">
            Ver los gastos cargados
          </Link>
        }
      />

      <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador
          titulo="Costo fijo mensual"
          valor={formatearDinero(fijoMensual)}
          detalle="gastos fijos más la planilla completa"
          tono="rojo"
        />
        <Indicador
          titulo="Gastos fijos vigentes"
          valor={formatearDinero(totalRecurrentes)}
          detalle={`${vigentes.length} de ${recurrentes.length} cargados`}
          tono="ambar"
        />
        <Indicador
          titulo="Planilla"
          valor={formatearDinero(nomina.total)}
          detalle={`${nomina.personas} ${nomina.personas === 1 ? 'persona' : 'personas'}, con aguinaldo e IPS`}
          tono="verde"
        />
        <Indicador
          titulo="Meses por generar"
          valor={String(pendientes.length)}
          detalle={
            pendientes.length > 0
              ? `el más viejo: ${formatearPeriodo(pendientes[0].periodo)}`
              : 'todo al día'
          }
          tono={pendientes.length > 0 ? 'rojo' : 'verde'}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Tarjeta>
            <TarjetaTitulo
              titulo="Generar el mes"
              descripcion="Escribe los gastos de ese mes en la lista de gastos. Tocarlo dos veces no duplica nada."
            />
            {periodos.length === 0 ? (
              <SinDatos mensaje="Cargá un gasto fijo o un sueldo y acá va a aparecer qué generar." />
            ) : (
              <Tabla>
                <EncabezadoTabla columnas={['Mes', 'Renglones', 'Por generar', 'Ya cargado', '']} />
                <tbody>
                  {periodos.map((p) => (
                    <tr key={p.periodo} className="border-t border-slate-100">
                      <td className="px-5 py-3 whitespace-nowrap">
                        <div className="text-slate-900">{formatearPeriodo(p.periodo)}</div>
                        {p.periodo === actual ? (
                          <div className="text-xs text-slate-500">mes en curso</div>
                        ) : null}
                      </td>
                      <td className="px-5 py-3 text-slate-600">
                        {p.faltantes > 0 ? (
                          <Etiqueta tono="ambar">{p.faltantes} por cargar</Etiqueta>
                        ) : (
                          <Etiqueta tono="verde">completo</Etiqueta>
                        )}
                      </td>
                      <td className="px-5 py-3 tabular-nums font-medium">
                        {p.aGenerar > 0 ? formatearDinero(p.aGenerar) : '—'}
                      </td>
                      <td className="px-5 py-3 tabular-nums text-slate-600">
                        {p.yaGenerado > 0 ? formatearDinero(p.yaGenerado) : '—'}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {p.faltantes > 0 ? (
                          <BotonAccion
                            accion={generarGastosDelPeriodo}
                            camposOcultos={{ periodo: p.periodo }}
                          >
                            Generar
                          </BotonAccion>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Tabla>
            )}
          </Tarjeta>

          <Tarjeta>
            <TarjetaTitulo
              titulo="Gastos fijos cargados"
              descripcion="Cambiarle el importe no reescribe los meses ya generados."
            />
            {recurrentes.length === 0 ? (
              <SinDatos mensaje="Todavía no cargaste ningún gasto fijo." />
            ) : (
              <Tabla>
                <EncabezadoTabla columnas={['Concepto', 'Categoría', 'Importe', 'Vigencia', '']} />
                <tbody>
                  {recurrentes.map((r) => (
                    <tr key={r.id} className="border-t border-slate-100">
                      <td className="px-5 py-3">
                        <div className="text-slate-900">{r.descripcion}</div>
                        <div className="text-xs text-slate-500">
                          {r.proveedor?.nombre ?? 'Sin proveedor'} · se paga el {r.diaDePago}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <Etiqueta tono={CATEGORIAS_GASTO.tono(r.categoria)}>
                          {CATEGORIAS_GASTO.etiqueta(r.categoria)}
                        </Etiqueta>
                      </td>
                      <td className="px-5 py-3 tabular-nums font-medium">
                        {formatearDinero(r.monto)}
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-600">
                        {r.activo ? (
                          <>
                            desde {formatearPeriodo(r.desde)}
                            {r.hasta ? ` hasta ${formatearPeriodo(r.hasta)}` : ''}
                          </>
                        ) : (
                          <Etiqueta tono="gris">de baja</Etiqueta>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <BotonAccion
                          accion={darDeBajaGastoRecurrente}
                          camposOcultos={{ id: r.id }}
                          variante={r.activo ? 'peligro' : 'secundario'}
                          confirmacion={
                            r.activo
                              ? '¿Dejar de generar este gasto? Los meses ya cargados no se tocan.'
                              : undefined
                          }
                        >
                          {r.activo ? 'Dar de baja' : 'Reactivar'}
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
              titulo="Planilla del mes"
              descripcion={`Sale del sueldo base de la gente activa. El aguinaldo se provisiona todos los meses (un doceavo) y el IPS patronal es ${ips} % del bruto.`}
            />
            {nomina.personas === 0 ? (
              <SinDatos mensaje="Nadie tiene sueldo base cargado en su ficha del equipo." />
            ) : (
              <>
                <Tabla>
                  <EncabezadoTabla columnas={['Persona', 'Rol', 'Sueldo base']} />
                  <tbody>
                    {nomina.empleados.map((e) => (
                      <tr key={e.id} className="border-t border-slate-100">
                        <td className="px-5 py-3 text-slate-900">{e.nombre}</td>
                        <td className="px-5 py-3">
                          <Etiqueta tono={ROLES.tono(e.rol)}>{ROLES.etiqueta(e.rol)}</Etiqueta>
                        </td>
                        <td className="px-5 py-3 tabular-nums">{formatearDinero(e.salarioBase)}</td>
                      </tr>
                    ))}
                  </tbody>
                </Tabla>
                <dl className="grid gap-px border-t border-slate-100 bg-slate-100 sm:grid-cols-4">
                  {[
                    { clave: 'Sueldos brutos', valor: nomina.bruto },
                    { clave: 'Aguinaldo devengado', valor: nomina.aguinaldo },
                    { clave: `IPS patronal (${ips} %)`, valor: nomina.ips },
                    { clave: 'Costo real de la planilla', valor: nomina.total },
                  ].map((fila) => (
                    <div key={fila.clave} className="bg-white px-5 py-3">
                      <dt className="text-xs text-slate-500">{fila.clave}</dt>
                      <dd className="tabular-nums font-medium text-slate-900">
                        {formatearDinero(fila.valor)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </>
            )}
          </Tarjeta>
        </div>

        <Tarjeta>
          <TarjetaTitulo
            titulo="Cargar un gasto fijo"
            descripcion="Los sueldos no van acá: se toman de la ficha de cada persona."
          />
          <div className="p-5">
            <Formulario accion={crearGastoRecurrente} textoBoton="Cargar gasto fijo">
              <div className="space-y-4">
                <Campo etiqueta="Categoría">
                  <select name="categoria" required className="campo" defaultValue="">
                    <option value="" disabled>
                      Elegí una
                    </option>
                    {CATEGORIAS_RECURRENTE.map((o) => (
                      <option key={o.valor} value={o.valor}>
                        {o.etiqueta}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo etiqueta="Concepto">
                  <input
                    name="descripcion"
                    required
                    className="campo"
                    placeholder="Alquiler del galpón"
                  />
                </Campo>
                <Campo etiqueta="Importe por mes" ayuda="En guaraníes, sin puntos.">
                  <input
                    name="monto"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={PASO_MONEDA}
                    required
                    className="campo"
                  />
                </Campo>
                <Campo etiqueta="Día de pago" ayuda="Del 1 al 28, para que exista en febrero.">
                  <input
                    name="diaDePago"
                    type="number"
                    min={1}
                    max={28}
                    defaultValue={1}
                    required
                    className="campo"
                  />
                </Campo>
                <Campo etiqueta="Desde qué mes">
                  <input name="desde" type="month" required defaultValue={actual} className="campo" />
                </Campo>
                <Campo etiqueta="Hasta qué mes" ayuda="Opcional: vacío es que sigue.">
                  <input name="hasta" type="month" className="campo" />
                </Campo>
                <Campo etiqueta="Proveedor" ayuda="Opcional.">
                  <select name="proveedorId" className="campo" defaultValue="">
                    <option value="">Sin proveedor</option>
                    {proveedores.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo etiqueta="Notas" ayuda="Opcional.">
                  <input name="notas" className="campo" placeholder="Contrato hasta marzo" />
                </Campo>
              </div>
            </Formulario>
          </div>
        </Tarjeta>
      </div>
    </>
  );
}
