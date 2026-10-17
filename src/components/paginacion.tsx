import Link from 'next/link';

/**
 * Paginación que conserva los filtros puestos.
 *
 * Se arma sobre los parámetros que ya trae la dirección, para que cambiar de
 * página no borre la búsqueda ni la categoría elegida.
 */
export function Paginacion({
  pagina,
  porPagina,
  total,
  parametros,
}: {
  pagina: number;
  porPagina: number;
  total: number;
  parametros: Record<string, string | string[] | undefined>;
}) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  if (paginas <= 1) return null;

  const desde = (pagina - 1) * porPagina + 1;
  const hasta = Math.min(pagina * porPagina, total);

  function enlace(destino: number) {
    const busqueda = new URLSearchParams();
    for (const [clave, valor] of Object.entries(parametros)) {
      if (clave === 'pagina' || valor === undefined) continue;
      busqueda.set(clave, Array.isArray(valor) ? (valor[0] ?? '') : valor);
    }
    if (destino > 1) busqueda.set('pagina', String(destino));
    const cadena = busqueda.toString();
    return cadena ? `?${cadena}` : '?';
  }

  return (
    <nav
      className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm"
      aria-label="Paginación"
    >
      <p className="text-slate-600">
        {desde}–{hasta} de {total}
      </p>
      <div className="flex items-center gap-2">
        {pagina > 1 ? (
          <Link href={enlace(pagina - 1)} className="boton-secundario px-3 py-1.5">
            Anterior
          </Link>
        ) : (
          <span className="cursor-not-allowed rounded-lg px-3 py-1.5 text-slate-400">Anterior</span>
        )}
        <span className="text-slate-500">
          Página {pagina} de {paginas}
        </span>
        {pagina < paginas ? (
          <Link href={enlace(pagina + 1)} className="boton-secundario px-3 py-1.5">
            Siguiente
          </Link>
        ) : (
          <span className="cursor-not-allowed rounded-lg px-3 py-1.5 text-slate-400">Siguiente</span>
        )}
      </div>
    </nav>
  );
}
