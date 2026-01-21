// -----------------------------------------------------------------------------
// File: /home/fgonzalez/turnito/index.js
// Turnito Admin v4.1 â€“ Sistema completo (GPIO Live + ImpresiÃ³n Node20)
// -----------------------------------------------------------------------------
// Â© Infratec Networks - Flavio GonzÃ¡lez, Uruguay 2025
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

// Chromecast con chromecast-api (más simple y estable)
const ChromecastAPI = require('chromecast-api');
const chromecastClient = new ChromecastAPI();
let chromecasts = [];

// -----------------------------------------------------------------------------
// âš™ï¸ ConfiguraciÃ³n base
// -----------------------------------------------------------------------------
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const port = 3000;
const saltRounds = 10;
// ðŸŽ¯ Cola activa persistente
const activeQueuePath = path.join(__dirname, 'active_queue.json');
let activeQueueId = 1;

try {
  if (fs.existsSync(activeQueuePath)) {
    const saved = JSON.parse(fs.readFileSync(activeQueuePath, 'utf8'));
    activeQueueId = saved.id || 1;
    console.log(`ðŸ’¾ Cola activa cargada: ${activeQueueId}`);
  }
} catch (e) {
  console.log('âš ï¸ Error cargando active_queue.json:', e.message);
}

function saveActiveQueue(id) {
  try {
    fs.writeFileSync(activeQueuePath, JSON.stringify({ id }));
  } catch (e) {
    console.error('âŒ Error guardando active_queue.json:', e.message);
  }
}

// -----------------------------------------------------------------------------
// ðŸ—„ï¸ Base de datos SQLite
// -----------------------------------------------------------------------------
const dbPath = path.join(__dirname, 'db', 'turnito.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error('âŒ Error conectando a SQLite:', err.message);
  else {
    console.log('âœ… SQLite conectado.');
    db.configure('busyTimeout', 5000); // espera hasta 5 segundos antes de dar error
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

      db.run(`CREATE TABLE IF NOT EXISTS monitors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  queue_id INTEGER,
  show_weather INTEGER DEFAULT 1,
  show_news INTEGER DEFAULT 1,
  orientation TEXT DEFAULT 'horizontal',
  background TEXT DEFAULT '/media/panaderia.jpg',
  last_update DATETIME DEFAULT CURRENT_TIMESTAMP
);`);


      db.get('SELECT * FROM users WHERE username="admin"', (err, row) => {
        if (!row) {
          bcrypt.hash('password', saltRounds, (err, hash) => {
            db.run('INSERT INTO users (username,password) VALUES (?,?)', ['admin', hash]);
            console.log('ðŸ‘¤ Usuario admin creado (password: password)');
          });
        }
      });
    });
  }
});

// -----------------------------------------------------------------------------
// ðŸš€ Express configuraciÃ³n
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
  res.locals.title = 'Turnito Admin';
  console.log(`[HTTP] ${req.method} ${req.url}`);
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
// ðŸ” Login
// -----------------------------------------------------------------------------
app.get('/login', (req, res) =>
  res.render('login', { layout: false, error: null, title: 'Login - Turnito Admin' })
);

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
    if (!user)
      return res.render('login', { layout: false, error: 'Credenciales invÃ¡lidas', title: 'Login - Turnito Admin' });
    bcrypt.compare(password, user.password, (err, ok) => {
      if (ok) {
        req.session.userId = user.id;
        req.session.username = user.username;
        res.redirect('/');
      } else {
        res.render('login', { layout: false, error: 'Credenciales invÃ¡lidas', title: 'Login - Turnito Admin' });
      }
    });
  });
});

app.get('/logout', (req, res) => req.session.destroy(() => res.redirect('/login')));

// -----------------------------------------------------------------------------
// ðŸ  PÃ¡gina de Inicio: Lienzo SVG (Diagrama de Nodos)
// -----------------------------------------------------------------------------
app.get('/', isAuthenticated, (req, res) => {
  console.log('ðŸ“¡ Acceso a / (Dashboard Integrated)');
  res.render('dashboard', { title: 'Mapa del Sistema' });
});

// -----------------------------------------------------------------------------
// ðŸ“Š Resumen Fusionado (GestiÃ³n de Colas + Monitoreo)
// -----------------------------------------------------------------------------
app.get('/resumen', isAuthenticated, (req, res) => {
  console.log('ðŸ“¡ Acceso a /resumen');
  res.render('resumen_fused', { title: 'Resumen General' });
});

app.get('/sistema/:section', isAuthenticated, (req, res) => {
  const s = req.params.section;
  console.log(`ðŸ“¡ Acceso a /sistema/${s}`);

  // Redirigir resumen al nuevo resumen fusionado
  if (s === 'resumen') return res.redirect('/resumen');

  const valid = [
    'acciones',
    'red',
    'logs',
    'servicios',
    'fullpageos',
    'pantallas',
    'publicidad',
    'control',
    'gpio',
    'impresion',
    'remoto',
    'stream'
  ];
  console.log('--- DEBUG SISTEMA ---');
  console.log('Section:', s);
  console.log('Valid includes:', valid.includes(s));

  if (!valid.includes(s)) return res.status(404).send('404 - SECCION NO VALIDA: ' + s);
  res.render(`sistema/${s}`, { title: `Sistema - ${s}`, gpioPins: global.gpioPins || [] });
});

// ðŸ“± Control Remoto (Webapp MÃ³vil)
app.get(['/remote', '/remoto'], isAuthenticated, (req, res) => {
  res.render('sistema/remoto', { layout: false, title: 'Control Remoto - Turnito' });
});

// -----------------------------------------------------------------------------
// ðŸ§  GPIO (Modern driver usando libgpiod / gpiomon)

// -----------------------------------------------------------------------------
// ðŸ§  GPIO (Modern driver usando libgpiod / gpiomon)
// -----------------------------------------------------------------------------
const { spawn } = require('child_process');

// DefiniciÃ³n de pines y acciones
const gpioPins = [
  { id: 17, mode: 'IN', action: 'emit_ticket', label: 'BotÃ³n Ticket' },
  { id: 27, mode: 'IN', action: 'next_turn', label: 'BotÃ³n Siguiente' },
  { id: 22, mode: 'IN', action: 'prev_turn', label: 'BotÃ³n Anterior' },
  { id: 23, mode: 'OUT', action: 'led', label: 'LED Estado' }
];
global.gpioPins = gpioPins;
global.activePins = {};
global.gpioDebounceMs = 50; // Default debounce
const lastPinTimes = {};

