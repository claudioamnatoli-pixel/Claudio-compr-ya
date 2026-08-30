'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { ESTADOS_ENVIO } from '@/lib/dominio';
import { StockInsuficiente } from '@/lib/inventario';
import { detallePedido, transicionarPedido, TransicionInvalida } from '@/lib/pedidos';
import { autorizar } from '@/lib/guardias';
import { prisma } from '@/lib/prisma';
import {
  dineroEnUnidadMinima,
  exito,
  fallo,
  textoObligatorio,
  textoOpcional,
  validar,
  type ResultadoAccion,
} from '@/lib/acciones';

function revalidarLogistica(pedidoId: string) {
  revalidatePath('/logistica');
  revalidatePath('/pedidos');
  revalidatePath(`/pedidos/${pedidoId}`);
  revalidatePath('/');
}

const esquemaAsignacion = z.object({
  envioId: textoObligatorio(),
  repartidorId: textoOpcional(),
  zonaId: textoOpcional(),
  fechaProgramada: textoOpcional(),
});

/** Asigna repartidor, zona y fecha. No mueve el pedido: sólo prepara la ruta. */
export async function asignarEnvio(
  _estadoPrevio: ResultadoAccion | null,
  formData: FormData,
): Promise<ResultadoAccion> {
  const guardia = await autorizar('logistica.gestionar');
  if (!guardia.ok) return guardia.respuesta;

  const resultado = validar(esquemaAsignacion, formData);
  if (!resultado.ok) return fallo(resultado.error);
  const { envioId, repartidorId, zonaId, fechaProgramada } = resultado.datos;

  const envio = await prisma.envio.findUnique({ where: { id: envioId } });
  if (!envio) return fallo('El envío ya no existe.');

  let fecha: Date | null = null;
  if (fechaProgramada) {
    fecha = new Date(fechaProgramada);
    if (Number.isNaN(fecha.getTime())) return fallo('La fecha programada no es válida.');
  }

  await prisma.envio.update({
    where: { id: envioId },
    data: {
      repartidorId,
      zonaId,
      fechaProgramada: fecha ?? envio.fechaProgramada,
      // Asignar a alguien saca al envío de la bandeja de pendientes, pero no
      // pisa un estado más avanzado (en ruta, entregado…).
      estado:
        repartidorId && ['POR_ASIGNAR', 'REPROGRAMADO', 'FALLIDO'].includes(envio.estado)
          ? 'ASIGNADO'
          : envio.estado,
    },
  });

  revalidarLogistica(envio.pedidoId);
  return exito('Envío asignado.');
}

const esquemaEntrega = z.object({
  envioId: textoObligatorio(),
  resultado: z.enum(['ENTREGADO', 'FALLIDO', 'REPROGRAMADO']),
  montoCobrado: dineroEnUnidadMinima('Escribe un importe válido'),
  costoReal: dineroEnUnidadMinima('Escribe un costo válido'),
  observaciones: textoOpcional(),
  nuevaFecha: textoOpcional(),
});

/**
 * Registra lo que pasó en la puerta del cliente. Si se entregó, arrastra al
 * pedido a «entregado» con todos sus efectos; si falló, suma un intento.
 */
export async function registrarEntrega(
  _estadoPrevio: ResultadoAccion | null,
  formData: FormData,
): Promise<ResultadoAccion> {
  const guardia = await autorizar('logistica.gestionar');
  if (!guardia.ok) return guardia.respuesta;

  const validacion = validar(esquemaEntrega, formData);
  if (!validacion.ok) return fallo(validacion.error);
  const { envioId, resultado, montoCobrado, costoReal, observaciones, nuevaFecha } =
    validacion.datos;

  const envio = await prisma.envio.findUnique({
    where: { id: envioId },
    include: { pedido: { include: detallePedido } },
  });
  if (!envio) return fallo('El envío ya no existe.');

  let fecha: Date | null = null;
  if (nuevaFecha) {
    fecha = new Date(nuevaFecha);
    if (Number.isNaN(fecha.getTime())) return fallo('La nueva fecha no es válida.');
  }

  try {
    await prisma.$transaction(async (tx) => {
      if (resultado === 'ENTREGADO') {
        await tx.envio.update({
          where: { id: envioId },
          data: {
            estado: 'ENTREGADO',
            fechaEntrega: new Date(),
            intentos: Math.max(envio.intentos, 1),
            montoCobrado:
              envio.pedido.metodoPago === 'CONTRA_ENTREGA'
                ? montoCobrado || envio.pedido.total
                : null,
            costoReal: costoReal || envio.costoReal,
            observaciones,
          },
        });
        // El pedido tiene que estar «enviado» para poder darse por entregado.
        if (envio.pedido.estado === 'ENVIADO') {
          await transicionarPedido(tx, envio.pedido, 'ENTREGADO');
        }
        return;
      }

      await tx.envio.update({
        where: { id: envioId },
        data: {
          estado: resultado,
          intentos: envio.intentos + 1,
          costoReal: costoReal || envio.costoReal,
          observaciones,
          ...(fecha ? { fechaProgramada: fecha } : {}),
        },
      });
    });
  } catch (error) {
    if (error instanceof TransicionInvalida || error instanceof StockInsuficiente) {
      return fallo(error.message);
    }
    throw error;
  }

  revalidarLogistica(envio.pedidoId);
  return exito(`Entrega registrada como ${ESTADOS_ENVIO.etiqueta(resultado).toLowerCase()}.`);
}

const esquemaDespacho = z.object({ envioId: textoObligatorio() });

/** Saca el envío a la calle: el pedido pasa a «enviado» y el envío a «en ruta». */
export async function despacharEnvio(
  _estadoPrevio: ResultadoAccion | null,
  formData: FormData,
): Promise<ResultadoAccion> {
  const guardia = await autorizar('logistica.gestionar');
  if (!guardia.ok) return guardia.respuesta;

  const validacion = validar(esquemaDespacho, formData);
  if (!validacion.ok) return fallo(validacion.error);

  const envio = await prisma.envio.findUnique({
    where: { id: validacion.datos.envioId },
    include: { pedido: { include: detallePedido } },
  });
  if (!envio) return fallo('El envío ya no existe.');
  if (!envio.repartidorId) return fallo('Asigna primero un repartidor.');

  try {
    await prisma.$transaction(async (tx) => {
      // Un pedido apenas confirmado pasa por «preparando» antes de salir.
      if (envio.pedido.estado === 'CONFIRMADO') {
        await transicionarPedido(tx, envio.pedido, 'PREPARANDO');
        await transicionarPedido(tx, { ...envio.pedido, estado: 'PREPARANDO' }, 'ENVIADO');
      } else if (envio.pedido.estado === 'PREPARANDO') {
        await transicionarPedido(tx, envio.pedido, 'ENVIADO');
      } else {
        throw new TransicionInvalida(envio.pedido.estado, 'ENVIADO');
      }
    });
  } catch (error) {
    if (error instanceof TransicionInvalida || error instanceof StockInsuficiente) {
      return fallo(error.message);
    }
    throw error;
  }

  revalidarLogistica(envio.pedidoId);
  return exito('El pedido salió a ruta.');
}
