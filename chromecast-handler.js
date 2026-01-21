// chromecast-handler.js - Módulo de Chromecast con chromecast-api
const ChromecastAPI = require('chromecast-api');

class ChromecastHandler {
    constructor() {
        this.client = new ChromecastAPI();
        this.devices = [];
        this.init();
    }

    init() {
        this.client.on('device', (device) => {
            console.log(`📡 [Chromecast] Encontrado: ${device.friendlyName} (${device.host})`);

            const existingIndex = this.devices.findIndex(d => d.id === device.host);
            const deviceData = {
                id: device.host,
                name: device.friendlyName,
                address: device.host,
                device: device
            };

            if (existingIndex === -1) {
                this.devices.push(deviceData);
            } else {
                this.devices[existingIndex] = deviceData;
            }
        });
    }

    getDevices() {
        return this.devices;
    }

    cast(ip, url, callback) {
        const deviceData = this.devices.find(d => d.address === ip);

        if (!deviceData || !deviceData.device) {
            return callback(new Error('Dispositivo no encontrado'));
        }

        const device = deviceData.device;

        try {
            device.play(url, 0, (err) => {
                if (err) {
                    console.error('[CAST ERROR]', err);
                    return callback(err);
                }
                callback(null, { success: true });
            });
        } catch (e) {
            console.error('[CAST EXCEPTION]', e);
            callback(e);
        }
    }
}

module.exports = ChromecastHandler;
