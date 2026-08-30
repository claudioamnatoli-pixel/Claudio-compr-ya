/**
 * Qué puede hacer cada rol.
 *
 * Este archivo es la única fuente de verdad: las páginas, los Server Actions y
 * el menú de navegación preguntan aquí. Es deliberadamente aburrido y explícito
 * —una lista por rol, sin herencia ni comodines— porque un permiso concedido
 * por descuido es difícil de ver en una jerarquía y muy fácil de ver en una
 * lista.
 *
 * No importa nada del servidor, para que el menú del cliente también lo use.
 */

export const PERMISOS = [
  'panel.ver',

  'leads.ver',
  'leads.gestionar',
  /// Ver los prospectos de todo el equipo, no sólo los propios.
  'leads.verTodos',

  'pedidos.ver',
  'pedidos.crear',
  /// Confirmar, cancelar, devolver: mover el pedido de estado.
  'pedidos.avanzar',

  'inventario.ver',
  'inventario.gestionar',

  'logistica.ver',
  'logistica.gestionar',

  /// Ver la lista de personal.
  'equipo.ver',
  /// Ver sueldos y comisiones ajenas.
  'equipo.verRemuneracion',
  /// Dar de alta, editar condiciones, pagar comisiones, crear equipos.
  'equipo.gestionar',
  'asistencia.registrar',

  'campanas.ver',
  'campanas.gestionar',

  'plantillas.ver',
  'plantillas.gestionar',
] as const;

export type Permiso = (typeof PERMISOS)[number];

const VENDEDOR: Permiso[] = [
  'panel.ver',
  'leads.ver',
  'leads.gestionar',
  'pedidos.ver',
  'pedidos.crear',
  'pedidos.avanzar',
  'inventario.ver',
  'logistica.ver',
  'campanas.ver',
  'plantillas.ver',
];

const PERMISOS_POR_ROL: Record<string, readonly Permiso[]> = {
  // Administración puede todo.
  ADMIN: PERMISOS,

  // Un líder dirige la venta de su equipo: ve los prospectos y las comisiones
  // de su gente, pero no toca sueldos ni da de alta personal.
  LIDER: [
    ...VENDEDOR,
    'leads.verTodos',
    'inventario.gestionar',
    'logistica.gestionar',
    'equipo.ver',
    'equipo.verRemuneracion',
    'asistencia.registrar',
    'campanas.gestionar',
    'plantillas.gestionar',
  ],

  // Un vendedor trabaja sus propios prospectos y cierra pedidos. No ve la lista
  // de personal ni lo que cobran los demás.
  VENDEDOR,

  // Reparto sólo necesita su ruta y los datos de entrega del pedido.
  REPARTIDOR: ['logistica.ver', 'logistica.gestionar', 'pedidos.ver'],

  // Almacén mueve stock; no necesita ver el dinero de las ventas.
  ALMACEN: ['inventario.ver', 'inventario.gestionar', 'pedidos.ver', 'logistica.ver'],
};

/** A dónde llevar a cada rol al entrar: lo primero que necesita ver. */
const INICIO_POR_ROL: Record<string, string> = {
  ADMIN: '/',
  LIDER: '/',
  VENDEDOR: '/',
  REPARTIDOR: '/logistica',
  ALMACEN: '/inventario',
};

export function permisosDe(rol: string): readonly Permiso[] {
  return PERMISOS_POR_ROL[rol] ?? [];
}

export function puede(rol: string | null | undefined, permiso: Permiso): boolean {
  if (!rol) return false;
  return permisosDe(rol).includes(permiso);
}

/** Página de inicio del rol. Se usa tras iniciar sesión y en redirecciones. */
export function inicioDe(rol: string | null | undefined): string {
  if (!rol) return '/login';
  return INICIO_POR_ROL[rol] ?? '/';
}

/**
 * ¿Puede ver la ficha de esta persona? Cualquiera puede ver la suya; el resto
 * de fichas requieren permiso sobre el personal.
 */
export function puedeVerEmpleado(
  usuario: { id: string; rol: string },
  empleadoId: string,
): boolean {
  return usuario.id === empleadoId || puede(usuario.rol, 'equipo.ver');
}

/**
 * Permiso que exige cada ruta del panel.
 *
 * Existe para poder comprobar el acceso antes de empezar a dibujar la página:
 * si se comprueba dentro de la página, la respuesta ya salió en streaming y la
 * redirección tiene que rematarla el navegador. Comprobando aquí sale un 307 de
 * verdad.
 *
 * El orden importa: las rutas más específicas van primero.
 */
const PERMISO_POR_RUTA: readonly (readonly [string, Permiso])[] = [
  ['/leads/nuevo', 'leads.gestionar'],
  ['/pedidos/nuevo', 'pedidos.crear'],
  ['/inventario/nuevo', 'inventario.gestionar'],
  ['/equipo/nuevo', 'equipo.gestionar'],
  ['/leads', 'leads.ver'],
  ['/pedidos', 'pedidos.ver'],
  ['/inventario', 'inventario.ver'],
  ['/logistica', 'logistica.ver'],
  ['/equipo', 'equipo.ver'],
  ['/campanas', 'campanas.ver'],
  ['/plantillas', 'plantillas.ver'],
];

/** Devuelve el permiso que pide una ruta, o null si no exige ninguno. */
export function permisoDeRuta(ruta: string): Permiso | null {
  if (ruta === '/') return 'panel.ver';

  // La ficha de una persona (/equipo/<id>) es el caso especial: cualquiera
  // puede ver la suya, así que la decisión la toma la propia página.
  if (ruta !== '/equipo/nuevo' && /^\/equipo\/[^/]+$/.test(ruta)) return null;

  for (const [prefijo, permiso] of PERMISO_POR_RUTA) {
    if (ruta === prefijo || ruta.startsWith(`${prefijo}/`)) return permiso;
  }
  return null;
}
