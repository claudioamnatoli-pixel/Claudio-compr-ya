import type { Metadata } from 'next';
import './globals.css';
import { CONFIG } from '@/lib/config';

export const metadata: Metadata = {
  title: {
    default: `${CONFIG.nombreTienda} · Ventas por TikTok`,
    template: `%s · ${CONFIG.nombreTienda}`,
  },
  description:
    'Sistema de gestión para una tienda que vende por TikTok: prospectos, WhatsApp, inventario, pedidos, logística de entrega y equipo de ventas.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
