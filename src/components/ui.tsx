import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Tono } from '@/lib/dominio';

// Las clases se escriben completas y no se arman por concatenación, porque
// Tailwind necesita ver la cadena literal para incluirla en el CSS final.
const CLASES_TONO: Record<Tono, string> = {
  gris: 'bg-slate-100 text-slate-700 ring-slate-200',
  azul: 'bg-blue-50 text-blue-700 ring-blue-200',
  verde: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  ambar: 'bg-amber-50 text-amber-800 ring-amber-200',
  rojo: 'bg-red-50 text-red-700 ring-red-200',
  morado: 'bg-violet-50 text-violet-700 ring-violet-200',
  marca: 'bg-marca-50 text-marca-700 ring-marca-200',
};

export function Etiqueta({
  children,
  tono = 'gris',
}: {
  children: ReactNode;
  tono?: Tono;
}) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${CLASES_TONO[tono]}`}
    >
      {children}
    </span>
  );
}

export function Tarjeta({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

export function TarjetaTitulo({
  titulo,
  descripcion,
  accion,
}: {
  titulo: string;
  descripcion?: string;
  accion?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">{titulo}</h2>
        {descripcion ? (
          <p className="mt-0.5 text-xs text-slate-500">{descripcion}</p>
        ) : null}
      </div>
      {accion}
    </div>
  );
}

export function EncabezadoPagina({
  titulo,
  descripcion,
  acciones,
}: {
  titulo: string;
  descripcion?: string;
  acciones?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          {titulo}
        </h1>
        {descripcion ? (
          <p className="mt-1 max-w-2xl text-sm text-slate-500">{descripcion}</p>
        ) : null}
      </div>
      {acciones ? <div className="flex flex-wrap gap-2">{acciones}</div> : null}
    </header>
  );
}

export function Indicador({
  titulo,
  valor,
  detalle,
  tono = 'gris',
}: {
  titulo: string;
  valor: string;
  detalle?: string;
  tono?: Tono;
}) {
  return (
    <Tarjeta className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {titulo}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
        {valor}
      </p>
      {detalle ? (
        <p className="mt-1 text-xs text-slate-500">
          <span
            className={`mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle ${CLASES_TONO[tono].split(' ')[0]}`}
          />
          {detalle}
        </p>
      ) : null}
    </Tarjeta>
  );
}

export function SinDatos({ mensaje }: { mensaje: string }) {
  return (
    <div className="px-5 py-10 text-center text-sm text-slate-500">{mensaje}</div>
  );
}

/** Barra de progreso hacia una meta. `fraccion` va de 0 a 1 (o más). */
export function Progreso({ fraccion }: { fraccion: number }) {
  const porcentaje = Math.min(Math.max(fraccion, 0), 1) * 100;
  const color =
    fraccion >= 1 ? 'bg-emerald-500' : fraccion >= 0.6 ? 'bg-marca-500' : 'bg-amber-500';
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${porcentaje}%` }} />
    </div>
  );
}

export function Tabla({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] text-left text-sm">{children}</table>
    </div>
  );
}

export function EncabezadoTabla({ columnas }: { columnas: string[] }) {
  return (
    <thead className="border-b border-slate-200 bg-slate-50/80">
      <tr>
        {columnas.map((columna) => (
          <th
            key={columna}
            scope="col"
            className="whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500"
          >
            {columna}
          </th>
        ))}
      </tr>
    </thead>
  );
}

export function FilaEnlace({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className="font-medium text-marca-700 hover:underline">
      {children}
    </Link>
  );
}
