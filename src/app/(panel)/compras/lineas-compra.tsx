'use client';

import { useState } from 'react';
import { BuscadorProducto, type ProductoEncontrado } from '@/components/buscador-producto';
import { PASO_MONEDA } from '@/lib/config';
import { formatearDinero } from '@/lib/formato';

type Linea = { clave: number; producto: ProductoEncontrado | null; cantidad: string; costo: string };

/**
 * Las líneas de una compra.
 *
 * Antes eran cinco desplegables con el catálogo entero dentro —con 3.000
 * productos, quince mil renglones en una sola pantalla—. Ahora se busca
 * escribiendo y se agregan las filas que hagan falta, sin tope.
 *
 * El costo se propone con el último pagado por ese producto, que es lo que uno
 * quiere confirmar o corregir, no escribir de cero.
 */
export function LineasCompra({
  buscar,
}: {
  buscar: (texto: string) => Promise<ProductoEncontrado[]>;
}) {
  const [lineas, setLineas] = useState<Linea[]>([
    { clave: 1, producto: null, cantidad: '', costo: '' },
  ]);

  function cambiar(clave: number, cambios: Partial<Linea>) {
    setLineas((actuales) =>
      actuales.map((l) => (l.clave === clave ? { ...l, ...cambios } : l)),
    );
  }

  const total = lineas.reduce(
    (suma, l) => suma + (Number(l.cantidad) || 0) * (Number(l.costo) || 0),
    0,
  );

  return (
    <div className="space-y-3">
      <span className="etiqueta-campo">Productos</span>

      {lineas.map((linea, indice) => (
        <div key={linea.clave} className="rounded-lg border border-slate-200 p-3">
          <BuscadorProducto
            nombreCampo="productoId"
            buscar={buscar}
            alElegir={(producto) =>
              cambiar(linea.clave, {
                producto,
                // El último costo conocido como punto de partida.
                costo: producto ? String(producto.costo) : '',
              })
            }
          />
          <div className="mt-2 grid grid-cols-[1fr_1fr_auto] items-end gap-2">
            <label className="block">
              <span className="text-xs text-slate-500">Cantidad</span>
              <input
                name="cantidad"
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                value={linea.cantidad}
                onChange={(e) => cambiar(linea.clave, { cantidad: e.target.value })}
                className="campo"
              />
            </label>
            <label className="block">
              <span className="text-xs text-slate-500">Costo por unidad</span>
              <input
                name="costoUnitario"
                type="number"
                min={0}
                step={PASO_MONEDA}
                inputMode="numeric"
                value={linea.costo}
                onChange={(e) => cambiar(linea.clave, { costo: e.target.value })}
                className="campo"
              />
            </label>
            {lineas.length > 1 ? (
              <button
                type="button"
                onClick={() => setLineas((a) => a.filter((l) => l.clave !== linea.clave))}
                className="boton-secundario mb-0.5 px-3"
                aria-label={`Quitar la línea ${indice + 1}`}
              >
                ×
              </button>
            ) : (
              <span />
            )}
          </div>
        </div>
      ))}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() =>
            setLineas((a) => [
              ...a,
              { clave: Math.max(0, ...a.map((l) => l.clave)) + 1, producto: null, cantidad: '', costo: '' },
            ])
          }
          className="boton-secundario px-3 py-1.5 text-sm"
        >
          + Agregar producto
        </button>
        {total > 0 ? (
          <span className="text-sm text-slate-600">
            Total: <b className="text-slate-900">{formatearDinero(total)}</b>
          </span>
        ) : null}
      </div>
    </div>
  );
}
