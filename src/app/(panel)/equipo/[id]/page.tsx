import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BotonAccion, Campo, Formulario } from '@/components/formulario';
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
import {
  ESTADOS_ASISTENCIA,
  ESTADOS_COMISION,
  ESTADOS_ENVIO,
  ESTADOS_PEDIDO,
  ROLES,
} from '@/lib/dominio';
import { ESTADOS_VENTA, inicioDelMes } from '@/lib/consultas';
import {
  aUnidades,
  formatearDinero,
  formatearFecha,
  formatearPeriodo,
  formatearPorcentaje,
  periodoDe,
} from '@/lib/formato';
import { prisma } from '@/lib/prisma';
import { requerirSesion } from '@/lib/guardias';
import { inicioDe, puede, puedeVerEmpleado } from '@/lib/permisos';
import { redirect } from 'next/navigation';
import { formatearTelefono } from '@/lib/whatsapp';
import { actualizarEmpleado, pagarComisiones, registrarAsistencia } from '../acciones';

export const dynamic = 'force-dynamic';

export default async function EmpleadoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const usuario = await requerirSesion();

  // Cualquiera puede abrir su propia ficha; la de otra persona exige permiso
  // sobre el personal.
  if (!puedeVerEmpleado(usuario, id)) redirect(inicioDe(usuario.rol));

  const esPropia = usuario.id === id;
  const puedeGestionar = puede(usuario.rol, 'equipo.gestionar');
  // El sueldo y las comisiones son datos sensibles: se ven los propios, o los
  // ajenos sólo con permiso explícito.
  const puedeVerDinero = esPropia || puede(usuario.rol, 'equipo.verRemuneracion');
  const puedeRegistrarAsistencia = puede(usuario.rol, 'asistencia.registrar');

  const periodo = periodoDe();
  const desdeEsteMes = inicioDelMes();

  const empleado = await prisma.empleado.findUnique({
    where: { id },
    include: {
      equipo: { select: { id: true, nombre: true, metaMensual: true } },
      equipoLiderado: { select: { id: true, nombre: true } },
    },
  });
  if (!empleado) notFound();

  const [equipos, ventas, comisiones, asistencias, pedidosRecientes, entregas, leadsMes] =
    await Promise.all([
      prisma.equipo.findMany({ select: { id: true, nombre: true }, orderBy: { nombre: 'asc' } }),
      prisma.pedido.aggregate({
        where: {
          vendedorId: empleado.id,
          estado: { in: ESTADOS_VENTA },
          createdAt: { gte: desdeEsteMes },
        },
        _sum: { total: true },
        _count: true,
      }),
      prisma.comision.findMany({
        where: { empleadoId: empleado.id },
        orderBy: { createdAt: 'desc' },
        take: 40,
        include: { pedido: { select: { id: true, codigo: true, estado: true } } },
      }),
      prisma.asistencia.findMany({
        where: { empleadoId: empleado.id },
        orderBy: { fecha: 'desc' },
        take: 30,
      }),
      prisma.pedido.findMany({
        where: { vendedorId: empleado.id },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, codigo: true, clienteNombre: true, total: true, estado: true, createdAt: true },
      }),
      prisma.envio.findMany({
        where: { repartidorId: empleado.id },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { pedido: { select: { id: true, codigo: true, clienteNombre: true, ciudad: true } } },
      }),
      prisma.lead.groupBy({
        by: ['estado'],
        where: { vendedorId: empleado.id, createdAt: { gte: desdeEsteMes } },
        _count: { _all: true },
      }),
    ]);

  const ventasMes = ventas._sum.total ?? 0;
  const avanceMeta = empleado.metaMensual > 0 ? ventasMes / empleado.metaMensual : null;

  const comisionesPeriodo = comisiones.filter((comision) => comision.periodo === periodo);
  const comisionMes = comisionesPeriodo
    .filter((comision) => comision.estado !== 'CANCELADA')
    .reduce((suma, comision) => suma + comision.monto, 0);
  const porPagar = comisionesPeriodo
    .filter((comision) => comision.estado === 'APROBADA')
    .reduce((suma, comision) => suma + comision.monto, 0);

  const totalLeads = leadsMes.reduce((suma, fila) => suma + fila._count._all, 0);
  const ganados = leadsMes.find((fila) => fila.estado === 'GANADO')?._count._all ?? 0;

  const esVendedor = ['VENDEDOR', 'LIDER'].includes(empleado.rol);
  const esRepartidor = empleado.rol === 'REPARTIDOR';
  const hoy = new Date().toISOString().slice(0, 10);

  return (
    <>
      <EncabezadoPagina
        titulo={empleado.nombre}
        descripcion={`${empleado.email} · ${formatearTelefono(empleado.telefono)} · desde ${formatearFecha(
          empleado.fechaIngreso,
        )}`}
        acciones={
          <Link href="/equipo" className="boton-secundario">
            Volver
          </Link>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Etiqueta tono={ROLES.tono(empleado.rol)}>{ROLES.etiqueta(empleado.rol)}</Etiqueta>
        <Etiqueta tono={empleado.activo ? 'verde' : 'gris'}>
          {empleado.activo ? 'Activo' : `Baja ${formatearFecha(empleado.fechaBaja)}`}
        </Etiqueta>
        {empleado.equipo ? (
          <span className="text-xs text-slate-500">Equipo {empleado.equipo.nombre}</span>
        ) : null}
        {empleado.equipoLiderado ? (
          <Etiqueta tono="marca">Lidera {empleado.equipoLiderado.nombre}</Etiqueta>
        ) : null}
      </div>

      {esVendedor ? (
        <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Indicador
            titulo="Ventas del mes"
            valor={formatearDinero(ventasMes)}
            detalle={`${ventas._count} pedidos`}
            tono="verde"
          />
          {puedeVerDinero ? (
            <Indicador
              titulo="Comisión del mes"
              valor={formatearDinero(comisionMes)}
              detalle={`${formatearDinero(porPagar)} aprobadas sin pagar`}
              tono="marca"
            />
          ) : null}
          <Indicador
            titulo="Prospectos atendidos"
            valor={`${totalLeads}`}
            detalle={
              totalLeads > 0
                ? `${formatearPorcentaje(ganados / totalLeads)} de cierre`
                : 'Sin prospectos este mes'
            }
            tono="azul"
          />
          <Indicador
            titulo="Avance de meta"
            valor={avanceMeta === null ? '—' : formatearPorcentaje(avanceMeta)}
            detalle={
              empleado.metaMensual > 0
                ? `Meta ${formatearDinero(empleado.metaMensual)}`
                : 'Sin meta asignada'
            }
            tono={avanceMeta !== null && avanceMeta >= 1 ? 'verde' : 'ambar'}
          />
        </section>
      ) : null}

      {esVendedor && avanceMeta !== null ? (
        <Tarjeta className="mb-6 p-5">
          <p className="mb-2 text-sm font-medium text-slate-700">
            {formatearDinero(ventasMes)} de {formatearDinero(empleado.metaMensual)} ·{' '}
            {formatearPeriodo(periodo)}
          </p>
          <Progreso fraccion={avanceMeta} />
        </Tarjeta>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {puedeGestionar ? (
        <Tarjeta className="lg:col-span-2">
          <TarjetaTitulo titulo="Datos y condiciones" />
          <div className="p-5">
            <Formulario accion={actualizarEmpleado} textoBoton="Guardar cambios">
              <input type="hidden" name="empleadoId" value={empleado.id} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo etiqueta="Nombre completo">
                  <input name="nombre" required defaultValue={empleado.nombre} className="campo" />
                </Campo>
                <Campo etiqueta="Correo">
                  <input
                    name="email"
                    type="email"
                    required
                    defaultValue={empleado.email}
                    className="campo"
                  />
                </Campo>
                <Campo etiqueta="Teléfono">
                  <input
                    name="telefono"
                    required
                    defaultValue={empleado.telefono}
                    className="campo"
                  />
                </Campo>
                <Campo etiqueta="Rol">
                  <select name="rol" defaultValue={empleado.rol} className="campo">
                    {ROLES.opciones.map((opcion) => (
                      <option key={opcion.valor} value={opcion.valor}>
                        {opcion.etiqueta}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo etiqueta="Equipo">
                  <select name="equipoId" defaultValue={empleado.equipoId ?? ''} className="campo">
                    <option value="">Sin equipo</option>
                    {equipos.map((equipo) => (
                      <option key={equipo.id} value={equipo.id}>
                        {equipo.nombre}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo etiqueta={`Sueldo base (${CONFIG.moneda})`}>
                  <input
                    name="salarioBase"
                    type="number"
                    min={0}
                    step={PASO_MONEDA}
                    defaultValue={aUnidades(empleado.salarioBase)}
                    className="campo"
                  />
                </Campo>
                <Campo
                  etiqueta="Comisión por venta (%)"
                  ayuda="Cambiarla no altera las comisiones ya generadas."
                >
                  <input
                    name="tasaComision"
                    type="number"
                    min={0}
                    max={100}
                    step="0.1"
                    defaultValue={(empleado.tasaComision * 100).toFixed(1)}
                    className="campo"
                  />
                </Campo>
                <Campo etiqueta={`Meta mensual (${CONFIG.moneda})`}>
                  <input
                    name="metaMensual"
                    type="number"
                    min={0}
                    step={PASO_MONEDA}
                    defaultValue={aUnidades(empleado.metaMensual)}
                    className="campo"
                  />
                </Campo>
                <Campo etiqueta="Notas" className="sm:col-span-2">
                  <textarea
                    name="notas"
                    rows={2}
                    defaultValue={empleado.notas ?? ''}
                    className="campo"
                  />
                </Campo>
                <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
                  <input
                    type="checkbox"
                    name="activo"
                    defaultChecked={empleado.activo}
                    className="h-4 w-4 rounded border-slate-300 text-marca-600 focus:ring-marca-500"
                  />
                  Activo en la empresa
                </label>
              </div>
            </Formulario>
          </div>
        </Tarjeta>
        ) : (
        <Tarjeta className="lg:col-span-2">
          <TarjetaTitulo
            titulo="Datos y condiciones"
            descripcion="Sólo administración puede modificar estos datos."
          />
          <dl className="grid gap-4 p-5 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Correo</dt>
              <dd className="mt-0.5 text-slate-800">{empleado.email}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Teléfono</dt>
              <dd className="mt-0.5 text-slate-800">{formatearTelefono(empleado.telefono)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Equipo</dt>
              <dd className="mt-0.5 text-slate-800">{empleado.equipo?.nombre ?? 'Sin equipo'}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">En la empresa desde</dt>
              <dd className="mt-0.5 text-slate-800">{formatearFecha(empleado.fechaIngreso)}</dd>
            </div>
            {puedeVerDinero ? (
              <>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Sueldo base</dt>
                  <dd className="mt-0.5 text-slate-800">{formatearDinero(empleado.salarioBase)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">
                    Comisión por venta
                  </dt>
                  <dd className="mt-0.5 text-slate-800">
                    {formatearPorcentaje(empleado.tasaComision, 1)}
                  </dd>
                </div>
              </>
            ) : null}
          </dl>
        </Tarjeta>
        )}

        <Tarjeta>
          <TarjetaTitulo titulo="Registrar asistencia" />
          <div className="p-5">
            {puedeRegistrarAsistencia ? (
            <Formulario accion={registrarAsistencia} textoBoton="Registrar">
              <input type="hidden" name="empleadoId" value={empleado.id} />
              <div className="space-y-4">
                <Campo etiqueta="Fecha">
                  <input type="date" name="fecha" defaultValue={hoy} required className="campo" />
                </Campo>
                <Campo etiqueta="Estado">
                  <select name="estado" defaultValue="PRESENTE" className="campo">
                    {ESTADOS_ASISTENCIA.opciones.map((opcion) => (
                      <option key={opcion.valor} value={opcion.valor}>
                        {opcion.etiqueta}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo etiqueta="Notas">
                  <input name="notas" className="campo" placeholder="Permiso médico" />
                </Campo>
              </div>
            </Formulario>
            ) : null}

            <div className="mt-5 border-t border-slate-200 pt-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Últimos 30 registros
              </h3>
              {asistencias.length === 0 ? (
                <p className="text-sm text-slate-500">Sin registros de asistencia.</p>
              ) : (
                <ul className="space-y-1.5">
                  {asistencias.map((asistencia) => (
                    <li
                      key={asistencia.id}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <span className="text-slate-600">{formatearFecha(asistencia.fecha)}</span>
                      <Etiqueta tono={ESTADOS_ASISTENCIA.tono(asistencia.estado)}>
                        {ESTADOS_ASISTENCIA.etiqueta(asistencia.estado)}
                      </Etiqueta>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Tarjeta>
      </div>

      {esVendedor ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {puedeVerDinero ? (
          <Tarjeta>
            <TarjetaTitulo
              titulo="Comisiones"
              descripcion={`Periodo actual: ${formatearPeriodo(periodo)}`}
              accion={
                puedeGestionar && porPagar > 0 ? (
                  <BotonAccion
                    accion={pagarComisiones}
                    camposOcultos={{ empleadoId: empleado.id, periodo }}
                    variante="primario"
                    confirmacion={`Se marcarán como pagadas ${formatearDinero(porPagar)} en comisiones. ¿Continuar?`}
                  >
                    Pagar {formatearDinero(porPagar)}
                  </BotonAccion>
                ) : null
              }
            />
            {comisiones.length === 0 ? (
              <SinDatos mensaje="Todavía no ha generado comisiones." />
            ) : (
              <Tabla>
                <EncabezadoTabla columnas={['Pedido', 'Periodo', 'Base', 'Comisión', 'Estado']} />
                <tbody className="divide-y divide-slate-100">
                  {comisiones.map((comision) => (
                    <tr key={comision.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/pedidos/${comision.pedido.id}`}
                          className="font-mono text-xs font-semibold text-marca-700 hover:underline"
                        >
                          {comision.pedido.codigo}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-500">
                        {formatearPeriodo(comision.periodo)}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">
                        {formatearDinero(comision.base)}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-slate-900">
                        {formatearDinero(comision.monto)}
                      </td>
                      <td className="px-4 py-2.5">
                        <Etiqueta tono={ESTADOS_COMISION.tono(comision.estado)}>
                          {ESTADOS_COMISION.etiqueta(comision.estado)}
                        </Etiqueta>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Tabla>
            )}
          </Tarjeta>
          ) : null}

          <Tarjeta>
            <TarjetaTitulo titulo="Últimos pedidos" />
            {pedidosRecientes.length === 0 ? (
              <SinDatos mensaje="Sin pedidos registrados." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {pedidosRecientes.map((pedido) => (
                  <li
                    key={pedido.id}
                    className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm"
                  >
                    <Link
                      href={`/pedidos/${pedido.id}`}
                      className="font-mono text-xs font-semibold text-marca-700 hover:underline"
                    >
                      {pedido.codigo}
                    </Link>
                    <span className="min-w-0 flex-1 truncate text-slate-700">
                      {pedido.clienteNombre}
                    </span>
                    <Etiqueta tono={ESTADOS_PEDIDO.tono(pedido.estado)}>
                      {ESTADOS_PEDIDO.etiqueta(pedido.estado)}
                    </Etiqueta>
                    <span className="font-semibold text-slate-900">
                      {formatearDinero(pedido.total)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>
        </div>
      ) : null}

      {esRepartidor ? (
        <Tarjeta className="mt-4">
          <TarjetaTitulo titulo="Entregas asignadas" />
          {entregas.length === 0 ? (
            <SinDatos mensaje="Sin entregas asignadas." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {entregas.map((envio) => (
                <li key={envio.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                  <Link
                    href={`/pedidos/${envio.pedido.id}`}
                    className="font-mono text-xs font-semibold text-marca-700 hover:underline"
                  >
                    {envio.pedido.codigo}
                  </Link>
                  <span className="min-w-0 flex-1 truncate text-slate-700">
                    {envio.pedido.clienteNombre}
                    <span className="ml-2 text-xs text-slate-500">{envio.pedido.ciudad}</span>
                  </span>
                  <span className="text-xs text-slate-500">{envio.intentos} intento(s)</span>
                  <Etiqueta tono={ESTADOS_ENVIO.tono(envio.estado)}>
                    {ESTADOS_ENVIO.etiqueta(envio.estado)}
                  </Etiqueta>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
      ) : null}
    </>
  );
}
