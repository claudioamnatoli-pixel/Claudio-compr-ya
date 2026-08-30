// Fuente de verdad de los catálogos del negocio.
//
// SQLite no tiene enums, así que estos objetos definen qué valores son válidos
// en cada campo de tipo "estado", cómo se llaman en pantalla y con qué color se
// pintan. Cualquier valor nuevo se agrega aquí y el resto de la aplicación lo
// recoge automáticamente.

export type Tono =
  | 'gris'
  | 'azul'
  | 'verde'
  | 'ambar'
  | 'rojo'
  | 'morado'
  | 'marca';

export type Opcion = { valor: string; etiqueta: string; tono: Tono };

function catalogo<T extends Record<string, { etiqueta: string; tono: Tono }>>(
  definicion: T,
) {
  const valores = Object.keys(definicion) as (keyof T & string)[];
  return {
    definicion,
    valores,
    opciones: valores.map<Opcion>((valor) => ({
      valor,
      etiqueta: definicion[valor].etiqueta,
      tono: definicion[valor].tono,
    })),
    etiqueta: (valor: string) => definicion[valor]?.etiqueta ?? valor,
    tono: (valor: string): Tono => definicion[valor]?.tono ?? 'gris',
    esValido: (valor: string) => valor in definicion,
  };
}

export const ROLES = catalogo({
  ADMIN: { etiqueta: 'Administración', tono: 'morado' },
  LIDER: { etiqueta: 'Líder de equipo', tono: 'marca' },
  VENDEDOR: { etiqueta: 'Vendedor', tono: 'azul' },
  REPARTIDOR: { etiqueta: 'Repartidor', tono: 'ambar' },
  ALMACEN: { etiqueta: 'Almacén', tono: 'gris' },
});

export const ESTADOS_ASISTENCIA = catalogo({
  PRESENTE: { etiqueta: 'Presente', tono: 'verde' },
  TARDE: { etiqueta: 'Retardo', tono: 'ambar' },
  AUSENTE: { etiqueta: 'Falta', tono: 'rojo' },
  PERMISO: { etiqueta: 'Permiso', tono: 'azul' },
  DESCANSO: { etiqueta: 'Descanso', tono: 'gris' },
});

export const ESTADOS_COMISION = catalogo({
  PENDIENTE: { etiqueta: 'Pendiente', tono: 'gris' },
  APROBADA: { etiqueta: 'Aprobada', tono: 'azul' },
  PAGADA: { etiqueta: 'Pagada', tono: 'verde' },
  CANCELADA: { etiqueta: 'Cancelada', tono: 'rojo' },
});

export const TIPOS_MOVIMIENTO = catalogo({
  ENTRADA: { etiqueta: 'Entrada', tono: 'verde' },
  SALIDA: { etiqueta: 'Salida', tono: 'azul' },
  AJUSTE: { etiqueta: 'Ajuste', tono: 'ambar' },
  DEVOLUCION: { etiqueta: 'Devolución', tono: 'morado' },
  MERMA: { etiqueta: 'Merma', tono: 'rojo' },
});

/// Movimientos que suman al stock. El resto resta.
export const MOVIMIENTOS_QUE_SUMAN = new Set(['ENTRADA', 'DEVOLUCION']);

export const TIPOS_CAMPANA = catalogo({
  VIDEO: { etiqueta: 'Video orgánico', tono: 'marca' },
  LIVE: { etiqueta: 'Transmisión en vivo', tono: 'rojo' },
  ADS: { etiqueta: 'Anuncio pagado', tono: 'morado' },
  PERFIL: { etiqueta: 'Perfil / bio', tono: 'gris' },
});

export const ORIGENES_LEAD = catalogo({
  TIKTOK_VIDEO: { etiqueta: 'Video de TikTok', tono: 'marca' },
  TIKTOK_LIVE: { etiqueta: 'TikTok en vivo', tono: 'rojo' },
  TIKTOK_ADS: { etiqueta: 'Anuncio de TikTok', tono: 'morado' },
  PERFIL: { etiqueta: 'Enlace del perfil', tono: 'azul' },
  REFERIDO: { etiqueta: 'Referido', tono: 'verde' },
  OTRO: { etiqueta: 'Otro', tono: 'gris' },
});

