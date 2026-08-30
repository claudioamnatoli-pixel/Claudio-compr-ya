'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { cerrarSesionAccion } from '@/app/login/acciones';
import { ROLES } from '@/lib/dominio';
import type { Permiso } from '@/lib/permisos';

type Usuario = { id: string; nombre: string; rol: string };

type Seccion = { href: string; etiqueta: string; icono: string; permiso: Permiso };

// Cada icono es el atributo `d` de un <path>; así se evita depender de una
// librería de iconos para media docena de dibujos.
const SECCIONES: Seccion[] = [
  { href: '/', etiqueta: 'Panel', permiso: 'panel.ver', icono: 'M3 12l9-9 9 9M5 10v10h14V10' },
  { href: '/leads', etiqueta: 'Prospectos', permiso: 'leads.ver', icono: 'M4 20a8 8 0 0116 0M12 12a4 4 0 100-8 4 4 0 000 8z' },
  { href: '/pedidos', etiqueta: 'Pedidos', permiso: 'pedidos.ver', icono: 'M6 2l1.5 4h9L18 2M4 6h16l-1.5 14h-13L4 6zM9 11h6' },
  { href: '/logistica', etiqueta: 'Logística', permiso: 'logistica.ver', icono: 'M3 7h11v9H3zM14 10h4l3 3v3h-7zM7 19a2 2 0 100-4 2 2 0 000 4zM18 19a2 2 0 100-4 2 2 0 000 4z' },
  { href: '/inventario', etiqueta: 'Inventario', permiso: 'inventario.ver', icono: 'M3 7l9-4 9 4-9 4-9-4zM3 12l9 4 9-4M3 17l9 4 9-4' },
  { href: '/equipo', etiqueta: 'Equipo', permiso: 'equipo.ver', icono: 'M8 11a3 3 0 100-6 3 3 0 000 6zM2 20a6 6 0 0112 0M16 11a3 3 0 100-6M22 20a6 6 0 00-4-5.6' },
  { href: '/campanas', etiqueta: 'Campañas', permiso: 'campanas.ver', icono: 'M3 10v4h4l5 4V6L7 10H3zM17 8a5 5 0 010 8' },
  { href: '/plantillas', etiqueta: 'Plantillas', permiso: 'plantillas.ver', icono: 'M4 4h16v12H8l-4 4V4zM8 9h8M8 12h5' },
  { href: '/auditoria', etiqueta: 'Auditoría', permiso: 'auditoria.ver', icono: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 004 0M9 12h6M9 16h4' },
];

function esActiva(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Enlaces({
  permisos,
  alNavegar,
}: {
  permisos: readonly Permiso[];
  alNavegar?: () => void;
}) {
  const pathname = usePathname();
  // El menú sólo muestra lo que la persona puede abrir. Ocultar no es proteger
  // —cada página y cada acción comprueban el permiso por su cuenta—, pero
  // evita callejones sin salida.
  const visibles = SECCIONES.filter((seccion) => permisos.includes(seccion.permiso));

  return (
    <nav className="flex flex-col gap-0.5">
      {visibles.map((seccion) => {
        const activa = esActiva(pathname, seccion.href);
        return (
          <Link
            key={seccion.href}
            href={seccion.href}
            onClick={alNavegar}
            aria-current={activa ? 'page' : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
              activa
                ? 'bg-marca-50 font-semibold text-marca-800'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.7}
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`h-4 w-4 shrink-0 ${activa ? 'text-marca-600' : 'text-slate-400'}`}
              aria-hidden="true"
            >
              <path d={seccion.icono} />
            </svg>
            {seccion.etiqueta}
          </Link>
        );
      })}
    </nav>
  );
}

function Marca() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-marca-600 text-sm font-bold text-white">
        CY
      </span>
      <span className="text-sm font-semibold tracking-tight text-slate-900">
        Compr-Ya
        <span className="block text-[11px] font-normal text-slate-500">Ventas por TikTok</span>
      </span>
    </Link>
  );
}

function FichaUsuario({ usuario }: { usuario: Usuario }) {
  const iniciales = usuario.nombre
    .split(' ')
    .slice(0, 2)
    .map((parte) => parte[0])
    .join('');

  return (
    <div className="border-t border-slate-200 pt-3">
      <Link
        href={`/equipo/${usuario.id}`}
        className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-slate-100"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
          {iniciales}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-slate-900">
            {usuario.nombre}
          </span>
          <span className="block text-[11px] text-slate-500">{ROLES.etiqueta(usuario.rol)}</span>
        </span>
      </Link>
      <div className="mt-1 flex gap-2 px-2">
        <Link href="/cambiar-password" className="text-[11px] text-slate-500 hover:text-slate-800">
          Cambiar contraseña
        </Link>
        <form action={cerrarSesionAccion}>
          <button type="submit" className="text-[11px] text-slate-500 hover:text-red-700">
            Cerrar sesión
          </button>
        </form>
      </div>
    </div>
  );
}

export function BarraLateral({
  usuario,
  permisos,
}: {
  usuario: Usuario;
  permisos: readonly Permiso[];
}) {
  return (
    <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white lg:block">
      <div className="sticky top-0 flex h-screen flex-col gap-6 p-4">
        <Marca />
        <Enlaces permisos={permisos} />
        <div className="mt-auto">
          <p className="mb-3 text-[11px] leading-relaxed text-slate-400">
            Datos de demostración. Ninguna venta, cliente o cobro de esta base es real.
          </p>
          <FichaUsuario usuario={usuario} />
        </div>
      </div>
    </aside>
  );
}

export function BarraSuperior({
  usuario,
  permisos,
}: {
  usuario: Usuario;
  permisos: readonly Permiso[];
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div className="sticky top-0 z-20 border-b border-slate-200 bg-white lg:hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <Marca />
        <button
          type="button"
          onClick={() => setAbierto((valor) => !valor)}
          aria-expanded={abierto}
          aria-label="Abrir menú de navegación"
          className="boton-secundario px-2.5 py-1.5"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            className="h-5 w-5"
            aria-hidden="true"
          >
            {abierto ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>
      {abierto ? (
        <div className="space-y-3 border-t border-slate-200 px-4 py-3">
          <Enlaces permisos={permisos} alNavegar={() => setAbierto(false)} />
          <FichaUsuario usuario={usuario} />
        </div>
      ) : null}
    </div>
  );
}
