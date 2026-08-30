import { CONFIG } from './config';

/**
 * Deja el teléfono en el formato que espera wa.me: sólo dígitos, con prefijo
 * de país. Acepta lo que la gente escribe de verdad: "+52 55 1234 5678",
 * "(55) 1234-5678", "55-1234-5678".
 */
export function normalizarTelefono(
  telefono: string,
  prefijoPais: string = CONFIG.prefijoPais,
): string {
  const soloDigitos = telefono.replace(/\D/g, '');
  if (!soloDigitos) return '';
  // Un 00 inicial es la forma internacional de marcar en muchos países.
  const sinCeros = soloDigitos.replace(/^0+/, '');
  if (sinCeros.startsWith(prefijoPais)) return sinCeros;
  return `${prefijoPais}${sinCeros}`;
}

/** Muestra el teléfono legible: "+52 5512345678". */
export function formatearTelefono(telefono: string): string {
  const normalizado = normalizarTelefono(telefono);
  if (!normalizado) return telefono;
  return `+${normalizado.slice(0, CONFIG.prefijoPais.length)} ${normalizado.slice(
    CONFIG.prefijoPais.length,
  )}`;
}

/**
 * Enlace que abre la conversación de WhatsApp con el mensaje ya escrito.
 * Funciona tanto en el móvil como en WhatsApp Web, y no requiere ninguna
 * integración de pago: es el enlace público `wa.me`.
 */
export function enlaceWhatsApp(telefono: string, mensaje?: string): string {
  const numero = normalizarTelefono(telefono);
  const base = `https://wa.me/${numero}`;
  return mensaje ? `${base}?text=${encodeURIComponent(mensaje)}` : base;
}

/** Variables que se pueden usar dentro de una plantilla, para documentar la UI. */
export const VARIABLES_PLANTILLA = [
  { clave: 'cliente', ejemplo: 'María', descripcion: 'Nombre del prospecto' },
  { clave: 'producto', ejemplo: 'Audífonos Pro', descripcion: 'Producto de interés' },
  { clave: 'precio', ejemplo: '$599.00', descripcion: 'Precio del producto' },
  { clave: 'vendedor', ejemplo: 'Ana', descripcion: 'Quien atiende el chat' },
  { clave: 'tienda', ejemplo: CONFIG.nombreTienda, descripcion: 'Nombre de la tienda' },
  { clave: 'ciudad', ejemplo: 'Guadalajara', descripcion: 'Ciudad del prospecto' },
  { clave: 'pedido', ejemplo: 'PED-0042', descripcion: 'Código del pedido' },
] as const;

/**
 * Sustituye `{{variable}}` por su valor. Las variables sin valor se dejan en
 * blanco en lugar de mostrar las llaves, para no mandarle "{{producto}}" a un
 * cliente por descuido.
 */
export function renderizarPlantilla(
  cuerpo: string,
  variables: Record<string, string | null | undefined>,
): string {
  return cuerpo.replace(/\{\{\s*(\w+)\s*\}\}/g, (_coincidencia, clave: string) => {
    const valor = variables[clave];
    return valor == null ? '' : String(valor);
  });
}
