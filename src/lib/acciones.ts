import { ZodError, z, type ZodTypeAny } from 'zod';
import { FACTOR_MONEDA } from './config';

/**
 * Resultado uniforme de un Server Action. Los formularios lo leen con
 * `useActionState` para mostrar el error sin recargar la página.
 */
export type ResultadoAccion =
  | {
      ok: true;
      mensaje?: string;
      /// Datos que la pantalla necesita mostrar tras la acción, como una
      /// contraseña provisional que sólo se enseña una vez.
      datos?: Record<string, string>;
    }
  | { ok: false; error: string };

export const exito = (mensaje?: string, datos?: Record<string, string>): ResultadoAccion => ({
  ok: true,
  mensaje,
  datos,
});
export const fallo = (error: string): ResultadoAccion => ({ ok: false, error });

/**
 * Valida un FormData contra un esquema de Zod y devuelve el error ya redactado
 * en español, listo para mostrarse.
 */
export function validar<T extends ZodTypeAny>(
  esquema: T,
  formData: FormData,
): { ok: true; datos: z.infer<T> } | { ok: false; error: string } {
  const crudo = Object.fromEntries(formData.entries());
  try {
    return { ok: true, datos: esquema.parse(crudo) as z.infer<T> };
  } catch (error) {
    if (error instanceof ZodError) {
      const primero = error.issues[0];
      const campo = primero?.path.join('.') ?? '';
      return { ok: false, error: campo ? `${campo}: ${primero.message}` : primero.message };
    }
    throw error;
  }
}

/** Campo de texto obligatorio que además recorta espacios sobrantes. */
export const textoObligatorio = (mensaje = 'Este dato es obligatorio') =>
  z
    .string({ required_error: mensaje })
    .transform((valor) => valor.trim())
    .refine((valor) => valor.length > 0, { message: mensaje });

/** Campo opcional: la cadena vacía de un formulario se convierte en null. */
export const textoOpcional = () =>
  z
    .string()
    .optional()
    .transform((valor) => {
      const limpio = valor?.trim();
      return limpio ? limpio : null;
    });

/**
 * Lee un importe tal como lo escribe una persona y lo guarda en la unidad
 * mínima de la moneda: "250000" → 250000 en guaraníes, "599.90" → 59990 donde
 * hay centavos.
 */
export const dineroEnUnidadMinima = (mensaje = 'Escribe un importe válido') =>
  z
    .string()
    .optional()
    .transform((valor) => Number(String(valor ?? '').replace(/[^0-9.-]/g, '')))
    .refine((numero) => Number.isFinite(numero) && numero >= 0, { message: mensaje })
    .transform((numero) => Math.round(numero * FACTOR_MONEDA));

export const enteroNoNegativo = (mensaje = 'Escribe un número válido') =>
  z
    .string()
    .optional()
    .transform((valor) => Number(String(valor ?? '').trim()))
    .refine((numero) => Number.isInteger(numero) && numero >= 0, { message: mensaje });
