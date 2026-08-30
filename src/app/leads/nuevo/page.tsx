import Link from 'next/link';
import { Campo, Formulario } from '@/components/formulario';
import { EncabezadoPagina, Tarjeta } from '@/components/ui';
import { ORIGENES_LEAD } from '@/lib/dominio';
import { formatearDinero } from '@/lib/formato';
import { prisma } from '@/lib/prisma';
import { crearLead } from '../acciones';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Nuevo prospecto' };

export default async function NuevoLeadPage() {
  const [campanas, productos, vendedores] = await Promise.all([
    prisma.campana.findMany({
      where: { activa: true },
      select: { id: true, nombre: true },
      orderBy: { fechaInicio: 'desc' },
    }),
    prisma.producto.findMany({
      where: { activo: true },
      select: { id: true, nombre: true, precio: true },
      orderBy: { nombre: 'asc' },
    }),
    prisma.empleado.findMany({
      where: { rol: { in: ['VENDEDOR', 'LIDER'] }, activo: true },
      select: { id: true, nombre: true },
      orderBy: { nombre: 'asc' },
    }),
  ]);

  return (
    <>
      <EncabezadoPagina
        titulo="Registrar prospecto"
        descripcion="Alguien escribió por TikTok. Anótalo aquí para que no se pierda y quede asignado a un responsable."
        acciones={
          <Link href="/leads" className="boton-secundario">
            Volver
          </Link>
        }
      />

      <Tarjeta className="max-w-3xl p-5">
        <Formulario accion={crearLead} textoBoton="Registrar prospecto">
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Nombre">
              <input name="nombre" required className="campo" placeholder="María Fernanda López" />
            </Campo>
            <Campo etiqueta="Teléfono de WhatsApp" ayuda="Con o sin prefijo de país; se normaliza solo.">
              <input name="telefono" required className="campo" placeholder="55 1234 5678" />
            </Campo>
            <Campo etiqueta="Ciudad">
              <input name="ciudad" className="campo" placeholder="Ciudad de México" />
            </Campo>
            <Campo etiqueta="Origen">
              <select name="origen" required defaultValue="TIKTOK_VIDEO" className="campo">
                {ORIGENES_LEAD.opciones.map((opcion) => (
                  <option key={opcion.valor} value={opcion.valor}>
                    {opcion.etiqueta}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Campaña">
              <select name="campanaId" defaultValue="" className="campo">
                <option value="">Sin campaña</option>
                {campanas.map((campana) => (
                  <option key={campana.id} value={campana.id}>
                    {campana.nombre}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Producto de interés">
              <select name="productoInteresId" defaultValue="" className="campo">
                <option value="">Sin definir</option>
                {productos.map((producto) => (
                  <option key={producto.id} value={producto.id}>
                    {producto.nombre} — {formatearDinero(producto.precio)}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo
              etiqueta="Responsable"
              ayuda="Si lo dejas sin asignar, el prospecto queda en la bandeja de nuevos."
            >
              <select name="vendedorId" defaultValue="" className="campo">
                <option value="">Sin asignar</option>
                {vendedores.map((vendedor) => (
                  <option key={vendedor.id} value={vendedor.id}>
                    {vendedor.nombre}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Notas" className="sm:col-span-2">
              <textarea
                name="notas"
                rows={3}
                className="campo"
                placeholder="Preguntó por el color negro y si hay envío el mismo día."
              />
            </Campo>
          </div>
        </Formulario>
      </Tarjeta>
    </>
  );
}
