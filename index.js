// -----------------------------------------------------------------------------
// File: /home/fgonzalez/turnito/index.js
// Turnito Admin v4.1 – Sistema completo (GPIO Live + Impresión Node20)
// -----------------------------------------------------------------------------
// © Infratec Networks - Flavio González, Uruguay 2025
// -----------------------------------------------------------------------------

const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const bcrypt = require('bcrypt');
const SQLiteStore = require('connect-sqlite3')(session);
const expressLayouts = require('express-ejs-layouts');
const { exec, execFile, execSync } = require('child_process');
const fs = require('fs');
const fsPromises = require('fs/promises');
const upload = require('express-fileupload');
const http = require('http');
const { Server } = require('socket.io');
const os = require('os');

// -----------------------------------------------------------------------------
// ⚙️ Configuración base
// -----------------------------------------------------------------------------
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const port = 3000;
const saltRounds = 10;

// -----------------------------------------------------------------------------
// 🗄️ Base de datos SQLite
// -----------------------------------------------------------------------------
const dbPath = path.join(__dirname, 'db', 'turnito.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error('❌ Error conectando a SQLite:', err.message);
  else {
    console.log('✅ SQLite conectado.');
    db.serialize(() => {
      db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT
      );`);
      db.run(`CREATE TABLE IF NOT EXISTS queues (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE
      );`);
      db.run(`CREATE TABLE IF NOT EXISTS turns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        queue_id INTEGER,
        turn_number INTEGER,
        status TEXT DEFAULT 'waiting',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );`);
      db.get('SELECT * FROM users WHERE username="admin"', (err, row) => {
        if (!row) {
          bcrypt.hash('password', saltRounds, (err, hash) => {
            db.run('INSERT INTO users (username,password) VALUES (?,?)', ['admin', hash]);
            console.log('👤 Usuario admin creado (password: password)');
          });
        }
      });
    });
  }
});

// -----------------------------------------------------------------------------
// 🚀 Express configuración
// -----------------------------------------------------------------------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(expressLayouts);
app.set('layout', 'layout');
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(upload());

app.use(session({
  store: new SQLiteStore({ db: 'turnito.db', dir: path.join(__dirname, 'db') }),
  secret: 'turnito_secret',
  resave: false,
  saveUninitialized: false
}));

app.use((req, res, next) => {
  res.locals.username = req.session.username || 'Invitado';
  next();
});

function isAuthenticated(req, res, next) {
  if (req.session.userId) return next();
  res.redirect('/login');
}
function isApiAuthenticated(req, res, next) {
  if (req.session.userId) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// -----------------------------------------------------------------------------
// 🔐 Login
// -----------------------------------------------------------------------------
app.get('/login', (req, res) =>
  res.render('login', { layout: false, error: null, title: 'Login - Turnito Admin' })
);

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
    if (!user)
      return res.render('login', { layout: false, error: 'Credenciales inválidas', title: 'Login - Turnito Admin' });
    bcrypt.compare(password, user.password, (err, ok) => {
      if (ok) {
        req.session.userId = user.id;
        req.session.username = user.username;
        res.redirect('/');
      } else {
        res.render('login', { layout: false, error: 'Credenciales inválidas', title: 'Login - Turnito Admin' });
      }
    });
  });
});

app.get('/logout', (req, res) => req.session.destroy(() => res.redirect('/login')));

// -----------------------------------------------------------------------------
// 🏠 Dashboard
// -----------------------------------------------------------------------------
app.get('/', isAuthenticated, (req, res) => res.render('index', { title: 'Turnito Dashboard' }));

// -----------------------------------------------------------------------------
// 🧩 Vistas del sistema
// -----------------------------------------------------------------------------
app.get('/sistema/:section', isAuthenticated, (req, res) => {
  const s = req.params.section;
  const valid = [
    'resumen',
    'acciones',
    'red',
    'logs',
    'servicios',
    'fullpageos',
    'pantallas',
    'publicidad',
    'control',
    'gpio',
    'impresion'
  ];
  if (!valid.includes(s)) return res.status(404).send('404');
  res.render(`sistema/${s}`, { title: `Sistema - ${s}` });
});

// -----------------------------------------------------------------------------
// 🖥️ Pantalla pública (alias /monitor y /pantalla)
// -----------------------------------------------------------------------------
app.get(['/monitor', '/pantalla'], (req, res) => {
  res.render('monitor', { layout: false, title: 'Pantalla Pública - MiTurno 1.0' });
});

// -----------------------------------------------------------------------------
// 🧠 GPIO (modo cliente pigpiod con antirrebote y protección de notifiers)
// -----------------------------------------------------------------------------
const { pigpio } = require('pigpio-client');

try {
  execSync('sudo systemctl restart pigpiod');
  console.log('♻️ Reiniciando pigpiod para limpiar notifiers previos...');
} catch (e) {
  console.warn('⚠️ No se pudo reiniciar pigpiod automáticamente:', e.message);
}

(async () => {
  try {
    const pi = pigpio({ host: 'localhost' });
    pi.once('connected', async () => {
      console.log('✅ Conectado al daemon pigpiod');

      const gpioPins = [
        { id: 17, mode: 'IN', action: 'emit_ticket' },
        { id: 27, mode: 'IN', action: 'next_turn' },
        { id: 22, mode: 'IN', action: 'prev_turn' },
        { id: 23, mode: 'OUT', action: 'led' }
      ];


      

      const activePins = {};
      const debounceState = {};

      for (const pin of gpioPins) {
        const g = pi.gpio(pin.id);
        activePins[pin.id] = g;

        if (pin.mode === 'IN') {
          await g.modeSet('input');
          debounceState[pin.id] = { lastTime: 0, lastValue: 0 };

          try {
            g.notify((value) => {
              const now = Date.now();
              const state = debounceState[pin.id];
              if (now - state.lastTime < 10) return;
              state.lastTime = now;
              if (value === 0) return;
              if (value !== state.lastValue) {
                state.lastValue = value;
                return;
              }
              console.log(`🔹 GPIO${pin.id} PRESIONADO`);
              io.emit('gpio-update', { pin: pin.id, value, action: pin.action });

              switch (pin.action) {
  case 'emit_ticket': {
    console.log('🎟️ [GPIO] Crear nuevo turno');
    db.get('SELECT MAX(turn_number) AS max FROM turns WHERE queue_id=?', [1], (err, row) => {
      const next = (row?.max || 0) + 1;
      db.run('INSERT INTO turns (queue_id, turn_number) VALUES (?, ?)', [1, next], function (e) {
        if (e) return console.error('❌ Error creando turno desde GPIO:', e.message);
        const turnData = { id: this.lastID, queue_id: 1, turn_number: next };
        io.emit('turn-update', { queue_id: 1, turn: next });
        printTurnTicket(turnData);
        console.log(`✅ Turno ${next} generado e impreso`);
      });
    });
    break;
  }

  case 'next_turn': {
    console.log('⏭️ [GPIO] Llamar siguiente turno');
    db.run("UPDATE turns SET status='completed' WHERE queue_id=? AND status='calling'", [1], (err) => {
      if (err) console.warn('⚠️ No se pudo completar turno previo');
      db.get("SELECT * FROM turns WHERE queue_id=? AND status='waiting' ORDER BY id ASC LIMIT 1", [1], (err2, next) => {
        if (!next) return console.log('🚫 No hay más turnos pendientes.');
        db.run('UPDATE turns SET status=? WHERE id=?', ['calling', next.id], (err3) => {
          if (err3) return console.error('❌ Error actualizando turno:', err3.message);
          io.emit('turn-update', { queue_id: 1, turn: next.turn_number });
          console.log(`📢 Turno ${next.turn_number} llamado`);
        });
      });
    });
    break;
  }

  case 'prev_turn':
    console.log('↩️ Retroceso manual (GPIO22)');
    break;
}


              state.lastValue = value;
            });
          } catch (err) {
            if (err.message.includes('Notifier already registered'))
              console.log(`⚠️ Notificador ya activo en GPIO${pin.id}, se omite duplicado.`);
            else console.error(`❌ Error configurando GPIO${pin.id}:`, err.message);
          }
        } else {
          await g.modeSet('output');
          await g.write(0);
        }
      }

      global.gpioPins = gpioPins;
      global.activePins = activePins;
    });

    pi.once('error', (err) => {
      console.error('❌ Error conectando a pigpiod:', err.message);
    });
  } catch (err) {
    console.error('⚠️ Error inicializando GPIO cliente:', err.message);
  }
})();





// -----------------------------------------------------------------------------
// 🧠 API QUEUES (TURNOS)
// -----------------------------------------------------------------------------
app.get('/api/queues', isApiAuthenticated, (req, res) => {
  db.all('SELECT * FROM queues', [], (err, rows) =>
    err ? res.status(500).json({ error: 'DB error' }) : res.json(rows)
  );
});

app.post('/api/queues', isApiAuthenticated, (req, res) => {
  db.run('INSERT INTO queues (name) VALUES (?)', [req.body.name], function (err) {
    err
      ? res.status(500).json({ error: 'Error creando cola' })
      : res.status(201).json({ id: this.lastID, name: req.body.name });
  });
});

app.get('/api/queues/:queueId/turns', isApiAuthenticated, (req, res) => {
  db.all('SELECT * FROM turns WHERE queue_id = ? ORDER BY turn_number', [req.params.queueId], (err, rows) =>
    err ? res.status(500).json({ error: 'DB error' }) : res.json(rows)
  );
});

app.post('/api/queues/:queueId/turns', isApiAuthenticated, (req, res) => {
  db.get('SELECT MAX(turn_number) AS max FROM turns WHERE queue_id=?', [req.params.queueId], (err, row) => {
    const next = (row?.max || 0) + 1;
    db.run('INSERT INTO turns (queue_id, turn_number) VALUES (?, ?)', [req.params.queueId, next], function (e) {
      e
        ? res.status(500).json({ error: 'Error agregando turno' })
        : res.status(201).json({ id: this.lastID, turn_number: next, status: 'waiting' });
    });
  });
});

// -----------------------------------------------------------------------------
// 🎯 Cola activa (para GPIO e impresión)
// -----------------------------------------------------------------------------
let activeQueueId = 1; // valor por defecto

app.post('/api/set-active-queue/:id', isApiAuthenticated, (req, res) => {
  activeQueueId = parseInt(req.params.id);
  console.log(`🎯 Cola activa configurada: ${activeQueueId}`);
  res.json({ success: true, queue: activeQueueId });
});




app.get('/api/get-active-queue', isApiAuthenticated, (req, res) => {
  db.get('SELECT * FROM queues WHERE id = ?', [activeQueueId], (err, row) => {
    if (err || !row) return res.json({ queue: null });
    res.json({ queue: row });
  });
});


// ✏️ Editar nombre de cola
app.put('/api/queues/:id', isApiAuthenticated, (req, res) => {
  const { name } = req.body;
  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Nombre inválido' });
  }
  db.run('UPDATE queues SET name = ? WHERE id = ?', [name.trim(), req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// 🗑️ Eliminar cola (y sus turnos)
app.delete('/api/queues/:id', isApiAuthenticated, (req, res) => {
  const id = parseInt(req.params.id);
  db.run('DELETE FROM queues WHERE id = ?', [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    db.run('DELETE FROM turns WHERE queue_id = ?', [id]);
    res.json({ success: true });
  });
});



// -----------------------------------------------------------------------------
// 🧾 SISTEMA DE TURNOS - RUTAS PÚBLICAS (para /monitor y /pantalla)
// -----------------------------------------------------------------------------

// 🔹 Listar colas (público, sin sesión)
app.get('/public/queues', (req, res) => {
  db.all('SELECT * FROM queues ORDER BY id ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// 🔹 Listar turnos por cola (público)
app.get('/public/queues/:id/turns', (req, res) => {
  const { id } = req.params;
  db.all(
    'SELECT * FROM turns WHERE queue_id = ? ORDER BY id ASC',
    [id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

// 🔹 Llamar siguiente turno (solo administrativo autenticado)
app.post('/api/queues/:id/call-next', isApiAuthenticated, (req, res) => {
  const { id } = req.params;

  // Completar turno actual (si lo hay)
  db.run(
    "UPDATE turns SET status='completed' WHERE queue_id=? AND status='calling'",
    [id],
    (err) => {
      if (err) console.warn('Error completando turno previo:', err.message);
    }
  );

  // Buscar el siguiente turno en espera
  db.get(
    "SELECT * FROM turns WHERE queue_id=? AND status='waiting' ORDER BY id ASC LIMIT 1",
    [id],
    (err, next) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!next) return res.json({ message: 'No hay más turnos pendientes.' });

      db.run('UPDATE turns SET status=? WHERE id=?', ['calling', next.id], (err2) => {
        if (err2) return res.status(500).json({ error: err2.message });

        console.log(`📢 Turno ${next.turn_number} llamado en cola ${id}`);
        io.emit('turn-update', { queue_id: id, turn: next.turn_number });
        res.json({ message: `Turno ${next.turn_number} llamado.`, turn: next });
      });
    }
  );
});




// -----------------------------------------------------------------------------
// 🧠 API PUBLICIDAD / PANTALLAS
// -----------------------------------------------------------------------------
app.get('/api/ads', isApiAuthenticated, (req, res) => {
  const dir = path.join(__dirname, 'public', 'media');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const files = fs.readdirSync(dir).filter(f => /\.(png|jpe?g|gif)$/i.test(f));
  let interval = 8;
  const cfg = path.join(dir, 'ads-config.json');
  if (fs.existsSync(cfg)) {
    try { interval = JSON.parse(fs.readFileSync(cfg)).interval || 8; } catch {}
  }
  res.json({ files, interval });
});

app.post('/api/ads', isApiAuthenticated, (req, res) => {
  if (!req.files || !req.files.adFile) return res.status(400).json({ error: 'Sin archivo' });
  const file = req.files.adFile;
  const dir = path.join(__dirname, 'public', 'media');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, file.name);
  file.mv(dest, (err) => {
    if (err) return res.status(500).json({ error: 'Error guardando archivo' });
    res.json({ message: 'Imagen subida correctamente' });
  });
});

app.delete('/api/ads/:filename', isApiAuthenticated, (req, res) => {
  const file = path.join(__dirname, 'public', 'media', req.params.filename);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'No existe' });
  fs.unlinkSync(file);
  res.json({ message: `Imagen ${req.params.filename} eliminada` });
});

app.post('/api/ads/interval', isApiAuthenticated, (req, res) => {
  const dir = path.join(__dirname, 'public', 'media');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const cfg = path.join(dir, 'ads-config.json');
  fs.writeFileSync(cfg, JSON.stringify({ interval: req.body.interval || 8 }));
  res.json({ message: 'Intervalo guardado correctamente' });
});

// -----------------------------------------------------------------------------
// 🔧 Logs del sistema
// -----------------------------------------------------------------------------
app.get('/api/system/logs/journal', isApiAuthenticated, (req, res) => {
  exec('journalctl -n 100 --no-pager', { maxBuffer: 2 * 1024 * 1024 }, (err, out) =>
    err ? res.status(500).json({ error: err.message }) : res.json({ logs: out })
  );
});

app.get('/api/system/logs/pm2', isApiAuthenticated, (req, res) => {
  exec('pm2 logs --nostream --lines 100', { maxBuffer: 2 * 1024 * 1024 }, (err, out) =>
    err ? res.status(500).json({ error: err.message }) : res.json({ logs: out })
  );
});

app.get('/api/system/logs/kernel', isApiAuthenticated, (req, res) => {
  exec('dmesg | tail -n 100', { maxBuffer: 2 * 1024 * 1024 }, (err, out) =>
    err ? res.status(500).json({ error: err.message }) : res.json({ logs: out })
  );
});

// -----------------------------------------------------------------------------
// 🔧 Servicios systemctl
// -----------------------------------------------------------------------------
app.get('/api/system/services', isApiAuthenticated, (req, res) => {
  exec('systemctl list-unit-files --type=service --no-pager', (err, out) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ services: out });
  });
});

app.post('/api/system/service/:name/restart', isApiAuthenticated, (req, res) => {
  exec(`systemctl restart ${req.params.name}`, (err) =>
    err ? res.status(500).json({ error: err.message }) : res.json({ message: 'Servicio reiniciado' })
  );
});

app.post('/api/system/service/:name/toggle', isApiAuthenticated, (req, res) => {
  const { action } = req.body;
  if (!['enable', 'disable'].includes(action)) return res.status(400).json({ error: 'Acción inválida' });
  exec(`systemctl ${action} ${req.params.name}`, (err) =>
    err ? res.status(500).json({ error: err.message }) : res.json({ message: `Servicio ${action} ejecutado` })
  );
});

// -----------------------------------------------------------------------------
// 🌐 Network nmcli
// -----------------------------------------------------------------------------
app.get('/api/network/status', isApiAuthenticated, (req, res) => {
  exec('nmcli general status', (err, out) => {
    if (err) return res.status(500).json({ error: err.message });
    exec('nmcli connection show --active', (e2, active) => {
      const mode = active.includes('TurnitoAP') ? 'Hotspot' : 'Cliente';
      res.json({ nmcli: out, mode });
    });
  });
});

app.post('/api/network/mode', isApiAuthenticated, (req, res) => {
  const { mode, ssid, password } = req.body;
  if (mode === 'hotspot') {
    exec(`nmcli device wifi hotspot ifname wlan0 ssid ${ssid || 'TurnitoAP'} password ${password || 'turnito1234'}`, (err) =>
      err ? res.status(500).json({ error: err.message }) : res.json({ message: 'Hotspot activado' })
    );
  } else if (mode === 'client') {
    exec(`nmcli device disconnect wlan0 && nmcli device wifi connect '${ssid}' password '${password}' ifname wlan0`, (err) =>
      err ? res.status(500).json({ error: err.message }) : res.json({ message: `Conectado a ${ssid}` })
    );
  } else {
    res.status(400).json({ error: 'Modo inválido' });
  }
});

// -----------------------------------------------------------------------------
// ⚙️ FullPageOS config
// -----------------------------------------------------------------------------
function safeRead(file, resKey, res) {
  fsPromises.readFile(file, 'utf8')
    .then(data => res.json({ [resKey]: data }))
    .catch(() => res.json({ [resKey]: '', warning: 'Archivo no disponible' }));
}

app.get('/api/system/fullpageos/config', isApiAuthenticated, (req, res) =>
  safeRead('/boot/firmware/config.txt', 'config', res)
);

app.get('/api/system/fullpageos/settings', isApiAuthenticated, (req, res) =>
  safeRead('/boot/firmware/fullpageos.txt', 'config', res)
);

app.post('/api/system/fullpageos/config', isApiAuthenticated, (req, res) => {
  fsPromises.writeFile('/boot/firmware/config.txt', req.body.content || '')
    .then(() => res.json({ message: 'config.txt guardado' }))
    .catch(err => res.status(500).json({ error: err.message }));
});

app.post('/api/system/fullpageos/settings', isApiAuthenticated, (req, res) => {
  fsPromises.writeFile('/boot/firmware/fullpageos.txt', req.body.content || '')
    .then(() => res.json({ message: 'fullpageos.txt guardado' }))
    .catch(err => res.status(500).json({ error: err.message }));
});

// -----------------------------------------------------------------------------
// 🔘 Acciones del sistema (reboot, shutdown, update)
// -----------------------------------------------------------------------------
app.post('/api/system/reboot', isApiAuthenticated, (req, res) => {
  exec('/sbin/reboot', (err) =>
    err ? res.status(500).json({ error: 'No se pudo reiniciar' })
        : res.json({ message: 'Reiniciando Raspberry Pi...' })
  );
});

app.post('/api/system/shutdown', isApiAuthenticated, (req, res) => {
  exec('/sbin/shutdown -h now', (err) =>
    err ? res.status(500).json({ error: 'No se pudo apagar' })
        : res.json({ message: 'Apagando Raspberry Pi...' })
  );
});

app.post('/api/system/update-os', isApiAuthenticated, (req, res) => {
  exec('apt update && apt -y upgrade', { timeout: 30 * 60 * 1000, maxBuffer: 50 * 1024 * 1024 }, (err, out) =>
    err ? res.status(500).json({ error: 'Error en actualización del sistema' })
        : res.json({ message: 'Actualización completada correctamente.', output: out.slice(0, 1000) })
  );
});

// 🧩 Actualizar cola
app.put('/api/queues/:id', isApiAuthenticated, (req, res) => {
  const { name } = req.body;
  db.run('UPDATE queues SET name = ? WHERE id = ?', [name, req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, id: req.params.id, name });
  });
});

// 🗑️ Eliminar cola
app.delete('/api/queues/:id', isApiAuthenticated, (req, res) => {
  const id = req.params.id;
  db.run('DELETE FROM queues WHERE id = ?', [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    db.run('DELETE FROM turns WHERE queue_id = ?', [id]);
    res.json({ success: true });
  });
});



// -----------------------------------------------------------------------------
// ⚡ SOCKET.IO CONNECTION HANDLER - Sincronización GPIO ↔ Web
// -----------------------------------------------------------------------------
io.on('connection', (socket) => {
  console.log(`🔌 Cliente conectado: ${socket.id}`);

  if (global.gpioPins && global.activePins) {
    const pins = global.gpioPins.map(p => ({
      id: p.id,
      mode: p.mode,
      value: 0,
      action: p.action
    }));
    socket.emit('gpio-status', { pins });
  }

  socket.on('gpio-write', ({ pin, value }) => {
    if (global.activePins && global.activePins[pin]) {
      const g = global.activePins[pin];
      try {
        g.write(value);
        console.log(`💡 GPIO${pin} → ${value}`);
        io.emit('gpio-update', { pin, value });
      } catch (e) {
        console.error(`⚠️ Error escribiendo GPIO${pin}:`, e.message);
      }
    }
  });

  socket.on('disconnect', () =>
    console.log(`❌ Cliente desconectado: ${socket.id}`)
  );
});

// -----------------------------------------------------------------------------
// 🧠 API GPIO STATUS - Estado actual
// -----------------------------------------------------------------------------
app.get('/api/gpio/status', isApiAuthenticated, async (req, res) => {
  try {
    if (!global.gpioPins || !global.activePins) return res.json({ pins: [] });

    const pins = await Promise.all(
      global.gpioPins.map(async p => {
        let value = 0;
        try {
          value = await global.activePins[p.id].read();
        } catch (err) {
          console.warn(`⚠️ No se pudo leer GPIO${p.id}:`, err.message);
        }
        return { id: p.id, mode: p.mode, value, action: p.action };
      })
    );
    res.json({ pins });
  } catch (err) {
    console.error('❌ Error obteniendo estado GPIO:', err.message);
    res.status(500).json({ error: 'No se pudo obtener estado GPIO' });
  }
});

// -----------------------------------------------------------------------------
// 📡 Emitir cambios GPIO global
// -----------------------------------------------------------------------------
function broadcastGPIO(pinId, value) {
  io.emit('gpio-update', { pin: pinId, value });
}
global.broadcastGPIO = broadcastGPIO;

// -----------------------------------------------------------------------------
// 🧠 MONITOR DEL SISTEMA (CPU, RAM, Temperatura, Disco, Uptime)
// -----------------------------------------------------------------------------
app.get('/api/system/cpu-temp', isApiAuthenticated, (req, res) => {
  const vcgencmd = '/usr/bin/vcgencmd';
  execFile(vcgencmd, ['measure_temp'], { timeout: 3000 }, (err, out) => {
    if (!err && out) {
      const m = out.match(/temp=([\d.]+)/);
      return res.json({ temperature: m ? m[1] : null });
    }
    try {
      const raw = fs.readFileSync('/sys/class/thermal/thermal_zone0/temp', 'utf8');
      res.json({ temperature: (Number(raw) / 1000).toFixed(1) });
    } catch {
      res.status(500).json({ error: 'No se pudo obtener temperatura' });
    }
  });
});

app.get('/api/system/cpu-usage', isApiAuthenticated, async (req, res) => {
  try {
    const stat1 = fs.readFileSync('/proc/stat', 'utf8').split('\n')[0].split(/\s+/).slice(1).map(Number);
    await new Promise(r => setTimeout(r, 250));
    const stat2 = fs.readFileSync('/proc/stat', 'utf8').split('\n')[0].split(/\s+/).slice(1).map(Number);
    const idle = stat2[3] - stat1[3];
    const total = stat2.reduce((a, b) => a + b, 0) - stat1.reduce((a, b) => a + b, 0);
    const usage = ((1 - idle / total) * 100).toFixed(1);
    res.json({ cpu_usage: usage });
  } catch {
    res.status(500).json({ error: 'No se pudo calcular uso de CPU' });
  }
});

app.get('/api/system/memory-usage', isApiAuthenticated, (req, res) => {
  try {
    const info = fs.readFileSync('/proc/meminfo', 'utf8');
    const get = (key) => Number((info.match(new RegExp(`^${key}:\\s+(\\d+)`, 'm')) || [])[1] || 0);
    const total = get('MemTotal');
    const avail = get('MemAvailable');
    const used = total - avail;
    res.json({ ram: ((used / total) * 100).toFixed(1) });
  } catch {
    res.status(500).json({ error: 'No se pudo obtener memoria' });
  }
});

app.get('/api/system/disk-usage', isApiAuthenticated, (req, res) => {
  exec("df -h / | awk 'NR==2 {print $3, $2, $5}'", (err, stdout) => {
    if (err) return res.status(500).json({ error: err.message });
    const [used, total, percent] = stdout.trim().split(/\s+/);
    res.json({ disk_used: used, disk_total: total, disk_percent: percent });
  });
});

app.get('/api/system/uptime', isApiAuthenticated, (req, res) => {
  const uptimeSec = os.uptime();
  const hours = Math.floor(uptimeSec / 3600);
  const minutes = Math.floor((uptimeSec % 3600) / 60);
  const seconds = Math.floor(uptimeSec % 60);
  res.json({ uptime: `${hours}h ${minutes}m ${seconds}s` });
});

// -----------------------------------------------------------------------------
// 🧾 API SYSTEM HOSTNAME
// -----------------------------------------------------------------------------
app.get('/api/system/hostname', isApiAuthenticated, (req, res) => {
  exec('hostname', (err, out) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ hostname: out.trim() });
  });
});

// -----------------------------------------------------------------------------
// 🖨️ Módulo de impresión POS (USB o Red TCP/IP) - Versión Nativa Estable
// -----------------------------------------------------------------------------
const net = require('net');
const usb = require('usb');

let printerMode = 'usb';
let printerNetworkIP = null;

// 🔍 Detectar impresora USB POS80
function detectUSBPrinter() {
  try {
    const devices = usb.getDeviceList();
    const pos = devices.find(
      d => d.deviceDescriptor.idVendor === 0x0416 && d.deviceDescriptor.idProduct === 0x5011
    );
    if (!pos) {
      return { connected: false, message: 'No se detecta impresora POS USB' };
    }
    return { connected: true, device: pos, message: 'Impresora POS USB detectada' };
  } catch (err) {
    return { connected: false, message: 'Error detectando impresora: ' + err.message };
  }
}

// 🔍 Detectar impresora de red (TCP/IP)
async function detectNetworkPrinter(ip) {
  return new Promise((resolve) => {
    const client = new net.Socket();
    client.setTimeout(1500);

    client.connect(9100, ip, () => {
      client.destroy();
      resolve({ connected: true, message: `Impresora de red detectada (${ip}:9100)` });
    });

    client.on('timeout', () => {
      client.destroy();
      resolve({ connected: false, message: `No responde la impresora (${ip})` });
    });

    client.on('error', () => {
      client.destroy();
      resolve({ connected: false, message: `Error conectando a ${ip}:9100` });
    });
  });
}

// 📡 Estado general
app.get('/api/print/status', async (req, res) => {
  try {
    if (printerMode === 'network' && printerNetworkIP) {
      const result = await detectNetworkPrinter(printerNetworkIP);
      return res.json(result);
    } else {
      const result = detectUSBPrinter();
      return res.json(result);
    }
  } catch (err) {
    res.status(500).json({ connected: false, message: 'Error verificando impresora: ' + err.message });
  }
});

// 🔧 Configurar modo (usb o red)
app.post('/api/print/mode', isApiAuthenticated, (req, res) => {
  const { mode, ip } = req.body;
  if (mode === 'network' && ip) {
    printerMode = 'network';
    printerNetworkIP = ip;
    res.json({ message: `Modo red configurado (${ip})` });
  } else if (mode === 'usb') {
    printerMode = 'usb';
    printerNetworkIP = null;
    res.json({ message: 'Modo USB configurado' });
  } else {
    res.status(400).json({ error: 'Parámetros inválidos' });
  }
});

// 🧾 Ticket de prueba
app.post('/api/print/test', async (req, res) => {
  try {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ticketNum = 'A' + Math.floor(Math.random() * 900 + 100);
    const line = '------------------------------';
    const ESC = '\x1B';

    // 🖨️ USB
    if (printerMode === 'usb') {
      const status = detectUSBPrinter();
      if (!status.connected) throw new Error(status.message);
      const pos = status.device;

      pos.open();
      const iface = pos.interfaces[0];
      iface.claim();

      const ep = iface.endpoints.find(e => e.direction === 'out');
      if (!ep) throw new Error('No se encontró endpoint OUT.');

      const data = Buffer.from(
        `${ESC}@\nTURNITO ADMIN\nSistema de Turnos\n${line}\nTICKET #${ticketNum}\n${line}\n${hh}:${mm}\nGracias por su visita\n${ESC}d\x02${ESC}m\n`,
        'ascii'
      );

      ep.transfer(data, (err) => {
        iface.release(true, () => pos.close());
        if (err) return res.status(500).json({ success: false, error: err.message });
        console.log(`🖨️ Ticket #${ticketNum} impreso por USB`);
        res.json({ success: true, message: `Ticket #${ticketNum} impreso por USB` });
      });
      return;
    }

    // 🌐 Red
    if (printerMode === 'network' && printerNetworkIP) {
      const client = new net.Socket();
      const data = Buffer.from(
        `${ESC}@\nTURNITO ADMIN\nSistema de Turnos\n${line}\nTICKET #${ticketNum}\n${line}\n${hh}:${mm}\nGracias por su visita\n${ESC}d\x02${ESC}m\n`,
        'ascii'
      );

      client.connect(9100, printerNetworkIP, () => {
        client.write(data, () => {
          client.end();
          console.log(`🖨️ Ticket #${ticketNum} impreso en red (${printerNetworkIP})`);
          res.json({ success: true, message: `Ticket #${ticketNum} impreso en red (${printerNetworkIP})` });
        });
      });

      client.on('error', (err) => {
        res.status(500).json({ success: false, error: `Error al conectar a ${printerNetworkIP}: ${err.message}` });
      });
      return;
    }

    throw new Error('No hay impresora configurada o conectada.');
  } catch (err) {
    console.error('❌ Error imprimiendo:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});


// -----------------------------------------------------------------------------
// 🧾 Función utilitaria para imprimir un ticket real de turno
// -----------------------------------------------------------------------------
async function printTurnTicket(turnData) {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const line = '────────────────────────────';
  const ESC = '\x1B';
  const turnNum = turnData?.turn_number?.toString().padStart(3, '0') || '---';
  const queueId = turnData?.queue_id || '?';
  
  // 🔍 Obtener nombre de la cola para incluirlo en el ticket
  const queue = await new Promise((resolve) => {
    db.get('SELECT name FROM queues WHERE id=?', [queueId], (err, row) =>
      resolve(row?.name || `Cola #${queueId}`)
    );
  });

  // 🧾 Diseño del ticket (alineado, centrado, coherente con el UI)
// 🧩 Leer configuración personalizada
let printCfg = { businessName: 'Mi Comercio', footerMessage: 'Gracias por su visita', defaultQueue: '' };
try {
  if (fs.existsSync(configFile)) {
    printCfg = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  }
} catch (err) {
  console.warn('⚠️ No se pudo leer configuración de impresión:', err.message);
}

// 🧾 Diseño del ticket usando los datos del JSON
const text =
`${ESC}@${ESC}a\x01${ESC}E\x01
${printCfg.businessName.toUpperCase()}
${ESC}E\x00
${line}
${ESC}a\x01${ESC}E\x01
${(queue || printCfg.defaultQueue).toUpperCase()}
${ESC}E\x00
${ESC}a\x01
TICKET N° ${turnNum}
${line}
${hh}:${mm} hs
${ESC}a\x01
${printCfg.footerMessage}
${ESC}d\x02${ESC}m`;


  try {
    // 🖨️ USB
    if (printerMode === 'usb') {
      const status = detectUSBPrinter();
      if (!status.connected) throw new Error(status.message);
      const pos = status.device;
      pos.open();
      const iface = pos.interfaces[0];
      iface.claim();
      const ep = iface.endpoints.find(e => e.direction === 'out');
      if (!ep) throw new Error('No se encontró endpoint OUT.');
      ep.transfer(Buffer.from(text, 'ascii'), (err) => {
        iface.release(true, () => pos.close());
        if (err) console.error('❌ Error imprimiendo ticket:', err.message);
        else console.log(`🖨️ Ticket ${turnNum} (${queue}) impreso`);
      });
      return;
    }

    // 🌐 Red
    if (printerMode === 'network' && printerNetworkIP) {
      const client = new net.Socket();
      client.connect(9100, printerNetworkIP, () => {
        client.write(Buffer.from(text, 'ascii'), () => {
          client.end();
          console.log(`🖨️ Ticket ${turnNum} (${queue}) impreso en red (${printerNetworkIP})`);
        });
      });
      client.on('error', (err) => console.error('❌ Error impresión red:', err.message));
      return;
    }

    console.warn('⚠️ No hay impresora configurada.');
  } catch (err) {
    console.error('❌ Error en printTurnTicket:', err.message);
  }
}



// -----------------------------------------------------------------------------
// ⚙️ Configuración de ticket (JSON persistente)
// -----------------------------------------------------------------------------
const configDir = path.join(__dirname, 'config');
const configFile = path.join(configDir, 'print.json');

// 🧩 Leer configuración actual
app.get('/api/print/config', isApiAuthenticated, (req, res) => {
  try {
    if (!fs.existsSync(configFile)) {
      const def = {
        businessName: "Mi Comercio",
        footerMessage: "Gracias por su visita",
        defaultQueue: "Mostrador General"
      };
      if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(configFile, JSON.stringify(def, null, 2));
      return res.json(def);
    }
    const cfg = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    res.json(cfg);
  } catch (err) {
    res.status(500).json({ error: 'Error leyendo configuración', detail: err.message });
  }
});

// 🧩 Guardar cambios de configuración
app.post('/api/print/config', isApiAuthenticated, (req, res) => {
  try {
    const { businessName, footerMessage, defaultQueue } = req.body;
    const data = {
      businessName: businessName?.trim() || "Mi Comercio",
      footerMessage: footerMessage?.trim() || "Gracias por su visita",
      defaultQueue: defaultQueue?.trim() || "Mostrador General"
    };
    if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(configFile, JSON.stringify(data, null, 2));
    res.json({ success: true, message: 'Configuración guardada correctamente', data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// -----------------------------------------------------------------------------
// 🧾 Configuración personalizada de tickets por cola
// -----------------------------------------------------------------------------
// Ruta del archivo JSON de configuración
const printConfigPath = path.join(__dirname, 'config', 'print.json');

// Asegurar que exista el archivo config/print.json
if (!fs.existsSync(printConfigPath)) {
  fs.mkdirSync(path.dirname(printConfigPath), { recursive: true });
  fs.writeFileSync(printConfigPath, '{}');
}

// 🧠 Leer configuración
function readPrintConfig() {
  try {
    const raw = fs.readFileSync(printConfigPath, 'utf8');
    return JSON.parse(raw || '{}');
  } catch (err) {
    console.warn('⚠️ Error leyendo print.json:', err.message);
    return {};
  }
}

// 💾 Guardar configuración
function writePrintConfig(data) {
  try {
    fs.writeFileSync(printConfigPath, JSON.stringify(data, null, 2));
    return true;
  } catch (err) {
    console.error('❌ Error guardando print.json:', err.message);
    return false;
  }
}

// 📡 Obtener configuración por cola
app.get('/api/print/config/:queueId', isApiAuthenticated, (req, res) => {
  const qid = `queue_${req.params.queueId}`;
  const cfg = readPrintConfig();
  if (!cfg[qid]) {
    // crear bloque vacío por defecto
    cfg[qid] = { store: '', sector: '', message: '' };
    writePrintConfig(cfg);
  }
  res.json(cfg[qid]);
});

// 💾 Guardar configuración por cola
app.post('/api/print/config/:queueId', isApiAuthenticated, (req, res) => {
  const qid = `queue_${req.params.queueId}`;
  const { store, sector, message } = req.body;
  const cfg = readPrintConfig();
  cfg[qid] = {
    store: store || '',
    sector: sector || '',
    message: message || ''
  };
  if (writePrintConfig(cfg)) {
    console.log(`🧾 Configuración actualizada para ${qid}`);
    res.json({ success: true });
  } else {
    res.status(500).json({ error: 'No se pudo guardar configuración' });
  }
});

// -----------------------------------------------------------------------------
// 🖨️ Ajuste en printTurnTicket(): leer config personalizada por cola
// -----------------------------------------------------------------------------
const originalPrintTurnTicket = printTurnTicket;
printTurnTicket = async function(turnData) {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const line = '--------------------------------';
  const ESC = '\x1B';
  const turnNum = turnData?.turn_number?.toString().padStart(3, '0') || '---';
  const queueId = turnData?.queue_id || '?';

  // 🧠 Leer config personalizada
  const cfg = readPrintConfig();
  const qcfg = cfg[`queue_${queueId}`] || {
    store: 'TURNITO ADMIN',
    sector: `Cola #${queueId}`,
    message: 'Gracias por su visita'
  };

  // 🧾 Construcción del ticket con estilo mejorado (versión compacta)
  const text = 
    `${ESC}@` +              // Inicializar impresora
    `${ESC}a\x01` +          // Centrar texto

    // --- Cabecera ---
    `${ESC}!\x30` +          // Fuente doble ancho y alto
    `${qcfg.store.toUpperCase()}\n` +
    `${ESC}!\x00` +          // Fuente normal
    `${qcfg.sector}\n\n` +

    // --- Separador ---
    `${line}\n\n` +

    // --- Cuerpo ---
    `${ESC}E\x01` +          // Negrita ON
    `SU TURNO ES:\n\n` +
    `${ESC}E\x00` +          // Negrita OFF
    `${ESC}!\x90` +          // Fuente extra grande
    `${turnNum}\n\n` +
    `${ESC}!\x00` +          // Fuente normal

    // --- Separador ---
    `${line}\n\n` +

    // --- Pie ---
    `${hh}:${mm} hs\n` +
    `${qcfg.message}\n\n` +

    // --- Final ---
    `${ESC}d\x03` +          // Avanzar 3 líneas
    `${ESC}m`;               // Corte parcial (si la impresora lo soporta)

  try {
    if (printerMode === 'usb') {
      const status = detectUSBPrinter();
      if (!status.connected) throw new Error(status.message);
      const pos = status.device;
      pos.open();
      const iface = pos.interfaces[0];
      iface.claim();
      const ep = iface.endpoints.find(e => e.direction === 'out');
      if (!ep) throw new Error('No se encontró endpoint OUT.');
      ep.transfer(Buffer.from(text, 'ascii'), (err) => {
        iface.release(true, () => pos.close());
        if (err) console.error('❌ Error imprimiendo ticket:', err.message);
        else console.log(`🖨️ Ticket ${turnNum} (${qcfg.sector}) impreso`);
      });
      return;
    }

    if (printerMode === 'network' && printerNetworkIP) {
      const client = new net.Socket();
      client.connect(9100, printerNetworkIP, () => {
        client.write(Buffer.from(text, 'ascii'), () => {
          client.end();
          console.log(`🖨️ Ticket ${turnNum} (${qcfg.sector}) impreso en red (${printerNetworkIP})`);
        });
      });
      client.on('error', (err) => console.error('❌ Error impresión red:', err.message));
      return;
    }

    console.warn('⚠️ No hay impresora configurada.');
  } catch (err) {
    console.error('❌ Error en printTurnTicket personalizado:', err.message);
  }
};




// -----------------------------------------------------------------------------
// 🚀 Servidor Express + Socket.IO
// -----------------------------------------------------------------------------
server.listen(port, () => {
  console.log(`✅ Turnito v4.1 corriendo en http://localhost:${port}`);
});
