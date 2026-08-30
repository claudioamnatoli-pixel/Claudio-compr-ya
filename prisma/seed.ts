/**
 * Datos de ejemplo de Compr-Ya.
 *
 * Simula unos tres meses de operación de una tienda que vende por TikTok y
 * cierra por WhatsApp, para poder recorrer la aplicación completa sin haber
 * hecho todavía una sola venta real. Todo es ficticio.
 *
 * Se ejecuta con `npm run db:seed` y es idempotente: borra y vuelve a crear.
 */
import { PrismaClient } from '@prisma/client';
import { MOVIMIENTOS_QUE_SUMAN } from '../src/lib/dominio';

const prisma = new PrismaClient();

// --- Azar reproducible ------------------------------------------------------
// Un generador con semilla fija hace que dos personas que siembren la base
// obtengan exactamente los mismos datos, lo que facilita comparar resultados.
function crearAzar(semilla: number) {
  let estado = semilla;
  return function azar() {
    estado |= 0;
    estado = (estado + 0x6d2b79f5) | 0;
    let t = Math.imul(estado ^ (estado >>> 15), 1 | estado);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const azar = crearAzar(20260830);

const entre = (min: number, max: number) => min + Math.floor(azar() * (max - min + 1));
const elegir = <T,>(lista: readonly T[]): T => lista[Math.floor(azar() * lista.length)];
const probabilidad = (p: number) => azar() < p;

const DIA_MS = 24 * 60 * 60 * 1000;
const HOY = new Date();
HOY.setHours(12, 0, 0, 0);
const haceDias = (dias: number, hora = 10) => {
  const fecha = new Date(HOY.getTime() - dias * DIA_MS);
  fecha.setHours(hora, entre(0, 59), 0, 0);
  return fecha;
};

const periodoDe = (fecha: Date) =>
  `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;

async function limpiar() {
  // El orden importa: primero lo que depende de otros registros.
  await prisma.comision.deleteMany();
  await prisma.envio.deleteMany();
  await prisma.itemPedido.deleteMany();
  await prisma.pedido.deleteMany();
  await prisma.mensajeWhatsApp.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.plantillaWhatsApp.deleteMany();
  await prisma.campana.deleteMany();
  await prisma.movimientoInventario.deleteMany();
  await prisma.producto.deleteMany();
  await prisma.asistencia.deleteMany();
  await prisma.zona.deleteMany();
  // Se rompe el vínculo líder→equipo antes de borrar para evitar el ciclo.
  await prisma.equipo.updateMany({ data: { liderId: null } });
  await prisma.empleado.deleteMany();
  await prisma.equipo.deleteMany();
}

async function main() {
  console.log('Limpiando datos anteriores…');
  await limpiar();

  // --- Zonas de reparto -----------------------------------------------------
  console.log('Creando zonas de reparto…');
  const zonas = await Promise.all(
    [
      { nombre: 'Centro', ciudad: 'Ciudad de México', costoEnvio: 4900, horasEstimadas: 24 },
      { nombre: 'Norte', ciudad: 'Ciudad de México', costoEnvio: 6900, horasEstimadas: 48 },
      { nombre: 'Sur', ciudad: 'Ciudad de México', costoEnvio: 6900, horasEstimadas: 48 },
      { nombre: 'Área metropolitana', ciudad: 'Estado de México', costoEnvio: 9900, horasEstimadas: 72 },
      { nombre: 'Interior (paquetería)', ciudad: 'Nacional', costoEnvio: 14900, horasEstimadas: 120 },
    ].map((datos) => prisma.zona.create({ data: datos })),
  );

  // --- Equipos y personal ---------------------------------------------------
  console.log('Creando equipos y personal…');
  const equipoAlfa = await prisma.equipo.create({
    data: {
      nombre: 'Equipo Alfa',
      descripcion: 'Cierre de ventas de los videos orgánicos y del perfil.',
      metaMensual: 25_000_00,
    },
  });
  const equipoBeta = await prisma.equipo.create({
    data: {
      nombre: 'Equipo Beta',
      descripcion: 'Atiende transmisiones en vivo y campañas pagadas.',
      metaMensual: 18_000_00,
    },
  });

  const crearEmpleado = (datos: {
    nombre: string;
    email: string;
    telefono: string;
    rol: string;
    equipoId?: string;
    salarioBase: number;
    tasaComision?: number;
    metaMensual?: number;
    diasAntiguedad: number;
  }) =>
    prisma.empleado.create({
      data: {
        nombre: datos.nombre,
        email: datos.email,
        telefono: datos.telefono,
        rol: datos.rol,
        equipoId: datos.equipoId,
        salarioBase: datos.salarioBase,
        tasaComision: datos.tasaComision ?? 0,
        metaMensual: datos.metaMensual ?? 0,
        fechaIngreso: haceDias(datos.diasAntiguedad, 9),
      },
    });

  const admin = await crearEmpleado({
    nombre: 'Claudia Amaya',
    email: 'claudia@compr-ya.mx',
    telefono: '5511000001',
    rol: 'ADMIN',
    salarioBase: 22_000_00,
    diasAntiguedad: 400,
  });

  const lidiaAlfa = await crearEmpleado({
    nombre: 'Lidia Ramos',
    email: 'lidia@compr-ya.mx',
    telefono: '5511000002',
    rol: 'LIDER',
    equipoId: equipoAlfa.id,
    salarioBase: 14_000_00,
    tasaComision: 0.03,
    metaMensual: 25_000_00,
    diasAntiguedad: 320,
  });
  const brunoBeta = await crearEmpleado({
    nombre: 'Bruno Cifuentes',
    email: 'bruno@compr-ya.mx',
    telefono: '5511000003',
    rol: 'LIDER',
    equipoId: equipoBeta.id,
    salarioBase: 14_000_00,
    tasaComision: 0.03,
    metaMensual: 18_000_00,
    diasAntiguedad: 280,
  });

  await prisma.equipo.update({ where: { id: equipoAlfa.id }, data: { liderId: lidiaAlfa.id } });
  await prisma.equipo.update({ where: { id: equipoBeta.id }, data: { liderId: brunoBeta.id } });

  const vendedores = await Promise.all([
    crearEmpleado({
      nombre: 'Ana Sotelo',
      email: 'ana@compr-ya.mx',
      telefono: '5511000004',
      rol: 'VENDEDOR',
      equipoId: equipoAlfa.id,
      salarioBase: 8_000_00,
      tasaComision: 0.08,
      metaMensual: 9_000_00,
      diasAntiguedad: 210,
    }),
    crearEmpleado({
      nombre: 'Diego Palma',
      email: 'diego@compr-ya.mx',
      telefono: '5511000005',
      rol: 'VENDEDOR',
      equipoId: equipoAlfa.id,
      salarioBase: 8_000_00,
      tasaComision: 0.07,
      metaMensual: 8_000_00,
      diasAntiguedad: 150,
    }),
    crearEmpleado({
      nombre: 'Ruth Villalobos',
      email: 'ruth@compr-ya.mx',
      telefono: '5511000006',
      rol: 'VENDEDOR',
      equipoId: equipoBeta.id,
      salarioBase: 8_000_00,
      tasaComision: 0.08,
      metaMensual: 9_000_00,
      diasAntiguedad: 120,
    }),
    crearEmpleado({
      nombre: 'Iván Quiroz',
      email: 'ivan@compr-ya.mx',
      telefono: '5511000007',
      rol: 'VENDEDOR',
      equipoId: equipoBeta.id,
      salarioBase: 7_000_00,
      tasaComision: 0.06,
      metaMensual: 6_000_00,
      diasAntiguedad: 45,
    }),
  ]);

  const repartidores = await Promise.all([
    crearEmpleado({
      nombre: 'Marco Tapia',
      email: 'marco@compr-ya.mx',
      telefono: '5511000008',
      rol: 'REPARTIDOR',
      salarioBase: 9_000_00,
      diasAntiguedad: 190,
    }),
    crearEmpleado({
      nombre: 'Sonia Beltrán',
      email: 'sonia@compr-ya.mx',
      telefono: '5511000009',
      rol: 'REPARTIDOR',
      salarioBase: 9_000_00,
      diasAntiguedad: 95,
    }),
  ]);

  const almacenista = await crearEmpleado({
    nombre: 'Hugo Márquez',
    email: 'hugo@compr-ya.mx',
    telefono: '5511000010',
    rol: 'ALMACEN',
    salarioBase: 8_500_00,
    diasAntiguedad: 240,
  });

  const plantilla = [admin, lidiaAlfa, brunoBeta, ...vendedores, ...repartidores, almacenista];

  // --- Asistencia de las últimas dos semanas --------------------------------
  console.log('Registrando asistencia…');
  for (let dia = 13; dia >= 0; dia -= 1) {
    const fecha = new Date(HOY.getTime() - dia * DIA_MS);
    fecha.setHours(0, 0, 0, 0);
    const esFinDeSemana = fecha.getDay() === 0;
    for (const persona of plantilla) {
      if (fecha < persona.fechaIngreso) continue;
      let estado: string;
      if (esFinDeSemana) estado = 'DESCANSO';
      else if (probabilidad(0.05)) estado = 'AUSENTE';
      else if (probabilidad(0.12)) estado = 'TARDE';
      else if (probabilidad(0.04)) estado = 'PERMISO';
      else estado = 'PRESENTE';

      const trabajó = estado === 'PRESENTE' || estado === 'TARDE';
      const entrada = trabajó ? new Date(fecha.getTime() + (estado === 'TARDE' ? 9.6 : 9) * 60 * 60 * 1000) : null;
      const salida = trabajó ? new Date(fecha.getTime() + 18 * 60 * 60 * 1000) : null;

      await prisma.asistencia.create({
        data: { empleadoId: persona.id, fecha, estado, entrada, salida },
      });
    }
  }

  // --- Catálogo -------------------------------------------------------------
  console.log('Creando catálogo e inventario inicial…');
  const catalogo = [
    { sku: 'AUD-PRO-01', nombre: 'Audífonos inalámbricos Pro', categoria: 'Audio', costo: 21_000, precio: 59_900, stock: 60 },
    { sku: 'AUD-MINI-02', nombre: 'Audífonos deportivos Mini', categoria: 'Audio', costo: 14_500, precio: 39_900, stock: 85 },
    { sku: 'BOC-BASS-03', nombre: 'Bocina portátil Bass 20 W', categoria: 'Audio', costo: 32_000, precio: 84_900, stock: 34 },
    { sku: 'REL-FIT-04', nombre: 'Reloj inteligente Fit', categoria: 'Wearables', costo: 38_000, precio: 99_900, stock: 42 },
    { sku: 'ARO-LUZ-05', nombre: 'Aro de luz 26 cm con trípode', categoria: 'Creadores', costo: 25_000, precio: 64_900, stock: 28 },
    { sku: 'MIC-LAV-06', nombre: 'Micrófono de solapa inalámbrico', categoria: 'Creadores', costo: 18_000, precio: 49_900, stock: 51 },
    { sku: 'SOP-CEL-07', nombre: 'Soporte de celular flexible', categoria: 'Creadores', costo: 6_500, precio: 19_900, stock: 120 },
    { sku: 'ORG-COC-08', nombre: 'Organizador de cocina 5 niveles', categoria: 'Hogar', costo: 22_000, precio: 57_900, stock: 24 },
    { sku: 'LAM-LED-09', nombre: 'Lámpara LED de escritorio', categoria: 'Hogar', costo: 15_000, precio: 42_900, stock: 47 },
    { sku: 'BOT-TER-10', nombre: 'Botella térmica 750 ml', categoria: 'Hogar', costo: 9_000, precio: 27_900, stock: 96 },
    { sku: 'MOC-VIA-11', nombre: 'Mochila antirrobo con USB', categoria: 'Accesorios', costo: 28_000, precio: 74_900, stock: 19 },
    { sku: 'CAR-RAP-12', nombre: 'Cargador rápido 65 W', categoria: 'Accesorios', costo: 16_000, precio: 44_900, stock: 8 },
    { sku: 'SET-BEL-13', nombre: 'Set de brochas de maquillaje', categoria: 'Belleza', costo: 11_000, precio: 34_900, stock: 4 },
    { sku: 'RIZ-CAB-14', nombre: 'Rizador de cabello automático', categoria: 'Belleza', costo: 34_000, precio: 89_900, stock: 31 },
  ];

  const productos = [];
  for (const item of catalogo) {
    const producto = await prisma.producto.create({
      data: {
        sku: item.sku,
        nombre: item.nombre,
        categoria: item.categoria,
        costo: item.costo,
        precio: item.precio,
        stock: item.stock,
        stockMinimo: item.stock < 20 ? 5 : 10,
        descripcion: `${item.nombre}. Producto estrella de la categoría ${item.categoria.toLowerCase()}, con buena rotación en video corto.`,
      },
    });
    // Compra inicial al proveedor, para que el inventario tenga historia.
    await prisma.movimientoInventario.create({
      data: {
        productoId: producto.id,
        tipo: 'ENTRADA',
        cantidad: item.stock,
        stockResultante: item.stock,
        motivo: 'Compra inicial a proveedor',
        referencia: 'FACT-PROV-0001',
        empleadoId: almacenista.id,
        createdAt: haceDias(90, 11),
      },
    });
    productos.push(producto);
  }

  // --- Campañas de TikTok ---------------------------------------------------
  console.log('Creando campañas de TikTok…');
  const campanas = await Promise.all(
    [
      { nombre: '¿Audífonos de $600 valen la pena?', tipo: 'VIDEO', hashtags: '#audifonos #gadgets #mexico', presupuesto: 0, dias: 62 },
      { nombre: 'Live de viernes — liquidación de audio', tipo: 'LIVE', hashtags: '#envivo #ofertas', presupuesto: 0, dias: 30 },
      { nombre: 'Ads — Reloj Fit público frío', tipo: 'ADS', hashtags: '#smartwatch', presupuesto: 12_000_00, dias: 45 },
      { nombre: 'Setup de creador por menos de $2000', tipo: 'VIDEO', hashtags: '#creadores #setup', presupuesto: 0, dias: 25 },
      { nombre: 'Ads — Hogar y organización', tipo: 'ADS', hashtags: '#hogar #organizacion', presupuesto: 8_000_00, dias: 18 },
      { nombre: 'Enlace fijo del perfil', tipo: 'PERFIL', hashtags: null, presupuesto: 0, dias: 120 },
    ].map((c) =>
      prisma.campana.create({
        data: {
          nombre: c.nombre,
          tipo: c.tipo,
          hashtags: c.hashtags,
          presupuesto: c.presupuesto,
          urlVideo: c.tipo === 'VIDEO' || c.tipo === 'LIVE' ? 'https://www.tiktok.com/@compr.ya' : null,
          fechaInicio: haceDias(c.dias, 12),
        },
      }),
    ),
  );

  // --- Plantillas de WhatsApp ----------------------------------------------
  console.log('Creando plantillas de WhatsApp…');
  const plantillasTexto = [
    {
      nombre: 'Primer contacto',
      etapa: 'NUEVO',
      cuerpo:
        '¡Hola {{cliente}}! 👋 Soy {{vendedor}} de {{tienda}}. Vi que te interesó {{producto}} por nuestro TikTok.\n\nSigue disponible en {{precio}} con envío a domicilio y pago contra entrega. ¿Te lo aparto?',
    },
    {
      nombre: 'Reenganche sin respuesta',
      etapa: 'CONTACTADO',
      cuerpo:
        'Hola {{cliente}}, ¿seguís interesada/o en {{producto}}? 😊 Me quedan pocas piezas y no quiero que te quedes sin la tuya. Cualquier duda me dices.',
    },
    {
      nombre: 'Detalle de producto',
      etapa: 'EN_CONVERSACION',
      cuerpo:
        '{{producto}} — {{precio}}\n\n✅ Garantía de 3 meses\n✅ Envío a {{ciudad}} en 24 a 48 h\n✅ Pagas cuando lo recibes\n\n¿Te comparto el enlace para confirmar tu pedido?',
    },
    {
      nombre: 'Confirmación de datos',
      etapa: 'COTIZADO',
      cuerpo:
        'Perfecto {{cliente}} 🙌 Para cerrar tu pedido necesito:\n\n1️⃣ Nombre completo\n2️⃣ Calle, número y colonia\n3️⃣ Alguna referencia de la casa\n4️⃣ Teléfono de contacto\n\nEn cuanto me los mandes lo dejo programado.',
    },
    {
      nombre: 'Pedido confirmado',
      etapa: 'GANADO',
      cuerpo:
        '¡Listo {{cliente}}! ✅ Tu pedido {{pedido}} quedó confirmado.\n\nTe llega en 24 a 48 h y pagas al recibir. Te aviso por aquí cuando salga a ruta. ¡Gracias por comprarnos! 💚',
    },
    {
      nombre: 'Pedido en ruta',
      etapa: 'GANADO',
      cuerpo:
        'Hola {{cliente}}, tu pedido {{pedido}} ya va en camino 🛵 Llega hoy. Por favor ten a la mano el pago exacto. ¡Gracias!',
    },
    {
      nombre: 'Recuperar entrega fallida',
      etapa: 'GANADO',
      cuerpo:
        'Hola {{cliente}}, pasamos a entregar tu pedido {{pedido}} y no encontramos a nadie 😕 ¿Qué día y horario te queda mejor para reprogramar?',
    },
  ];
  const plantillasWA = await Promise.all(
    plantillasTexto.map((p) => prisma.plantillaWhatsApp.create({ data: p })),
  );

  // --- Prospectos, conversaciones y pedidos ---------------------------------
  console.log('Creando prospectos, conversaciones y pedidos…');

  const nombresClientes = [
    'María Fernanda López', 'José Luis Herrera', 'Karla Jiménez', 'Andrés Mota',
    'Patricia Ruiz', 'Emiliano Vega', 'Sofía Castañeda', 'Ricardo Ibarra',
    'Gabriela Núñez', 'Tomás Reséndiz', 'Alejandra Pineda', 'Óscar Fuentes',
    'Valeria Arriaga', 'Sergio Bautista', 'Daniela Escobar', 'Mauricio Salas',
    'Rosa Elena Trejo', 'Fernando Aguilar', 'Lucía Zamora', 'Néstor Peralta',
    'Itzel Camacho', 'Rodrigo Blanco', 'Mariana Ochoa', 'Julio César Rivas',
    'Paola Guzmán', 'Héctor Domínguez', 'Renata Solís', 'Adrián Cuevas',
    'Norma Cárdenas', 'Pablo Ordóñez', 'Cecilia Mendoza', 'Ismael Robles',
    'Verónica Lara', 'Arturo Nájera', 'Brenda Cortés', 'Luis Ángel Serrano',
    'Elena Márquez', 'Javier Ontiveros', 'Silvia Padilla', 'Raúl Estrada',
    'Miriam Tovar', 'Enrique Valdés', 'Carolina Bermúdez', 'Gustavo Linares',
    'Ximena Rojas', 'Alan Cervantes', 'Teresa Godínez', 'Marcos Delgado',
  ];
  const calles = ['Av. Insurgentes', 'Calle Morelos', 'Av. Revolución', 'Calle Hidalgo', 'Av. Universidad', 'Calle 5 de Mayo', 'Av. Chapultepec', 'Calle Juárez'];
  const colonias = ['Del Valle', 'Roma Norte', 'Narvarte', 'Coyoacán', 'Escandón', 'Lindavista', 'Iztacalco', 'Satélite'];
  const referencias = ['Portón negro', 'Frente a la farmacia', 'Edificio azul, timbre 3', 'Junto a la papelería', 'Casa de dos pisos con reja blanca'];
  const motivosPerdida = ['Le pareció caro', 'Ya lo compró en otro lado', 'Dejó de responder', 'No hay cobertura de envío', 'Sólo preguntaba'];

  const origenPorCampana: Record<string, string> = {
    VIDEO: 'TIKTOK_VIDEO',
    LIVE: 'TIKTOK_LIVE',
    ADS: 'TIKTOK_ADS',
    PERFIL: 'PERFIL',
  };

  let contadorLead = 0;
  let contadorPedido = 0;
  // Stock en memoria para descontar las ventas sin consultar la base cada vez.
  const stockActual = new Map(productos.map((p) => [p.id, p.stock]));

  for (const nombreCliente of nombresClientes) {
    contadorLead += 1;
    const diasAtras = entre(0, 75);
    const creadoAt = haceDias(diasAtras, entre(9, 21));
    const campana = elegir(campanas);
    const producto = elegir(productos);
    const vendedor = elegir(vendedores);
    const ciudad = elegir(['Ciudad de México', 'Estado de México', 'Guadalajara', 'Monterrey', 'Puebla']);

    // Los leads más antiguos ya tuvieron tiempo de resolverse; los recientes no.
    let estado: string;
    if (diasAtras < 3) estado = elegir(['NUEVO', 'NUEVO', 'CONTACTADO', 'EN_CONVERSACION']);
    else if (diasAtras < 10) estado = elegir(['CONTACTADO', 'EN_CONVERSACION', 'COTIZADO', 'GANADO', 'PERDIDO']);
    else estado = elegir(['GANADO', 'GANADO', 'GANADO', 'PERDIDO', 'PERDIDO', 'COTIZADO']);

    const lead = await prisma.lead.create({
      data: {
        codigo: `LEAD-${String(contadorLead).padStart(4, '0')}`,
        nombre: nombreCliente,
        telefono: `55${entre(10000000, 99999999)}`,
        ciudad,
        origen: origenPorCampana[campana.tipo] ?? 'OTRO',
        estado,
        campanaId: campana.id,
        productoInteresId: producto.id,
        vendedorId: estado === 'NUEVO' ? null : vendedor.id,
        motivoPerdida: estado === 'PERDIDO' ? elegir(motivosPerdida) : null,
        createdAt: creadoAt,
        ultimoContactoAt: estado === 'NUEVO' ? null : new Date(creadoAt.getTime() + entre(1, 40) * 60 * 60 * 1000),
      },
    });

    // Conversación de WhatsApp acorde al avance del lead.
    if (estado !== 'NUEVO') {
      const guion: { direccion: string; cuerpo: string; plantillaId?: string }[] = [
        {
          direccion: 'SALIENTE',
          cuerpo: `¡Hola ${nombreCliente.split(' ')[0]}! 👋 Soy ${vendedor.nombre.split(' ')[0]} de Compr-Ya. Vi que te interesó ${producto.nombre} por nuestro TikTok.`,
          plantillaId: plantillasWA[0].id,
        },
      ];
      if (estado !== 'CONTACTADO') {
        guion.push({ direccion: 'ENTRANTE', cuerpo: elegir(['Hola, sí me interesa. ¿Cuánto cuesta?', 'Buenas, ¿hacen envíos a mi zona?', '¿Sigue disponible?']) });
        guion.push({
          direccion: 'SALIENTE',
          cuerpo: `${producto.nombre} está en $${(producto.precio / 100).toFixed(2)} con envío a ${ciudad} y pago contra entrega. ¿Te lo aparto?`,
          plantillaId: plantillasWA[2].id,
        });
      }
      if (estado === 'GANADO') {
        guion.push({ direccion: 'ENTRANTE', cuerpo: 'Sí, lo quiero. Te paso mis datos.' });
      } else if (estado === 'PERDIDO') {
        guion.push({ direccion: 'ENTRANTE', cuerpo: elegir(['Gracias, lo voy a pensar.', 'Está un poco caro para mí.', 'Ya lo compré en otro lugar.']) });
      }

      let desplazamiento = 0;
      for (const mensaje of guion) {
        desplazamiento += entre(5, 180);
        await prisma.mensajeWhatsApp.create({
          data: {
            leadId: lead.id,
            direccion: mensaje.direccion,
            cuerpo: mensaje.cuerpo,
            plantillaId: mensaje.plantillaId,
            empleadoId: mensaje.direccion === 'SALIENTE' ? vendedor.id : null,
            createdAt: new Date(creadoAt.getTime() + desplazamiento * 60 * 1000),
          },
        });
      }
    }

    if (estado !== 'GANADO') continue;

    // --- El lead ganado se convierte en pedido -------------------------------
    contadorPedido += 1;
    const zona = ciudad === 'Ciudad de México' ? elegir(zonas.slice(0, 3)) : ciudad === 'Estado de México' ? zonas[3] : zonas[4];
    const pedidoAt = new Date(creadoAt.getTime() + entre(2, 30) * 60 * 60 * 1000);

    // Uno o dos productos por pedido; el segundo es una venta cruzada.
    const productosPedido = [producto];
    if (probabilidad(0.35)) {
      const extra = elegir(productos);
      if (extra.id !== producto.id) productosPedido.push(extra);
    }

    const items = productosPedido.map((p) => {
      const cantidad = probabilidad(0.2) ? 2 : 1;
      return { producto: p, cantidad, precioUnitario: p.precio, subtotal: p.precio * cantidad };
    });
    const subtotal = items.reduce((suma, i) => suma + i.subtotal, 0);
    const descuento = probabilidad(0.15) ? Math.round(subtotal * 0.1) : 0;
    const total = subtotal - descuento + zona.costoEnvio;

    // El estado del pedido depende de cuánto tiempo lleva creado.
    const diasDelPedido = Math.floor((HOY.getTime() - pedidoAt.getTime()) / DIA_MS);
    let estadoPedido: string;
    if (diasDelPedido < 1) estadoPedido = elegir(['PENDIENTE', 'CONFIRMADO']);
    else if (diasDelPedido < 3) estadoPedido = elegir(['CONFIRMADO', 'PREPARANDO', 'ENVIADO']);
    else estadoPedido = elegir(['ENTREGADO', 'ENTREGADO', 'ENTREGADO', 'ENTREGADO', 'DEVUELTO', 'CANCELADO']);

    const metodoPago = elegir(['CONTRA_ENTREGA', 'CONTRA_ENTREGA', 'CONTRA_ENTREGA', 'TRANSFERENCIA', 'TARJETA']);
    const cerrado = ['ENTREGADO', 'CANCELADO', 'DEVUELTO'].includes(estadoPedido);

    const pedido = await prisma.pedido.create({
      data: {
        codigo: `PED-${String(contadorPedido).padStart(4, '0')}`,
        clienteNombre: nombreCliente,
        telefono: lead.telefono,
        direccion: `${elegir(calles)} ${entre(10, 890)}, Col. ${elegir(colonias)}`,
        ciudad,
        referencia: elegir(referencias),
        estado: estadoPedido,
        metodoPago,
        subtotal,
        descuento,
        costoEnvio: zona.costoEnvio,
        total,
        leadId: lead.id,
        vendedorId: vendedor.id,
        createdAt: pedidoAt,
        confirmadoAt: estadoPedido === 'PENDIENTE' ? null : new Date(pedidoAt.getTime() + 60 * 60 * 1000),
        cerradoAt: cerrado ? new Date(pedidoAt.getTime() + entre(24, 96) * 60 * 60 * 1000) : null,
        items: {
          create: items.map((i) => ({
            productoId: i.producto.id,
            cantidad: i.cantidad,
            precioUnitario: i.precioUnitario,
            subtotal: i.subtotal,
          })),
        },
      },
    });

    // Movimientos de inventario: sale al confirmar, regresa si se devuelve.
    if (estadoPedido !== 'PENDIENTE' && estadoPedido !== 'CANCELADO') {
      for (const item of items) {
        const previo = stockActual.get(item.producto.id) ?? 0;
        const resultante = previo - item.cantidad;
        stockActual.set(item.producto.id, resultante);
        await prisma.movimientoInventario.create({
          data: {
            productoId: item.producto.id,
            tipo: 'SALIDA',
            cantidad: item.cantidad,
            stockResultante: resultante,
            motivo: 'Venta',
            referencia: pedido.codigo,
            empleadoId: almacenista.id,
            createdAt: new Date(pedidoAt.getTime() + 2 * 60 * 60 * 1000),
          },
        });
      }
      if (estadoPedido === 'DEVUELTO') {
        for (const item of items) {
          const previo = stockActual.get(item.producto.id) ?? 0;
          const resultante = previo + item.cantidad;
          stockActual.set(item.producto.id, resultante);
          await prisma.movimientoInventario.create({
            data: {
              productoId: item.producto.id,
              tipo: 'DEVOLUCION',
              cantidad: item.cantidad,
              stockResultante: resultante,
              motivo: 'Cliente rechazó el pedido',
              referencia: pedido.codigo,
              empleadoId: almacenista.id,
              createdAt: new Date(pedidoAt.getTime() + 72 * 60 * 60 * 1000),
            },
          });
        }
      }
    }

    // Envío asociado.
    const mapaEstadoEnvio: Record<string, string> = {
      PENDIENTE: 'POR_ASIGNAR',
      CONFIRMADO: 'POR_ASIGNAR',
      PREPARANDO: 'ASIGNADO',
      ENVIADO: 'EN_RUTA',
      ENTREGADO: 'ENTREGADO',
      DEVUELTO: 'DEVUELTO',
      CANCELADO: 'POR_ASIGNAR',
    };
    const estadoEnvio = mapaEstadoEnvio[estadoPedido];
    const necesitaRepartidor = ['ASIGNADO', 'EN_RUTA', 'ENTREGADO', 'DEVUELTO'].includes(estadoEnvio);
    await prisma.envio.create({
      data: {
        pedidoId: pedido.id,
        zonaId: zona.id,
        repartidorId: necesitaRepartidor ? elegir(repartidores).id : null,
        estado: estadoEnvio,
        guia: necesitaRepartidor ? `GUIA-${entre(100000, 999999)}` : null,
        fechaProgramada: new Date(pedidoAt.getTime() + zona.horasEstimadas * 60 * 60 * 1000),
        fechaEntrega: estadoEnvio === 'ENTREGADO' ? new Date(pedidoAt.getTime() + entre(20, 90) * 60 * 60 * 1000) : null,
        intentos: estadoEnvio === 'ENTREGADO' ? (probabilidad(0.2) ? 2 : 1) : estadoEnvio === 'DEVUELTO' ? 3 : 0,
        costoReal: necesitaRepartidor ? zona.costoEnvio + entre(-1500, 2500) : null,
        montoCobrado: estadoEnvio === 'ENTREGADO' && metodoPago === 'CONTRA_ENTREGA' ? total : null,
        observaciones: estadoEnvio === 'DEVUELTO' ? 'Tres intentos sin éxito, el cliente no respondió.' : null,
        createdAt: pedidoAt,
      },
    });

    // Comisión del vendedor, sólo si la venta cuenta como efectiva.
    if (['CONFIRMADO', 'PREPARANDO', 'ENVIADO', 'ENTREGADO'].includes(estadoPedido)) {
      const base = subtotal - descuento;
      const monto = Math.round(base * vendedor.tasaComision);
      let estadoComision = 'PENDIENTE';
      if (estadoPedido === 'ENTREGADO') {
        estadoComision = periodoDe(pedidoAt) === periodoDe(HOY) ? 'APROBADA' : 'PAGADA';
      }
      await prisma.comision.create({
        data: {
          empleadoId: vendedor.id,
          pedidoId: pedido.id,
          base,
          porcentaje: vendedor.tasaComision,
          monto,
          estado: estadoComision,
          periodo: periodoDe(pedidoAt),
          createdAt: pedidoAt,
          pagadaAt: estadoComision === 'PAGADA' ? new Date(pedidoAt.getTime() + 20 * DIA_MS) : null,
        },
      });
    }
  }

  // Se sincroniza el stock final con lo que dicen los movimientos.
  for (const [productoId, stock] of stockActual) {
    await prisma.producto.update({ where: { id: productoId }, data: { stock } });
  }

  // Verificación: el stock de cada producto debe coincidir con sus movimientos.
  for (const producto of productos) {
    const movimientos = await prisma.movimientoInventario.findMany({
      where: { productoId: producto.id },
      select: { tipo: true, cantidad: true },
    });
    const calculado = movimientos.reduce(
      (suma, m) => suma + (MOVIMIENTOS_QUE_SUMAN.has(m.tipo) ? m.cantidad : -m.cantidad),
      0,
    );
    if (calculado !== stockActual.get(producto.id)) {
      throw new Error(
        `Inventario inconsistente en ${producto.sku}: movimientos dan ${calculado}, stock ${stockActual.get(producto.id)}`,
      );
    }
  }

  const resumen = {
    equipos: await prisma.equipo.count(),
    empleados: await prisma.empleado.count(),
    productos: await prisma.producto.count(),
    campanas: await prisma.campana.count(),
    leads: await prisma.lead.count(),
    mensajes: await prisma.mensajeWhatsApp.count(),
    pedidos: await prisma.pedido.count(),
    envios: await prisma.envio.count(),
    comisiones: await prisma.comision.count(),
    asistencias: await prisma.asistencia.count(),
  };
  console.log('Datos de ejemplo creados:', resumen);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
