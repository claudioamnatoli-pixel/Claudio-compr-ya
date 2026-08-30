/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Los Server Actions de este proyecto sólo reciben formularios pequeños.
    serverActions: { bodySizeLimit: '1mb' },
  },
};

export default nextConfig;
