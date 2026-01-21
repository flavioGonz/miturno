const usb = require('usb');

console.log('🔍 Buscando dispositivo POS...');
const devices = usb.getDeviceList();
const pos = devices.find(d => d.deviceDescriptor.idVendor === 0x0416 && d.deviceDescriptor.idProduct === 0x5011);

if (!pos) {
  console.error('❌ No se encontró la impresora POS80.');
  process.exit(1);
}

console.log('✅ Impresora POS80 detectada, intentando abrir...');
try {
  pos.open();
  const iface = pos.interfaces[0];
  iface.claim();

  // Buscar endpoint de escritura (OUT)
  const ep = iface.endpoints.find(e => e.direction === 'out');
  if (!ep) throw new Error('No se encontró endpoint OUT.');

  console.log('🖨️ Enviando comando ESC/POS...');
  const ESC = '\x1B';
  const data = Buffer.from(
    `${ESC}@\nTURNITO ADMIN\nSistema de Turnos\n------------------------------\nTICKET TEST\n------------------------------\nGracias por su visita\n${ESC}d\x02${ESC}m\n`,
    'ascii'
  );

  ep.transfer(data, (err) => {
    if (err) console.error('💥 Error enviando datos:', err);
    else console.log('✅ Ticket enviado correctamente.');
    iface.release(true, () => pos.close());
  });
} catch (e) {
  console.error('💥 Error general:', e.message);
}
