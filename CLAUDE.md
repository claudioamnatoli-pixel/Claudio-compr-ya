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
| Sólo un enlace | `https://claude.ai/code/artifact/ff0c7647-d4db-4352-8497-350e1cb28db5` |
| Navegador, sin instalar nada | `https://codespaces.new/claudioamnatoli-pixel/Claudio-compr-ya/tree/claude/tiktok-ecommerce-program-5y1bcr` |
| Local, un comando | `npm run empezar` |
| En línea, un botón | `render.yaml` arma servidor y base PostgreSQL juntos; sólo pide la cuenta de GitHub |

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

**Un correo en pantalla se confunde con un enlace.** Las cuentas de ejemplo se
listaban como texto para copiar; al tocarlas el navegador abre el correo o las
busca, y parece que el sistema no anda. Ahora cada una es un botón que rellena
el formulario (`src/app/login/cuentas-demo.tsx`). Se muestran **también en
producción** —un despliegue recién sembrado no sirve si no se sabe con qué
entrar— pero allí **sin la contraseña**, que quedaría a la vista de cualquiera
que abra la dirección: sólo los correos, que ya están en el README, y el aviso
de cambiarla.

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
pisen nada. Son **10 empleados**, no 5: los cinco de la tabla de arriba son los
que tienen contraseña de ejemplo. Contar 5 y ver 10 no es un sembrado
duplicado — ya costó una falsa alarma.

`render.yaml` describe el despliegue entero —servicio web y base PostgreSQL— para
que no haya que copiar cadenas de conexión a mano ni crear una segunda cuenta.
`SESSION_SECRET` se genera del lado de Render (`generateValue: true`): nunca hay
un secreto escrito en el repositorio. Si cambia la rama de trabajo, hay que
cambiarla también en `render.yaml` y en el enlace del botón del README.

**`render.yaml` no declara `plan`, y no hay que agregarlo.** Render conserva el
plan que cada recurso tenga puesto cuando el campo se omite; si se declarara,
cada sincronización devolvería el servicio al plan gratuito y pisaría lo que se
haya pagado en el panel. El cambio a pago se hace una vez, en el panel, y queda.

## La copia de un solo enlace

`enlace/compra-ya.html` es el sistema entero en un archivo, sin servidor ni
base: corre en el navegador y guarda con la capacidad `db` del artefacto. Está
publicado en el enlace de arriba; **para actualizarlo hay que republicar ese
mismo URL**, no crear otro, o el usuario se queda con un enlace viejo.

Repite las reglas del sistema grande a propósito —stock que sale al confirmar y
vuelve al cancelar o devolver, precio congelado en la línea, comisión atada al
estado del pedido, atribución por campaña— y **no** tiene sesiones, permisos ni
auditoría. Si una regla cambia acá, cambia también allá; si no puede repetirse,
decirlo en `enlace/README.md` en vez de dejar que las dos versiones se
contradigan en silencio.

**El mismo archivo sirve en dos modos.** Con la capacidad `db` guarda en la base
del artefacto; abierto con doble clic cae en `baseLocal()`, que respeta el mismo
contrato y guarda en `localStorage`, arrancando con la semilla embebida en
`#semillaInicial`. Así se puede mandar como archivo a quien no logra abrir un
enlace.

**Nunca mostrar cifras en cero mientras se espera el permiso.** El permiso se
pide al arrancar (`claude.permissions.request(['db'])`) y hasta que llegan los
datos se muestra la pantalla de carga. Antes se pintaban ceros y el programa
parecía vacío estando bien: ese fue el malentendido de «no tiene nada», dos
veces.

`enlace/semilla.json` es un espejo de lo que hay cargado en el artefacto:
`probar-semilla.mjs` comprueba la página contra esos datos, no contra datos
inventados. Al sembrar documentos nuevos, actualizar el espejo.

## Verificar antes de dar algo por bueno

```
npm run verificar     # pedido completo, dinero, permisos, contraseñas, auditoría
npm run typecheck && npm run lint && npm run build
```

Hay además dos baterías de navegador (Playwright) que cubren sesiones, roles,
reparto de accesos y auditoría. Al día de hoy: **59** comprobaciones en el
script y **29** en el navegador (14 + 15).

