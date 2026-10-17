import Link from 'next/link';
import { requerirPagina } from '@/lib/guardias';
import { Campo, Formulario } from '@/components/formulario';
import { EncabezadoPagina, Tarjeta, TarjetaTitulo } from '@/components/ui';
import { COLUMNAS } from '@/lib/importar';
import { importarCatalogo } from './acciones';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Cargar catálogo' };

export default async function ImportarPage() {
  await requerirPagina('inventario.gestionar');

  return (
    <>
      <EncabezadoPagina
        titulo="Cargar catálogo desde una planilla"
        descripcion="Para dar de alta muchos productos de una vez, sin escribirlos uno por uno."
        acciones={
          <Link href="/inventario" className="boton-secundario">
            Volver al inventario
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Tarjeta>
          <TarjetaTitulo titulo="Pegá acá las celdas" />
          <div className="p-5">
            <Formulario accion={importarCatalogo} textoBoton="Cargar catálogo" textoEnviando="Cargando…">
              <Campo
                etiqueta="Planilla"
                ayuda="En Excel seleccioná las filas, copiá con Ctrl+C y pegá acá con Ctrl+V."
              >
                <textarea
                  name="planilla"
                  rows={14}
                  required
                  className="campo font-mono text-xs"
                  placeholder={
                    'COS-001\tLabial mate rojo\tCosmética\t18.000\t35.000\t120\t20\n' +
                    'COS-002\tBase líquida tono 2\tCosmética\t42.000\t79.000\t40\t10'
                  }
                />
              </Campo>
            </Formulario>
          </div>
        </Tarjeta>

        <div className="space-y-6">
          <Tarjeta>
            <TarjetaTitulo titulo="Las columnas, en este orden" />
            <ol className="space-y-1 px-5 pb-5 pt-1 text-sm text-slate-700">
              {COLUMNAS.map((c, i) => (
                <li key={c}>
                  <span className="mr-2 font-mono text-xs text-slate-400">{i + 1}</span>
                  {c}
                </li>
              ))}
            </ol>
            <p className="px-5 pb-5 text-xs text-slate-500">
              Si la primera fila son los títulos, se saltea sola.
            </p>
          </Tarjeta>

          <Tarjeta>
            <TarjetaTitulo titulo="Qué va a pasar" />
            <ul className="space-y-3 px-5 pb-5 pt-1 text-sm text-slate-700">
              <li>
                <b className="text-slate-900">Los precios se leen a la paraguaya.</b> «190.000» son
                ciento noventa mil.
              </li>
              <li>
                <b className="text-slate-900">O entra todo o no entra nada.</b> Si una línea está
                mal, no se carga ninguna y te digo cuáles corregir.
              </li>
              <li>
                <b className="text-slate-900">A los productos que ya existen no se les toca el
                stock.</b> Se les actualiza nombre, categoría y precios. Las existencias sólo se
                mueven con una compra o un movimiento, que dejan rastro.
              </li>
            </ul>
          </Tarjeta>
        </div>
      </div>
    </>
  );
}
