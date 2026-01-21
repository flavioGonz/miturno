// Endpoint de casting simplificado y robusto
app.post('/api/chromecast/cast', isApiAuthenticated, (req, res) => {
    const { ip, url } = req.body;

    // Validación básica
    if (!ip || !url) {
        return res.status(400).json({ error: 'IP y URL requeridos' });
    }

    // Verificar disponibilidad de módulos
    if (!chromecastAvailable) {
        return res.status(503).json({ error: 'Chromecast no disponible' });
    }

    console.log(`[CAST] ${ip} -> ${url}`);

    // Detectar tipo de contenido
    let contentType = 'video/mp4';
    if (url.match(/\.(jpg|jpeg|png|webp|gif)/i)) {
        contentType = url.match(/\.png/i) ? 'image/png' : 'image/jpeg';
    } else if (url.includes('http')) {
        contentType = 'text/html';
    }

    // Intentar casting
    try {
        const client = new Client();
        let done = false;

        // Timeout de seguridad
        const timeout = setTimeout(() => {
            if (!done) {
                done = true;
                try { client.close(); } catch (e) { }
                res.status(504).json({ error: 'Timeout' });
            }
        }, 15000);

        // Conectar
        client.connect(ip, () => {
            if (done) return;

            client.launch(DefaultMediaReceiver, (err, player) => {
                if (done) return;

                if (err) {
                    done = true;
                    clearTimeout(timeout);
                    try { client.close(); } catch (e) { }
                    return res.status(500).json({ error: err.message });
                }

                const media = {
                    contentId: url,
                    contentType: contentType,
                    streamType: 'BUFFERED',
                    metadata: {
                        type: 0,
                        metadataType: 0,
                        title: "Turnito",
                        images: []
                    }
                };

                player.load(media, { autoplay: true }, (err) => {
                    if (done) return;
                    done = true;
                    clearTimeout(timeout);
                    try { client.close(); } catch (e) { }

                    if (err) {
                        return res.status(500).json({ error: err.message });
                    }
                    res.json({ success: true, message: 'Casting iniciado' });
                });
            });
        });

        client.on('error', (err) => {
            if (!done) {
                done = true;
                clearTimeout(timeout);
                try { client.close(); } catch (e) { }
                res.status(500).json({ error: err.message });
            }
        });

    } catch (e) {
        console.error('[CAST ERROR]', e);
        res.status(500).json({ error: 'Error interno: ' + e.message });
    }
});
