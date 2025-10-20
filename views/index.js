// ---------------------------------------------------------------------
// File: /home/fgonzalez/turnito/index.js
// Turnito Admin v2.9 – Live Log Viewer (Offline Edition)
// ---------------------------------------------------------------------

const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const bcrypt = require('bcrypt');
const SQLiteStore = require('connect-sqlite3')(session);
const expressLayouts = require('express-ejs-layouts');
const { exec, execFile } = require('child_process');
const fs = require('fs');
const fsPromises = require('fs/promises');

const app = express();
const port = 3000;
const saltRounds = 10;

// ----------------------
// Base de datos SQLite
// ----------------------
const dbPath = path.join(__dirname, 'db', 'turnito.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error('Error conectando a SQLite:', err.message);
  else {
    console.log('✅ SQLite conectado.');
    db.serialize(() => {
      db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT);`);
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

// ----------------------
// Express config
// ----------------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(expressLayouts);
app.set('layout', 'layout');
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

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

// ----------------------
// Login
// ----------------------
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

// ----------------------
// Vistas
// ----------------------
app.get('/', isAuthenticated, (req, res) => res.render('index', { title: 'Turnito Dashboard' }));
app.get('/sistema/:section', isAuthenticated, (req, res) => {
  const s = req.params.section;
  const valid = ['resumen', 'acciones', 'red', 'logs', 'servicios', 'fullpageos'];
  if (!valid.includes(s)) return res.status(404).send('404');
  res.render(`sistema/${s}`, { title: `Sistema - ${s}` });
});

// ----------------------
// API: Servicios
// ----------------------
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

// ----------------------
// API: Network (nmcli)
// ----------------------
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

// ----------------------
// API: FullPageOS
// ----------------------
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

// ----------------------
// API: Logs en tiempo real v2.9
// ----------------------
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
// ENDPOINTS BÁSICOS DEL SISTEMA - para resumen y monitoreo
// -----------------------------------------------------------------------------
app.get('/api/system/cpu-temp', isApiAuthenticated, (req, res) => {
  execFile('/usr/bin/vcgencmd', ['measure_temp'], { timeout: 3000 }, (err, out) => {
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
    const total = stat2.reduce((a,b)=>a+b,0) - stat1.reduce((a,b)=>a+b,0);
    const usage = ((1 - idle / total) * 100).toFixed(1);
    res.json({ cpu_usage: usage });
  } catch {
    res.status(500).json({ error: 'No se pudo calcular uso de CPU' });
  }
});

app.get('/api/system/memory-usage', isApiAuthenticated, (req, res) => {
  try {
    const info = fs.readFileSync('/proc/meminfo', 'utf8');
    const get = (key) => Number((info.match(new RegExp(`^${key}:\\s+(\\d+)`, 'm'))||[])[1]||0);
    const total = get('MemTotal');
    const avail = get('MemAvailable');
    const used = total - avail;
    res.json({ ram: ((used / total) * 100).toFixed(1) });
  } catch {
    res.status(500).json({ error: 'No se pudo obtener memoria' });
  }
});

app.get('/api/system/swap-usage', isApiAuthenticated, (req, res) => {
  try {
    const info = fs.readFileSync('/proc/meminfo', 'utf8');
    const get = (key) => Number((info.match(new RegExp(`^${key}:\\s+(\\d+)`, 'm'))||[])[1]||0);
    const total = get('SwapTotal');
    const free = get('SwapFree');
    const used = total - free;
    res.json({ swap: total ? ((used / total) * 100).toFixed(1) : 0 });
  } catch {
    res.status(500).json({ error: 'No se pudo obtener SWAP' });
  }
});

app.get('/api/system/disk-usage', isApiAuthenticated, (req, res) => {
  execFile('/bin/df', ['-h', '/'], (err, out) => {
    if (err) return res.status(500).json({ error: 'Error disco' });
    const [, size, used, avail, pct] = out.split('\n')[1].split(/\s+/);
    res.json({ size, used, avail, pct });
  });
});

app.get('/api/system/process-count', isApiAuthenticated, (req, res) => {
  execFile('/bin/ps', ['-e', '--no-headers'], (err, out) => {
    if (err) return res.status(500).json({ error: 'Error procesos' });
    res.json({ process_count: out.split('\n').filter(Boolean).length });
  });
});

app.get('/api/system/uptime', isApiAuthenticated, (req, res) => {
  const s = parseFloat(fs.readFileSync('/proc/uptime', 'utf8').split(' ')[0]);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  res.json({ uptime: `${h}h ${m}m` });
});

// -----------------------------------------------------------------------------
// ENDPOINTS DE ACCIONES DEL SISTEMA - para /sistema/acciones
// -----------------------------------------------------------------------------

// 🔁 Reiniciar Raspberry
app.post('/api/system/reboot', isApiAuthenticated, (req, res) => {
  exec('/sbin/reboot', (err) =>
    err ? res.status(500).json({ error: 'No se pudo reiniciar' })
        : res.json({ message: 'Reiniciando Raspberry Pi...' })
  );
});

// ⏻ Apagar Raspberry
app.post('/api/system/shutdown', isApiAuthenticated, (req, res) => {
  exec('/sbin/shutdown -h now', (err) =>
    err ? res.status(500).json({ error: 'No se pudo apagar' })
        : res.json({ message: 'Apagando Raspberry Pi...' })
  );
});

// ⬆️ Actualizar sistema operativo
app.post('/api/system/update-os', isApiAuthenticated, (req, res) => {
  exec('apt update && apt -y upgrade', { timeout: 30 * 60 * 1000, maxBuffer: 50 * 1024 * 1024 }, (err, out) =>
    err ? res.status(500).json({ error: 'Error en actualización del sistema' })
        : res.json({ message: 'Actualización completada correctamente.', output: out.slice(0, 1000) })
  );
});

// 💻 Hostname actual y cambio
app.get('/api/system/hostname', isApiAuthenticated, (req, res) => {
  exec('hostname', (err, out) => {
    if (err) return res.status(500).json({ error: 'No se pudo obtener el hostname' });
    res.json({ hostname: out.trim() });
  });
});

app.post('/api/system/hostname', isApiAuthenticated, (req, res) => {
  const { hostname } = req.body;
  if (!hostname) return res.status(400).json({ error: 'Hostname vacío' });
  exec(`hostnamectl set-hostname ${hostname}`, (err) =>
    err ? res.status(500).json({ error: 'No se pudo cambiar hostname' })
        : res.json({ message: `Hostname cambiado a ${hostname}` })
  );
});

// 🕒 Hora del sistema (GET/POST)
app.get('/api/system/time', isApiAuthenticated, (req, res) => {
  exec('date -Iseconds', (err, out) =>
    err ? res.status(500).json({ error: 'No se pudo obtener hora' })
        : res.json({ time: out.trim() })
  );
});

app.post('/api/system/time', isApiAuthenticated, (req, res) => {
  const { datetime } = req.body;
  if (!datetime) return res.status(400).json({ error: 'Fecha/hora vacía' });
  exec(`date -s "${datetime}"`, (err) =>
    err ? res.status(500).json({ error: 'No se pudo cambiar hora' })
        : res.json({ message: `Hora del sistema ajustada a ${datetime}` })
  );
});


// ----------------------
app.listen(port, () => console.log(`✅ Turnito v2.9 corriendo en http://localhost:${port}`));
