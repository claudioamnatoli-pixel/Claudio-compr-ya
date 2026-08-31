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
| **Auditoría** | Quién cambió un sueldo, un precio o una comisión, y quién intentó entrar sin conseguirlo. |

## Cómo hacerlo funcionar

Tres caminos, del que menos pide al que más. Todos terminan en el mismo
programa, con los mismos datos de ejemplo.

### 1. En el navegador, sin instalar nada (recomendado)

GitHub puede correr el proyecto por vos. No hace falta instalar programas ni
crear cuentas nuevas: alcanza con la de GitHub que ya usás para este
repositorio.

Abrí este enlace y pulsá el botón verde:

**https://codespaces.new/claudioamnatoli-pixel/Claudio-compr-ya/tree/claude/tiktok-ecommerce-program-5y1bcr**

Se instala todo, se crea la base, se cargan los datos de ejemplo, arranca el
servidor y se abre solo en una pestaña del navegador. No hay que escribir nada.
Entrá con `claudia@compr-ya.com.py` y la contraseña `demo1234`.

Si la pestaña no se abre sola, buscá el panel **Ports** y hacé clic en el ícono
del globo, en el puerto 3000.

**Para saber si un entorno tiene el código actual:** la pantalla de acceso
muestra la versión bajo el nombre de la tienda. Si no aparece ninguna versión,
ese entorno está corriendo código anterior y hay que crear uno nuevo.

La configuración está en `.devcontainer/devcontainer.json`. Los codespaces se
suspenden solos cuando no se usan; volver a abrirlo retoma donde quedó.

**Si algo no anda:** en la terminal del codespace, `npm run preparar` deja todo
listo de nuevo sin borrar nada, y `git pull` trae los últimos cambios (después
hay que reiniciar el servidor con `Ctrl+C` y `npm run dev`, porque la
configuración de Next no se recarga sola).

### 2. En tu computadora, con un comando

