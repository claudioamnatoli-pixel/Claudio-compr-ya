import { requerirPagina } from '@/lib/guardias';
import { puede } from '@/lib/permisos';
import Link from 'next/link';
import { Campo, Formulario } from '@/components/formulario';
import { primerValor } from '@/components/filtros';
import {
  EncabezadoPagina,
  EncabezadoTabla,
  Etiqueta,
  Indicador,
  Progreso,
  SinDatos,
  Tabla,
  Tarjeta,
  TarjetaTitulo,
} from '@/components/ui';
import { CONFIG, PASO_MONEDA } from '@/lib/config';
import { ROLES } from '@/lib/dominio';
import { rendimientoDeVendedores } from '@/lib/consultas';
import {
  formatearDinero,
  formatearDineroCorto,
  formatearNumero,
  formatearPeriodo,
  formatearPorcentaje,
  periodoDe,
} from '@/lib/formato';
import { prisma } from '@/lib/prisma';
import { crearEquipo } from './acciones';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Equipo' };

type Parametros = Promise<{ [clave: string]: string | string[] | undefined }>;

/** Los últimos seis periodos, para el selector de mes. */
function periodosRecientes(cantidad = 6) {
  const hoy = new Date();
  return Array.from({ length: cantidad }, (_, indice) =>
    periodoDe(new Date(hoy.getFullYear(), hoy.getMonth() - indice, 1)),
  );
}