La copia de un solo enlace tiene las suyas, **84** en total, y necesitan
Playwright instalado a mano (`npm i -D playwright`; no es dependencia del
proyecto):

```
node enlace/probar.mjs           # 69 · circuito, copia suelta y espera del permiso
node enlace/probar-semilla.mjs   # 15 · la página contra los datos publicados
```

Costumbre de este proyecto: **comprobar contra lo real, no suponer**. El soporte
de PostgreSQL se validó levantando un PostgreSQL de verdad; el arreglo del proxy,
reproduciendo el rechazo y confirmando que un origen ajeno sigue bloqueado; el
arranque de un comando, sobre una copia sin `.env`, sin dependencias y sin base.
Y una prueba que no puede fallar no prueba nada: las estructurales se validaron
rompiéndolas a propósito.

## Freno a la prueba de contraseñas

`minutosDeEspera()` (`src/app/login/acciones.ts`) corta a los **10 fallos en 15
minutos**. Tres decisiones que hay que respetar:

- **Se cuenta por correo, no por cuenta.** Frenar sólo los correos existentes
  convertiría el bloqueo en un detector de cuentas: un correo inventado se
  frena igual.
- **El freno va antes de buscar la cuenta y antes de verificar la contraseña.**
  Si fuera después, probar contraseñas seguiría costando lo mismo.
- **Se cuenta sobre la auditoría que ya existía**, sin campos nuevos: por eso
  `registrarIntentoFallido` guarda el **correo** en `actor` y el nombre en el
  resumen. Cambiar eso rompe el conteo en silencio.

El perdón es por antigüedad, no por acierto: los fallos salen solos de la
ventana. Se probó rompiéndolo —con el límite en 100000 fallan tres
comprobaciones, entre ellas la única que importa, que la contraseña correcta
tampoco entre mientras dure—: `node pruebas/bloqueo-de-acceso.mjs`, 8
comprobaciones contra un PostgreSQL de verdad.

## Administración, contabilidad y suministros

Tres pantallas nuevas y una regla que lo gobierna todo.

**Cada gasto se registra una sola vez, en su lugar natural.** El estado de
resultados (`src/lib/contabilidad.ts`) va a buscar cada cifra donde ya vive —el
costo a la línea del pedido, las comisiones a `Comision`, la publicidad a
`Campana`, el reparto a `Envio.costoReal`, el resto a `Gasto`— y **nunca copia**.
Cargar una comisión o una campaña como `Gasto` la contaría dos veces y el
resultado mentiría sin que nadie supiera por qué. Por eso `CATEGORIAS_GASTO` no
tiene categoría de comisiones ni de publicidad: la omisión es deliberada.

**Resultado y caja son preguntas distintas**, y la pantalla muestra las dos.
El resultado usa el costo de lo que *se vendió*; la caja, lo que se *pagó por
reponer*. Un mes de mucha reposición da caja negativa con el negocio sano.
Confundirlas es el error clásico.

**La mercadería entra al depósito al recibir, no al cargar el borrador.**
`transicionarCompra()` (`src/lib/compras.ts`) es el equivalente de
`transicionarPedido` para el dinero que sale: aplica el movimiento por
`aplicarMovimiento()` y pone en `Producto.costo` lo pagado en esta compra —el
«último costo», con el que hay que calcular el margen de aquí en adelante—.
El costo histórico no se pierde: queda congelado en cada `ItemCompra`.

**`ItemPedido.costoUnitario` congela el costo del día de la venta**, por el
mismo motivo que el precio. Sin él, reponer más caro haría parecer que se perdió
plata en ventas viejas. Los pedidos anteriores a este campo quedan en 0 y su
margen sale inflado.

**El módulo es sólo de ADMIN.** Almacén recibe mercadería pero no ve compras:
llevan el costo de cada producto, que es justo lo que ese rol no ve. Si algún
día tiene que recibirlas, será un permiso propio que muestre cantidades sin
importes.

