import { requerirPagina } from '@/lib/guardias';
import { puede } from '@/lib/permisos';
import Link from 'next/link';
import { Campo, Formulario } from '@/components/formulario';
import { ConstructorPedido } from '@/components/constructor-pedido';
import { EncabezadoPagina, Tarjeta, TarjetaTitulo } from '@/components/ui';
import { METODOS_PAGO } from '@/lib/dominio';
import { prisma } from '@/lib/prisma';
import { crearPedido } from '../acciones';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Nuevo pedido' };

type Parametros = Promise<{ leadId?: string | string[] }>;

export default async function NuevoPedidoPage({ searchParams }: { searchParams: Parametros }) {
  const usuario = await requerirPagina('pedidos.crear');
  const puedeElegirVendedor = puede(usuario.rol, 'equipo.ver');
  const { leadId: leadIdCrudo } = await searchParams;
  const leadId = Array.isArray(leadIdCrudo) ? leadIdCrudo[0] : leadIdCrudo;

  const [productos, zonas, vendedores, lead] = await Promise.all([
    prisma.producto.findMany({
      where: { activo: true },
      select: { id: true, nombre: true, precio: true, stock: true },
      orderBy: { nombre: 'asc' },
    }),
    prisma.zona.findMany({
      where: { activa: true },
      select: { id: true, nombre: true, ciudad: true, costoEnvio: true, horasEstimadas: true },
      orderBy: { costoEnvio: 'asc' },
    }),
    prisma.empleado.findMany({
      where: { rol: { in: ['VENDEDOR', 'LIDER'] }, activo: true },
      select: { id: true, nombre: true },
      orderBy: { nombre: 'asc' },
    }),
    leadId
      ? prisma.lead.findUnique({
          where: { id: leadId },
          select: {
            id: true,
            nombre: true,
            telefono: true,
            ciudad: true,
            vendedorId: true,
            productoInteresId: true,
            codigo: true,
          },
        })
      : null,
  ]);

  return (
    <>
      <EncabezadoPagina
        titulo="Nuevo pedido"
        descripcion={
          lead
            ? `Cerrando el prospecto ${lead.codigo}. Al guardar, el prospecto queda marcado como ganado.`
            : 'Captura lo que el cliente confirmó por WhatsApp. El stock se descuenta al confirmar el pedido, no al capturarlo.'
        }
        acciones={
          <Link href={lead ? `/leads/${lead.id}` : '/pedidos'} className="boton-secundario">
            Volver
          </Link>
        }
      />

      {productos.length === 0 ? (
        <Tarjeta className="p-6 text-sm text-slate-600">
          No hay productos activos en el catálogo.{' '}
          <Link href="/inventario/nuevo" className="font-medium text-marca-700 hover:underline">
            Da de alta el primero
          </Link>
          .
        </Tarjeta>
      ) : (
        <Formulario accion={crearPedido} textoBoton="Crear pedido" className="max-w-4xl">
          {lead ? <input type="hidden" name="leadId" value={lead.id} /> : null}

          <div className="space-y-4">
            <Tarjeta>
              <TarjetaTitulo titulo="Datos de entrega" />
              <div className="grid gap-4 p-5 sm:grid-cols-2">
                <Campo etiqueta="Nombre de quien recibe">
                  <input
                    name="clienteNombre"
                    required
                    defaultValue={lead?.nombre ?? ''}
                    className="campo"
                  />
                </Campo>
                <Campo etiqueta="Teléfono">
                  <input
                    name="telefono"
                    required
                    defaultValue={lead?.telefono ?? ''}
                    className="campo"
                  />
                </Campo>
                <Campo etiqueta="Dirección" className="sm:col-span-2">
                  <input
                    name="direccion"
                    required
                    className="campo"
                    placeholder="Av. Insurgentes 123, Col. Del Valle"
                  />
                </Campo>
                <Campo etiqueta="Ciudad">
                  <input
                    name="ciudad"
                    required
                    defaultValue={lead?.ciudad ?? ''}
                    className="campo"
                  />
                </Campo>
                <Campo
                  etiqueta="Referencia"
                  ayuda="Lo que le sirve al repartidor para encontrar la casa."
                >
                  <input name="referencia" className="campo" placeholder="Portón negro" />
                </Campo>
              </div>
            </Tarjeta>

            <Tarjeta>
              <TarjetaTitulo titulo="Productos" />
              <div className="p-5">
                <ConstructorPedido
                  productos={productos}
                  zonas={zonas}
                  productoInicialId={lead?.productoInteresId ?? undefined}
                />
              </div>
            </Tarjeta>

            <Tarjeta>
              <TarjetaTitulo titulo="Cobro y asignación" />
              <div className="grid gap-4 p-5 sm:grid-cols-2">
                <Campo etiqueta="Método de pago">
                  <select name="metodoPago" defaultValue="CONTRA_ENTREGA" className="campo">
                    {METODOS_PAGO.opciones.map((opcion) => (
                      <option key={opcion.valor} value={opcion.valor}>
                        {opcion.etiqueta}
                      </option>
                    ))}
                  </select>
                </Campo>
                {puedeElegirVendedor ? (
                  <Campo etiqueta="Vendedor" ayuda="Determina de quién es la comisión.">
                    <select
                      name="vendedorId"
                      defaultValue={lead?.vendedorId ?? ''}
                      className="campo"
                    >
                      <option value="">Sin vendedor</option>
                      {vendedores.map((vendedor) => (
                        <option key={vendedor.id} value={vendedor.id}>
                          {vendedor.nombre}
                        </option>
                      ))}
                    </select>
                  </Campo>
                ) : (
                  <Campo etiqueta="Vendedor" ayuda="La comisión de este pedido será tuya.">
                    <input value={usuario.nombre} disabled className="campo" />
                  </Campo>
                )}
                <Campo etiqueta="Notas internas" className="sm:col-span-2">
                  <textarea
                    name="notas"
                    rows={2}
                    className="campo"
                    placeholder="Entregar después de las 6 de la tarde."
                  />
                </Campo>
              </div>
            </Tarjeta>
          </div>
        </Formulario>
      )}
    </>
  );
}