// FunciÃ³n para procesar eventos GPIO
function handleGpioEdge(pinId, value) {
  const pin = gpioPins.find(p => p.id === parseInt(pinId));
  if (!pin) return;

  console.log(`ðŸ”¹ GPIO${pinId} -> ${value === 1 ? 'HIGH' : 'LOW'}`);

  // DEBOUNCE LOGIC
  const now = Date.now();
  const last = lastPinTimes[pinId] || 0;
  if (now - last < global.gpioDebounceMs) {
    console.log(`ðŸ›¡ï¸  Debouce ignored for Pin ${pinId} (${now - last}ms < ${global.gpioDebounceMs}ms)`);
    return;
  }
  lastPinTimes[pinId] = now;

  // Sincronizar estado para la API
  global.activePins[pinId] = { value };

  // Eventos para el Dashboard (Mapa SVG) y Panel de Bloques
  io.emit('gpio-event', { pin: pinId, state: value });
  io.emit('gpio-update', { pin: pinId, value, action: pin.action });

  // Acciones al presionar (HIGH)
  if (value === 1) {
    switch (pin.action) {
      case 'emit_ticket':
        console.log(`ðŸŽŸï¸ [GPIO] Crear nuevo turno en cola ${activeQueueId}`);
        db.get('SELECT MAX(turn_number) AS max FROM turns WHERE queue_id=?', [activeQueueId], (err, row) => {
          const next = (row?.max || 0) + 1;
          db.run('INSERT INTO turns (queue_id, turn_number) VALUES (?, ?)', [activeQueueId, next], function (e) {
            if (e) return console.error('âŒ Error creando turno:', e.message);
            // IMPORTANTE: Emitir evento de impresiÃ³n para el Dashboard
            io.emit('print-event', { ticket: next });
            io.emit('turn-update', { queue_id: activeQueueId, turn: next });
            if (typeof printTurnTicket === 'function') {
              printTurnTicket({ id: this.lastID, queue_id: activeQueueId, turn_number: next });
            }
          });
        });
        break;
      case 'next_turn':
        console.log(`â­ï¸ [GPIO] Llamar siguiente turno en cola ${activeQueueId}`);
        db.run("UPDATE turns SET status='completed' WHERE queue_id=? AND status='calling'", [activeQueueId], () => {
          db.get("SELECT * FROM turns WHERE queue_id=? AND status='waiting' ORDER BY id ASC LIMIT 1", [activeQueueId], (err, next) => {
            if (!next) return console.log('ðŸš« No hay turnos pendientes.');
            db.run("UPDATE turns SET status='calling' WHERE id=?", [next.id], () => {
              io.emit('turn-update', { queue_id: activeQueueId, turn: next.turn_number });
            });
          });
        });
        break;
      case 'prev_turn':
        console.log(`ðŸ”™ [GPIO] Volver al turno anterior en cola ${activeQueueId}`);
        // Retroceder: El actual pasa a waiting, y el ultimo completed pasa a calling
        db.get("SELECT * FROM turns WHERE queue_id=? AND status='calling' ORDER BY id DESC LIMIT 1", [activeQueueId], (err, current) => {
          if (current) db.run("UPDATE turns SET status='waiting' WHERE id=?", [current.id]);
          db.get("SELECT * FROM turns WHERE queue_id=? AND status='completed' ORDER BY id DESC LIMIT 1", [activeQueueId], (err, prev) => {
            if (prev) {
              db.run("UPDATE turns SET status='calling' WHERE id=?", [prev.id], () => {
                io.emit('turn-update', { queue_id: activeQueueId, turn: prev.turn_number });
              });
            }
          });
        });
        break;
    }
  }
}

// Iniciar monitor gpiomon (asincrÃ³nico y resiliente)
function startGpioMonitor() {
  try {
    // Matar procesos huÃ©rfanos para evitar "Device or resource busy"
    execSync('sudo killall -9 gpiomon 2>/dev/null');
  } catch (e) { }

  const inputPins = gpioPins.filter(p => p.mode === 'IN').map(p => p.id);
  console.log('ðŸ”Œ Iniciando gpiomon para pines:', inputPins.join(', '));
  console.log('ðŸ§ Verificando permisos de GPIO...');
  exec('gpiodetect', (err, stdout) => {
    if (err) console.error('âŒ Error: gpiodetect fallÃ³. Â¿EstÃ¡ libgpiod-utils instalado?', err.message);
    else console.log('âœ… gpiodetect:', stdout.trim());
  });

  // SincronizaciÃ³n inicial de valores
  inputPins.forEach(id => {
    exec(`gpioget 0 ${id}`, (err, out) => {
      if (!err) {
        const value = parseInt(out.trim());
        global.activePins[id] = { value };
        console.log(`ðŸ“ Inicializado GPIO${id}: ${value === 1 ? 'HIGH' : 'LOW'}`);
      }
    });
  });

  // Chip 0 es el estÃ¡ndar en Raspberry Pi para los GPIO normales
  // Usamos -F para el formato y %o (offset) %e (event: 1=falling, 2=rising o viceversa)
  // En libgpiod v1.6: %e suele ser 1 (rising) o 2 (falling)
  const monitor = spawn('sudo', ['gpiomon', '-b', '-F', '%o %e', '0', ...inputPins.map(String)]);

  let lastEventTime = 0;
  monitor.stdout.on('data', (data) => {
    const raw = data.toString().trim();
    const lines = raw.split('\n');
    const now = Date.now();

    lines.forEach(line => {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 2) {
        const pinId = parts[0];
        const eventType = parts[1]; // 1 o 2

        // Debounce simple por pin
        if (now - lastEventTime < 300) return;
        lastEventTime = now;

        console.log(`ðŸ“¡ [GPIO RAW] Pin ${pinId} Evento ${eventType}`);
        // Disparamos la acciÃ³n. En muchos casos el evento 1 o 2 es el "clic".
        handleGpioEdge(pinId, 1);
      }
    });
  });

  monitor.stderr.on('data', (data) => {
    console.warn('âš ï¸ GPIO Monitor stderr:', data.toString());
  });

  monitor.on('close', (code) => {
    console.error(`âŒ GPIO Monitor cerrÃ³ con cÃ³digo ${code}. Reiniciando en 5s...`);
    setTimeout(startGpioMonitor, 5000);
  });
}

startGpioMonitor();





// -----------------------------------------------------------------------------
// ðŸ§  API QUEUES (TURNOS)
// -----------------------------------------------------------------------------
app.get('/api/queues', isApiAuthenticated, (req, res) => {
  db.all('SELECT * FROM queues', [], (err, rows) =>
    err ? res.status(500).json({ error: 'DB error' }) : res.json(rows)
  );
});

// ðŸ”¹ Resumen de colas para el dashboard
app.get('/api/queues/summary', isApiAuthenticated, (req, res) => {
  const sql = `
    SELECT 
      q.*,
      (SELECT turn_number FROM turns WHERE queue_id = q.id AND status = 'calling' ORDER BY id DESC LIMIT 1) as current_turn,
      (SELECT COUNT(*) FROM turns WHERE queue_id = q.id AND status = 'waiting') as waiting_count
    FROM queues q
  `;
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
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
  const qId = parseInt(req.params.queueId);
  db.get('SELECT MAX(turn_number) AS max FROM turns WHERE queue_id=?', [qId], (err, row) => {
    const next = (row?.max || 0) + 1;
    db.run('INSERT INTO turns (queue_id, turn_number) VALUES (?, ?)', [qId, next], function (e) {
      if (e) return res.status(500).json({ error: 'Error agregando turno' });

      // âœ… IMPORTANTE: Emitir y llamar a la impresora
      io.emit('print-event', { ticket: next });
      io.emit('turn-update', { queue_id: qId, turn: next });

      if (typeof printTurnTicket === 'function') {
        printTurnTicket({ id: this.lastID, queue_id: qId, turn_number: next });
      }

      res.status(201).json({ id: this.lastID, turn_number: next, status: 'waiting' });
    });
  });
});

// ðŸ”¹ Llamar al SIGUIENTE turno (Next)
app.post('/api/queues/:queueId/call-next', isApiAuthenticated, (req, res) => {
  const qId = parseInt(req.params.queueId);

  // 1. Completar el actual (si existe)
  db.run("UPDATE turns SET status = 'completed' WHERE queue_id = ? AND status = 'calling'", [qId], function (err) {

    // 2. Buscar el siguiente en espera
    db.get("SELECT * FROM turns WHERE queue_id = ? AND status = 'waiting' ORDER BY id ASC LIMIT 1", [qId], (err, row) => {
      if (!row) {
        // No hay nadie esperando
        io.emit('turn-update', { queue_id: qId });
        return res.json({ message: 'No hay mÃ¡s turnos en espera' });
      }

      // 3. Marcar como llamando
      db.run("UPDATE turns SET status = 'calling' WHERE id = ?", [row.id], (err) => {
        io.emit('turn-update', { queue_id: qId, turn: row.turn_number });

        // Audio y Flash
        io.emit('play-audio', { file: 'chime.mp3' });

        res.json({ message: 'Llamando siguiente', turn: row });
      });
    });
  });
});

