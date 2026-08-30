import type { ReactNode } from 'react';

/**
 * Barra de filtros basada en un formulario GET normal: los criterios quedan en
 * la URL, así que se pueden compartir y funcionan sin JavaScript en el cliente.
 */
export function BarraFiltros({
  children,
  accionLimpiar,
}: {
  children: ReactNode;
  accionLimpiar?: string;
}) {
  return (
    <form
      method="get"
      className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      {children}
      <div className="flex gap-2">
        <button type="submit" className="boton-primario">
          Filtrar
        </button>
        {accionLimpiar ? (
          <a href={accionLimpiar} className="boton-secundario">
            Limpiar
          </a>
        ) : null}
      </div>
    </form>
  );
}

export function FiltroSelect({
  nombre,
  etiqueta,
  valor,
  opciones,
  textoTodos = 'Todos',
}: {
  nombre: string;
  etiqueta: string;
  valor?: string;
  opciones: { valor: string; etiqueta: string }[];
  textoTodos?: string;
}) {
  return (
    <label className="block">
      <span className="etiqueta-campo">{etiqueta}</span>
      <select name={nombre} defaultValue={valor ?? ''} className="campo w-48">
        <option value="">{textoTodos}</option>
        {opciones.map((opcion) => (
          <option key={opcion.valor} value={opcion.valor}>
            {opcion.etiqueta}
          </option>
        ))}
      </select>
    </label>
  );
}

export function FiltroTexto({
  nombre,
  etiqueta,
  valor,
  marcador,
}: {
  nombre: string;
  etiqueta: string;
  valor?: string;
  marcador?: string;
}) {
  return (
    <label className="block">
      <span className="etiqueta-campo">{etiqueta}</span>
      <input
        type="search"
        name={nombre}
        defaultValue={valor ?? ''}
        placeholder={marcador}
        className="campo w-56"
      />
    </label>
  );
}

/** Lee un parámetro de la URL que puede venir repetido y devuelve el primero. */
export function primerValor(valor: string | string[] | undefined): string | undefined {
  if (Array.isArray(valor)) return valor[0] || undefined;
  return valor || undefined;
}
