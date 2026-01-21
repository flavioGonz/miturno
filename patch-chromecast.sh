#!/bin/bash
# Parche simple para Chromecast

cd ~/turnito

# Backup
cp index.js index.js.backup_chromecast

# Reemplazar imports (líneas 22-36 aproximadamente)
sed -i '22,36d' index.js
sed -i '21a\\n// Chromecast con chromecast-api\nconst ChromecastAPI = require('"'"'chromecast-api'"'"');\nconst chromecastClient = new ChromecastAPI();\nlet chromecasts = [];' index.js

# Reemplazar sección de Chromecast (líneas 1989-2118 aproximadamente)
# Primero eliminar la sección vieja
sed -i '1989,2118d' index.js

# Insertar la nueva sección
sed -i '1988a\\n// -----------------------------------------------------------------------------\n// 📺 CHROMECAST LOGIC con chromecast-api\n// -----------------------------------------------------------------------------\n\nchromecastClient.on('"'"'device'"'"', (device) => {\n  console.log(`📡 [Chromecast] Encontrado: ${device.friendlyName} (${device.host})`);\n  const existingIndex = chromecasts.findIndex(c => c.id === device.host);\n  const deviceData = { id: device.host, name: device.friendlyName, address: device.host, device: device };\n  if (existingIndex === -1) { chromecasts.push(deviceData); } else { chromecasts[existingIndex] = deviceData; }\n});\n\napp.get('"'"'/api/chromecast/scan'"'"', isApiAuthenticated, (req, res) => {\n  console.log('"'"'🔍 Consultando dispositivos Cast...'"'"');\n  res.json({ devices: chromecasts });\n});\n\napp.post('"'"'/api/chromecast/cast'"'"', isApiAuthenticated, (req, res) => {\n  const { ip, url } = req.body;\n  if (!ip || !url) return res.status(400).json({ error: '"'"'IP y URL requeridos'"'"' });\n  console.log(`[CAST] ${ip} -> ${url}`);\n  const deviceData = chromecasts.find(c => c.address === ip);\n  if (!deviceData || !deviceData.device) return res.status(404).json({ error: '"'"'Dispositivo no encontrado'"'"' });\n  const device = deviceData.device;\n  try {\n    device.play(url, 0, (err) => {\n      if (err) { console.error('"'"'[CAST ERROR]'"'"', err); return res.status(500).json({ error: '"'"'Error: '"'"' + err.message }); }\n      res.json({ success: true, message: '"'"'Casting iniciado'"'"' });\n    });\n  } catch (e) { console.error('"'"'[CAST EXCEPTION]'"'"', e); res.status(500).json({ error: '"'"'Error: '"'"' + e.message }); }\n});' index.js

echo "✅ Parche aplicado"