// ðŸ”¹ Volver al ANTERIOR turno (Back)
app.post('/api/queues/:queueId/call-prev', isApiAuthenticated, (req, res) => {
  const qId = parseInt(req.params.queueId);

  // LÃ³gica: 
  // 1. Buscar el turno "calling" actual.
  // 2. Si existe, ponerlo en "waiting" (lo devolvemos a la cola).
  // 3. Buscar el Ãºltimo "completed" y ponerlo en "calling".

  db.get("SELECT * FROM turns WHERE queue_id = ? AND status = 'calling'", [qId], (err, current) => {
    if (current) {
      // Devolver a espera
      db.run("UPDATE turns SET status = 'waiting' WHERE id = ?", [current.id]);
    }

    // Buscar el Ãºltimo completado para reactivarlo
    db.get("SELECT * FROM turns WHERE queue_id = ? AND status = 'completed' ORDER BY completed_at DESC LIMIT 1", [qId], (err, prev) => {
      if (!prev) {
        io.emit('turn-update', { queue_id: qId });
        return res.json({ message: 'No hay turno anterior' });
      }

      // Reactivar el anterior
      db.run("UPDATE turns SET status = 'calling', completed_at = NULL WHERE id = ?", [prev.id], (err) => {
        io.emit('turn-update', { queue_id: qId, turn: prev.turn_number });
        res.json({ message: 'Volviendo al anterior', turn: prev });
      });
    });
  });
});

// ðŸ”¹ RESETEAR fila (Borrar todos los turnos)
app.post('/api/queues/:queueId/reset', isApiAuthenticated, (req, res) => {
  const qId = parseInt(req.params.queueId);
  db.run("DELETE FROM turns WHERE queue_id = ?", [qId], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    io.emit('turn-update', { queue_id: qId });
    res.json({ message: 'Fila reseteada correctamente' });
  });
});

// -----------------------------------------------------------------------------
// ðŸŽ¯ Cola activa (para GPIO e impresiÃ³n)
// -----------------------------------------------------------------------------
// ðŸŽ¯ Cola activa configurada por el usuario

app.post('/api/set-active-queue/:id', isApiAuthenticated, (req, res) => {
  activeQueueId = parseInt(req.params.id);
  saveActiveQueue(activeQueueId);
  console.log(`ðŸŽ¯ Cola activa configurada y guardada: ${activeQueueId}`);
  res.json({ success: true, queue: activeQueueId });
});




app.get('/api/get-active-queue', isApiAuthenticated, (req, res) => {
  db.get('SELECT * FROM queues WHERE id = ?', [activeQueueId], (err, row) => {
    if (err || !row) return res.json({ queue: null });
    res.json({ queue: row });
  });
});


// âœï¸ Editar nombre de cola
app.put('/api/queues/:id', isApiAuthenticated, (req, res) => {
  const { name } = req.body;
  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Nombre invÃ¡lido' });
  }
  db.run('UPDATE queues SET name = ? WHERE id = ?', [name.trim(), req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// ðŸ—‘ï¸ Eliminar cola (y sus turnos)
app.delete('/api/queues/:id', isApiAuthenticated, (req, res) => {
  const id = parseInt(req.params.id);
  db.run('DELETE FROM queues WHERE id = ?', [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    db.run('DELETE FROM turns WHERE queue_id = ?', [id]);
    res.json({ success: true });
  });
});



// -----------------------------------------------------------------------------
// ðŸ§¾ SISTEMA DE TURNOS - RUTAS PÃšBLICAS (para /monitor y /pantalla)
// -----------------------------------------------------------------------------

// ðŸ”¹ Listar colas (pÃºblico, sin sesiÃ³n)
app.get('/public/queues', (req, res) => {
  db.all('SELECT * FROM queues ORDER BY id ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// ðŸ”¹ Listar turnos por cola (pÃºblico)
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

// ðŸ”¹ Llamar siguiente turno (solo administrativo autenticado)
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
      if (!next) return res.json({ message: 'No hay mÃ¡s turnos pendientes.' });

      db.run('UPDATE turns SET status=? WHERE id=?', ['calling', next.id], (err2) => {
        if (err2) return res.status(500).json({ error: err2.message });

        console.log(`ðŸ“¢ Turno ${next.turn_number} llamado en cola ${id}`);
        io.emit('turn-update', { queue_id: id, turn: next.turn_number });
        res.json({ message: `Turno ${next.turn_number} llamado.`, turn: next });
      });
    }
  );
});




// -----------------------------------------------------------------------------
// ðŸ§  API PUBLICIDAD / PANTALLAS
// -----------------------------------------------------------------------------
app.get('/api/ads', (req, res) => {
  const dir = path.join(__dirname, 'public', 'media');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const files = fs.readdirSync(dir).filter(f => /\.(png|jpe?g|gif)$/i.test(f));
  let interval = 8;
  const cfg = path.join(dir, 'ads-config.json');
  if (fs.existsSync(cfg)) {
    try { interval = JSON.parse(fs.readFileSync(cfg)).interval || 8; } catch { }
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
// ðŸ”§ Logs del sistema
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
// ðŸ”§ Servicios systemctl
// -----------------------------------------------------------------------------
app.get('/api/system/services', isApiAuthenticated, (req, res) => {
  exec('systemctl list-units --type=service --all --no-pager --no-legend', (err, out) => {
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
  if (!['enable', 'disable'].includes(action)) return res.status(400).json({ error: 'AcciÃ³n invÃ¡lida' });
  exec(`systemctl ${action} ${req.params.name}`, (err) =>
    err ? res.status(500).json({ error: err.message }) : res.json({ message: `Servicio ${action} ejecutado` })
  );
});

// -----------------------------------------------------------------------------
// ðŸŒ Network nmcli
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
    res.status(400).json({ error: 'Modo invÃ¡lido' });
  }
});

// -----------------------------------------------------------------------------
// âš™ï¸ FullPageOS config
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
// ðŸ”˜ Acciones del sistema (reboot, shutdown, update)
// -----------------------------------------------------------------------------
app.post('/api/system/reboot', isApiAuthenticated, (req, res) => {
  exec('/sbin/reboot', (err) =>
    err ? res.status(500).json({ error: 'No se pudo reiniciar' }) : res.json({ message: 'Reiniciando...' })
  );
});

// ðŸ–¥ï¸ Control de Pantalla (HDMI)
app.post('/api/hdmi/control', isApiAuthenticated, (req, res) => {
  const { action } = req.body; // 'on' o 'off'
  const state = action === 'on' ? '1' : '0';
  exec(`vcgencmd display_power ${state}`, (err) => {
    if (err) return res.status(500).json({ error: 'No se pudo controlar el HDMI' });
    res.json({ success: true, message: `Pantalla ${action === 'on' ? 'encendida' : 'apagada'}` });
  });
});

// ðŸ–¨ï¸ ImpresiÃ³n de prueba
app.post('/api/print/test', isApiAuthenticated, (req, res) => {
  const testTurn = { turn_number: '000', queue_id: 1 };
  printTurnTicket(testTurn);
  res.json({ success: true, message: 'ImpresiÃ³n de prueba enviada' });
});

app.post('/api/system/shutdown', isApiAuthenticated, (req, res) => {
  exec('/sbin/shutdown -h now', (err) =>
    err ? res.status(500).json({ error: 'No se pudo apagar' })
      : res.json({ message: 'Apagando Raspberry Pi...' })
  );
});

app.post('/api/system/update-os', isApiAuthenticated, (req, res) => {
  exec('apt update && apt -y upgrade', { timeout: 30 * 60 * 1000, maxBuffer: 50 * 1024 * 1024 }, (err, out) =>
    err ? res.status(500).json({ error: 'Error en actualizaciÃ³n del sistema' })
      : res.json({ message: 'ActualizaciÃ³n completada correctamente.', output: out.slice(0, 1000) })
  );
});

// ðŸ“Š MÃ‰TRICAS EXTRA PARA RESUMEN PREMIUM
app.get('/api/system/load-avg', isApiAuthenticated, (req, res) => {
  const load = os.loadavg();
  res.json({ load1: load[0].toFixed(2), load5: load[1].toFixed(2), load15: load[2].toFixed(2) });
});

app.get('/api/system/network-ips', isApiAuthenticated, (req, res) => {
  const nets = os.networkInterfaces();
  const results = {};
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        if (!results[name]) results[name] = [];
        results[name].push(net.address);
      }
    }
  }
  res.json(results);
});

app.get('/api/system/pm2-status-detail', isApiAuthenticated, (req, res) => {
  exec('pm2 jlist', (err, stdout) => {
    if (err) return res.status(500).json({ error: 'PM2 error' });
    try {
      const list = JSON.parse(stdout);
      const app = list.find(a => a.name === 'turnito');
      if (!app) return res.json({ status: 'offline' });
      res.json({
        status: app.pm2_env.status,
        restarts: app.pm2_env.restart_time,
        uptime: Math.floor((Date.now() - app.pm2_env.pm_uptime) / 1000),
        memory: (app.monit.memory / 1024 / 1024).toFixed(2) + ' MB',
        cpu: app.monit.cpu + '%'
      });
    } catch (e) { res.json({ status: 'offline', info: 'Not tracked by PM2' }); }
  });
});

app.get('/api/hardware/usb-devices', isApiAuthenticated, (req, res) => {
  exec('lsusb', (err, stdout) => {
    if (err) return res.status(500).json({ error: 'lsusb error' });
    const devices = stdout.trim().split('\n').map(line => line.trim());
    res.json(devices);
  });
});

// ðŸ§© Actualizar cola
app.put('/api/queues/:id', isApiAuthenticated, (req, res) => {
  const { name } = req.body;
  db.run('UPDATE queues SET name = ? WHERE id = ?', [name, req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, id: req.params.id, name });
  });
});

