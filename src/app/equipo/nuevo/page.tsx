import Link from 'next/link';
import { Campo, Formulario } from '@/components/formulario';
import { EncabezadoPagina, Tarjeta } from '@/components/ui';
import { CONFIG } from '@/lib/config';
import { ROLES } from '@/lib/dominio';
import { prisma } from '@/lib/prisma';
import { crearEmpleado } from '../acciones';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Alta de personal' };

export default async function NuevoEmpleadoPage() {
  const equipos = await prisma.equipo.findMany({
    select: { id: true, nombre: true },
    orderBy: { nombre: 'asc' },
  });

  return (
    <>
      <EncabezadoPagina
        titulo="Dar de alta a alguien"
        descripcion="Vendedores, repartidores, almacén o administración. El rol define qué puede aparecer asignado a esta persona."
        acciones={
          <Link href="/equipo" className="boton-secundario">
            Volver
          </Link>
        }
      />

      <Tarjeta className="max-w-3xl p-5">
        <Formulario accion={crearEmpleado} textoBoton="Dar de alta">
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Nombre completo">
              <input name="nombre" required className="campo" placeholder="Ana Sotelo" />
            </Campo>
            <Campo etiqueta="Correo">
              <input
                name="email"
                type="email"
                required
                className="campo"
                placeholder="ana@compr-ya.mx"
              />
            </Campo>
            <Campo etiqueta="Teléfono">
              <input name="telefono" required className="campo" placeholder="55 1234 5678" />
            </Campo>
            <Campo etiqueta="Rol">
              <select name="rol" defaultValue="VENDEDOR" required className="campo">
                {ROLES.opciones.map((opcion) => (
                  <option key={opcion.valor} value={opcion.valor}>
                    {opcion.etiqueta}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Equipo">
              <select name="equipoId" defaultValue="" className="campo">
                <option value="">Sin equipo</option>
                {equipos.map((equipo) => (
                  <option key={equipo.id} value={equipo.id}>
                    {equipo.nombre}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta={`Sueldo base mensual (${CONFIG.moneda})`}>
              <input
                name="salarioBase"
                type="number"
                min={0}
                step="0.01"
                defaultValue={0}
                className="campo"
              />
            </Campo>
            <Campo
              etiqueta="Comisión por venta (%)"
              ayuda="Se aplica sobre el subtotal menos el descuento, al confirmar el pedido."
            >
              <input
                name="tasaComision"
                type="number"
                min={0}
                max={100}
                step="0.1"
                defaultValue={0}
                className="campo"
              />
            </Campo>
            <Campo etiqueta={`Meta de venta mensual (${CONFIG.moneda})`}>
              <input
                name="metaMensual"
                type="number"
                min={0}
                step="0.01"
                defaultValue={0}
                className="campo"
              />
            </Campo>
            <Campo etiqueta="Notas" className="sm:col-span-2">
              <textarea name="notas" rows={2} className="campo" />
            </Campo>
          </div>
        </Formulario>
      </Tarjeta>
    </>
  );
}
