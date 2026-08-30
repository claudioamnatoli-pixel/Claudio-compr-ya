// Configuración pública de la tienda, con valores por defecto razonables para
// que el proyecto arranque sin tener que tocar el archivo .env.

export const CONFIG = {
  nombreTienda: process.env.NEXT_PUBLIC_NOMBRE_TIENDA || 'Compr-Ya',
  /// Prefijo telefónico del país, sin "+". Se antepone a los números locales
  /// para armar los enlaces de WhatsApp.
  prefijoPais: process.env.NEXT_PUBLIC_PREFIJO_PAIS || '52',
  moneda: process.env.NEXT_PUBLIC_MONEDA || 'MXN',
  locale: process.env.NEXT_PUBLIC_LOCALE || 'es-MX',
} as const;
