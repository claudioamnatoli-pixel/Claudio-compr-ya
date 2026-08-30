import { requerirPagina } from '@/lib/guardias';
import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { BarraFiltros, FiltroSelect, primerValor } from '@/components/filtros';
import { BotonAccion, Campo, Formulario } from '@/components/formulario';
import {
  EncabezadoPagina,
  Etiqueta,
  Indicador,
  SinDatos,
  Tarjeta,
  TarjetaTitulo,
} from '@/components/ui';
import { CONFIG, PASO_MONEDA } from '@/lib/config';
import { ESTADOS_ENVIO, METODOS_PAGO } from '@/lib/dominio';
import { inicioDelDia } from '@/lib/consultas';
import {
  aUnidades,
  formatearDinero,
  formatearFechaHora,
  formatearNumero,
  paraInputFechaHora,
} from '@/lib/formato';
import { prisma } from '@/lib/prisma';
import { enlaceWhatsApp, formatearTelefono } from '@/lib/whatsapp';
import { asignarEnvio, despacharEnvio, registrarEntrega } from './acciones';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Logística' };

type Parametros = Promise<{ [clave: string]: string | string[] | undefined }>;

export default async function LogisticaPage({ searchParams }: { searchParams: Parametros }) {
  await requerirPagina('logistica.ver');
  const parametros = await searchParams;
  const estado = primerValor(parametros.estado);
  const repartidorId = primerValor(parametros.repartidorId);
  const zonaId = primerValor(parametros.zonaId);

  const filtro: Prisma.EnvioWhereInput = {
    ...(estado ? { estado } : { estado: { notIn: ['ENTREGADO', 'DEVUELTO'] } }),
    ...(repartidorId ? { repartidorId } : {}),
    ...(zonaId ? { zonaId } : {}),
  };

  const desdeHoy = inicioDelDia();
  const [envios, repartidores, zonas, porAsignar, enRuta, entregadasHoy, efectivo] =
    await Promise.all([
      prisma.envio.findMany({
        where: filtro,
        orderBy: [{ fechaProgramada: 'asc' }, { createdAt: 'asc' }],
        take: 100,
        include: {
          zona: true,
          repartidor: { select: { id: true, nombre: true } },
          pedido: {
            select: {
              id: true,
              codigo: true,
              clienteNombre: true,
              telefono: true,
              direccion: true,
              ciudad: true,
              referencia: true,
              total: true,
              estado: true,
              metodoPago: true,
            },
          },
        },
      }),
      prisma.empleado.findMany({
        where: { rol: 'REPARTIDOR', activo: true },
        select: { id: true, nombre: true },
        orderBy: { nombre: 'asc' },
      }),
      prisma.zona.findMany({ where: { activa: true }, orderBy: { nombre: 'asc' } }),
      prisma.envio.count({ where: { estado: 'POR_ASIGNAR' } }),
      prisma.envio.count({ where: { estado: { in: ['ASIGNADO', 'EN_RUTA'] } } }),
      prisma.envio.count({ where: { estado: 'ENTREGADO', fechaEntrega: { gte: desdeHoy } } }),
      prisma.envio.aggregate({
        where: { estado: 'ENTREGADO', fechaEntrega: { gte: desdeHoy } },
        _sum: { montoCobrado: true },
      }),
    ]);

  return (
    <>
      <EncabezadoPagina
        titulo="Logística de entregas"
        descripcion="Asignar repartidor, sacar a ruta y registrar qué pasó en la puerta del cliente."
      />

      <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador
          titulo="Por asignar"
          valor={formatearNumero(porAsignar)}
          detalle="Esperando repartidor"
          tono={porAsignar > 0 ? 'ambar' : 'verde'}
        />
        <Indicador
          titulo="En ruta"
          valor={formatearNumero(enRuta)}
          detalle="Asignadas o ya circulando"
          tono="azul"
        />
        <Indicador
          titulo="Entregadas hoy"
          valor={formatearNumero(entregadasHoy)}
          detalle="Desde las 00:00"
          tono="verde"
        />
        <Indicador
          titulo="Efectivo por liquidar"
          valor={formatearDinero(efectivo._sum.montoCobrado ?? 0)}
          detalle="Cobrado hoy contra entrega"
          tono="marca"
        />
      </section>

      <BarraFiltros accionLimpiar="/logistica">
        <FiltroSelect
          nombre="estado"
          etiqueta="Estado"
          valor={estado}
          opciones={ESTADOS_ENVIO.opciones}
          textoTodos="Pendientes (por defecto)"
        />
        <FiltroSelect
          nombre="repartidorId"
          etiqueta="Repartidor"
          valor={repartidorId}
          opciones={repartidores.map((r) => ({ valor: r.id, etiqueta: r.nombre }))}
        />
        <FiltroSelect
          nombre="zonaId"
          etiqueta="Zona"
          valor={zonaId}
          opciones={zonas.map((z) => ({ valor: z.id, etiqueta: `${z.nombre} · ${z.ciudad}` }))}
        />
      </BarraFiltros>

      {envios.length === 0 ? (
        <Tarjeta>
          <SinDatos mensaje="No hay envíos que coincidan con estos filtros." />
        </Tarjeta>
      ) : (
        <div className="space-y-3">
          {envios.map((envio) => {
            const contraEntrega = envio.pedido.metodoPago === 'CONTRA_ENTREGA';
            const puedeDespachar =
              !!envio.repartidorId &&
              ['CONFIRMADO', 'PREPARANDO'].includes(envio.pedido.estado) &&
              ['ASIGNADO', 'REPROGRAMADO', 'FALLIDO'].includes(envio.estado);
            const puedeCerrar = envio.estado === 'EN_RUTA' || envio.estado === 'FALLIDO';

            return (
              <Tarjeta key={envio.id}>
                <div className="flex flex-wrap items-start justify-between gap-4 p-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/pedidos/${envio.pedido.id}`}
                        className="font-mono text-xs font-semibold text-marca-700 hover:underline"
                      >
                        {envio.pedido.codigo}
                      </Link>
                      <Etiqueta tono={ESTADOS_ENVIO.tono(envio.estado)}>
                        {ESTADOS_ENVIO.etiqueta(envio.estado)}
                      </Etiqueta>
                      <Etiqueta tono={METODOS_PAGO.tono(envio.pedido.metodoPago)}>
                        {METODOS_PAGO.etiqueta(envio.pedido.metodoPago)}
                      </Etiqueta>
                      {envio.intentos > 0 ? (
                        <span className="text-xs text-slate-500">
                          {envio.intentos} intento(s)
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1.5 font-medium text-slate-900">
                      {envio.pedido.clienteNombre}
                    </p>
                    <p className="text-sm text-slate-600">
                      {envio.pedido.direccion}, {envio.pedido.ciudad}
                    </p>
                    {envio.pedido.referencia ? (
                      <p className="text-xs text-slate-500">{envio.pedido.referencia}</p>
                    ) : null}
                    <p className="mt-1 text-xs text-slate-500">
                      {formatearTelefono(envio.pedido.telefono)}
                      {envio.zona ? ` · ${envio.zona.nombre}` : ' · sin zona'}
                      {envio.fechaProgramada
                        ? ` · programado ${formatearFechaHora(envio.fechaProgramada)}`
                        : ''}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-lg font-semibold text-slate-900">
                      {formatearDinero(envio.pedido.total)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {envio.repartidor?.nombre ?? 'Sin repartidor'}
                    </p>
                    <a
                      href={enlaceWhatsApp(
                        envio.pedido.telefono,
                        `Hola ${envio.pedido.clienteNombre.split(' ')[0]}, te escribo por tu pedido ${
                          envio.pedido.codigo
                        }.`,
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="boton-whatsapp mt-2 px-2.5 py-1 text-xs"
                    >
                      Avisar al cliente
                    </a>
                  </div>
                </div>

                <div className="grid gap-px border-t border-slate-200 bg-slate-200 md:grid-cols-2">
                  <div className="bg-white p-5">
                    <h3 className="mb-3 text-sm font-semibold text-slate-900">Asignación</h3>
                    <Formulario
                      accion={asignarEnvio}
                      textoBoton="Guardar asignación"
                      variante="secundario"
                      extra={
                        puedeDespachar ? (
                          <BotonAccion
                            accion={despacharEnvio}
                            camposOcultos={{ envioId: envio.id }}
                            variante="primario"
                          >
                            Sacar a ruta
                          </BotonAccion>
                        ) : null
                      }
                    >
                      <input type="hidden" name="envioId" value={envio.id} />
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Campo etiqueta="Repartidor">
                          <select
                            name="repartidorId"
                            defaultValue={envio.repartidorId ?? ''}
                            className="campo"
                          >
                            <option value="">Sin asignar</option>
                            {repartidores.map((repartidor) => (
                              <option key={repartidor.id} value={repartidor.id}>
                                {repartidor.nombre}
                              </option>
                            ))}
                          </select>
                        </Campo>
                        <Campo etiqueta="Zona">
                          <select name="zonaId" defaultValue={envio.zonaId ?? ''} className="campo">
                            <option value="">Sin zona</option>
                            {zonas.map((zona) => (
                              <option key={zona.id} value={zona.id}>
                                {zona.nombre} · {zona.ciudad}
                              </option>
                            ))}
                          </select>
                        </Campo>
                        <Campo etiqueta="Fecha programada" className="sm:col-span-2">
                          <input
                            type="datetime-local"
                            name="fechaProgramada"
                            defaultValue={paraInputFechaHora(envio.fechaProgramada)}
                            className="campo"
                          />
                        </Campo>
                      </div>
                    </Formulario>
                  </div>

                  <div className="bg-white p-5">
                    <h3 className="mb-3 text-sm font-semibold text-slate-900">
                      Resultado de la entrega
                    </h3>
                    {puedeCerrar ? (
                      <Formulario accion={registrarEntrega} textoBoton="Registrar resultado">
                        <input type="hidden" name="envioId" value={envio.id} />
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Campo etiqueta="Qué pasó">
                            <select name="resultado" defaultValue="ENTREGADO" className="campo">
                              <option value="ENTREGADO">Entregado</option>
                              <option value="FALLIDO">No se pudo entregar</option>
                              <option value="REPROGRAMADO">Reprogramado</option>
                            </select>
                          </Campo>
                          <Campo
                            etiqueta={`Cobrado (${CONFIG.moneda})`}
                            ayuda={contraEntrega ? undefined : 'El pedido ya venía pagado.'}
                          >
                            <input
                              type="number"
                              name="montoCobrado"
                              min={0}
                              step={PASO_MONEDA}
                              defaultValue={contraEntrega ? aUnidades(envio.pedido.total) : 0}
                              disabled={!contraEntrega}
                              className="campo"
                            />
                          </Campo>
                          <Campo etiqueta={`Costo real (${CONFIG.moneda})`}>
                            <input
                              type="number"
                              name="costoReal"
                              min={0}
                              step={PASO_MONEDA}
                              defaultValue={envio.costoReal ? aUnidades(envio.costoReal) : ''}
                              className="campo"
                            />
                          </Campo>
                          <Campo etiqueta="Nueva fecha (si se reprograma)">
                            <input type="datetime-local" name="nuevaFecha" className="campo" />
                          </Campo>
                          <Campo etiqueta="Observaciones" className="sm:col-span-2">
                            <input
                              name="observaciones"
                              defaultValue={envio.observaciones ?? ''}
                              className="campo"
                              placeholder="No había nadie; pidió pasar el sábado."
                            />
                          </Campo>
                        </div>
                      </Formulario>
                    ) : (
                      <p className="text-sm text-slate-500">
                        {envio.estado === 'POR_ASIGNAR' || envio.estado === 'ASIGNADO'
                          ? 'Asigna un repartidor y saca el pedido a ruta para poder cerrar la entrega.'
                          : 'Este envío ya está cerrado.'}
                      </p>
                    )}
                  </div>
                </div>
              </Tarjeta>
            );
          })}
        </div>
      )}
    </>
  );
}