// ðŸ—‘ï¸ Eliminar cola
app.delete('/api/queues/:id', isApiAuthenticated, (req, res) => {
  const id = req.params.id;
  db.run('DELETE FROM queues WHERE id = ?', [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    db.run('DELETE FROM turns WHERE queue_id = ?', [id]);
    res.json({ success: true });
  });
});



// -----------------------------------------------------------------------------
// âš¡ SOCKET.IO CONNECTION HANDLER - SincronizaciÃ³n GPIO â†” Web
// -----------------------------------------------------------------------------
io.on('connection', (socket) => {
  console.log(`ðŸ”Œ Cliente conectado: ${socket.id}`);

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
        console.log(`ðŸ’¡ GPIO${pin} â†’ ${value}`);
        io.emit('gpio-update', { pin, value });
      } catch (e) {
        console.error(`âš ï¸ Error escribiendo GPIO${pin}:`, e.message);
      }
    }
  });

  socket.on('disconnect', () =>
    console.log(`âŒ Cliente desconectado: ${socket.id}`)
  );
});

// -----------------------------------------------------------------------------
// ðŸ§  API GPIO STATUS - Estado actual
// -----------------------------------------------------------------------------
app.get('/api/gpio/status', isApiAuthenticated, async (req, res) => {
  try {
    if (!global.gpioPins || !global.activePins) return res.json({ pins: [] });

    const pins = await Promise.all(
      global.gpioPins.map(async p => {
        let value = 0;
        try {
          if (global.activePins && global.activePins[p.id]) {
            value = global.activePins[p.id].value || 0;
          }
        } catch (err) {
          console.warn(`âš ï¸ Error leyendo estado cache GPIO${p.id}:`, err.message);
        }
        return { id: p.id, mode: p.mode, value, action: p.action };
      })
    );
    res.json({ pins });
  } catch (err) {
    console.error('âŒ Error obteniendo estado GPIO:', err.message);
    res.status(500).json({ error: 'No se pudo obtener estado GPIO' });
  }
});

// -----------------------------------------------------------------------------
// ðŸ“¡ Emitir cambios GPIO global
// -----------------------------------------------------------------------------
function broadcastGPIO(pinId, value) {
  io.emit('gpio-update', { pin: pinId, value });
}
global.broadcastGPIO = broadcastGPIO;

// -----------------------------------------------------------------------------
// ðŸ§  MONITOR DEL SISTEMA (CPU, RAM, Temperatura, Disco, Uptime)
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
// ðŸ§¾ API SYSTEM HOSTNAME
// -----------------------------------------------------------------------------
app.get('/api/system/hostname', isApiAuthenticated, (req, res) => {
  exec('hostname', (err, out) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ hostname: out.trim() });
  });
});

// -----------------------------------------------------------------------------
// ðŸ–¨ï¸ MÃ³dulo de impresiÃ³n POS (USB o Red TCP/IP) - VersiÃ³n Nativa Estable
// -----------------------------------------------------------------------------
const net = require('net');
const usb = require('usb');

let printerMode = 'usb';
let printerNetworkIP = null;

// ðŸ” Detectar impresora USB POS80
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

// ðŸ” Detectar impresora de red (TCP/IP)
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

// ðŸ“¡ Estado general
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

// ðŸ”§ Configurar modo (usb o red)
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
    res.status(400).json({ error: 'ParÃ¡metros invÃ¡lidos' });
  }
});