export default async function EquipoPage({ searchParams }: { searchParams: Parametros }) {
  const usuario = await requerirPagina('equipo.ver');
  const puedeGestionar = puede(usuario.rol, 'equipo.gestionar');
  // Sueldos y comisiones ajenas son datos sensibles: un líder los ve para
  // dirigir a su gente, un vendedor no.
  const puedeVerDinero = puede(usuario.rol, 'equipo.verRemuneracion');
  const parametros = await searchParams;
  const periodo = primerValor(parametros.periodo) ?? periodoDe();

  const [vendedores, equipos, empleados, comisionesPeriodo, asistenciaPeriodo] = await Promise.all([
    rendimientoDeVendedores(periodo),
    prisma.equipo.findMany({
      include: {
        lider: { select: { id: true, nombre: true } },
        _count: { select: { miembros: true } },
      },
      orderBy: { nombre: 'asc' },
    }),
    prisma.empleado.findMany({
      include: { equipo: { select: { nombre: true } } },
      orderBy: [{ activo: 'desc' }, { nombre: 'asc' }],
    }),
    prisma.comision.groupBy({
      by: ['estado'],
      where: { periodo },
      _sum: { monto: true },
      _count: { _all: true },
    }),
    prisma.asistencia.groupBy({
      by: ['estado'],
      where: { fecha: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } },
      _count: { _all: true },
    }),
  ]);

  const activos = empleados.filter((empleado) => empleado.activo);
  const nomina = activos.reduce((suma, empleado) => suma + empleado.salarioBase, 0);
  const comisionesTotales = comisionesPeriodo.reduce((suma, fila) => suma + (fila._sum.monto ?? 0), 0);
  const porPagar = comisionesPeriodo
    .filter((fila) => fila.estado === 'APROBADA' || fila.estado === 'PENDIENTE')
    .reduce((suma, fila) => suma + (fila._sum.monto ?? 0), 0);

  const asistenciasContadas = asistenciaPeriodo
    .filter((fila) => fila.estado !== 'DESCANSO')
    .reduce((suma, fila) => suma + fila._count._all, 0);
  const presentes = asistenciaPeriodo
    .filter((fila) => fila.estado === 'PRESENTE' || fila.estado === 'TARDE')
    .reduce((suma, fila) => suma + fila._count._all, 0);

  // Ventas por equipo, sumando lo que hizo cada uno de sus integrantes.
  const ventasPorEquipo = new Map<string, number>();
  const idPorNombreEquipo = new Map(equipos.map((equipo) => [equipo.nombre, equipo.id]));
  for (const vendedor of vendedores) {
    if (!vendedor.equipo) continue;
    const equipoId = idPorNombreEquipo.get(vendedor.equipo);
    if (!equipoId) continue;
    ventasPorEquipo.set(equipoId, (ventasPorEquipo.get(equipoId) ?? 0) + vendedor.ventas);
  }

  const candidatosLider = activos.filter((empleado) =>
    ['LIDER', 'ADMIN', 'VENDEDOR'].includes(empleado.rol),
  );

  return (
    <>
      <EncabezadoPagina
        titulo="Equipo y estructura de venta"
        descripcion="Quién vende, en qué equipo está, cuánto lleva del mes y qué comisión le toca."
        acciones={
          puedeGestionar ? (
            <Link href="/equipo/nuevo" className="boton-primario">
              Dar de alta a alguien
            </Link>
          ) : null
        }
      />

      <form method="get" className="mb-6 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="etiqueta-campo">Periodo</span>
          <select name="periodo" defaultValue={periodo} className="campo w-56">
            {periodosRecientes().map((valor) => (
              <option key={valor} value={valor}>
                {formatearPeriodo(valor)}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="boton-secundario">
          Ver periodo
        </button>
      </form>

      <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador
          titulo="Personas activas"
          valor={formatearNumero(activos.length)}
          detalle={`${empleados.length - activos.length} inactivas`}
          tono="azul"
        />
        {puedeVerDinero ? (
          <>
            <Indicador
              titulo="Nómina base mensual"
              valor={formatearDineroCorto(nomina)}
              detalle="Sin contar comisiones"
              tono="gris"
            />
            <Indicador
              titulo={`Comisiones ${formatearPeriodo(periodo)}`}
              valor={formatearDinero(comisionesTotales)}
              detalle={`${formatearDinero(porPagar)} pendientes de pago`}
              tono="marca"
            />
          </>
        ) : null}
        <Indicador
          titulo="Asistencia del mes"
          valor={
            asistenciasContadas > 0 ? formatearPorcentaje(presentes / asistenciasContadas) : '—'
          }
          detalle="Días trabajados sobre días laborables"
          tono={
            asistenciasContadas > 0 && presentes / asistenciasContadas < 0.9 ? 'ambar' : 'verde'
          }
        />
      </section>

      <section className="mb-6 grid gap-4 md:grid-cols-2">
        {equipos.map((equipo) => {
          const ventas = ventasPorEquipo.get(equipo.id) ?? 0;
          const avance = equipo.metaMensual > 0 ? ventas / equipo.metaMensual : 0;
          return (
            <Tarjeta key={equipo.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-900">{equipo.nombre}</h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {equipo._count.miembros} integrantes ·{' '}
                    {equipo.lider ? (
                      <Link
                        href={`/equipo/${equipo.lider.id}`}
                        className="text-marca-700 hover:underline"
                      >
                        {equipo.lider.nombre}
                      </Link>
                    ) : (
                      'sin líder'
                    )}
                  </p>
                </div>
                <Etiqueta tono={avance >= 1 ? 'verde' : avance >= 0.6 ? 'marca' : 'ambar'}>
                  {equipo.metaMensual > 0 ? formatearPorcentaje(avance) : 'sin meta'}
                </Etiqueta>
              </div>
              {equipo.descripcion ? (
                <p className="mt-2 text-sm text-slate-600">{equipo.descripcion}</p>
              ) : null}
              <div className="mt-3">
                <Progreso fraccion={avance} />
              </div>
              <p className="mt-1.5 text-xs text-slate-500">
                {formatearDineroCorto(ventas)} de {formatearDineroCorto(equipo.metaMensual)} en{' '}
                {formatearPeriodo(periodo)}
              </p>
            </Tarjeta>
          );
        })}
      </section>

      <Tarjeta className="mb-6">
        <TarjetaTitulo
          titulo={`Rendimiento de venta · ${formatearPeriodo(periodo)}`}
          descripcion="Ordenado por importe vendido en el periodo."
        />
        {vendedores.length === 0 ? (
          <SinDatos mensaje="No hay vendedores dados de alta." />
        ) : (
          <Tabla>
            <EncabezadoTabla
              columnas={[
                'Vendedor',
                'Equipo',
                'Prospectos',
                'Cierre',
                'Pedidos',
                'Ventas',
                'Meta',
                ...(puedeVerDinero ? ['Comisión'] : []),
              ]}
            />
            <tbody className="divide-y divide-slate-100">
              {vendedores.map((vendedor) => (
                <tr key={vendedor.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/equipo/${vendedor.id}`}
                      className="font-medium text-slate-900 hover:text-marca-700 hover:underline"
                    >
                      {vendedor.nombre}
                    </Link>
                    <p className="text-xs text-slate-500">{ROLES.etiqueta(vendedor.rol)}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{vendedor.equipo ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {vendedor.leads}
                    <span className="ml-1 text-xs text-slate-400">({vendedor.ganados} cerrados)</span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatearPorcentaje(vendedor.conversion)}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{vendedor.pedidos}</td>
                  <td className="px-4 py-3 font-semibold text-slate-900">
                    {formatearDineroCorto(vendedor.ventas)}
                  </td>
                  <td className="w-40 px-4 py-3">
                    {vendedor.avanceMeta === null ? (
                      <span className="text-xs text-slate-400">Sin meta</span>
                    ) : (
                      <>
                        <Progreso fraccion={vendedor.avanceMeta} />
                        <p className="mt-1 text-xs text-slate-500">
                          {formatearPorcentaje(vendedor.avanceMeta)} de{' '}
                          {formatearDineroCorto(vendedor.metaMensual)}
                        </p>
                      </>
                    )}
                  </td>
                  {puedeVerDinero ? (
                    <td className="px-4 py-3 text-slate-700">
                      {formatearDinero(vendedor.comisiones)}
                      <p className="text-xs text-slate-500">
                        {formatearPorcentaje(vendedor.tasaComision, 0)} por venta
                      </p>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </Tarjeta>

      <div className="grid gap-4 lg:grid-cols-3">
        <Tarjeta className={puedeGestionar ? 'lg:col-span-2' : 'lg:col-span-3'}>
          <TarjetaTitulo titulo="Toda la plantilla" />
          <Tabla>
            <EncabezadoTabla
            columnas={[
              'Persona',
              'Rol',
              'Equipo',
              ...(puedeVerDinero ? ['Sueldo base'] : []),
              'Estado',
            ]}
          />
            <tbody className="divide-y divide-slate-100">
              {empleados.map((empleado) => (
                <tr key={empleado.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/equipo/${empleado.id}`}
                      className="font-medium text-slate-900 hover:text-marca-700 hover:underline"
                    >
                      {empleado.nombre}
                    </Link>
                    <p className="text-xs text-slate-500">{empleado.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Etiqueta tono={ROLES.tono(empleado.rol)}>{ROLES.etiqueta(empleado.rol)}</Etiqueta>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{empleado.equipo?.nombre ?? '—'}</td>
                  {puedeVerDinero ? (
                    <td className="px-4 py-3 text-slate-600">
                      {formatearDinero(empleado.salarioBase)}
                    </td>
                  ) : null}
                  <td className="px-4 py-3">
                    <Etiqueta tono={empleado.activo ? 'verde' : 'gris'}>
                      {empleado.activo ? 'Activo' : 'Inactivo'}
                    </Etiqueta>
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        </Tarjeta>

        {puedeGestionar ? (
        <Tarjeta>
          <TarjetaTitulo
            titulo="Nuevo equipo"
            descripcion="Agrupa vendedores bajo un líder y ponle una meta mensual."
          />
          <div className="p-5">
            <Formulario accion={crearEquipo} textoBoton="Crear equipo">
              <div className="space-y-4">
                <Campo etiqueta="Nombre">
                  <input name="nombre" required className="campo" placeholder="Equipo Gamma" />
                </Campo>
                <Campo etiqueta="Descripción">
                  <textarea
                    name="descripcion"
                    rows={2}
                    className="campo"
                    placeholder="Atiende los lives de fin de semana."
                  />
                </Campo>
                <Campo etiqueta={`Meta mensual (${CONFIG.moneda})`}>
                  <input
                    name="metaMensual"
                    type="number"
                    min={0}
                    step={PASO_MONEDA}
                    defaultValue={0}
                    className="campo"
                  />
                </Campo>
                <Campo etiqueta="Líder">
                  <select name="liderId" defaultValue="" className="campo">
                    <option value="">Sin líder</option>
                    {candidatosLider.map((empleado) => (
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
        ) : null}
      </div>
    </>
  );
}
