import Link from 'next/link';
import { requerirPagina } from '@/lib/guardias';
import { puede } from '@/lib/permisos';
import { BotonAccion, Campo, Formulario } from '@/components/formulario';
import {
  EncabezadoPagina,
  EncabezadoTabla,
  Etiqueta,
  Indicador,
  SinDatos,
  Tabla,
  Tarjeta,
  TarjetaTitulo,
} from '@/components/ui';
import { PASO_MONEDA } from '@/lib/config';
import { CATEGORIAS_GASTO } from '@/lib/dominio';
import { mesDe } from '@/lib/contabilidad';
import { periodosPendientes } from '@/lib/recurrentes';
import { formatearDinero, formatearFecha, formatearPeriodo } from '@/lib/formato';
import { prisma } from '@/lib/prisma';
import { crearGasto, eliminarGasto } from './acciones';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Gastos' };

export default async function GastosPage() {
  const usuario = await requerirPagina('gastos.ver');
  const puedeGestionar = puede(usuario.rol, 'gastos.gestionar');
  const { desde, hasta } = mesDe(new Date());

  const [gastos, proveedores, delMes, periodos] = await Promise.all([
    prisma.gasto.findMany({
      orderBy: { fecha: 'desc' },
      take: 80,
      include: { proveedor: { select: { nombre: true } }, empleado: { select: { nombre: true } } },
    }),
    prisma.proveedor.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } }),
    prisma.gasto.groupBy({
      by: ['categoria'],
      where: { fecha: { gte: desde, lte: hasta } },
      _sum: { monto: true },
    }),
    puedeGestionar ? periodosPendientes() : Promise.resolve([]),
  ]);

  const pendientes = periodos.filter((p) => p.faltantes > 0);

  const totalMes = delMes.reduce((suma, g) => suma + (g._sum.monto ?? 0), 0);
  const mayor = delMes
    .map((g) => ({ categoria: g.categoria, monto: g._sum.monto ?? 0 }))
    .sort((a, b) => b.monto - a.monto)[0];
  const hoy = new Date().toISOString().slice(0, 10);

  return (
    <>
      <EncabezadoPagina
        titulo="Gastos"
        descripcion="Lo que se paga sin que haya una venta detrás: alquiler, servicios, embalaje, banco, contador."
        acciones={
          puedeGestionar ? (
            <Link href="/gastos/recurrentes" className="boton-secundario">
              Gastos fijos del mes
            </Link>
          ) : null
        }
      />

      {pendientes.length > 0 ? (
        <p className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {pendientes.length === 1
            ? `Falta generar los gastos fijos de ${formatearPeriodo(pendientes[0].periodo)}.`
            : `Faltan generar los gastos fijos de ${pendientes.length} meses.`}{' '}
          <Link href="/gastos/recurrentes" className="font-medium underline">
            Generarlos ahora
          </Link>
        </p>
      ) : null}

      <section className="mb-6 grid gap-4 sm:grid-cols-3">
        <Indicador titulo="Gastado este mes" valor={formatearDinero(totalMes)} tono="ambar" />
        <Indicador
          titulo="Mayor categoría"
          valor={mayor ? CATEGORIAS_GASTO.etiqueta(mayor.categoria) : '—'}
          detalle={mayor ? formatearDinero(mayor.monto) : 'sin gastos cargados'}
        />
        <Indicador titulo="Cargados" valor={String(gastos.length)} detalle="últimos movimientos" />
      </section>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Tarjeta>
          <TarjetaTitulo
            titulo="Últimos gastos"
            descripcion="Las comisiones y las campañas no se cargan acá: ya se cuentan por su lado."
          />
          {gastos.length === 0 ? (
            <SinDatos mensaje="Todavía no cargaste ningún gasto." />
          ) : (
            <Tabla>
              <EncabezadoTabla columnas={['Fecha', 'Categoría', 'Concepto', 'Importe', '']} />
              <tbody>
                {gastos.map((g) => (
                  <tr key={g.id} className="border-t border-slate-100">
                    <td className="px-5 py-3 whitespace-nowrap text-slate-600">{formatearFecha(g.fecha)}</td>
                    <td className="px-5 py-3">
                      <Etiqueta tono={CATEGORIAS_GASTO.tono(g.categoria)}>
                        {CATEGORIAS_GASTO.etiqueta(g.categoria)}
                      </Etiqueta>
                    </td>
                    <td className="px-5 py-3">
                      <div className="text-slate-900">{g.descripcion}</div>
                      <div className="text-xs text-slate-500">
                        {g.proveedor?.nombre ?? 'Sin proveedor'}
                        {g.comprobante ? ` · ${g.comprobante}` : ''}
                      </div>
                    </td>
                    <td className="px-5 py-3 tabular-nums font-medium">{formatearDinero(g.monto)}</td>
                    <td className="px-5 py-3 text-right">
                      {puedeGestionar ? (
                        <BotonAccion
                          accion={eliminarGasto}
                          camposOcultos={{ id: g.id }}
                          variante="peligro"
                          confirmacion="¿Eliminar este gasto? Queda registrado en la auditoría."
                        >
                          Eliminar
                        </BotonAccion>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
        </Tarjeta>

        {puedeGestionar ? (
          <Tarjeta>
            <TarjetaTitulo titulo="Cargar un gasto" />
            <div className="p-5">
              <Formulario accion={crearGasto} textoBoton="Registrar gasto">
                <div className="space-y-4">
                  <Campo etiqueta="Categoría">
                    <select name="categoria" required className="campo" defaultValue="">
                      <option value="" disabled>Elegí una</option>
                      {CATEGORIAS_GASTO.opciones.map((o) => (
                        <option key={o.valor} value={o.valor}>{o.etiqueta}</option>
                      ))}
                    </select>
                  </Campo>
                  <Campo etiqueta="Concepto">
                    <input name="descripcion" required className="campo" placeholder="Alquiler del depósito, octubre" />
                  </Campo>
                  <Campo etiqueta="Importe" ayuda="En guaraníes, sin puntos.">
                    <input name="monto" type="number" inputMode="numeric" min={0} step={PASO_MONEDA} required className="campo" />
                  </Campo>
                  <Campo etiqueta="Fecha">
                    <input name="fecha" type="date" required defaultValue={hoy} className="campo" />
                  </Campo>
                  <Campo etiqueta="Proveedor" ayuda="Opcional.">
                    <select name="proveedorId" className="campo" defaultValue="">
                      <option value="">Sin proveedor</option>
                      {proveedores.map((p) => (
                        <option key={p.id} value={p.id}>{p.nombre}</option>
                      ))}
                    </select>
                  </Campo>
                  <Campo etiqueta="Comprobante" ayuda="Número de factura o recibo.">
                    <input name="comprobante" className="campo" placeholder="001-001-0001234" />
                  </Campo>
                </div>
              </Formulario>
            </div>
          </Tarjeta>
        ) : null}
      </div>
    </>
  );
}
