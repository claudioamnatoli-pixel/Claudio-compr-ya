'use client';

import { useActionState, useMemo, useState } from 'react';
import { registrarMensaje } from '@/app/leads/acciones';
import type { ResultadoAccion } from '@/lib/acciones';
import { enlaceWhatsApp, renderizarPlantilla } from '@/lib/whatsapp';

type Plantilla = { id: string; nombre: string; etapa: string; cuerpo: string };

/**
 * Redactor de mensajes de WhatsApp.
 *
 * No hay envío automático: el botón abre el chat en WhatsApp con el texto ya
 * escrito (enlace público `wa.me`, sin API de pago ni número verificado) y a la
 * vez guarda el mensaje en el historial del prospecto. Es el flujo que de hecho
 * usa un vendedor con el teléfono en la mano.
 */
export function PanelWhatsApp({
  leadId,
  telefono,
  plantillas,
  variables,
  vendedorId,
  etapaActual,
}: {
  leadId: string;
  telefono: string;
  plantillas: Plantilla[];
  variables: Record<string, string | null | undefined>;
  vendedorId: string | null;
  etapaActual: string;
}) {
  const [texto, setTexto] = useState('');
  const [plantillaId, setPlantillaId] = useState('');
  const [estadoSalida, enviarSalida, pendienteSalida] = useActionState<
    ResultadoAccion | null,
    FormData
  >(registrarMensaje, null);
  const [estadoEntrada, enviarEntrada, pendienteEntrada] = useActionState<
    ResultadoAccion | null,
    FormData
  >(registrarMensaje, null);

  // Las plantillas de la etapa en la que está el prospecto se muestran primero.
  const plantillasOrdenadas = useMemo(
    () =>
      [...plantillas].sort((a, b) => {
        const pesoA = a.etapa === etapaActual ? 0 : 1;
        const pesoB = b.etapa === etapaActual ? 0 : 1;
        return pesoA - pesoB || a.nombre.localeCompare(b.nombre);
      }),
    [plantillas, etapaActual],
  );

  function aplicarPlantilla(id: string) {
    setPlantillaId(id);
    const plantilla = plantillas.find((p) => p.id === id);
    setTexto(plantilla ? renderizarPlantilla(plantilla.cuerpo, variables) : '');
  }

  const enlace = enlaceWhatsApp(telefono, texto);

  return (
    <div className="space-y-4 p-5">
      <label className="block">
        <span className="etiqueta-campo">Plantilla</span>
        <select
          value={plantillaId}
          onChange={(evento) => aplicarPlantilla(evento.target.value)}
          className="campo"
        >
          <option value="">Escribir desde cero</option>
          {plantillasOrdenadas.map((plantilla) => (
            <option key={plantilla.id} value={plantilla.id}>
              {plantilla.nombre}
              {plantilla.etapa === etapaActual ? ' (sugerida)' : ''}
            </option>
          ))}
        </select>
      </label>

      <form
        action={enviarSalida}
        onSubmit={() => {
          // Se abre dentro del gesto del usuario para que no lo bloquee el navegador.
          window.open(enlace, '_blank', 'noopener,noreferrer');
          setTexto('');
          setPlantillaId('');
        }}
      >
        <input type="hidden" name="leadId" value={leadId} />
        <input type="hidden" name="direccion" value="SALIENTE" />
        {plantillaId ? <input type="hidden" name="plantillaId" value={plantillaId} /> : null}
        {vendedorId ? <input type="hidden" name="empleadoId" value={vendedorId} /> : null}

        <label className="block">
          <span className="etiqueta-campo">Mensaje</span>
          <textarea
            name="cuerpo"
            rows={7}
            required
            value={texto}
            onChange={(evento) => setTexto(evento.target.value)}
            placeholder="Escribe el mensaje o elige una plantilla…"
            className="campo font-normal"
          />
        </label>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={pendienteSalida || texto.trim().length === 0}
            className="boton-whatsapp"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
              <path d="M12.04 2a9.9 9.9 0 00-8.5 15l-1.1 4.03 4.13-1.08A9.9 9.9 0 1012.04 2zm5.79 14.06c-.24.68-1.4 1.3-1.94 1.34-.5.05-1.13.07-1.82-.11-.42-.11-.96-.29-1.65-.59-2.9-1.25-4.8-4.17-4.94-4.36-.15-.2-1.19-1.58-1.19-3.02 0-1.43.75-2.14 1.02-2.43.27-.29.58-.36.78-.36h.56c.18 0 .42-.07.66.5.24.59.82 2.02.89 2.17.07.15.12.32.02.51-.1.2-.15.32-.29.49l-.44.51c-.15.15-.3.31-.13.6.17.3.76 1.25 1.63 2.03 1.12 1 2.06 1.31 2.35 1.46.29.15.46.12.63-.07.17-.2.73-.85.92-1.14.2-.29.39-.24.66-.15.27.1 1.7.8 1.99.95.29.15.49.22.56.34.07.12.07.68-.17 1.33z" />
            </svg>
            {pendienteSalida ? 'Guardando…' : 'Abrir WhatsApp y registrar'}
          </button>
          <a
            href={enlaceWhatsApp(telefono)}
            target="_blank"
            rel="noopener noreferrer"
            className="boton-secundario"
          >
            Sólo abrir el chat
          </a>
        </div>

        {estadoSalida && !estadoSalida.ok ? (
          <p role="alert" className="mt-3 text-sm text-red-600">
            {estadoSalida.error}
          </p>
        ) : null}
      </form>

      <details className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium text-slate-700">
          Anotar lo que respondió el cliente
        </summary>
        <form action={enviarEntrada} className="mt-3">
          <input type="hidden" name="leadId" value={leadId} />
          <input type="hidden" name="direccion" value="ENTRANTE" />
          <textarea
            name="cuerpo"
            rows={3}
            required
            placeholder="Sí me interesa, ¿hacen envío a Puebla?"
            className="campo"
          />
          <button type="submit" disabled={pendienteEntrada} className="boton-secundario mt-2">
            {pendienteEntrada ? 'Guardando…' : 'Guardar respuesta'}
          </button>
          {estadoEntrada && !estadoEntrada.ok ? (
            <p role="alert" className="mt-2 text-sm text-red-600">
              {estadoEntrada.error}
            </p>
          ) : null}
        </form>
      </details>
    </div>
  );
}