export const ESTADOS_LEAD = catalogo({
  NUEVO: { etiqueta: 'Nuevo', tono: 'azul' },
  CONTACTADO: { etiqueta: 'Contactado', tono: 'morado' },
  EN_CONVERSACION: { etiqueta: 'En conversación', tono: 'marca' },
  COTIZADO: { etiqueta: 'Cotizado', tono: 'ambar' },
  GANADO: { etiqueta: 'Ganado', tono: 'verde' },
  PERDIDO: { etiqueta: 'Perdido', tono: 'rojo' },
});

/// Orden del embudo, de arriba abajo. Se usa en el tablero de leads.
export const EMBUDO_LEAD = [
  'NUEVO',
  'CONTACTADO',
  'EN_CONVERSACION',
  'COTIZADO',
  'GANADO',
  'PERDIDO',
] as const;

export const ESTADOS_PEDIDO = catalogo({
  PENDIENTE: { etiqueta: 'Pendiente', tono: 'gris' },
  CONFIRMADO: { etiqueta: 'Confirmado', tono: 'azul' },
  PREPARANDO: { etiqueta: 'Preparando', tono: 'morado' },
  ENVIADO: { etiqueta: 'Enviado', tono: 'ambar' },
  ENTREGADO: { etiqueta: 'Entregado', tono: 'verde' },
  CANCELADO: { etiqueta: 'Cancelado', tono: 'rojo' },
  DEVUELTO: { etiqueta: 'Devuelto', tono: 'rojo' },
});

/// Transiciones permitidas. Evita que un pedido entregado vuelva a "pendiente".
export const TRANSICIONES_PEDIDO: Record<string, string[]> = {
  PENDIENTE: ['CONFIRMADO', 'CANCELADO'],
  CONFIRMADO: ['PREPARANDO', 'CANCELADO'],
  PREPARANDO: ['ENVIADO', 'CANCELADO'],
  ENVIADO: ['ENTREGADO', 'DEVUELTO'],
  ENTREGADO: ['DEVUELTO'],
  CANCELADO: [],
  DEVUELTO: [],
};

/// Estados en los que el pedido ya no genera trabajo operativo.
export const PEDIDOS_CERRADOS = new Set(['ENTREGADO', 'CANCELADO', 'DEVUELTO']);
/// Estados que cuentan como venta efectiva para métricas y comisiones.
export const PEDIDOS_VENDIDOS = new Set([
  'CONFIRMADO',
  'PREPARANDO',
  'ENVIADO',
  'ENTREGADO',
]);

export const METODOS_PAGO = catalogo({
  CONTRA_ENTREGA: { etiqueta: 'Contra entrega', tono: 'ambar' },
  TRANSFERENCIA: { etiqueta: 'Transferencia', tono: 'azul' },
  TARJETA: { etiqueta: 'Tarjeta', tono: 'morado' },
});

export const ESTADOS_ENVIO = catalogo({
  POR_ASIGNAR: { etiqueta: 'Por asignar', tono: 'gris' },
  ASIGNADO: { etiqueta: 'Asignado', tono: 'azul' },
  EN_RUTA: { etiqueta: 'En ruta', tono: 'ambar' },
  ENTREGADO: { etiqueta: 'Entregado', tono: 'verde' },
  FALLIDO: { etiqueta: 'Entrega fallida', tono: 'rojo' },
  REPROGRAMADO: { etiqueta: 'Reprogramado', tono: 'morado' },
  DEVUELTO: { etiqueta: 'Devuelto', tono: 'rojo' },
});

export const DIRECCIONES_MENSAJE = catalogo({
  SALIENTE: { etiqueta: 'Enviado', tono: 'marca' },
  ENTRANTE: { etiqueta: 'Recibido', tono: 'gris' },
});
