import Link from 'next/link';
import { Campo, Formulario } from '@/components/formulario';
import { EncabezadoPagina, Tarjeta } from '@/components/ui';
import { CONFIG } from '@/lib/config';
import { crearProducto } from '../acciones';

export const metadata = { title: 'Nuevo producto' };

export default function NuevoProductoPage() {
  return (
    <>
      <EncabezadoPagina
        titulo="Nuevo producto"
        descripcion="Da de alta lo que vas a promocionar. El stock inicial queda registrado como una entrada de inventario."
        acciones={
          <Link href="/inventario" className="boton-secundario">
            Volver
          </Link>
        }
      />

      <Tarjeta className="max-w-3xl p-5">
        <Formulario accion={crearProducto} textoBoton="Crear producto">
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="SKU" ayuda="Código interno único, por ejemplo AUD-PRO-01.">
              <input name="sku" required className="campo font-mono" placeholder="AUD-PRO-01" />
            </Campo>
            <Campo etiqueta="Nombre">
              <input
                name="nombre"
                required
                className="campo"
                placeholder="Audífonos inalámbricos Pro"
              />
            </Campo>
            <Campo etiqueta="Categoría">
              <input name="categoria" required className="campo" placeholder="Audio" />
            </Campo>
            <Campo etiqueta="Stock inicial">
              <input
                name="stockInicial"
                type="number"
                min={0}
                step={1}
                defaultValue={0}
                className="campo"
              />
            </Campo>
            <Campo etiqueta={`Costo (${CONFIG.moneda})`} ayuda="Lo que te cuesta a ti la pieza.">
              <input
                name="costo"
                type="number"
                min={0}
                step="0.01"
                required
                className="campo"
                placeholder="210.00"
              />
            </Campo>
            <Campo etiqueta={`Precio de venta (${CONFIG.moneda})`}>
              <input
                name="precio"
                type="number"
                min={0}
                step="0.01"
                required
                className="campo"
                placeholder="599.00"
              />
            </Campo>
            <Campo
              etiqueta="Stock mínimo"
              ayuda="Cuando el stock llegue a este número, el producto aparecerá en las alertas."
            >
              <input
                name="stockMinimo"
                type="number"
                min={0}
                step={1}
                defaultValue={5}
                className="campo"
              />
            </Campo>
            <Campo etiqueta="Descripción" className="sm:col-span-2">
              <textarea
                name="descripcion"
                rows={3}
                className="campo"
                placeholder="Detalles que le sirvan al vendedor cuando conteste por WhatsApp."
              />
            </Campo>
          </div>
        </Formulario>
      </Tarjeta>
    </>
  );
}
