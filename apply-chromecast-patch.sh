#!/bin/bash
cd ~/turnito

# Backup
cp index.js index.js.backup_$(date +%s)

# Agregar import del módulo después de la línea 21 (después de const os = require('os');)
sed -i "21a const ChromecastHandler = require('./chromecast-handler');" index.js

# Agregar instancia después de la línea que agregamos
sed -i "22a const chromecastHandler = new ChromecastHandler();" index.js

# Reemplazar el endpoint de scan (buscar la línea y reemplazarla)
sed -i "s|app.get('/api/chromecast/scan'.*|app.get('/api/chromecast/scan', isApiAuthenticated, (req, res) => { res.json({ devices: chromecastHandler.getDevices() }); });|" index.js

# Reemplazar el endpoint de cast (desde la línea hasta el final del endpoint)
# Primero encontrar la línea
LINE=$(grep -n "app.post('/api/chromecast/cast'" index.js | cut -d: -f1)

# Eliminar desde esa línea hasta encontrar el siguiente app.
END_LINE=$(tail -n +$((LINE + 1)) index.js | grep -n "^app\." | head -n 1 | cut -d: -f1)
END_LINE=$((LINE + END_LINE - 1))

# Eliminar esas líneas
sed -i "${LINE},${END_LINE}d" index.js

# Insertar el nuevo endpoint
sed -i "${LINE}i app.post('/api/chromecast/cast', isApiAuthenticated, (req, res) => {\\
  const { ip, url } = req.body;\\
  if (!ip || !url) return res.status(400).json({ error: 'IP y URL requeridos' });\\
  console.log(\`[CAST] \${ip} -> \${url}\`);\\
  chromecastHandler.cast(ip, url, (err, result) => {\\
    if (err) return res.status(500).json({ error: err.message });\\
    res.json({ success: true, message: 'Casting iniciado' });\\
  });\\
});" index.js

echo "✅ Cambios aplicados"