// ðŸ§¾ Ticket de prueba
app.post('/api/print/test', async (req, res) => {
  try {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ticketNum = 'A' + Math.floor(Math.random() * 900 + 100);
    const line = '------------------------------';
    const ESC = '\x1B';

    // ðŸ–¨ï¸ USB
    if (printerMode === 'usb') {
      const status = detectUSBPrinter();
      if (!status.connected) throw new Error(status.message);
      const pos = status.device;

      pos.open();
      const iface = pos.interfaces[0];
      iface.claim();

      const ep = iface.endpoints.find(e => e.direction === 'out');
      if (!ep) throw new Error('No se encontrÃ³ endpoint OUT.');

      const data = Buffer.from(
        `${ESC}@\nTURNITO ADMIN\nSistema de Turnos\n${line}\nTICKET #${ticketNum}\n${line}\n${hh}:${mm}\nGracias por su visita\n${ESC}d\x02${ESC}m\n`,
        'ascii'
      );

      ep.transfer(data, (err) => {
        iface.release(true, () => pos.close());
        if (err) return res.status(500).json({ success: false, error: err.message });
        console.log(`ðŸ–¨ï¸ Ticket #${ticketNum} impreso por USB`);
        res.json({ success: true, message: `Ticket #${ticketNum} impreso por USB` });
      });
      return;
    }

    // ðŸŒ Red
    if (printerMode === 'network' && printerNetworkIP) {
      const client = new net.Socket();
      const data = Buffer.from(
        `${ESC}@\nTURNITO ADMIN\nSistema de Turnos\n${line}\nTICKET #${ticketNum}\n${line}\n${hh}:${mm}\nGracias por su visita\n${ESC}d\x02${ESC}m\n`,
        'ascii'
      );

      client.connect(9100, printerNetworkIP, () => {
        client.write(data, () => {
          client.end();
          console.log(`ðŸ–¨ï¸ Ticket #${ticketNum} impreso en red (${printerNetworkIP})`);
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
    console.error('âŒ Error imprimiendo:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});


// -----------------------------------------------------------------------------
// ðŸ§¾ FunciÃ³n utilitaria para imprimir un ticket real de turno
// -----------------------------------------------------------------------------
async function printTurnTicket(turnData) {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const line = 'â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€';
  const ESC = '\x1B';
  const turnNum = turnData?.turn_number?.toString().padStart(3, '0') || '---';
  const queueId = turnData?.queue_id || '?';

  // ðŸ” Obtener nombre de la cola para incluirlo en el ticket
  const queue = await new Promise((resolve) => {
    db.get('SELECT name FROM queues WHERE id=?', [queueId], (err, row) =>
      resolve(row?.name || `Cola #${queueId}`)
    );
  });

  // ðŸ§¾ DiseÃ±o del ticket (alineado, centrado, coherente con el UI)
  // ðŸ§© Leer configuraciÃ³n personalizada
  let printCfg = { businessName: 'Mi Comercio', footerMessage: 'Gracias por su visita', defaultQueue: '' };
  try {
    if (fs.existsSync(configFile)) {
      printCfg = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    }
  } catch (err) {
    console.warn('âš ï¸ No se pudo leer configuraciÃ³n de impresiÃ³n:', err.message);
  }

  // ðŸ§¾ DiseÃ±o del ticket usando los datos del JSON
  const text =
    `${ESC}@${ESC}a\x01${ESC}E\x01
${printCfg.businessName.toUpperCase()}
${ESC}E\x00
${line}
${ESC}a\x01${ESC}E\x01
${(queue || printCfg.defaultQueue).toUpperCase()}
${ESC}E\x00
${ESC}a\x01
TICKET NÂ° ${turnNum}
${line}
${hh}:${mm} hs
${ESC}a\x01
${printCfg.footerMessage}
${ESC}d\x02${ESC}m`;


  try {
    // ðŸ–¨ï¸ USB
    if (printerMode === 'usb') {
      const status = detectUSBPrinter();
      if (!status.connected) throw new Error(status.message);
      const pos = status.device;
      pos.open();
      const iface = pos.interfaces[0];
      iface.claim();
      const ep = iface.endpoints.find(e => e.direction === 'out');
      if (!ep) throw new Error('No se encontrÃ³ endpoint OUT.');
      ep.transfer(Buffer.from(text, 'ascii'), (err) => {
        iface.release(true, () => pos.close());
        if (err) console.error('âŒ Error imprimiendo ticket:', err.message);
        else console.log(`ðŸ–¨ï¸ Ticket ${turnNum} (${queue}) impreso`);
      });
      return;
    }

    // ðŸŒ Red
    if (printerMode === 'network' && printerNetworkIP) {
      const client = new net.Socket();
      client.connect(9100, printerNetworkIP, () => {
        client.write(Buffer.from(text, 'ascii'), () => {
          client.end();
          console.log(`ðŸ–¨ï¸ Ticket ${turnNum} (${queue}) impreso en red (${printerNetworkIP})`);
        });
      });
      client.on('error', (err) => console.error('âŒ Error impresiÃ³n red:', err.message));
      return;
    }

    console.warn('âš ï¸ No hay impresora configurada.');
  } catch (err) {
    console.error('âŒ Error en printTurnTicket:', err.message);
  }
}



// -----------------------------------------------------------------------------
// âš™ï¸ ConfiguraciÃ³n de ticket (JSON persistente)
// -----------------------------------------------------------------------------
const configDir = path.join(__dirname, 'config');
const configFile = path.join(configDir, 'print.json');

// ðŸ§© Leer configuraciÃ³n actual
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
    res.status(500).json({ error: 'Error leyendo configuraciÃ³n', detail: err.message });
  }
});

// ðŸ§© Guardar cambios de configuraciÃ³n
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
    res.json({ success: true, message: 'ConfiguraciÃ³n guardada correctamente', data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// -----------------------------------------------------------------------------
// ðŸ§¾ ConfiguraciÃ³n personalizada de tickets por cola
// -----------------------------------------------------------------------------
// Ruta del archivo JSON de configuraciÃ³n
const printConfigPath = path.join(__dirname, 'config', 'print.json');

// Asegurar que exista el archivo config/print.json
if (!fs.existsSync(printConfigPath)) {
  fs.mkdirSync(path.dirname(printConfigPath), { recursive: true });
  fs.writeFileSync(printConfigPath, '{}');
}

// ðŸ§  Leer configuraciÃ³n
function readPrintConfig() {
  try {
    const raw = fs.readFileSync(printConfigPath, 'utf8');
    return JSON.parse(raw || '{}');
  } catch (err) {
    console.warn('âš ï¸ Error leyendo print.json:', err.message);
    return {};
  }
}

// ðŸ’¾ Guardar configuraciÃ³n
function writePrintConfig(data) {
  try {
    fs.writeFileSync(printConfigPath, JSON.stringify(data, null, 2));
    return true;
  } catch (err) {
    console.error('âŒ Error guardando print.json:', err.message);
    return false;
  }
}

// ðŸ“¡ Obtener configuraciÃ³n por cola
app.get('/api/print/config/:queueId', isApiAuthenticated, (req, res) => {
  const qid = `queue_${req.params.queueId}`;
  const cfg = readPrintConfig();
  if (!cfg[qid]) {
    // crear bloque vacÃ­o por defecto
    cfg[qid] = { store: '', sector: '', message: '' };
    writePrintConfig(cfg);
  }
  res.json(cfg[qid]);
});

// ðŸ’¾ Guardar configuraciÃ³n por cola
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
    console.log(`ðŸ§¾ ConfiguraciÃ³n actualizada para ${qid}`);
    res.json({ success: true });
  } else {
    res.status(500).json({ error: 'No se pudo guardar configuraciÃ³n' });
  }
});

// -----------------------------------------------------------------------------
// ðŸ–¨ï¸ Ajuste en printTurnTicket(): leer config personalizada por cola
// ðŸ§¹ Normalizar texto para impresoras tÃ©rmicas (quitar acentos y eÃ±es)
function normalizeText(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Quitar tildes
    .replace(/[Ã±Ã‘]/g, 'n')           // Reemplazar Ã±
    .replace(/[^\x00-\x7F]/g, '');   // Eliminar cualquier otro carÃ¡cter no ASCII
}

// -----------------------------------------------------------------------------
const originalPrintTurnTicket = printTurnTicket;
printTurnTicket = async function (turnData) {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const line = '--------------------------------';
  const ESC = '\x1B';
  const turnNum = turnData?.turn_number?.toString().padStart(3, '0') || '---';
  const queueId = turnData?.queue_id || '?';

  // ðŸ§  Leer config personalizada
  const cfg = readPrintConfig();
  const qcfg = cfg[`queue_${queueId}`] || {
    store: 'TURNITO ADMIN',
    sector: `Cola #${queueId}`,
    message: 'Gracias por su visita'
  };

  // ðŸ§¹ Normalizar textos para evitar errores en la impresora
  const store = normalizeText(qcfg.store).toUpperCase();
  const sector = normalizeText(qcfg.sector);
  const message = normalizeText(qcfg.message);

  // ðŸ§¾ ConstrucciÃ³n del ticket con estilo mejorado (versiÃ³n compacta)
  const text =
    `${ESC}@` +              // Inicializar impresora
    `${ESC}a\x01` +          // Centrar texto

    // --- Cabecera ---
    `${ESC}!\x30` +          // Fuente doble ancho y alto
    `${store}\n` +
    `${ESC}!\x00` +          // Fuente normal
    `${sector}\n\n` +

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
    `${message}\n\n` +

    // --- Final ---
    `${ESC}d\x03` +          // Avanzar 3 lÃ­neas
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
      if (!ep) throw new Error('No se encontrÃ³ endpoint OUT.');
      ep.transfer(Buffer.from(text, 'ascii'), (err) => {
        iface.release(true, () => pos.close());
        if (err) console.error('âŒ Error imprimiendo ticket:', err.message);
        else {
          console.log(`ðŸ–¨ï¸ Ticket ${turnNum} (${qcfg.sector}) impreso`);
          // Emitir evento para el Dashboard
          io.emit('print-event', { ticket: turnNum });
        }
      });
      return;
    }

    if (printerMode === 'network' && printerNetworkIP) {
      const client = new net.Socket();
      client.connect(9100, printerNetworkIP, () => {
        client.write(Buffer.from(text, 'ascii'), () => {
          client.end();
          console.log(`ðŸ–¨ï¸ Ticket ${turnNum} (${qcfg.sector}) impreso en red (${printerNetworkIP})`);
          // Emitir evento para el Dashboard
          io.emit('print-event', { ticket: turnNum });
        });
      });
      client.on('error', (err) => console.error('âŒ Error impresiÃ³n red:', err.message));
      return;
    }

    console.warn('âš ï¸ No hay impresora configurada.');
  } catch (err) {
    console.error('âŒ Error en printTurnTicket personalizado:', err.message);
  }
};


// -----------------------------------------------------------------------------
// ðŸ“° Noticias Uruguay (RSS resiliente con redirecciones y fallback local)
// -----------------------------------------------------------------------------
const https = require('https');
const { URL } = require('url');

app.get('/api/news', (req, res) => {
  const sources = [
    'https://www.montevideo.com.uy/anxml.aspx?type=0',
    'https://news.google.com/rss?hl=es-419&gl=UY&ceid=UY:es-419'
  ];

  function fetchWithRedirect(url, depth = 0, cb) {
    if (depth > 3) return cb(new Error('Too many redirects'));
    try {
      https.get(url, (r) => {
        if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
          const next = new URL(r.headers.location, url).href;
          return fetchWithRedirect(next, depth + 1, cb);
        }
        let data = '';
        r.on('data', chunk => data += chunk);
        r.on('end', () => cb(null, data));
      }).on('error', cb);
    } catch (e) {
      cb(e);
    }
  }

  function sendFallback() {
    res.json({
      results: [
        { title: 'Noticias no disponibles temporalmente.', image_url: '/media/news-default.jpg' },
        { title: 'Verifique la conexiÃ³n o las fuentes RSS.', image_url: '/media/news-default.jpg' }
      ]
    });
  }

  // Intentar fuentes en secuencia
  const tryNext = (i = 0) => {
    if (i >= sources.length) return sendFallback();
    const url = sources[i];
    fetchWithRedirect(url, 0, (err, xml) => {
      if (!err && xml && xml.includes('<item>')) {
        console.log(`ðŸ“° Fuente RSS: ${url}`);
        return res.type('xml').send(xml);
      }
      console.warn(`âš ï¸ FallÃ³ RSS fuente ${url}:`, err?.message);
      tryNext(i + 1);
    });
  };

  tryNext();
});


// -----------------------------------------------------------------------------
// ðŸ“º Control de Monitor HDMI (DRM moderno - Raspberry Pi OS)
// -----------------------------------------------------------------------------
const configTxtPath = '/boot/firmware/config.txt';

// Status Detallado (DRM sysfs)
app.get('/api/hdmi/status', isApiAuthenticated, (req, res) => {
  const drmPath = '/sys/class/drm/card0-HDMI-A-1';

  try {
    const connected = fs.readFileSync(`${drmPath}/status`, 'utf8').trim() === 'connected';

    if (!connected) {
      return res.json({ connected: false, message: 'Monitor desconectado' });
    }

    // Obtener resoluciÃ³n actual
    exec('fbset -s', (err, fbout) => {
      const modeMatch = fbout ? fbout.match(/mode "(\d+x\d+)"/) : null;
      const currentRes = modeMatch ? modeMatch[1] : 'Desconocida';

      // Leer EDID para nombre del monitor
      exec(`edid-decode ${drmPath}/edid 2>/dev/null | grep "Display Product Name" || echo "Monitor HDMI"`, (errEdid, edidOut) => {
        const monitorName = edidOut.trim().split(':')[1]?.trim() || 'Monitor HDMI';

        res.json({
          connected: true,
          name: monitorName,
          resolution: currentRes,
          state: 'Activo',
          info: 'DRM/KMS'
        });
      });
    });
  } catch (err) {
    res.json({ connected: false, message: 'Error leyendo DRM', error: err.message });
  }
});

// Listar Modos Disponibles (desde DRM)
app.get('/api/hdmi/modes', isApiAuthenticated, (req, res) => {
  const drmPath = '/sys/class/drm/card0-HDMI-A-1';

  try {
    const modesRaw = fs.readFileSync(`${drmPath}/modes`, 'utf8');
    const modes = modesRaw.trim().split('\n').map((line, idx) => {
      const match = line.match(/(\d+)x(\d+)([ip])?/);
      if (!match) return null;
      return {
        id: idx + 1,
        resolution: `${match[1]}x${match[2]}`,
        type: match[3] === 'i' ? 'Entrelazado' : 'Progresivo',
        raw: line
      };
    }).filter(x => x);

    res.json({ modes });
  } catch (err) {
    res.json({ modes: [], error: 'No se pudieron leer los modos' });
  }
});

// Aplicar resoluciÃ³n (con fallbacks mÃºltiples)
app.post('/api/hdmi/set-resolution', isApiAuthenticated, (req, res) => {
  const { resolution } = req.body; // formato: "1920x1080"
  const [w, h] = resolution.split('x');

  // MÃ©todo 1: xrandr (mÃ¡s confiable)
  exec(`DISPLAY=:0 xrandr --output HDMI-1 --mode ${resolution} 2>/dev/null`, (err) => {
    if (!err) return res.json({ success: true, message: `ResoluciÃ³n ${resolution} aplicada` });

    // MÃ©todo 2: fbset
    exec(`fbset -g ${w} ${h} ${w} ${h} 32`, (err2) => {
      if (err2) return res.status(500).json({ error: 'Error aplicando resoluciÃ³n', detail: err2.message });
      res.json({ success: true, message: `ResoluciÃ³n ${resolution} aplicada` });
    });
  });
});

// Control de energÃ­a HDMI (FullPageOS con DPMS)
app.post('/api/hdmi/power', isApiAuthenticated, (req, res) => {
  const { state } = req.body; // 'on' o 'off'

  // Usar DPMS para FullPageOS (mÃ¡s compatible)
  const dpmsCmd = state === 'on'
    ? 'DISPLAY=:0 xset dpms force on && DISPLAY=:0 xrandr --output HDMI-1 --auto'
    : 'DISPLAY=:0 xset dpms force off';

  exec(dpmsCmd, (err, stdout, stderr) => {
    if (err) {
      console.error('Error DPMS:', stderr);
      return res.status(500).json({ error: 'Error controlando energÃ­a HDMI', detail: stderr });
    }
    res.json({ success: true, message: `Pantalla ${state === 'on' ? 'encendida' : 'apagada'}` });
  });
});


// -----------------------------------------------------------------------------
// ðŸ“¡ API: ConfiguraciÃ³n de Red WiFi
// -----------------------------------------------------------------------------

// Obtener estado actual de la red WiFi
app.get('/api/network/status', isApiAuthenticated, (req, res) => {
  // Obtener informaciÃ³n de la conexiÃ³n WiFi actual
  exec('nmcli -t -f active,ssid,signal,security dev wifi | grep "^yes"', (err, stdout) => {
    if (err || !stdout.trim()) {
      return res.json({
        connected: false,
        ssid: '--',
        signal: 0,
        security: '--',
        mode: 'Desconectado'
      });
    }

    const parts = stdout.trim().split(':');
    const ssid = parts[1] || '--';
    const signal = parseInt(parts[2]) || 0;
    const security = parts[3] || '--';

    // Obtener gateway y hacer ping
    exec("ip route | grep default | awk '{print $3}'", (errGw, gateway) => {
      const gw = gateway.trim();

      // Ping al gateway
      exec(`ping -c 1 -W 1 ${gw} 2>/dev/null | grep 'time=' | awk -F'time=' '{print $2}' | awk '{print $1}'`, (errPing, pingGw) => {
        // Ping a Google DNS
        exec(`ping -c 1 -W 1 8.8.8.8 2>/dev/null | grep 'time=' | awk -F'time=' '{print $2}' | awk '{print $1}'`, (errPing2, pingGoogle) => {

          res.json({
            connected: true,
            ssid: ssid,
            signal: signal,
            security: security,
            mode: 'Cliente WiFi',
            gateway: gw || '--',
            pingGateway: pingGw.trim() || '--',
            pingGoogle: pingGoogle.trim() || '--'
          });
        });
      });
    });
  });
});

// Obtener contraseÃ±a guardada de la red actual (desde NetworkManager)
app.get('/api/network/password', isApiAuthenticated, (req, res) => {
  const { ssid } = req.query;

  if (!ssid) {
    return res.status(400).json({ error: 'SSID requerido' });
  }

  // Obtener la contraseÃ±a desde NetworkManager
  exec(`sudo nmcli -s -g 802-11-wireless-security.psk connection show "${ssid}"`, (err, stdout) => {
    if (err) {
      return res.json({ password: '' });
    }
    res.json({ password: stdout.trim() });
  });
});

// Listar redes WiFi disponibles
app.get('/api/network/scan', isApiAuthenticated, (req, res) => {
  exec('nmcli -t -f ssid,signal,security dev wifi list', (err, stdout) => {
    if (err) {
      return res.status(500).json({ error: 'Error escaneando redes', detail: err.message });
    }

    const networks = stdout.trim().split('\n').map(line => {
      const parts = line.split(':');
      return {
        ssid: parts[0] || '',
        signal: parseInt(parts[1]) || 0,
        security: parts[2] || 'Abierta'
      };
    }).filter(n => n.ssid); // Filtrar redes sin SSID

    res.json({ networks });
  });
});

// Guardar configuraciÃ³n de red
app.post('/api/network/config', isApiAuthenticated, express.json(), (req, res) => {
  const { mode, ssid, password } = req.body;

  if (mode === 'client') {
    // Conectar como cliente WiFi
    const cmd = `nmcli dev wifi connect "${ssid}" password "${password}"`;
    exec(cmd, (err, stdout, stderr) => {
      if (err) {
        console.error('Error conectando WiFi:', stderr);
        return res.status(500).json({ error: 'Error al conectar', detail: stderr });
      }
      res.json({ success: true, message: 'Conectado a la red WiFi' });
    });
  } else if (mode === 'hotspot') {
    // Crear hotspot
    const cmd = `nmcli dev wifi hotspot ssid "${ssid}" password "${password}"`;
    exec(cmd, (err, stdout, stderr) => {
      if (err) {
        console.error('Error creando hotspot:', stderr);
        return res.status(500).json({ error: 'Error al crear hotspot', detail: stderr });
      }
      res.json({ success: true, message: 'Hotspot creado correctamente' });
    });
  } else {
    res.status(400).json({ error: 'Modo invÃ¡lido' });
  }
});


// -----------------------------------------------------------------------------
// ðŸ–¥ï¸ API: Monitores de Pantalla / ConfiguraciÃ³n visual
// -----------------------------------------------------------------------------

app.get('/api/monitors', (req, res) => {
  const sql = `
    SELECT m.*, q.name AS queue_name
    FROM monitors m
    LEFT JOIN queues q ON m.queue_id = q.id
    ORDER BY m.id ASC
  `;
  db.all(sql, [], (err, rows) => {
    if (err) {
      console.error('âŒ Error listando monitores:', err);
      return res.status(500).json({ error: 'Error al listar monitores' });
    }
    res.json(rows);
  });
});

app.post('/api/monitors', express.json(), (req, res) => {
  const { id, name, queue_id, show_weather, show_news, orientation, background } = req.body;

  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'El nombre del monitor es obligatorio' });
  }

  const sqlUpdate = `
    UPDATE monitors
    SET queue_id = ?, show_weather = ?, show_news = ?, orientation = ?, background = ?, last_update = CURRENT_TIMESTAMP
    WHERE id = ?
  `;

  const sqlInsert = `
    INSERT INTO monitors (name, queue_id, show_weather, show_news, orientation, background)
    VALUES (?, ?, ?, ?, ?, ?)
  `;

  if (id) {
    db.run(sqlUpdate, [queue_id || null, show_weather ? 1 : 0, show_news ? 1 : 0, orientation || 'horizontal', background || '/media/panaderia.jpg', id], function (err) {
      if (err) {
        console.error('âŒ Error actualizando monitor (POST):', err);
        return res.status(500).json({ error: 'No se pudo actualizar el monitor' });
      }
      res.json({ message: 'Monitor actualizado correctamente', id });
    });
  } else {
    db.run(sqlInsert, [name, queue_id || null, show_weather ? 1 : 0, show_news ? 1 : 0, orientation || 'horizontal', background || '/media/panaderia.jpg'], function (err) {
      if (err) {
        console.error('âŒ Error creando monitor:', err);
        return res.status(500).json({ error: 'No se pudo crear el monitor' });
      }
      res.json({ message: 'Monitor creado correctamente', id: this.lastID });
    });
  }
});

