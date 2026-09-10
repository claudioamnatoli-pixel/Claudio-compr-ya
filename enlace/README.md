# Compra Ya — la versión de un solo enlace

Una copia del sistema que corre **entera en el navegador**, sin instalar nada,
sin servidor y sin base de datos que levantar. Es un único archivo,
[`compra-ya.html`](compra-ya.html), publicado como artefacto de Claude:

<https://claude.ai/code/artifact/ff0c7647-d4db-4352-8497-350e1cb28db5>

Existe porque el sistema completo —Next.js, Prisma, sesiones— pide una
terminal, y no siempre hay una a mano. Esta versión se abre desde el teléfono.

## Qué tiene

Las mismas ocho pantallas y las mismas reglas que la aplicación grande:

| Pantalla | Qué hace |
| --- | --- |
| Hoy | Ventas del mes, ticket promedio, conversión, por cobrar, embudo y campañas que más venden |
| Prospectos | Ficha, etapa, responsable, plantillas de WhatsApp y el enlace ya escrito |
| Pedidos | Alta desde un prospecto, líneas, envío, comisión y los pasos de estado |
| Entregas | Lo que está en la calle, lo que falta despachar y el efectivo cobrado hoy |
| Inventario | Stock, mínimo, margen, y movimientos con motivo y fecha |
| Campañas | Cada vivo o aviso con su inversión, sus prospectos y su retorno |
| Equipo | Rol, tasa, lo vendido y la comisión aprobada contra la pendiente |
| Plantillas | Mensajes con `{{cliente}}`, `{{producto}}`, `{{precio}}`, `{{ciudad}}`, `{{pedido}}` |

## Qué comparte con el sistema grande

- **El dinero es entero.** Guaraníes sin decimales; `Intl` da el formato.
- **Los estados viven en un catálogo.** `ETAPAS`, `ESTADOS`, `PAGOS`,
  `TIPOS_CAMPANA`, `ROLES` y `ZONAS`, arriba del archivo.
- **El pedido arrastra sus efectos.** `muevePedido()` descuenta el stock al
  confirmar y lo devuelve al cancelar o devolver, marca la fecha de entrega y
  cobra el contra entrega. La comisión sigue al estado del pedido.
- **El precio se congela en la línea del pedido.**
- **El stock no se escribe a mano:** entra o sale con un motivo, y queda el
  historial.

## En qué se diferencia

- **No hay sesiones ni permisos.** Quien tenga el enlace ve todo. Para repartir
  accesos por rol hay que usar el sistema grande.
- **No hay transacciones.** El descuento de stock se marca en el propio pedido
  (`stockDescontado`) para no restar dos veces.
- **No hay auditoría.**

Sirve para probar el circuito y para vender desde el teléfono; para operar en
serio con varias personas, el sistema grande.

## Comprobarlo

Dos baterías de navegador, **63 + 15 comprobaciones**:

```
node enlace/probar.mjs           # circuito completo contra un almacenamiento simulado
node enlace/probar-semilla.mjs   # la página contra los datos realmente sembrados
```

Necesitan Playwright (`npm i -D playwright`); no está entre las dependencias
del proyecto para no cargarle un navegador a quien sólo quiere vender.

`semilla.json` es un espejo de lo que hay cargado en el artefacto: sirve para
comprobar que la página y los datos publicados encajan, no sólo la página
contra datos inventados.
