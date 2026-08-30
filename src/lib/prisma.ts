import { PrismaClient } from '@prisma/client';

// En desarrollo Next.js recarga los módulos en cada cambio. Sin este singleton
// se abriría una conexión nueva por recarga hasta agotar el pool.
const globalParaPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalParaPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalParaPrisma.prisma = prisma;
}