Se probó con `node pruebas/administracion.mjs` —20 comprobaciones contra un
PostgreSQL de verdad— y se validó rompiéndolo: invirtiendo la condición de
`entraAlDeposito`, la prueba acusa el stock que no se movió. La prueba es
repetible: el costo de la compra se deriva del actual y los gastos se miden por
diferencia, para que correrla dos veces sobre la misma base siga probando algo.

## Caja y rendiciones

Con cobro contra entrega el efectivo anda en el bolsillo de quien reparte.
`Envio.montoCobrado` sabía cuánto se cobró; `Rendicion` sabe si llegó.

**Cada envío queda atado a una sola rendición** (`Envio.rendicionId`). Esa
atadura es la integridad de todo: sin ella el mismo cobro se podría rendir dos
veces, o quedar sin rendir sin que apareciera en pendientes. Se validó
rompiéndola —vaciando la lista de envíos que se atan— y la prueba acusa cuatro
fallos, entre ellos que la plata se puede volver a rendir.

**El esperado se congela al cerrar.** Si se recalculara después, corregir un
envío cambiaría una diferencia que ya se discutió y se dio por saldada.

**Sólo se atan los envíos que se contaron.** Si entre el cálculo y el cierre
entra un cobro nuevo, queda pendiente para la próxima en vez de colarse sin
estar sumado en el esperado.

La contabilidad distingue ahora **cobrado**, **rendido** y **todavía en la
calle**: lo tercero no es una pérdida, es plata que no llegó aún.

`node pruebas/caja.mjs`, 14 comprobaciones contra un PostgreSQL de verdad. Al
acotar una aserción a una tabla, hacerlo por su encabezado: la tabla de cierres
anteriores también nombra al repartidor y lleva importes, y leer «la primera
fila que coincida» devuelve el faltante en vez de lo pendiente.

**El módulo es sólo de ADMIN, también la caja.** Que el repartidor vea lo que
debe sería útil y exige recortar los datos a los suyos; no está hecho.

## Carga masiva del catálogo

El catálogo real va de 500 a 3.000 productos por rubro, así que cargarlos de a
uno no es una opción. `/inventario/importar` toma las celdas pegadas desde
Excel.

**Los importes se leen a la paraguaya.** `leerImporte()` (`src/lib/importar.ts`)
trata cualquier punto o coma como separador de miles cuando la moneda no tiene
centavos: «190.000» son ciento noventa mil. Leerlo como decimal dividiría todos
los precios por mil, y eso no se nota hasta que alguien vende algo.

**O entra todo o no entra nada.** Una sola línea mala cancela la carga entera y
devuelve qué corregir. Una carga a medias de tres mil productos es imposible de
desenredar.

**No toca el stock de lo que ya existe.** Un código repetido actualiza nombre,
categoría y precios; las existencias sólo se mueven con una compra o un
movimiento, que dejan historial. Volver a pegar la misma planilla es seguro.

`crearProductosConStock()` vive en `src/lib/inventario.ts` a propósito: escribe
existencias e historial juntos, igual que `aplicarMovimiento`, pero en lote. La
regla sigue teniendo un solo dueño.

Dos bugs que encontró la prueba y conviene no reintroducir:

- **Los títulos se detectan por igualdad exacta, no por «contiene».** Buscar
  «contiene sku» hacía que un producto con código `SKU-0001` se tomara por
  encabezado y **desapareciera sin aviso**.
- **El código repetido se comprueba antes que el resto.** Si se deja para el
  final, un código cuya primera aparición fue rechazada por otro motivo no
  queda registrado y la segunda pasa como buena.

`npx tsx pruebas/importar.mjs` (21, sin navegador ni base) y
`node pruebas/importar-catalogo.mjs` (11, contra PostgreSQL: 3.000 productos en
un segundo).

## Pantallas con catálogo grande

Con 3.000 productos, cuatro pantallas traían el catálogo entero. La de compras
era la peor: cinco desplegables con todo adentro, quince mil renglones en una
sola página.