// âœ… Actualizar monitor vÃ­a PUT (Soportado por pantallas.ejs)
app.put('/api/monitors/:id', express.json(), (req, res) => {
  const { id } = req.params;
  const { name, queue_id, show_weather, show_news, orientation, background } = req.body;

  const sql = `
    UPDATE monitors
    SET name = ?, queue_id = ?, show_weather = ?, show_news = ?, orientation = ?, background = ?, last_update = CURRENT_TIMESTAMP
    WHERE id = ?
  `;

  db.run(sql, [name, queue_id || null, show_weather ? 1 : 0, show_news ? 1 : 0, orientation || 'horizontal', background || '/media/panaderia.jpg', id], function (err) {
    if (err) {
      console.error('âŒ Error actualizando monitor (PUT):', err);
      return res.status(500).json({ error: 'Error al actualizar monitor' });
    }
    res.json({ success: true, message: 'Monitor actualizado correctamente' });
  });
});

app.delete('/api/monitors/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM monitors WHERE id = ?', [id], function (err) {
    if (err) {
      console.error('âŒ Error eliminando monitor:', err);
      return res.status(500).json({ error: 'Error al eliminar monitor' });
    }
    res.json({ message: 'Monitor eliminado correctamente' });
  });
});



// -----------------------------------------------------------------------------
// ðŸ–¥ï¸ Ruta: /monitor â€” Pantalla pÃºblica dinÃ¡mica segÃºn monitor asignado
// -----------------------------------------------------------------------------
app.get(['/monitor', '/pantalla'], (req, res) => {
  const monitorId = req.query.id || 1;

  const sql = `
    SELECT m.*, q.name AS queue_name
    FROM monitors m
    LEFT JOIN queues q ON m.queue_id = q.id
    WHERE m.id = ?
  `;

  db.get(sql, [monitorId], (err, monitor) => {
    if (err) {
      console.error('âŒ Error al obtener monitor:', err);
      return res.status(500).send('Error interno del servidor');
    }

    // ConfiguraciÃ³n por defecto si no existe el ID
    const config = monitor
      ? {
        id: monitor.id,
        queue_id: monitor.queue_id,
        queue_name: monitor.queue_name || 'Sin asignar',
        background: monitor.background || '/media/panaderia.jpg',
        orientation: monitor.orientation || 'horizontal',
        show_weather: monitor.show_weather ?? 1,
        show_news: monitor.show_news ?? 1
      }
      : {
        id: null,
        queue_id: null,
        queue_name: 'Sin asignar',
        background: '/media/panaderia.jpg',
        orientation: 'horizontal',
        show_weather: 1,
        show_news: 1
      };

    res.render('monitor', { layout: false, config });
  });
});


