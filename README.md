# Compr-Ya

Sistema de gestión para una tienda paraguaya que vende por **TikTok** y cierra por
**WhatsApp**.

Cubre el circuito completo de ese modelo de negocio: alguien ve un vivo o un aviso,
escribe, un vendedor lo atiende por WhatsApp, se arma el pedido, se descuenta el
inventario, un repartidor lo entrega y cobra, y al vendedor le toca su comisión.

Viene configurado para Paraguay: guaraníes, prefijo +595 y ciudades del país. Se
cambia desde `.env` sin tocar código.

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
| **Campañas** | Qué vivo o aviso trajo cada prospecto y cuánto dinero terminó generando. |
| **Accesos** | Inicio de sesión con contraseña y permisos por rol: cada persona ve sólo lo suyo. |

## Puesta en marcha

Necesitas Node.js 20 o superior. No hace falta instalar ninguna base de datos:
en desarrollo se usa SQLite, que es un solo archivo.

```bash
cp .env.example .env
npm run setup     # instala, genera el cliente, crea la base y la llena de ejemplos
npm run dev       # http://localhost:3000
```

Entra con `claudia@compr-ya.com.py` y la contraseña `demo1234`. La pantalla de
acceso lista las demás cuentas de ejemplo mientras estés en desarrollo.

### Comandos

| Comando | Para qué |
| --- | --- |
| `npm run dev` | Servidor de desarrollo. |
| `npm run build` / `npm start` | Compilar y servir en producción. |
| `npm run db:reset` | Borrar la base y volver a sembrarla desde cero. |
| `npm run db:studio` | Explorar los datos en una interfaz visual. |
| `npm run verificar` | Prueba el pedido completo, el manejo del dinero, los permisos y las contraseñas. |
| `npm run typecheck` / `npm run lint` | Comprobaciones de tipos y estilo. |

## Configuración

Todo se ajusta desde `.env` (ver `.env.example`):

- `SESSION_SECRET` — clave con la que se firman las sesiones. **En producción hay
  que poner una propia**: `openssl rand -base64 32`.
- `NEXT_PUBLIC_NOMBRE_TIENDA` — nombre que aparece en la interfaz y en las plantillas.
- `NEXT_PUBLIC_PREFIJO_PAIS` — prefijo telefónico sin `+`. Paraguay es `595`; los
  números que se escriben como `0981…` se normalizan solos.
- `NEXT_PUBLIC_MONEDA` y `NEXT_PUBLIC_LOCALE` — moneda y formato regional. Si cambias
  a una moneda con centavos, el sistema lo detecta y ajusta los importes solo.

## Quién ve qué

Cada persona entra con su correo y su contraseña, y ve sólo lo que su rol
necesita. Los permisos están en un único archivo, `src/lib/permisos.ts`, escrito
como una lista explícita por rol: un permiso concedido por descuido es fácil de
ver en una lista y difícil de ver en una jerarquía.

| Rol | Entra a | No puede |
| --- | --- | --- |
| **Administración** | Todo | — |
| **Líder de equipo** | Panel, prospectos de todo el equipo, pedidos, inventario, logística, campañas, plantillas, comisiones de su gente | Dar de alta personal ni cambiar sueldos |
| **Vendedor** | Panel, **sus** prospectos y los que no tienen responsable, pedidos, catálogo, campañas y plantillas | Ver la nómina, los sueldos ni los prospectos de otros vendedores |
| **Repartidor** | Logística y los datos de entrega de los pedidos | Todo lo demás |
| **Almacén** | Inventario y consulta de pedidos | El panel de ventas y los prospectos |

Tres detalles que importan:

- **El permiso se comprueba en el servidor, siempre.** El menú oculta lo que no
  corresponde, pero ocultar no protege: una petición se puede enviar a mano. Cada
  página y **cada una de las 22 acciones** comprueban el permiso por su cuenta, y
  `npm run verificar` falla si alguna acción nueva se queda sin guarda.
- **El recorte va en la consulta.** Un vendedor no ve los prospectos ajenos porque
  no se traen de la base, no porque se escondan al dibujar la página.
- **La venta se atribuye a quien la hace.** Un vendedor no puede poner el pedido
  —ni la comisión— a nombre de otra persona.

### Contraseñas

