import { BotonAccion, Campo, Formulario } from '@/components/formulario';
import {
  EncabezadoPagina,
  Etiqueta,
  SinDatos,
  Tarjeta,
  TarjetaTitulo,
} from '@/components/ui';
import { ESTADOS_LEAD } from '@/lib/dominio';
import { prisma } from '@/lib/prisma';
import { VARIABLES_PLANTILLA } from '@/lib/whatsapp';
import { actualizarPlantilla, cambiarEstadoPlantilla, crearPlantilla } from './acciones';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Plantillas de WhatsApp' };

export default async function PlantillasPage() {
  const plantillas = await prisma.plantillaWhatsApp.findMany({
    orderBy: [{ activa: 'desc' }, { nombre: 'asc' }],
    include: { _count: { select: { mensajes: true } } },
  });

  return (
    <>
      <EncabezadoPagina
        titulo="Plantillas de WhatsApp"
        descripcion="Los mensajes que el equipo usa una y otra vez. Escribirlos bien una sola vez ahorra horas y evita que cada quien conteste distinto."
      />

      <Tarjeta className="mb-6 p-5">
        <h2 className="text-sm font-semibold text-slate-900">Variables disponibles</h2>
        <p className="mt-1 text-sm text-slate-600">
          Escríbelas entre llaves dobles dentro del texto. Al abrir el chat de un prospecto se
          sustituyen por sus datos; si un dato falta, la variable se deja en blanco.
        </p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {VARIABLES_PLANTILLA.map((variable) => (
            <li
              key={variable.clave}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs"
            >
              <code className="font-semibold text-marca-700">{`{{${variable.clave}}}`}</code>
              <span className="ml-2 text-slate-500">{variable.descripcion}</span>
            </li>
          ))}
        </ul>
      </Tarjeta>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {plantillas.length === 0 ? (
            <Tarjeta>
              <SinDatos mensaje="Todavía no hay plantillas. Crea la primera con el formulario de al lado." />
            </Tarjeta>
          ) : (
            plantillas.map((plantilla) => (
              <Tarjeta key={plantilla.id}>
                <TarjetaTitulo
                  titulo={plantilla.nombre}
                  descripcion={`Sugerida en la etapa «${ESTADOS_LEAD.etiqueta(
                    plantilla.etapa,
                  )}» · usada ${plantilla._count.mensajes} vez(ces)`}
                  accion={
                    <div className="flex items-center gap-2">
                      <Etiqueta tono={plantilla.activa ? 'verde' : 'gris'}>
                        {plantilla.activa ? 'Activa' : 'Inactiva'}
                      </Etiqueta>
                      <BotonAccion
                        accion={cambiarEstadoPlantilla}
                        camposOcultos={{
                          plantillaId: plantilla.id,
                          activa: plantilla.activa ? '0' : '1',
                        }}
                      >
                        {plantilla.activa ? 'Desactivar' : 'Activar'}
                      </BotonAccion>
                    </div>
                  }
                />
                <details className="p-5">
                  <summary className="cursor-pointer text-sm font-medium text-slate-700">
                    Ver y editar el texto
                  </summary>
                  <div className="mt-4">
                    <Formulario accion={actualizarPlantilla} textoBoton="Guardar plantilla">
                      <input type="hidden" name="plantillaId" value={plantilla.id} />
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Campo etiqueta="Nombre">
                          <input
                            name="nombre"
                            required
                            defaultValue={plantilla.nombre}
                            className="campo"
                          />
                        </Campo>
                        <Campo etiqueta="Etapa sugerida">
                          <select name="etapa" defaultValue={plantilla.etapa} className="campo">
                            {ESTADOS_LEAD.opciones.map((opcion) => (
                              <option key={opcion.valor} value={opcion.valor}>
                                {opcion.etiqueta}
                              </option>
                            ))}
                          </select>
                        </Campo>
                        <Campo etiqueta="Texto" className="sm:col-span-2">
                          <textarea
                            name="cuerpo"
                            rows={8}
                            required
                            defaultValue={plantilla.cuerpo}
                            className="campo"
                          />
                        </Campo>
                      </div>
                    </Formulario>
                  </div>
                </details>
                <div className="border-t border-slate-100 bg-slate-50 px-5 py-4">
                  <p className="whitespace-pre-wrap text-sm text-slate-700">{plantilla.cuerpo}</p>
                </div>
              </Tarjeta>
            ))
          )}
        </div>

        <Tarjeta className="h-fit">
          <TarjetaTitulo titulo="Nueva plantilla" />
          <div className="p-5">
            <Formulario accion={crearPlantilla} textoBoton="Crear plantilla">
              <div className="space-y-4">
                <Campo etiqueta="Nombre">
                  <input
                    name="nombre"
                    required
                    className="campo"
                    placeholder="Recuperar carrito abandonado"
                  />
                </Campo>
                <Campo etiqueta="Etapa sugerida">
                  <select name="etapa" defaultValue="CONTACTADO" className="campo">
                    {ESTADOS_LEAD.opciones.map((opcion) => (
                      <option key={opcion.valor} value={opcion.valor}>
                        {opcion.etiqueta}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo etiqueta="Texto">
                  <textarea
                    name="cuerpo"
                    rows={8}
                    required
                    className="campo"
                    placeholder={'Hola {{cliente}}, ¿sigues interesada en {{producto}}?'}
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
