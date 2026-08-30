import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Campo, Formulario } from '@/components/formulario';
import { PanelWhatsApp } from '@/components/panel-whatsapp';
import {
  EncabezadoPagina,
  Etiqueta,
  SinDatos,
  Tarjeta,
  TarjetaTitulo,
} from '@/components/ui';
import { CONFIG } from '@/lib/config';
import {
  ESTADOS_LEAD,
  ESTADOS_PEDIDO,
  ORIGENES_LEAD,
  TIPOS_CAMPANA,
} from '@/lib/dominio';
import {
  formatearDinero,
  formatearFecha,
  formatearFechaHora,
  tiempoRelativo,
} from '@/lib/formato';
import { prisma } from '@/lib/prisma';
import { formatearTelefono } from '@/lib/whatsapp';
import { actualizarLead } from '../acciones';

export const dynamic = 'force-dynamic';

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      vendedor: true,
      campana: true,
      productoInteres: true,
      mensajes: {
        orderBy: { createdAt: 'asc' },
        include: { empleado: { select: { nombre: true } } },
      },
      pedidos: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!lead) notFound();

  const [plantillas, vendedores] = await Promise.all([
    prisma.plantillaWhatsApp.findMany({
      where: { activa: true },
      select: { id: true, nombre: true, etapa: true, cuerpo: true },
    }),
    prisma.empleado.findMany({
      where: { rol: { in: ['VENDEDOR', 'LIDER'] }, activo: true },
      select: { id: true, nombre: true },
      orderBy: { nombre: 'asc' },
    }),
  ]);

  const variables = {
    cliente: lead.nombre.split(' ')[0],
    producto: lead.productoInteres?.nombre ?? '',
    precio: lead.productoInteres ? formatearDinero(lead.productoInteres.precio) : '',
    vendedor: lead.vendedor?.nombre.split(' ')[0] ?? '',
    tienda: CONFIG.nombreTienda,
    ciudad: lead.ciudad ?? '',
    pedido: lead.pedidos[0]?.codigo ?? '',
  };

  return (
    <>
      <EncabezadoPagina
        titulo={lead.nombre}
        descripcion={`${lead.codigo} · ${formatearTelefono(lead.telefono)}${
          lead.ciudad ? ` · ${lead.ciudad}` : ''
        }`}
        acciones={
          <>
            <Link href="/leads" className="boton-secundario">
              Volver
            </Link>
            <Link
              href={`/pedidos/nuevo?leadId=${lead.id}`}
              className="boton-primario"
            >
              Crear pedido
            </Link>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Etiqueta tono={ESTADOS_LEAD.tono(lead.estado)}>
          {ESTADOS_LEAD.etiqueta(lead.estado)}
        </Etiqueta>
        <Etiqueta tono={ORIGENES_LEAD.tono(lead.origen)}>
          {ORIGENES_LEAD.etiqueta(lead.origen)}
        </Etiqueta>
        <span className="text-xs text-slate-500">
          Registrado {formatearFecha(lead.createdAt)} · último contacto{' '}
          {lead.ultimoContactoAt ? tiempoRelativo(lead.ultimoContactoAt) : 'nunca'}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Tarjeta>
            <TarjetaTitulo
              titulo="Escribir por WhatsApp"
              descripcion="Elige una plantilla, ajústala y abre el chat con el texto listo."
            />
            <PanelWhatsApp
              leadId={lead.id}
              telefono={lead.telefono}
              plantillas={plantillas}
              variables={variables}
              vendedorId={lead.vendedorId}
              etapaActual={lead.estado}
            />
          </Tarjeta>

          <Tarjeta>
            <TarjetaTitulo
              titulo="Conversación"
              descripcion={`${lead.mensajes.length} mensajes registrados.`}
            />
            {lead.mensajes.length === 0 ? (
              <SinDatos mensaje="Todavía no hay mensajes con este prospecto." />
            ) : (
              <ul className="space-y-3 p-5">
                {lead.mensajes.map((mensaje) => {
                  const saliente = mensaje.direccion === 'SALIENTE';
                  return (
                    <li
                      key={mensaje.id}
                      className={`flex ${saliente ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                          saliente
                            ? 'rounded-br-sm bg-marca-600 text-white'
                            : 'rounded-bl-sm bg-slate-100 text-slate-800'
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{mensaje.cuerpo}</p>
                        <p
                          className={`mt-1 text-[11px] ${
                            saliente ? 'text-white/70' : 'text-slate-500'
                          }`}
                        >
                          {saliente ? mensaje.empleado?.nombre ?? 'Tienda' : lead.nombre} ·{' '}
                          {formatearFechaHora(mensaje.createdAt)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Tarjeta>

          <Tarjeta>
            <TarjetaTitulo titulo="Pedidos de este prospecto" />
            {lead.pedidos.length === 0 ? (
              <SinDatos mensaje="Aún no se ha convertido en pedido." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {lead.pedidos.map((pedido) => (
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
                    <span className="flex-1 text-xs text-slate-500">
                      {formatearFecha(pedido.createdAt)}
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

        <div className="space-y-4">
          <Tarjeta>
            <TarjetaTitulo titulo="Seguimiento" />
            <div className="p-5">
              <Formulario accion={actualizarLead} textoBoton="Guardar cambios">
                <input type="hidden" name="leadId" value={lead.id} />
                <div className="space-y-4">
                  <Campo etiqueta="Etapa">
                    <select name="estado" defaultValue={lead.estado} className="campo">
                      {ESTADOS_LEAD.opciones.map((opcion) => (
                        <option key={opcion.valor} value={opcion.valor}>
                          {opcion.etiqueta}
                        </option>
                      ))}
                    </select>
                  </Campo>
                  <Campo etiqueta="Responsable">
                    <select
                      name="vendedorId"
                      defaultValue={lead.vendedorId ?? ''}
                      className="campo"
                    >
                      <option value="">Sin asignar</option>
                      {vendedores.map((vendedor) => (
                        <option key={vendedor.id} value={vendedor.id}>
                          {vendedor.nombre}
                        </option>
                      ))}
                    </select>
                  </Campo>
                  <Campo
                    etiqueta="Motivo de pérdida"
                    ayuda="Sólo se guarda si la etapa es «Perdido». Sirve para saber qué falla."
                  >
                    <input
                      name="motivoPerdida"
                      defaultValue={lead.motivoPerdida ?? ''}
                      className="campo"
                      placeholder="Le pareció caro"
                    />
                  </Campo>
                  <Campo etiqueta="Notas">
                    <textarea
                      name="notas"
                      rows={4}
                      defaultValue={lead.notas ?? ''}
                      className="campo"
                    />
                  </Campo>
                </div>
              </Formulario>
            </div>
          </Tarjeta>

          <Tarjeta>
            <TarjetaTitulo titulo="De dónde vino" />
            <dl className="space-y-3 p-5 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Campaña</dt>
                <dd className="mt-0.5 text-slate-800">
                  {lead.campana ? (
                    <>
                      <Link
                        href="/campanas"
                        className="font-medium text-marca-700 hover:underline"
                      >
                        {lead.campana.nombre}
                      </Link>
                      <span className="ml-2">
                        <Etiqueta tono={TIPOS_CAMPANA.tono(lead.campana.tipo)}>
                          {TIPOS_CAMPANA.etiqueta(lead.campana.tipo)}
                        </Etiqueta>
                      </span>
                    </>
                  ) : (
                    <span className="text-slate-400">Sin campaña asociada</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">
                  Producto de interés
                </dt>
                <dd className="mt-0.5 text-slate-800">
                  {lead.productoInteres ? (
                    <>
                      {lead.productoInteres.nombre}
                      <span className="ml-2 text-slate-500">
                        {formatearDinero(lead.productoInteres.precio)}
                      </span>
                    </>
                  ) : (
                    <span className="text-slate-400">Sin definir</span>
                  )}
                </dd>
              </div>
              {lead.campana?.urlVideo ? (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Video</dt>
                  <dd className="mt-0.5">
                    <a
                      href={lead.campana.urlVideo}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-marca-700 hover:underline"
                    >
                      Abrir en TikTok
                    </a>
                  </dd>
                </div>
              ) : null}
            </dl>
          </Tarjeta>
        </div>
      </div>
    </>
  );
}
