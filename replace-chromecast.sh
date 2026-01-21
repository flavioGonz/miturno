#!/bin/bash
# Script para reemplazar el código de Chromecast

cd ~/turnito

# Backup del archivo original
cp index.js index.js.backup_$(date +%Y%m%d_%H%M%S)

# Encontrar línea donde empieza CHROMECAST
START_LINE=$(grep -n "// 📺 CHROMECAST" index.js | cut -d: -f1)

# Encontrar línea donde termina (buscar el siguiente comentario de sección grande)
END_LINE=$(tail -n +$((START_LINE + 1)) index.js | grep -n "^// ---" | head -n 1 | cut -d: -f1)
END_LINE=$((START_LINE + END_LINE))

echo "Reemplazando líneas $START_LINE a $END_LINE"

# Crear archivo temporal con la primera parte
head -n $((START_LINE - 1)) index.js > index.js.tmp

# Agregar el nuevo código de Chromecast
cat >> index.js.tmp << 'CHROMECAST_CODE'
// -----------------------------------------------------------------------------
// 📺 CHROMECAST con chromecast-api
// -----------------------------------------------------------------------------
const ChromecastAPI = require('chromecast-api');
const chromecastClient = new ChromecastAPI();

let chromecasts = [];

chromecastClient.on('device', (device) => {
  console.log(`📡 [Chromecast] Encontrado: ${device.friendlyName} (${device.host})`);
  
  const existingIndex = chromecasts.findIndex(c => c.id === device.host);
  const deviceData = {
    id: device.host,
    name: device.friendlyName,
    address: device.host,
    device: device
  };

  if (existingIndex === -1) {
    chromecasts.push(deviceData);
  } else {
    chromecasts[existingIndex] = deviceData;
  }
});

app.get('/api/chromecast/scan', isApiAuthenticated, (req, res) => {
  res.json(chromecasts);
});

app.post('/api/chromecast/cast', isApiAuthenticated, (req, res) => {
  const { ip, url } = req.body;
  
  if (!ip || !url) {
    return res.status(400).json({ error: 'IP y URL requeridos' });
  }

  console.log(`[CAST] ${ip} -> ${url}`);

  const deviceData = chromecasts.find(c => c.address === ip);
  
  if (!deviceData || !deviceData.device) {
    return res.status(404).json({ error: 'Dispositivo no encontrado' });
  }

  const device = deviceData.device;

  try {
    device.play(url, 0, (err) => {
      if (err) {
        console.error('[CAST ERROR]', err);
        return res.status(500).json({ error: 'Error: ' + err.message });
      }
      res.json({ success: true, message: 'Casting iniciado' });
    });
  } catch (e) {
    console.error('[CAST EXCEPTION]', e);
    res.status(500).json({ error: 'Error: ' + e.message });
  }
});

CHROMECAST_CODE

# Agregar el resto del archivo
tail -n +$((END_LINE + 1)) index.js >> index.js.tmp

# Reemplazar el archivo original
mv index.js.tmp index.js

echo "✅ Código de Chromecast reemplazado"