Se guardan con `scrypt`, cada una con su propia sal, y se comparan en tiempo
constante. La aplicación nunca guarda ni muestra la contraseña en claro. Al
cambiarla se cierran las demás sesiones abiertas con esa cuenta. Administración
puede dejar una contraseña provisional: quien entra con ella no llega a ninguna
pantalla hasta cambiarla.

## Cómo está armado

- **Next.js 15** (App Router) con **React 19** y TypeScript en modo estricto.
- **Server Components** para leer y **Server Actions** para escribir: no hay una capa
  de API intermedia ni estado de servidor duplicado en el cliente.
- **Prisma** sobre SQLite en desarrollo. Cambiar a PostgreSQL es cambiar el
  `provider` del `datasource` y la `DATABASE_URL`.
- **Tailwind CSS** con unas pocas clases de componente en `globals.css`.
- Interfaz enteramente en español, incluidos los nombres del código.

### Decisiones que conviene conocer

**El dinero se guarda como entero, en la unidad mínima de la moneda.** Los
decimales de coma flotante acumulan errores de redondeo que en un sistema de
ventas terminan por no cuadrar. Cuánto vale esa unidad mínima no se asume: se le
pregunta a `Intl`. El guaraní no tiene centavos, así que ₲ 250.000 se guarda como
`250000`; en una moneda con centavos, $599,00 se guarda como `59900`. Cambiar
`NEXT_PUBLIC_MONEDA` ajusta el factor, el formato y hasta el `step` de los campos
de importe, sin tocar código.

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

**El permiso se comprueba antes de dibujar.** El layout del panel resuelve qué
permiso pide la ruta y decide ahí mismo. Si se comprobara dentro de la página, la
respuesta ya habría empezado a enviarse y la redirección tendría que rematarla el
navegador; comprobando antes sale un `307` de verdad. Las páginas repiten la
comprobación de todos modos.

## Sobre WhatsApp

La aplicación **no envía mensajes automáticamente**. Prepara el texto y abre la
conversación mediante el enlace público `wa.me`, que funciona en el móvil y en
WhatsApp Web sin API de pago, sin número verificado y sin aprobación previa. Al
pulsar el botón se abre el chat y, a la vez, el mensaje queda registrado en el
historial del prospecto.

Si más adelante quieres envío automático, el punto de integración es
`registrarMensaje()` en `src/app/leads/acciones.ts`: ahí se llamaría a la API de
WhatsApp Business en lugar de sólo guardar el registro.

## Sobre TikTok en Paraguay

En Paraguay no está disponible TikTok Shop, así que la venta ocurre donde
realmente ocurre: **en los vivos y con avisos pagados**, y se cierra por WhatsApp.
El sistema está armado alrededor de eso y no depende de ninguna integración con
TikTok.

La atribución se hace registrando cada vivo o aviso como una campaña y asociando
a ella los prospectos que llegan. Es trabajo manual, pero es el que se puede
sostener desde el primer día y responde la pregunta que importa: qué contenido
trae plata y cuál sólo trae vistas. En la pantalla de campañas se ve, por cada
una, cuántos prospectos generó, cuántos cerraron y cuántas veces se recuperó la
inversión.

Si algún día TikTok Shop llega al país, el modelo `Campana` es el lugar natural
para colgar el identificador real de la campaña o del video.

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
  middleware.ts        Anota la ruta pedida para que el layout compruebe permisos
  lib/
    auth.ts            Sesiones y cookies
    password.ts        Hash y verificación de contraseñas
    permisos.ts        Qué puede hacer cada rol
    guardias.ts        Guardas de páginas y de Server Actions
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

- **Cambiar las contraseñas de ejemplo y `SESSION_SECRET`.** Las cuentas del seed
  comparten una contraseña conocida; sirven para probar, no para operar.
- **Servir por HTTPS.** La cookie de sesión se marca como `secure` en producción,
  así que sin HTTPS nadie podrá iniciar sesión.
- **Base de datos de verdad.** SQLite está bien para desarrollo; para varios
  usuarios simultáneos toca PostgreSQL. Es cambiar el `provider` y la
  `DATABASE_URL`.
- **Respaldos** de la base.
- **Datos personales.** Guardas nombres, teléfonos y direcciones de clientes:
  revisá qué exige la normativa paraguaya de protección de datos personales.
- **Registro de auditoría.** Hoy se sabe quién movió el inventario y quién escribió
  cada mensaje, pero no queda rastro de quién cambió un sueldo o un precio.
