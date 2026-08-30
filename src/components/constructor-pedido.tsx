'use client';

import { useMemo, useState } from 'react';
import { CONFIG, PASO_MONEDA } from '@/lib/config';
import { aUnidadMinima, formatearDinero } from '@/lib/formato';

type Producto = { id: string; nombre: string; precio: number; stock: number };
type Zona = { id: string; nombre: string; ciudad: string; costoEnvio: number; horasEstimadas: number };

type Linea = { clave: number; productoId: string; cantidad: number };

/**
 * Editor de las líneas del pedido. Calcula el total en vivo mientras se arma,
 * que es justo lo que el vendedor necesita para poder decirle un precio al
 * cliente sin colgar el chat. El servidor vuelve a calcularlo todo al guardar:
 * lo que se muestra aquí es una ayuda, no la fuente de verdad.
 */
export function ConstructorPedido({
  productos,
  zonas,
  productoInicialId,
}: {
  productos: Producto[];
  zonas: Zona[];
  productoInicialId?: string;
}) {
  const [lineas, setLineas] = useState<Linea[]>([
    { clave: 1, productoId: productoInicialId ?? productos[0]?.id ?? '', cantidad: 1 },
  ]);
  const [zonaId, setZonaId] = useState(zonas[0]?.id ?? '');
  const [descuento, setDescuento] = useState('0');

  const porId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);

  function actualizarLinea(clave: number, cambios: Partial<Linea>) {
    setLineas((actuales) =>
      actuales.map((linea) => (linea.clave === clave ? { ...linea, ...cambios } : linea)),
    );
  }

  function agregarLinea() {
    setLineas((actuales) => [
      ...actuales,
      { clave: Math.max(0, ...actuales.map((l) => l.clave)) + 1, productoId: productos[0]?.id ?? '', cantidad: 1 },
    ]);
  }

  function quitarLinea(clave: number) {
    setLineas((actuales) =>
      actuales.length === 1 ? actuales : actuales.filter((linea) => linea.clave !== clave),
    );
  }

  const subtotal = lineas.reduce((suma, linea) => {
    const producto = porId.get(linea.productoId);
    return suma + (producto ? producto.precio * linea.cantidad : 0);
  }, 0);

  const zona = zonas.find((z) => z.id === zonaId);
  const costoEnvio = zona?.costoEnvio ?? 0;
  const descuentoAplicado = Math.max(0, aUnidadMinima(descuento.replace(',', '.')));
  const total = Math.max(0, subtotal - descuentoAplicado) + costoEnvio;

  const excedeStock = lineas.some((linea) => {
    const producto = porId.get(linea.productoId);
    return producto ? linea.cantidad > producto.stock : false;
  });

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {lineas.map((linea) => {
          const producto = porId.get(linea.productoId);
          const sinStock = producto ? linea.cantidad > producto.stock : false;
          return (
            <div key={linea.clave} className="flex flex-wrap items-end gap-3">
              <label className="min-w-[16rem] flex-1">
                <span className="etiqueta-campo">Producto</span>
                <select
                  name="productoId"
                  value={linea.productoId}
                  onChange={(evento) =>
                    actualizarLinea(linea.clave, { productoId: evento.target.value })
                  }
                  className="campo"
                >
                  {productos.map((p) => (
                    <option key={p.id} value={p.id} disabled={p.stock === 0}>
                      {p.nombre} — {formatearDinero(p.precio)}
                      {p.stock === 0 ? ' (agotado)' : ` (${p.stock} disp.)`}
                    </option>
                  ))}
                </select>
              </label>
              <label className="w-28">
                <span className="etiqueta-campo">Cantidad</span>
                <input
                  name="cantidad"
                  type="number"
                  min={1}
                  step={1}
                  value={linea.cantidad}
                  onChange={(evento) =>
                    actualizarLinea(linea.clave, {
                      cantidad: Math.max(1, Number(evento.target.value) || 1),
                    })
                  }
                  className={`campo ${sinStock ? 'border-red-400' : ''}`}
                />
              </label>
              <div className="w-28 pb-2 text-right text-sm font-medium text-slate-800">
                {producto ? formatearDinero(producto.precio * linea.cantidad) : '—'}
              </div>
              <button
                type="button"
                onClick={() => quitarLinea(linea.clave)}
                disabled={lineas.length === 1}
                className="boton-secundario mb-0.5 px-2.5"
                aria-label="Quitar producto"
              >
                ✕
              </button>
              {sinStock ? (
                <p className="w-full text-xs text-red-600">
                  Sólo quedan {producto?.stock} unidades de este producto.
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      <button type="button" onClick={agregarLinea} className="boton-secundario">
        + Agregar producto
      </button>

      <div className="grid gap-4 border-t border-slate-200 pt-4 sm:grid-cols-2">
        <label className="block">
          <span className="etiqueta-campo">Zona de entrega</span>
          <select
            name="zonaId"
            value={zonaId}
            onChange={(evento) => setZonaId(evento.target.value)}
            className="campo"
          >
            <option value="">Sin zona (envío gratis)</option>
            {zonas.map((z) => (
              <option key={z.id} value={z.id}>
                {z.nombre} · {z.ciudad} — {formatearDinero(z.costoEnvio)} ({z.horasEstimadas} h)
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="etiqueta-campo">Descuento ({CONFIG.moneda})</span>
          <input
            name="descuento"
            type="number"
            min={0}
            step={PASO_MONEDA}
            value={descuento}
            onChange={(evento) => setDescuento(evento.target.value)}
            className="campo"
          />
        </label>
      </div>

      <dl className="space-y-1.5 rounded-lg bg-slate-50 p-4 text-sm">
        <div className="flex justify-between">
          <dt className="text-slate-600">Subtotal</dt>
          <dd className="font-medium text-slate-800">{formatearDinero(subtotal)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-600">Descuento</dt>
          <dd className="font-medium text-slate-800">−{formatearDinero(descuentoAplicado)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-600">Envío</dt>
          <dd className="font-medium text-slate-800">{formatearDinero(costoEnvio)}</dd>
        </div>
        <div className="flex justify-between border-t border-slate-200 pt-1.5 text-base">
          <dt className="font-semibold text-slate-900">Total</dt>
          <dd className="font-semibold text-slate-900">{formatearDinero(total)}</dd>
        </div>
      </dl>

      {excedeStock ? (
        <p role="alert" className="text-sm text-red-600">
          Hay líneas por encima del stock disponible. Ajusta las cantidades antes de guardar.
        </p>
      ) : null}
    </div>
  );
}
