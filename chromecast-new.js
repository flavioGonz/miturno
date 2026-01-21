// -----------------------------------------------------------------------------
// 📺 CHROMECAST con chromecast-api (más simple y estable)
// -----------------------------------------------------------------------------
const ChromecastAPI = require('chromecast-api');
const chromecastClient = new ChromecastAPI();

let chromecasts = [];

// Escanear dispositivos
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

// API: Escanear Chromecasts
app.get('/api/chromecast/scan', isApiAuthenticated, (req, res) => {
    res.json(chromecasts);
});

// API: Casting
app.post('/api/chromecast/cast', isApiAuthenticated, (req, res) => {
    const { ip, url } = req.body;

    if (!ip || !url) {
        return res.status(400).json({ error: 'IP y URL requeridos' });
    }

    console.log(`[CAST] ${ip} -> ${url}`);

    // Buscar el dispositivo
    const deviceData = chromecasts.find(c => c.address === ip);

    if (!deviceData || !deviceData.device) {
        return res.status(404).json({ error: 'Dispositivo no encontrado. Escanea la red primero.' });
    }

    const device = deviceData.device;

    // Detectar tipo de contenido
    let contentType = 'video/mp4';
    if (url.match(/\.(jpg|jpeg|png|webp|gif)/i)) {
        contentType = url.match(/\.png/i) ? 'image/png' : 'image/jpeg';
    } else if (url.match(/\.(mp4|webm|mkv)/i)) {
        contentType = 'video/mp4';
    }

    try {
        // Usar chromecast-api para reproducir
        device.play(url, 0, (err) => {
            if (err) {
                console.error('[CAST ERROR]', err);
                return res.status(500).json({ error: 'Error al reproducir: ' + err.message });
            }
            res.json({ success: true, message: 'Casting iniciado correctamente' });
        });
    } catch (e) {
        console.error('[CAST EXCEPTION]', e);
        res.status(500).json({ error: 'Error interno: ' + e.message });
    }
});
