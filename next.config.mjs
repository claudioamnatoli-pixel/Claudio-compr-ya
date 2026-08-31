/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      // Los Server Actions de este proyecto sólo reciben formularios pequeños.
      bodySizeLimit: '1mb',

      // Next rechaza un Server Action cuando el dominio desde el que se envía no
      // coincide con el del servidor: es lo que impide que otro sitio dispare
      // acciones en tu nombre. Detrás de un proxy —GitHub Codespaces sirve la
      // aplicación en *.app.github.dev mientras el servidor se cree en
      // localhost— esa comprobación da un falso positivo y no se puede ni
      // iniciar sesión. Se autorizan sólo esos dominios, no cualquiera.
      allowedOrigins: [
        'localhost:3000',
        '*.app.github.dev',
        '*.github.dev',
        // Para cualquier otro proxy, se añade su dominio en esta variable:
        // ORIGENES_PERMITIDOS="mi-tunel.example.com,otro.example.com"
        ...(process.env.ORIGENES_PERMITIDOS?.split(',')
          .map((dominio) => dominio.trim())
          .filter(Boolean) ?? []),
      ],
    },
  },
};

export default nextConfig;
