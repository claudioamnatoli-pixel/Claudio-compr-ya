# Compr-Ya

Sistema de gestión para una tienda que vende por **TikTok** y cierra por **WhatsApp**.

Cubre el circuito completo de ese modelo de negocio: alguien ve un video, escribe,
un vendedor lo atiende por WhatsApp, se arma el pedido, se descuenta el inventario,
un repartidor lo entrega y cobra, y al vendedor le toca su comisión.

> Los datos que trae de fábrica son **ficticios**, pensados para poder recorrer el
> sistema antes de tener la primera venta real. Ningún cliente, cobro o campaña de
> la base es real.

## Qué incluye

| Módulo | Qué resuelve |
| --- | --- |
| **Panel** | Ventas del mes contra el anterior, conversión, embudo, campañas que más venden, stock por reponer. |
| **Prospectos** | Cada persona que escribió por TikTok, con su etapa, responsable y campaña de origen. |
| **WhatsApp** | Plantillas con variables (`{{cliente}}`, `{{producto}}`…), redactor que abre el chat con el texto listo e historial de la conversación. |
| **Inventario** | Catálogo, costos, márgenes, alertas de stock mínimo e historial auditable de cada movimiento. |
| **Pedidos** | Armado del pedido con total en vivo, estados con transiciones validadas y efectos automáticos sobre stock y comisión. |
| **Logística** | Asignación de repartidor y zona, salida a ruta, entregas fallidas, reprogramaciones y efectivo cobrado contra entrega. |
| **Equipo** | Alta de personal, equipos con líder y meta, asistencia, ranking de venta y pago de comisiones. |
| **Campañas** | Qué video, live o anuncio trajo cada prospecto y cuánto dinero terminó generando. |

## Puesta en marcha

Necesitas Node.js 20 o superior. No hace falta instalar ninguna base de datos:
en desarrollo se usa SQLite, que es un solo archivo.

```bash
cp .env.example .env
npm run setup     # instala, genera el cliente, crea la base y la llena de ejemplos
npm run dev       # http://localhost:3000
```

### Comandos

| Comando | Para qué |
| --- | --- |
| `npm run dev` | Servidor de desarrollo. |
| `npm run build` / `npm start` | Compilar y servir en producción. |
| `npm run db:reset` | Borrar la base y volver a sembrarla desde cero. |
| `npm run db:studio` | Explorar los datos en una interfaz visual. |
| `npm run verificar` | Prueba el flujo completo de un pedido contra la base real. |
| `npm run typecheck` / `npm run lint` | Comprobaciones de tipos y estilo. |

## Configuración

Todo se ajusta desde `.env` (ver `.env.example`):

- `NEXT_PUBLIC_NOMBRE_TIENDA` — nombre que aparece en la interfaz y en las plantillas.
- `NEXT_PUBLIC_PREFIJO_PAIS` — prefijo telefónico sin `+`, usado para armar los enlaces de WhatsApp.
- `NEXT_PUBLIC_MONEDA` y `NEXT_PUBLIC_LOCALE` — moneda y formato regional de los importes.

## Cómo está armado

- **Next.js 15** (App Router) con **React 19** y TypeScript en modo estricto.
- **Server Components** para leer y **Server Actions** para escribir: no hay una capa
  de API intermedia ni estado de servidor duplicado en el cliente.
- **Prisma** sobre SQLite en desarrollo. Cambiar a PostgreSQL es cambiar el
  `provider` del `datasource` y la `DATABASE_URL`.
- **Tailwind CSS** con unas pocas clases de componente en `globals.css`.
- Interfaz enteramente en español, incluidos los nombres del código.

### Decisiones que conviene conocer

**El dinero se guarda en centavos.** Todos los importes son enteros en la unidad
mínima de la moneda; los decimales de coma flotante acumulan errores de redondeo
que en un sistema de ventas terminan por no cuadrar. Para mostrarlos se usa
`formatearDinero()` de `src/lib/formato.ts`.

**Los catálogos viven en un solo archivo.** SQLite no soporta enums, así que los
estados son cadenas. `src/lib/dominio.ts` define qué valores son válidos, cómo se
llaman en pantalla y de qué color se pintan. Añadir un estado nuevo se hace ahí y
el resto de la aplicación lo recoge solo.

**El inventario nunca se escribe a mano.** Todo cambio de stock pasa por
`aplicarMovimiento()` (`src/lib/inventario.ts`), que ajusta las existencias y deja
el registro en el historial dentro de la misma transacción. Así las dos cosas no
se pueden separar.

**Los estados del pedido tienen reglas.** `TRANSICIONES_PEDIDO` define qué pasos
son válidos, y `transicionarPedido()` (`src/lib/pedidos.ts`) aplica los efectos:
el stock sale al confirmar y vuelve si se cancela o se devuelve, la comisión se
crea, se aprueba o se anula, y el envío se mantiene sincronizado. Pedidos y
logística llaman a esa misma función, así que las dos vistas no pueden
contradecirse.

**El precio se congela en el pedido.** `ItemPedido` guarda el precio del momento de
la venta en lugar de leerlo del producto, para que un cambio de tarifa no reescriba
el histórico.

## Sobre WhatsApp

La aplicación **no envía mensajes automáticamente**. Prepara el texto y abre la
conversación mediante el enlace público `wa.me`, que funciona en el móvil y en
WhatsApp Web sin API de pago, sin número verificado y sin aprobación previa. Al
pulsar el botón se abre el chat y, a la vez, el mensaje queda registrado en el
historial del prospecto.

Si más adelante quieres envío automático, el punto de integración es
`registrarMensaje()` en `src/app/leads/acciones.ts`: ahí se llamaría a la API de
WhatsApp Business en lugar de sólo guardar el registro.

## Sobre TikTok Shop

Este proyecto no habla todavía con la API oficial de TikTok Shop, porque para eso
hace falta una cuenta de vendedor aprobada y credenciales de desarrollador. La
atribución de ventas se hace por campaña registrada a mano, que es lo que se puede
sostener desde el día uno. El modelo `Campana` es el lugar natural para colgar
después el identificador real de la campaña o del video.

## Estructura

```
prisma/
  schema.prisma        Modelo de datos
  seed.ts              Datos de ejemplo
scripts/
  verificar-flujo.ts   Prueba del ciclo de vida de un pedido
src/
  app/                 Rutas; cada módulo con su acciones.ts
  components/          Interfaz reutilizable
  lib/
    dominio.ts         Estados válidos, etiquetas y colores
    inventario.ts      Movimientos de stock
    pedidos.ts         Transiciones de pedido y sus efectos
    consultas.ts       Métricas del negocio
    formato.ts         Dinero, fechas y porcentajes
    whatsapp.ts        Enlaces wa.me y plantillas
```

## Antes de usarlo con ventas reales

Este proyecto es una base funcional, no un producto terminado. Lo que falta para
producción:

- **Autenticación y permisos.** Ahora mismo cualquiera que abra la aplicación ve y
  edita todo. Un vendedor no debería poder cambiar sueldos.
- **Base de datos de verdad.** SQLite está bien para desarrollo; para varios
  usuarios simultáneos toca PostgreSQL.
- **Respaldos** de la base.
- **Datos personales.** Guardas nombres, teléfonos y direcciones de clientes:
  revisa qué exige la ley de protección de datos de tu país.