**Nada de desplegables de catálogo.** `BuscadorProducto`
(`src/components/buscador-producto.tsx`) consulta mientras se escribe, con
espera de 250 ms y descartando las respuestas que llegan tarde —si no, una
búsqueda vieja puede pisar a la nueva—. El identificador elegido viaja en un
campo oculto, así el formulario se envía igual que antes y las acciones no
cambiaron. Lo usan compras, armar pedido y alta de prospectos.

**El inventario pagina, pero los totales no.** `POR_PAGINA = 50` para las filas;
las cifras y las alertas se calculan sobre el catálogo entero con una consulta
que pide sólo cuatro columnas numéricas —unos kilobytes— porque el problema
nunca fue la base, sino dibujar 3.000 filas. La alerta compara dos columnas, que
Prisma no expresa en `where`, así que se resuelve en TypeScript y se pagina por
los identificadores obtenidos.

Medido con 3.014 productos reales: el inventario pasó de ~1 MB a **130 KB**, y
las tres pantallas de formulario quedaron entre 23 y 31 KB, con menos de 20
`<option>` cada una. `node pruebas/escala.mjs`, 14 comprobaciones.

Al escribir pruebas sobre estas pantallas: el `role="option"` está en el botón,
no en el `<li>`; y leer cifras del `textContent` del cuerpo entero las pega
(«30.6283.014»), así que conviene acotar a un locator.

## Gastos fijos y la planilla

Lo que se paga todos los meses pase lo que pase se carga una vez en
`/gastos/recurrentes` y después se genera con un botón. Los sueldos no se
cargan: salen de la nómina.

**Un gasto fijo es una plantilla, no un gasto.** `GastoRecurrente` describe el
alquiler; los gastos de cada mes son filas normales de `Gasto`. Por eso el
estado de resultados no cambió ni una línea: sigue leyendo `Gasto` y la regla de
que cada gasto se cuenta una sola vez, en su lugar natural, queda intacta.

**`Gasto.claveGeneracion` es único y ahí está la integridad.** Cada renglón
generado lleva `recurrente:<id>:2026-10`, `sueldos:2026-10`, `aguinaldo:2026-10`
o `ips:2026-10`; los gastos cargados a mano lo dejan nulo, y los nulos no chocan
en un índice único ni en SQLite ni en PostgreSQL. Sin esa columna, tocar el
botón dos veces cobra el alquiler dos veces y el resultado del mes miente sin
que nadie sepa por qué.

**Se genera con un botón, nunca al abrir la pantalla.** Una página que se mira
no debe escribir en la base: con dos personas mirando, o con el navegador
recargando, aparecerían gastos que nadie cargó.

**El aguinaldo es una provisión mensual, no un gasto de diciembre.** Se devenga
todos los meses (un doceavo) junto con el IPS patronal (16,5 % del bruto,
`IPS_PATRONAL_DECIMAS`). Cargarlo entero en diciembre deja once meses mejores de
lo que son y el último, una catástrofe. **El bruto no alcanza para
presupuestar**: la planilla cuesta un 24,8 % más de lo que dice la suma de los
sueldos.

**La nómina sale de `Empleado.salarioBase` de la gente activa**, sin copia que
se desactualice. Por eso `CATEGORIAS_GASTO.SUELDOS` **no** se admite como gasto
fijo —`CATEGORIAS_FUERA_DE_RECURRENTE`—: cargarla además a mano la contaría dos
veces. Es la misma omisión deliberada que deja fuera las comisiones y la
publicidad.

**Cambiar el importe no reescribe el pasado**, por el mismo motivo que el precio
se congela en la línea del pedido. Y dar de baja no borra: deja de generar de
ahí en adelante y conserva lo ya cargado, que es lo que explica un mes cerrado.

**Se genera con los sueldos de hoy.** Generar un mes viejo después de un aumento
lo carga con el sueldo nuevo. Es una limitación conocida, no un descuido: no hay
historial de sueldos y hacerlo bien pide uno.

Dos avisos para quien escriba pruebas acá:

- `mode: 'insensitive'` de Prisma **sólo existe en PostgreSQL**. La comparación
  de nombres repetidos se hace en TypeScript para que funcione también en SQLite.
- `skipDuplicates` de `createMany` **tampoco corre en SQLite**, así que lo ya
  generado se filtra en TypeScript. El índice único sigue siendo la garantía: si
  dos personas generan el mismo mes a la vez, la transacción falla en voz alta.