// -----------------------------------------------------------------------------
// ðŸ“¡ API: Obtener configuraciÃ³n de un monitor por ID
// -----------------------------------------------------------------------------
app.get('/api/monitors/:id', (req, res) => {
  const monitorId = req.params.id;
  const sql = `
    SELECT m.*, q.name AS queue_name
    FROM monitors m
    LEFT JOIN queues q ON m.queue_id = q.id
    WHERE m.id = ?
  `;

  db.get(sql, [monitorId], (err, monitor) => {
    if (err) {
      console.error('âŒ Error consultando monitor:', err);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }

    if (!monitor) {
      return res.status(404).json({ error: 'Monitor no encontrado' });
    }

    res.json({
      id: monitor.id,
      queue_id: monitor.queue_id,
      queue_name: monitor.queue_name || 'Sin asignar',
      background: monitor.background || '/media/panaderia.jpg',
      orientation: monitor.orientation || 'horizontal',
      show_weather: monitor.show_weather ?? 1,
      show_news: monitor.show_news ?? 1
    });
  });
});


// -----------------------------------------------------------------------------
// ðŸŽ¨ Ruta: Dashboard de Componentes
// -----------------------------------------------------------------------------
app.get('/dashboard', (req, res) => {
  res.render('dashboard', { layout: false });
});

