import type { Metadata } from 'next';
import './globals.css';
import { BarraLateral, BarraSuperior } from '@/components/navegacion';
import { CONFIG } from '@/lib/config';

export const metadata: Metadata = {
  title: {
    default: `${CONFIG.nombreTienda} · Operación de ventas por TikTok`,
    template: `%s · ${CONFIG.nombreTienda}`,
  },
  description:
    'Sistema de gestión para una tienda que vende por TikTok: prospectos, WhatsApp, inventario, pedidos, logística de entrega y equipo de ventas.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <div className="flex min-h-screen flex-col lg:flex-row">
          <BarraSuperior />
          <BarraLateral />
          <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