```
npx tsx pruebas/gastos-fijos.mjs           # 23 · períodos, día de pago, aguinaldo, IPS
node pruebas/gastos-fijos-pantalla.mjs     # 35 · circuito completo contra PostgreSQL
```

Se validó rompiéndolo dos veces. Quitando el filtro de lo ya generado, la prueba
acusa tres fallos; quitando la guarda de nombres repetidos, siete, entre ellos
el alquiler cobrado dos veces. **La primera versión de esa prueba no probaba
nada**: comprobaba que un mes completo no ofreciera el botón, y el segundo
pasado por el mismo mes nunca se ejecutaba. Ahora carga un gasto fijo nuevo a
mitad de mes y vuelve a generar, que es cuando el filtro de verdad trabaja.

## La confirmación de los formularios falla de a veces

Al enviar un formulario del panel, **de vez en cuando el dato se guarda y la
pantalla no acusa recibo**: no aparece el cartel verde ni la fila nueva, y hay
que recargar para verla. Medido sobre la misma pantalla y el mismo build, una de
cada cuatro veces. Pasa con la lista vacía y con la lista llena, y pasa en
pantallas que ya estaban desplegadas —`/gastos`, `/plantillas`—, así que **no lo
trajo ningún cambio reciente**: es el `useActionState` de los Server Actions con
`revalidatePath` de la propia ruta. No está arreglado.

Dos consecuencias prácticas:

- **El daño real es el doble envío**: quien cargó algo cree que no entró y lo
  vuelve a cargar. Por eso las defensas van en el servidor y no en la interfaz
  —`claveGeneracion` para los meses, la guarda de nombres repetidos para los
  gastos fijos—, donde no dependen de que la pantalla se comporte.
- **Ninguna prueba debe esperar el cartel de confirmación.** Se recarga la
  página y se mira el estado. Una batería que espere el cartel falla una de cada
  cuatro corridas y hace perder la tarde buscando el problema donde no está
  —ya la hizo perder una vez—.

Se descartó un arreglo por el camino: mover el «no hay nada» adentro de la
tabla, para que la forma del árbol no cambiara. Pareció funcionar una vez y no
era eso; se revirtió entero. Queda anotado para que nadie lo intente de nuevo
creyendo que es nuevo.

## Las baterías de pantalla envejecen con las pantallas

`pruebas/administracion.mjs` se quedó rota sin que nadie lo notara: el cambio
que sacó los desplegables de catálogo de `/compras` dejó al test buscando un
`select[name="productoId"]` que ya no existe. Al tocar una pantalla hay que
correr **las baterías que la pisan**, no sólo las de la función nueva.

Dos cosas que cuesta descubrir cada vez:

- El `role="option"` del buscador está en el **botón**, no en el `<li>`, y el
  nombre del producto vive en su propio `<span>`: leer el `textContent` del
  botón entero lo pega con el código y el stock («…MiniAUD-MINI-0282 u.») y
  después no coincide con ninguna fila del inventario.
- Al elegir en el buscador hay que **esperar a que el campo oculto se llene**
  antes de seguir; y si la prueba navega a otra pantalla, la elección se
  pierde y hay que volver a hacerla.

`pruebas/caja.mjs` **no es repetible**: la segunda corrida seguida sobre la misma
base no encuentra plata sin rendir. Correrla sobre una base recién sembrada.

## El verificador busca en profundidad

`scripts/verificar-flujo.ts` miraba **una sola carpeta** bajo `src/app/(panel)`,
así que las acciones en rutas anidadas —la primera fue `inventario/importar`—
eran invisibles y podían quedarse sin guarda sin que nada fallara. Ahora recorre
el árbol entero. Se validó quitándole la guarda a la acción anidada: el
verificador la acusa por nombre.

## Antes de vender de verdad

Cambiar las contraseñas de ejemplo y `SESSION_SECRET`; servir por HTTPS (la
cookie es `secure` en producción); pasar a PostgreSQL; respaldos; revisar la
normativa paraguaya de datos personales.