// -----------------------------------------------------------------------------
// ðŸ“Š API: Estado de Componentes del Sistema
// -----------------------------------------------------------------------------
app.get('/api/system/components-status', isApiAuthenticated, async (req, res) => {
  const status = {
    backend: { connected: true },
    frontend: { connected: true },
    printer: { connected: false },
    hdmi: { connected: false },
    gpio: { connected: false }
  };

  // ðŸ–¨ï¸ Verificar impresora inteligente (USB o Red)
  try {
    if (printerMode === 'network' && printerNetworkIP) {
      const pRes = await detectNetworkPrinter(printerNetworkIP);
      status.printer.connected = pRes.connected;
    } else {
      const pRes = detectUSBPrinter();
      status.printer.connected = pRes.connected;
    }
  } catch (e) { }

  // ðŸ“º Verificar HDMI (Moderno DRM)
  try {
    await new Promise((resolve) => {
      // Escaneamos todos los puertos HDMI posibles
      exec('grep "^connected$" /sys/class/drm/card*/status', (err, stdout) => {
        if (!err && stdout.trim()) {
          status.hdmi.connected = true;
          // Intentar obtener resoluciÃ³n
          exec('cat /sys/class/drm/card*-HDMI-*/modes | head -1', (err2, modes) => {
            if (!err2 && modes.trim()) {
              status.hdmi.resolution = modes.trim();
            }
            resolve();
          });
        } else {
          resolve();
        }
      });
    });
  } catch (e) { }

  // ðŸ”˜ Verificar GPIO (pigpiod o /dev/gpiomem)
  try {
    await new Promise((resolve) => {
      exec('lsof -i :8888 || ls /dev/gpiomem', (err, stdout) => {
        if (!err && stdout.trim()) {
          status.gpio.connected = true;
        }
        resolve();
      });
    });
  } catch (e) { }

  res.json(status);
});


// -----------------------------------------------------------------------------
// ðŸš€ Servidor Express + Socket.IO
// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// ðŸ“¡ API: GPIO Settings (Debounce)
// -----------------------------------------------------------------------------
app.get('/api/gpio/settings', isApiAuthenticated, (req, res) => {
  res.json({ debounce: global.gpioDebounceMs || 50 });
});

app.post('/api/gpio/settings', isApiAuthenticated, (req, res) => {
  const { debounce } = req.body;
  if (debounce && !isNaN(debounce)) {
    global.gpioDebounceMs = parseInt(debounce);
    console.log(`âš™ï¸  GPIO Debounce set to ${global.gpioDebounceMs}ms`);
    res.json({ success: true, debounce: global.gpioDebounceMs });
  } else {
    res.status(400).json({ error: 'Valor invÃ¡lido' });
  }
});


// -----------------------------------------------------------------------------
// ðŸ“º CHROMECAST LOGIC
// -----------------------------------------------------------------------------
let chromecasts = [];

// Discover
browser.on('up', function (service) {
  // El nombre amistoso suele estar en txt.fn
  const friendlyName = service.txt?.fn || service.name.split('-')[0] || service.name;
  console.log(`ðŸ“¡ [Bonjour] Encontrado: ${friendlyName} (${service.name}) en ${service.addresses?.[0]}`);

  const existingIndex = chromecasts.findIndex(c => c.id === service.name);
  const deviceData = {
    id: service.name,
    name: friendlyName,
    address: service.addresses?.[0] || 'Unknown',
    port: service.port,
    txt: service.txt
  };

  if (existingIndex === -1) {
    chromecasts.push(deviceData);
  } else {
    chromecasts[existingIndex] = deviceData;
  }
});

browser.on('down', function (service) {
  console.log(`âœ–ï¸  [Bonjour] Desconectado: ${service.name}`);
  chromecasts = chromecasts.filter(c => c.id !== service.name);
});

// Restart discovery
function refreshDiscovery() {
  try {
    console.log('ðŸ”„ Actualizando lista de dispositivos...');
    if (typeof browser.update === 'function') browser.update();
  } catch (e) { console.error('Error refreshing discovery:', e); }
}

// En bonjour-service no hace falta llamar a start(), se inicia al buscar.

app.get('/api/chromecast/scan', isApiAuthenticated, async (req, res) => {
  console.log('ðŸ”  Consultando dispositivos Cast...');
  refreshDiscovery();
  // Dar 1s para que el update recoja algo nuevo si acaba de encenderse
  if (chromecasts.length === 0) await new Promise(r => setTimeout(r, 1500));
  res.json({ devices: chromecasts });
});

app.post('/api/chromecast/cast', isApiAuthenticated, (req, res) => {
  const { ip, url } = req.body;
  if (!ip || !url) return res.status(400).json({ error: 'IP y URL requeridos' });

  let contentType = 'video/mp4';
  if (url.match(/\.(jpg|jpeg|png|webp|gif)/i)) {
    contentType = 'image/jpeg';
    if (url.match(/\.png/i)) contentType = 'image/png';
  } else if (url.includes('http')) {
    contentType = 'text/html';
  }

  console.log(`Casting Request: ${ip} -> ${url} (${contentType})`);

  const client = new Client();
  let responseSent = false;

  const timer = setTimeout(() => {
    if (!responseSent) {
      responseSent = true;
      client.close();
      res.status(504).json({ error: 'Tiempo de espera agotado al conectar con Chromecast' });
    }
  }, 10000);

  client.connect(ip, function () {
    clearTimeout(timer);
    if (responseSent) return;

    const Receiver = (contentType === 'text/html') ? DashCast : DefaultMediaReceiver;

    client.launch(Receiver, function (err, player) {
      if (err) {
        if (!responseSent) {
          responseSent = true;
          client.close();
          return res.status(500).json({ error: 'Error al lanzar app: ' + err.message });
        }
        return;
      }

      if (Receiver === DashCast) {
        // Un pequeño delay para que DashCast esté listo
        setTimeout(() => {
          player.load(url, function (err, status) {
            if (!responseSent) {
              responseSent = true;
              client.close();
              res.json({ success: true, message: 'Casting Web iniciado' });
            }
          });
        }, 1500);
      } else {
        const media = {
          contentId: url,
          contentType: contentType,
          streamType: 'BUFFERED',
          metadata: {
            type: 0,
            metadataType: 0,
            title: "Turnito Stream",
            images: []
          }
        };
        player.load(media, { autoplay: true }, function (err, status) {
          if (!responseSent) {
            responseSent = true;
            client.close();
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, message: 'Casting Media iniciado' });
          }
        });
      }
    });
  });

  client.on('error', function (err) {
    if (!responseSent) {
      responseSent = true;
      clearTimeout(timer);
      client.close();
      res.status(500).json({ error: 'Error de comunicación: ' + err.message });
    }
  });
});

// FullPageOS Restart Fix
app.post('/api/system/fullpageos/restart', isApiAuthenticated, (req, res) => {
  // Attempt standard FullPageOS scripts or brute force
  // 1. Try restarting service
  // 2. Try killing chromium (autostart should respawn it)
  const cmd = 'sudo systemctl restart fullpageos || sudo pkill -o chromium || sudo pkill -o chromium-browser';
  exec(cmd, (err, stdout, stderr) => {
    if (err) {
      console.error('Restart FP Error:', stderr);
      return res.status(500).json({ error: 'Error restarting', details: stderr });
    }
    res.json({ success: true, message: 'Entorno reiniciado' });
  });
});


// --- SYSTEM ACTIONS ---
app.post('/api/system/reboot', isApiAuthenticated, (req, res) => {
  console.log('âš ï¸  REBOOT REQUESTED');
  res.json({ success: true });
  setTimeout(() => exec('sudo reboot'), 1000);
});

app.post('/api/system/shutdown', isApiAuthenticated, (req, res) => {
  console.log('âš ï¸  SHUTDOWN REQUESTED');
  res.json({ success: true });
  setTimeout(() => exec('sudo shutdown -h now'), 1000);
});

app.post('/api/system/update-os', isApiAuthenticated, (req, res) => {
  console.log('âš ï¸  OS UPDATE REQUESTED');
  const cmd = 'cd ~/turnito && git pull && npm install && pm2 restart turnito';
  exec(cmd, (err, stdout, stderr) => {
    if (err) return res.status(500).json({ error: stderr });
    res.json({ success: true, stdout });
  });
});

// -----------------------------------------------------------------------------
// ðŸš€ Servidor Express + Socket.IO
// -----------------------------------------------------------------------------
server.listen(port, () => {
  console.log(`âœ… Turnito v4.1 corriendo en http://localhost:${port}`);
});