Necesitás [Node.js](https://nodejs.org) 18 o superior y Git.

```bash
git clone https://github.com/claudioamnatoli-pixel/Claudio-compr-ya.git
cd Claudio-compr-ya
npm run empezar
```

`npm run empezar` crea el archivo de configuración con una clave de sesión
propia, instala las dependencias, prepara la base de datos, la llena de ejemplos
y arranca el servidor en http://localhost:3000. Es seguro repetirlo: cada paso
comprueba antes si hace falta, y nunca pisa datos existentes.

Para apagarlo, `Ctrl+C`. Para volver a arrancarlo, `npm run dev`.

### 3. En línea, con una dirección web propia

Para que quede accesible desde cualquier teléfono hace falta un hosting y una
base PostgreSQL: los pasos están en «Ponerlo en línea», más abajo.

### Comandos

| Comando | Para qué |
| --- | --- |
| `npm run empezar` | Preparar todo y arrancar. Es lo único que hace falta la primera vez. |
| `npm run dev` | Arrancar, cuando ya está preparado. |
| `npm run preparar` | Sólo preparar, sin arrancar. Es lo que corre Codespaces al crearse. |
| `npm run build` / `npm start` | Compilar y servir en producción. |
| `npm run db:reset` | Borrar la base y volver a sembrarla desde cero. |
| `npm run db:seed -- --solo-si-vacia` | Sembrar sólo si la base está vacía; es lo que corre al desplegar. |
| `npm run db:studio` | Explorar los datos en una interfaz visual. |
| `npm run verificar` | Probar el pedido completo, el dinero, los permisos, las contraseñas y la auditoría. |
| `npm run typecheck` / `npm run lint` | Comprobaciones de tipos y estilo. |

## Configuración

Todo se ajusta desde `.env`, que `npm run empezar` crea por vos a partir de
`.env.example`:

- `SESSION_SECRET` — clave con la que se firman las sesiones. Se genera una propia
  al preparar el proyecto; en un servidor, poné otra distinta.
- `NEXT_PUBLIC_NOMBRE_TIENDA` — nombre que aparece en la interfaz y en las plantillas.
- `NEXT_PUBLIC_PREFIJO_PAIS` — prefijo telefónico sin `+`. Paraguay es `595`; los
  números que se escriben como `0981…` se normalizan solos.
- `NEXT_PUBLIC_MONEDA` y `NEXT_PUBLIC_LOCALE` — moneda y formato regional. Si cambiás
  a una moneda con centavos, el sistema lo detecta y ajusta los importes solo.

## Ponerlo en línea

Para que el programa tenga una dirección web propia, accesible desde cualquier
teléfono. Se hace entero desde el navegador, sin terminal, pero hacen falta dos
cuentas gratuitas: una de hosting y una de base de datos.

> Si el registro en alguno de estos servicios no te deja avanzar, usá el camino
> de Codespaces de más arriba: corre el mismo programa, sin cuentas nuevas.

**1. Base de datos.** Creá una base PostgreSQL gratuita en
[neon.com](https://neon.com) o [supabase.com](https://supabase.com) y copiá la
cadena de conexión, que empieza por `postgresql://`.

**2. Hosting.** Entrá a [vercel.com](https://vercel.com) con tu cuenta de
GitHub, elegí *Add New → Project*, importá este repositorio y seleccioná la
rama. Antes de darle a *Deploy*, agregá estas variables de entorno:

| Variable | Valor |
| --- | --- |
| `DATABASE_URL` | La cadena de conexión del paso 1 |
| `SESSION_SECRET` | Una frase larga y propia, mínimo 16 caracteres |
| `NEXT_PUBLIC_MONEDA` | `PYG` |
| `NEXT_PUBLIC_LOCALE` | `es-PY` |
| `NEXT_PUBLIC_PREFIJO_PAIS` | `595` |
| `NEXT_PUBLIC_NOMBRE_TIENDA` | El nombre de tu tienda |

**3. Listo.** El primer despliegue crea las tablas y carga los datos de ejemplo
por su cuenta; entrás con `claudia@compr-ya.com.py` y `demo1234`. Los
despliegues siguientes **no** vuelven a sembrar: si la base ya tiene gente
dentro, el sembrado se salta solo y no pisa nada.

> Cambiá esa contraseña en cuanto entres, y borrá las cuentas de ejemplo antes
> de usarlo con clientes reales.

### Cómo elige el motor de base de datos

No hay que tocar nada para pasar de local a servidor. `DATABASE_URL` decide:
una que empieza por `file:` usa SQLite, una que empieza por `postgresql://` usa
PostgreSQL. Como Prisma no acepta una variable en el campo `provider`, el
esquema se ajusta al compilar (`scripts/preparar-esquema.mjs`), leyendo la URL
del entorno o del `.env`.

Por eso el código no lleva SQL escrito a mano: el único sitio donde hacía falta
—comparar el stock contra su propio mínimo— se resolvió en TypeScript, que
funciona igual en los dos motores.

## Quién ve qué

Cada persona entra con su correo y su contraseña, y ve sólo lo que su rol
necesita. Los permisos están en un único archivo, `src/lib/permisos.ts`, escrito
como una lista explícita por rol: un permiso concedido por descuido es fácil de
ver en una lista y difícil de ver en una jerarquía.

| Rol | Entra a | No puede |
| --- | --- | --- |
| **Administración** | Todo, incluidos los accesos y la auditoría | — |
| **Líder de equipo** | Panel, prospectos de todo el equipo, pedidos, inventario, logística, campañas, plantillas, comisiones de su gente | Dar de alta personal, cambiar sueldos, repartir contraseñas ni leer la auditoría |
| **Vendedor** | Panel, **sus** prospectos y los que no tienen responsable, pedidos, catálogo, campañas y plantillas | Ver la nómina, los sueldos ni los prospectos de otros vendedores |
| **Repartidor** | Logística y los datos de entrega de los pedidos | Todo lo demás |
| **Almacén** | Inventario y consulta de pedidos | El panel de ventas y los prospectos |

Tres detalles que importan:

- **El permiso se comprueba en el servidor, siempre.** El menú oculta lo que no
  corresponde, pero ocultar no protege: una petición se puede enviar a mano. Cada
  página y **cada una de las 24 acciones** comprueban el permiso por su cuenta, y
  `npm run verificar` falla si alguna acción nueva se queda sin guarda —o si una
  que toca dinero o accesos se queda sin dejar rastro en la auditoría.
- **El recorte va en la consulta.** Un vendedor no ve los prospectos ajenos porque
  no se traen de la base, no porque se escondan al dibujar la página.
- **La venta se atribuye a quien la hace.** Un vendedor no puede poner el pedido
  —ni la comisión— a nombre de otra persona.

### Contraseñas y alta de accesos

Estar en la nómina y poder entrar al sistema son dos cosas distintas: alguien
recién contratado existe en el sistema pero no tiene acceso hasta que
administración se lo da, desde su ficha.

Al dársela se genera una contraseña **provisional** pensada para dictarse por
teléfono (`tevuna-8023`: sílabas y dígitos, sin las letras y cifras que se
confunden al leerlas). Se muestra **una sola vez**, en pantalla, y hay que
confirmar que se anotó antes de que la ficha se actualice — si desapareciera
sola habría que generar otra. Quien entra con ella no llega a ninguna pantalla
hasta cambiarla.

Las contraseñas se guardan con `scrypt`, cada una con su propia sal, y se
comparan en tiempo constante. Nunca se guardan ni se muestran en claro. Cambiar
la contraseña, restablecerla, quitar el acceso o dar de baja a alguien cierra
sus sesiones abiertas en el acto.

### Registro de auditoría

Todo lo que toca el dinero o el acceso deja rastro: quién subió un sueldo y
desde cuánto, quién cambió un precio, quién pagó comisiones, quién dio o quitó
un acceso, quién anuló un pedido y quién intentó entrar sin conseguirlo. Cada
entrada guarda qué campos cambiaron, con el valor anterior y el nuevo.

Sólo administración lo lee. No se registra todo a propósito: el movimiento de
inventario y la conversación de WhatsApp ya llevan su propio historial, y
duplicarlo sólo añadiría ruido donde hay que buscar. El registro se escribe
dentro de la misma transacción que el cambio que describe, de modo que no puede
quedar diciendo que pasó algo que no pasó.

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

**Los Server Actions vienen con una defensa que hay que abrirle paso.** Va
resuelto por partida doble —los dominios autorizados en `next.config.mjs` y el
alineado de cabeceras en el middleware—, porque cada uno cubre al otro si
cambia el comportamiento de Next o los encabezados del proxy. Comprobado que
cualquiera de los dos basta por sí solo, y que ninguno deja pasar un origen
ajeno. Next
rechaza una acción cuando el dominio desde el que se envía no coincide con el
del servidor: eso impide que otro sitio dispare acciones en tu nombre. Detrás de
un proxy —Codespaces sirve la aplicación en `*.app.github.dev` mientras el
servidor se cree en `localhost`— la comprobación da un falso positivo y no deja
ni iniciar sesión. En `next.config.mjs` se autorizan esos dominios concretos, y
sólo esos; cualquier otro sigue bloqueado. Para otro proxy, se añade su dominio
en `ORIGENES_PERMITIDOS`.

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
.devcontainer/
  devcontainer.json    Hace que GitHub Codespaces lo arranque solo
scripts/
  preparar.mjs         Deja el proyecto listo con un solo comando
  verificar-flujo.ts   Prueba del ciclo de vida de un pedido
  preparar-esquema.mjs Elige SQLite o PostgreSQL según la DATABASE_URL
src/
  app/                 Rutas; cada módulo con su acciones.ts
  components/          Interfaz reutilizable
  middleware.ts        Anota la ruta pedida para que el layout compruebe permisos
  lib/
    auth.ts            Sesiones y cookies
    auditoria.ts       Registro de cambios y comparación de campos
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
  usuarios simultáneos toca PostgreSQL. Basta con poner una `DATABASE_URL` de
  PostgreSQL: el resto se ajusta solo.
- **Respaldos** de la base.
- **Datos personales.** Guardas nombres, teléfonos y direcciones de clientes:
  revisá qué exige la normativa paraguaya de protección de datos personales.
- **Bloqueo tras varios intentos fallidos.** Los intentos quedan registrados, pero
  nada impide seguir probando contraseñas.
