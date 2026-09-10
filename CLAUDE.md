# Compr-Ya

Sistema de gestión para una tienda **paraguaya** que capta por TikTok —vivos y
avisos pagados— y cierra la venta por WhatsApp. Cubre el circuito entero:
prospecto, conversación, pedido, inventario, entrega con cobro contra entrega,
comisión del vendedor.

En Paraguay no hay TikTok Shop, así que el sistema **no depende de ninguna
integración con TikTok**: la atribución se hace registrando cada vivo o aviso
como una campaña y colgando de ella los prospectos que llegan.

- Interfaz y **nombres del código en español**, incluidos variables y funciones.
- Next.js 15 (App Router) · React 19 · TypeScript estricto · Prisma · Tailwind.
- Rama de trabajo: `claude/tiktok-ecommerce-program-5y1bcr`.

## Arrancarlo

| Camino | Cómo |
| --- | --- |
| Navegador, sin instalar nada | `https://codespaces.new/claudioamnatoli-pixel/Claudio-compr-ya/tree/claude/tiktok-ecommerce-program-5y1bcr` |
| Local, un comando | `npm run empezar` |
| En línea | Ver «Ponerlo en línea» en el README |

Cuentas de ejemplo, todas con contraseña `demo1234`:
`claudia@` administración · `lidia@` líder · `ana@` vendedora · `marco@`
repartidor · `hugo@` almacén, todas en `@compr-ya.com.py`.

## Decisiones que hay que respetar

**El dinero es un entero en la unidad mínima de la moneda.** Nunca decimales de
coma flotante. Cuánto vale esa unidad se le pregunta a `Intl`, no se asume: el
guaraní no tiene centavos (factor 1), una moneda con centavos sí (factor 100).
Ver `FACTOR_MONEDA` en `src/lib/config.ts`; para mostrar, `formatearDinero()`.

**Los estados válidos viven en un solo catálogo.** SQLite no tiene enums, así
que son cadenas. `src/lib/dominio.ts` define qué valores existen, cómo se llaman
en pantalla y de qué color se pintan. Un estado nuevo se agrega ahí y el resto
lo recoge solo.

**El inventario nunca se escribe a mano.** Todo cambio de stock pasa por
`aplicarMovimiento()` (`src/lib/inventario.ts`), que ajusta existencias y
escribe el historial en la misma transacción. No se puede tener una cosa sin la
otra.

**Los estados del pedido tienen reglas.** `TRANSICIONES_PEDIDO` dice qué pasos
son válidos; `transicionarPedido()` (`src/lib/pedidos.ts`) aplica los efectos:
el stock sale al confirmar y vuelve si se cancela o devuelve, la comisión se
crea, se aprueba o se anula, y el envío se mantiene sincronizado. **Pedidos y
logística llaman a esa misma función**, para que las dos vistas no puedan
contradecirse.

**El precio se congela en `ItemPedido`.** Un cambio de tarifa no debe reescribir
el histórico.

**No hay SQL escrito a mano.** El único caso que lo pedía —comparar el stock
contra su propio mínimo— se resolvió en TypeScript, así funciona igual en SQLite
y en PostgreSQL.

## Permisos

`src/lib/permisos.ts` es la única fuente de verdad: una lista explícita por rol,
sin herencia ni comodines, porque un permiso concedido por descuido se ve en una
lista y se esconde en una jerarquía.

- **Ocultar no protege.** El menú filtra lo que no corresponde, pero cada página
  y **cada acción del panel** comprueban el permiso por su cuenta; una petición
  se puede enviar a mano.
- **El recorte de datos va en la consulta**, no en el pintado. Un vendedor no ve
  los prospectos ajenos porque no se traen de la base.
- **El permiso de la ruta se resuelve en el layout**, antes de dibujar, para que
  denegar sea un `307` real y no un salto en el navegador.
- La venta se atribuye a quien la hace: un vendedor no puede poner el pedido —ni
  la comisión— a nombre de otro.

`npm run verificar` **falla** si una acción nueva se queda sin guarda, o si una
que toca dinero o accesos no deja rastro en la auditoría.

## Trampas conocidas

**Server Actions detrás de un proxy.** Next rechaza una acción cuando el dominio
desde el que llega no coincide con el del servidor —así impide que otro sitio
dispare acciones en tu nombre—. Con Codespaces (`*.app.github.dev`) eso da un
falso positivo y **no deja ni iniciar sesión**: el síntoma es
`Invalid Server Actions request`. Resuelto por partida doble, y cada defensa
basta por sí sola:

1. `allowedOrigins` en `next.config.mjs` (dominios de GitHub y `localhost:3000`).
2. El middleware alinea `x-forwarded-host` con el origen, sólo para esos dominios.

Un origen ajeno sigue bloqueado. Para otro proxy o túnel, `ORIGENES_PERMITIDOS`.

**Versión visible.** La pantalla de acceso muestra `VERSION` (`src/lib/config.ts`).
Si un entorno no la muestra, está corriendo código anterior — eso costó varias
vueltas de diagnóstico antes de existir. Subirla a mano cuando haya un cambio
que convenga notar desde fuera.

**Base vacía.** Si el sembrado falló, la pantalla de acceso lo dice y ofrece
cargarla con un botón, en lugar de responder «correo o contraseña incorrectos» y
mandar a buscar el problema donde no está.

**Los mensajes de error no deben adivinar la causa.** `src/app/error.tsx` mostró
un tiempo «revisá la base de datos» pasara lo que pasara, y apuntó al lugar
equivocado. Ahora muestra el motivo real cuando el servidor lo entrega.

## Motor de base de datos

`DATABASE_URL` decide: `file:` usa SQLite, `postgresql://` usa PostgreSQL.
Prisma no acepta una variable en `provider`, así que `scripts/preparar-esquema.mjs`
ajusta el esquema al compilar, leyendo la URL del entorno **o del `.env`** (Node
no carga `.env` solo; olvidarlo dejaba el esquema apuntando al motor equivocado).

El sembrado acepta `--solo-si-vacia` y corre dentro de la compilación, para que
el primer despliegue tenga datos sin abrir una terminal y los siguientes no
pisen nada.

## Verificar antes de dar algo por bueno

```
npm run verificar     # pedido completo, dinero, permisos, contraseñas, auditoría
npm run typecheck && npm run lint && npm run build
```

Hay además dos baterías de navegador (Playwright) que cubren sesiones, roles,
reparto de accesos y auditoría. Al día de hoy: **59** comprobaciones en el
script y **29** en el navegador (14 + 15).

Costumbre de este proyecto: **comprobar contra lo real, no suponer**. El soporte
de PostgreSQL se validó levantando un PostgreSQL de verdad; el arreglo del proxy,
reproduciendo el rechazo y confirmando que un origen ajeno sigue bloqueado; el
arranque de un comando, sobre una copia sin `.env`, sin dependencias y sin base.
Y una prueba que no puede fallar no prueba nada: las estructurales se validaron
rompiéndolas a propósito.

## Antes de vender de verdad

Cambiar las contraseñas de ejemplo y `SESSION_SECRET`; servir por HTTPS (la
cookie es `secure` en producción); pasar a PostgreSQL; respaldos; revisar la
normativa paraguaya de datos personales. Falta un bloqueo tras varios intentos
fallidos: hoy quedan registrados, pero nada impide seguir probando.
