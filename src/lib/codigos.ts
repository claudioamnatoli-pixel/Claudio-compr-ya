import { prisma } from './prisma';

/**
 * Genera el siguiente código legible de una serie ("PED-0043", "LEAD-0128").
 *
 * Se calcula a partir del último código existente en lugar de un contador
 * aparte, para que la numeración siga siendo correcta si se borra la base de
 * datos y se vuelve a sembrar.
 */
async function siguienteCodigo(
  prefijo: string,
  ultimoCodigo: string | undefined,
): Promise<string> {
  const ultimoNumero = ultimoCodigo
    ? Number.parseInt(ultimoCodigo.replace(`${prefijo}-`, ''), 10)
    : 0;
  const siguiente = Number.isFinite(ultimoNumero) ? ultimoNumero + 1 : 1;
  return `${prefijo}-${String(siguiente).padStart(4, '0')}`;
}

export async function generarCodigoPedido(): Promise<string> {
  const ultimo = await prisma.pedido.findFirst({
    orderBy: { codigo: 'desc' },
    select: { codigo: true },
  });
  return siguienteCodigo('PED', ultimo?.codigo);
}

export async function generarCodigoLead(): Promise<string> {
  const ultimo = await prisma.lead.findFirst({
    orderBy: { codigo: 'desc' },
    select: { codigo: true },
  });
  return siguienteCodigo('LEAD', ultimo?.codigo);
}
