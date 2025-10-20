const escpos = require('@node-escpos/core');
const USB = require('@node-escpos/usb-adapter');  // ← exporta directamente la clase

const device = new USB();  // ← CORRECTO para tu versión
const printer = new escpos.Printer(device, { encoding: 'UTF-8' });

device.open(() => {
  printer
    .align('ct')
    .text('Turnito POS80 OK (Node20)')
    .cut()
    .close();
});
