'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { formatearDinero } from '@/lib/formato';

export type ProductoEncontrado = {
  id: string;
  nombre: string;
  sku: string;
  precio: number;
  costo: number;
  stock: number;
};

/**
 * Campo para elegir un producto escribiendo, en lugar de un desplegable.
 *
 * Con un catálogo de miles, una lista desplegable es inusable: nadie recorre
 * tres mil renglones. Acá se escribe «labial» y aparecen los pocos que
 * coinciden.
 *
 * El identificador elegido viaja en un campo oculto, así el formulario se
 * envía igual que antes y el servidor no se entera del cambio.
 */
export function BuscadorProducto({
  nombreCampo,
  buscar,
  alElegir,
  marcador = 'Escribí el nombre o el código…',
}: {
  nombreCampo: string;
  buscar: (texto: string) => Promise<ProductoEncontrado[]>;
  alElegir?: (producto: ProductoEncontrado | null) => void;
  marcador?: string;
}) {
  const [texto, setTexto] = useState('');
  const [resultados, setResultados] = useState<ProductoEncontrado[]>([]);
  const [elegido, setElegido] = useState<ProductoEncontrado | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const idLista = useId();
  const pedido = useRef(0);

  useEffect(() => {
    if (elegido || texto.trim().length < 2) {
      setResultados([]);
      return;
    }
    // Se espera a que deje de escribir: una consulta por tecla sería una por
    // letra, y el servidor contestaría preguntas que ya no interesan.
    const temporizador = setTimeout(async () => {
      const mio = ++pedido.current;
      setBuscando(true);
      try {
        const encontrados = await buscar(texto);
        // Sólo la última búsqueda pinta: las anteriores pueden llegar después
        // y dejarían en pantalla resultados de un texto viejo.
        if (mio === pedido.current) {
          setResultados(encontrados);
          setAbierto(true);
        }
      } finally {
        if (mio === pedido.current) setBuscando(false);
      }
    }, 250);
    return () => clearTimeout(temporizador);
  }, [texto, elegido, buscar]);

  function elegir(producto: ProductoEncontrado) {
    setElegido(producto);
    setTexto(producto.nombre);
    setAbierto(false);
    setResultados([]);
    alElegir?.(producto);
  }

  function limpiar() {
    setElegido(null);
    setTexto('');
    setResultados([]);
    alElegir?.(null);
  }

  return (
    <div className="relative">
      <input type="hidden" name={nombreCampo} value={elegido?.id ?? ''} />
      <div className="flex gap-2">
        <input
          type="text"
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            if (elegido) {
              setElegido(null);
              alElegir?.(null);
            }
          }}
          onFocus={() => resultados.length > 0 && setAbierto(true)}
          placeholder={marcador}
          className="campo"
          role="combobox"
          aria-expanded={abierto}
          aria-controls={idLista}
          autoComplete="off"
        />
        {elegido ? (
          <button type="button" onClick={limpiar} className="boton-secundario px-3" aria-label="Quitar">
            ×
          </button>
        ) : null}
      </div>

      {elegido ? (
        <p className="mt-1 text-xs text-slate-500">
          <span className="font-mono">{elegido.sku}</span> · {elegido.stock} en stock ·{' '}
          {formatearDinero(elegido.precio)}
        </p>
      ) : null}

      {abierto && !elegido ? (
        <ul
          id={idLista}
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg"
        >
          {buscando ? (
            <li className="px-3 py-2 text-sm text-slate-500">Buscando…</li>
          ) : resultados.length === 0 ? (
            <li className="px-3 py-2 text-sm text-slate-500">
              Ningún producto coincide con «{texto}».
            </li>
          ) : (
            resultados.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => elegir(p)}
                  className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50"
                >
                  <span>
                    <span className="text-slate-900">{p.nombre}</span>
                    <span className="ml-2 font-mono text-xs text-slate-400">{p.sku}</span>
                  </span>
                  <span className="shrink-0 text-xs text-slate-500">
                    {p.stock} u. · {formatearDinero(p.precio)}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
