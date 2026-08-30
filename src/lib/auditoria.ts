import type { Prisma } from '@prisma/client';
import type { Tono } from './dominio';
import { prisma } from './prisma';

/**
 * Registro de auditoría.
 *
 * Anota quién hizo qué y qué cambió, para lo que afecta al dinero o al acceso:
 * sueldos, comisiones, precios, altas y bajas de personal, contraseñas y
 * anulación de pedidos. No se registra todo: el movimiento de inventario y la
 * conversación de WhatsApp ya llevan su propio historial, y duplicarlo sólo
 * añadiría ruido donde hay que buscar.
 */

export const ACCIONES_AUDITADAS: Record<string, { etiqueta: string; tono: Tono }> = {
  'empleado.crear': { etiqueta: 'Alta de personal', tono: 'verde' },
  'empleado.actualizar': { etiqueta: 'Cambio de condiciones', tono: 'ambar' },
  'empleado.acceso_otorgado': { etiqueta: 'Acceso otorgado', tono: 'morado' },
  'empleado.acceso_revocado': { etiqueta: 'Acceso revocado', tono: 'rojo' },
  'equipo.crear': { etiqueta: 'Alta de equipo', tono: 'verde' },
  'producto.crear': { etiqueta: 'Alta de producto', tono: 'verde' },
  'producto.actualizar': { etiqueta: 'Cambio de precio o costo', tono: 'ambar' },
  'comision.pagar': { etiqueta: 'Pago de comisiones', tono: 'marca' },
  'pedido.anular': { etiqueta: 'Pedido anulado', tono: 'rojo' },
  'password.cambiada': { etiqueta: 'Contraseña cambiada', tono: 'azul' },
  'sesion.iniciada': { etiqueta: 'Inicio de sesión', tono: 'gris' },
  'sesion.fallida': { etiqueta: 'Acceso fallido', tono: 'rojo' },
};

export function etiquetaDeAccion(accion: string): string {
  return ACCIONES_AUDITADAS[accion]?.etiqueta ?? accion;
}

export function tonoDeAccion(accion: string): Tono {
  return ACCIONES_AUDITADAS[accion]?.tono ?? 'gris';
}

export type Cambio = { antes: unknown; despues: unknown };
export type Cambios = Record<string, Cambio>;

/**
 * Compara los campos indicados entre dos versiones de un registro y devuelve
 * sólo los que cambiaron, o null si no cambió ninguno.
 *
 * Se compara con `Object.is` sobre valores primitivos: los campos auditados son
 * números, textos y booleanos, así que no hace falta comparar en profundidad.
 */
export function compararCampos<T extends object>(
  antes: T,
  despues: Partial<T>,
  campos: readonly (keyof T & string)[],
): Cambios | null {
  const cambios: Cambios = {};
  for (const campo of campos) {
    if (!(campo in despues)) continue;
    const valorAntes = antes[campo];
    const valorDespues = despues[campo];
    // Las fechas se comparan por su instante, no por identidad de objeto.
    const iguales =
      valorAntes instanceof Date && valorDespues instanceof Date
        ? valorAntes.getTime() === valorDespues.getTime()
        : Object.is(valorAntes, valorDespues);
    if (!iguales) cambios[campo] = { antes: valorAntes, despues: valorDespues };
  }
  return Object.keys(cambios).length > 0 ? cambios : null;
}

type DatosRegistro = {
  accion: string;
  entidad: string;
  entidadId?: string | null;
  resumen: string;
  cambios?: Cambios | null;
  /// Quién actúa. Sin sesión (un acceso fallido) sólo se anota la descripción.
  actor: { id: string; nombre: string } | { id?: undefined; nombre: string };
};

/**
 * Escribe una entrada de auditoría.
 *
 * Acepta el cliente de una transacción para que el registro se guarde o se
 * pierda junto con el cambio que describe: una auditoría que dice que algo pasó
 * cuando no pasó es peor que no tener auditoría.
 */
export async function auditar(
  cliente: Prisma.TransactionClient | typeof prisma,
  datos: DatosRegistro,
) {
  await cliente.auditoria.create({
    data: {
      accion: datos.accion,
      entidad: datos.entidad,
      entidadId: datos.entidadId ?? null,
      resumen: datos.resumen,
      cambios: datos.cambios ? JSON.stringify(datos.cambios) : null,
      empleadoId: datos.actor.id ?? null,
      actor: datos.actor.nombre,
    },
  });
}

/** Lee el JSON de cambios de una entrada, tolerando que esté mal formado. */
export function leerCambios(cambios: string | null): Cambios | null {
  if (!cambios) return null;
  try {
    return JSON.parse(cambios) as Cambios;
  } catch {
    return null;
  }
}

/** Nombres legibles de los campos auditados, para no mostrar "salarioBase". */
export const NOMBRES_DE_CAMPO: Record<string, string> = {
  nombre: 'Nombre',
  email: 'Correo',
  telefono: 'Teléfono',
  rol: 'Rol',
  equipoId: 'Equipo',
  salarioBase: 'Sueldo base',
  tasaComision: 'Comisión por venta',
  metaMensual: 'Meta mensual',
  activo: 'Activo',
  notas: 'Notas',
  precio: 'Precio',
  costo: 'Costo',
  stockMinimo: 'Stock mínimo',
  categoria: 'Categoría',
  descripcion: 'Descripción',
};

/** Campos cuyo valor es dinero, para formatearlos como tal al mostrarlos. */
export const CAMPOS_DE_DINERO = new Set(['salarioBase', 'metaMensual', 'precio', 'costo']);
/** Campos cuyo valor es una fracción que se muestra como porcentaje. */
export const CAMPOS_DE_PORCENTAJE = new Set(['tasaComision']);

/**
 * Cortes rápidos del registro.
 *
 * Los inicios de sesión son muchos y frecuentes, y ahogan visualmente lo que de
 * verdad se busca aquí: qué cambió y quién lo cambió. Separarlos en dos vistas
 * deja ambas cosas a un clic, sin esconder ninguna.
 */
export const GRUPOS_AUDITORIA: Record<string, { etiqueta: string; acciones: string[] }> = {
  cambios: {
    etiqueta: 'Cambios',
    acciones: [
      'empleado.crear',
      'empleado.actualizar',
      'equipo.crear',
      'producto.crear',
      'producto.actualizar',
      'comision.pagar',
      'pedido.anular',
    ],
  },
  accesos: {
    etiqueta: 'Accesos',
    acciones: [
      'empleado.acceso_otorgado',
      'empleado.acceso_revocado',
      'password.cambiada',
      'sesion.iniciada',
      'sesion.fallida',
    ],
  },
};
