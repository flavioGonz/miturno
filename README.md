# Turnito Admin - Sistema de Gestión de Turnos y Control para Raspberry Pi

[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/) [![Express.js](https://img.shields.io/badge/Express.js-4.x-blue.svg)](https://expressjs.com/) [![SQLite](https://img.shields.io/badge/Database-SQLite3-blue.svg)](https://www.sqlite.org/index.html) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Turnito Admin** es una solución web todo-en-uno, diseñada para ejecutarse en un **Raspberry Pi** (idealmente con FullPageOS o una distribución ligera de Debian/Ubuntu). Combina un robusto **sistema de gestión de turnos** con un potente **panel de control para la administración remota del propio Raspberry Pi**.

Es la herramienta perfecta para pequeños negocios, clínicas, oficinas o cualquier entorno que requiera organizar la atención al público y, al mismo tiempo, tener control total sobre el dispositivo que lo gestiona, todo desde una interfaz web amigable y completamente offline.

<img width="1898" height="934" alt="image" src="https://github.com/user-attachments/assets/33d7a5bd-57d5-4171-9f3e-ebce42b6f237" />


---

## ✨ Características Principales

El sistema se divide en dos grandes áreas funcionales:

### 🧾 Sistema de Gestión de Turnos

- **Múltiples Colas de Servicio:** Administra diferentes departamentos o servicios (Ej: "Caja", "Atención al Cliente") de forma simultánea.
- **Panel de Operador (`/sistema/control`):** Una interfaz intuitiva para que el personal pueda llamar, completar, saltar o agregar turnos con un solo clic.
- **Monitor Público (`/monitor`):** Una pantalla diseñada para televisores o monitores de cara al público. Muestra el último turno llamado, el historial de llamadas y reproduce un sonido de notificación.
- **Publicidad Dinámica:** Sube imágenes (JPG, PNG) desde el panel de administración y muéstralas en un carrusel en el monitor público, con intervalo de rotación configurable.
- **Impresión de Tickets:** Soporte nativo para impresoras térmicas (USB o Red) para emitir tickets físicos a los clientes.

### ⚙️ Panel de Control del Raspberry Pi

- **Monitor de Sistema en Tiempo Real (`/sistema/resumen`):** Visualiza el uso de CPU, RAM, temperatura del procesador, espacio en disco y tiempo de actividad.
- **Control de GPIO (`/sistema/gpio`):** Interactúa con los pines GPIO del Raspberry Pi en tiempo real. Lee el estado de pulsadores y controla el encendido de LEDs o relés directamente desde la web, con comunicación bidireccional vía WebSockets.
- **Administración del Sistema Operativo:**
  - **Acciones de Energía:** Reinicia o apaga el Raspberry Pi de forma segura.
  - **Gestión de Servicios:** Habilita, deshabilita o reinicia servicios de `systemd`.
  - **Logs del Sistema:** Visualiza logs de `journalctl`, `dmesg` y del propio `pm2`.
  - **Actualizaciones del SO:** Lanza una actualización completa del sistema (`apt update && upgrade`).
- **Configuración de Red (`/sistema/red`):** Visualiza el estado de la red y cambia entre modo Cliente WiFi y modo Hotspot Access Point.
- **Edición de Archivos de Configuración:** Modifica archivos críticos como `/boot/firmware/config.txt` y `/boot/firmware/fullpageos.txt` directamente desde la interfaz.

---

## 🛠️ Tecnologías Utilizadas

| Componente                                  | Tecnología / Módulo                                                       |
| :------------------------------------------ | :-------------------------------------------------------------------------- |
| **Backend**                           | Node.js, Express.js                                                         |
| **Base de Datos**                     | SQLite3 (con `connect-sqlite3` para sesiones)                             |
| **Frontend**                          | EJS (Server-Side Rendering), Tabler CSS (Dark Mode Offline)                 |
| **Comunicación Real-Time**           | Socket.IO                                                                   |
| **Autenticación**                    | `express-session`, `bcrypt`                                             |
| **Integración Hardware (GPIO)**      | `pigpio-client` (sobre el daemon `pigpiod`)                             |
| **Integración Hardware (Impresora)** | Módulos nativos `usb` y `net` de Node.js                               |
| **Gestión de Procesos**              | PM2                                                                         |
| **Interacción con SO**               | `child_process` (ejecutando `systemctl`, `nmcli`, `vcgencmd`, etc.) |

---

## 🚀 Instalación y Puesta en Marcha

Sigue estos pasos para tener Turnito funcionando en tu Raspberry Pi.

### 1. Prerrequisitos

Asegúrate de tener lo siguiente instalado en tu sistema:

- **Node.js:** Versión 18 o superior.
- **NPM:** Gestor de paquetes de Node.js.
- **Git:** Para clonar el repositorio.
- **PM2:** Para gestionar el proceso en producción (`sudo npm install -g pm2`).
- **Daemon PIGPIO:** Esencial para el control de GPIO.
  ```bash
  sudo apt-get update
  sudo apt-get install pigpiod
  ```

### 2. Instalación

```bash
# 1. Clona el repositorio en el directorio de tu preferencia (ej: /home/pi)
cd /home/pi
git clone [https://github.com/tu-usuario/turnito.git](https://github.com/flavioGonz/miturno) # <-- Reemplaza con tu URL de repo
cd turnito

# 2. Instala las dependencias del proyecto
npm install

# 3. Habilita y arranca el daemon pigpiod para que se inicie con el sistema
sudo systemctl enable pigpiod
sudo systemctl start pigpiod

# 4. Otorga permisos de GPIO al usuario actual (ej: pi) y reinicia
sudo usermod -aG gpio $(whoami)
sudo reboot
```

### 3. Ejecución

#### Modo Desarrollo

Para pruebas y desarrollo, puedes iniciar la aplicación directamente:

```bash
npm run dev
```

La aplicación estará disponible en `http://<IP_RASPBERRY>:3000`.

#### Modo Producción (Recomendado)

Para un funcionamiento continuo y reinicio automático, usa PM2:

```bash
# Inicia la aplicación con PM2 y dale un nombre
pm2 start index.js --name turnito

# Configura PM2 para que se inicie automáticamente al arrancar el sistema
pm2 startup

# Guarda la configuración actual de procesos de PM2
pm2 save
```

---

## 📖 Guía de Uso

### Acceso Inicial

1. Abre tu navegador y ve a `http://<IP_RASPBERRY>:3000`.
2. Serás redirigido a la página de login.
3. Usa las credenciales por defecto:
   - **Usuario:** `admin`
   - **Contraseña:** `password`
4. **¡Importante!** Se recomienda cambiar la contraseña por defecto lo antes posible.

### Paneles Principales

- **Panel de Control de Turnos:** `http://.../sistema/control`
- **Monitor Público:** `http://.../monitor`
- **Resumen del Sistema:** `http://.../sistema/resumen`
- **Control de GPIO:** `http://.../sistema/gpio`
- **Configuración de Impresión:** `http://.../sistema/impresion`

---

## 🩺 Diagnóstico y Pruebas con cURL

Para interactuar con la API directamente desde la línea de comandos, puedes usar `curl`. Como la mayoría de los endpoints requieren autenticación, primero necesitas iniciar sesión y guardar la cookie de sesión.

**Paso 1: Iniciar Sesión**

Ejecuta este comando para autenticarte con el usuario `admin` y la contraseña `password`. La cookie de sesión se guardará en `cookies.txt`. Reemplaza `<IP_RASPBERRY>` con la IP de tu dispositivo.

```bash
curl -X POST -c cookies.txt -d "username=admin&password=password" http://<IP_RASPBERRY>:3000/login
```

**Paso 2: Realizar Consultas a la API**

Ahora puedes usar el archivo `cookies.txt` para hacer llamadas a los endpoints protegidos.

**Ejemplos:**

* **Listar todas las colas de turnos:**

  ```bash
  curl -b cookies.txt http://<IP_RASPBERRY>:3000/api/queues
  ```
* **Crear una nueva cola llamada "Ventas":**

  ```bash
  curl -X POST -b cookies.txt -H "Content-Type: application/json" -d '{"name":"Ventas"}' http://<IP_RASPBERRY>:3000/api/queues
  ```
* **Llamar al siguiente turno de la cola con ID 1:**

  ```bash
  curl -X POST -b cookies.txt http://<IP_RASPBERRY>:3000/api/queues/1/call-next
  ```
* **Obtener el estado de los pines GPIO:**

  ```bash
  curl -b cookies.txt http://<IP_RASPBERRY>:3000/api/gpio/status
  ```
* **Obtener la temperatura del CPU:**

  ```bash
  curl -b cookies.txt http://<IP_RASPBERRY>:3000/api/system/cpu-temp
  ```
* **Enviar un ticket de prueba a la impresora:**

  ```bash
  curl -X POST -b cookies.txt http://<IP_RASPBERRY>:3000/api/print/test
  ```

---

## 🔌 Integración de Hardware y Configuraciones por Defecto

### Control por GPIO

La aplicación puede ser controlada por pulsadores físicos conectados a los pines GPIO.

- **Comunicación:** `pigpio-client` se conecta al daemon `pigpiod` local y usa `socket.io` para notificar a la interfaz web en tiempo real.
- **Anti-rebote (Debounce):** Se implementa un sistema de anti-rebote por software para evitar lecturas múltiples en una sola pulsación. El código ignora cambios que ocurran en menos de 10ms.

**Mapa de pines por defecto (configurable en `index.js`):**

| Pin BCM | Dirección | Acción / Evento | Descripción                                         |
| :------ | :--------- | :--------------- | :--------------------------------------------------- |
| `17`  | IN         | `emit_ticket`  | Genera un nuevo turno en la cola 1.                  |
| `27`  | IN         | `next_turn`    | Llama al siguiente turno de la cola 1.               |
| `22`  | IN         | `prev_turn`    | Acción personalizada (actualmente solo log).        |
| `23`  | OUT        | `led`          | Indicador LED que puede ser controlado desde la web. |

<img width="1013" height="807" alt="image" src="https://github.com/user-attachments/assets/30672b95-6985-4dae-9e4b-11bdb6b2e54b" /> <img width="1016" height="808" alt="image" src="https://github.com/user-attachments/assets/02982077-bb79-48ca-8827-2a9a330d05a8" /><img width="1011" height="843" alt="image" src="https://github.com/user-attachments/assets/6c4ece14-8b19-4d11-8b0d-bde96e1cc639" />




### Impresora Térmica de Tickets

El sistema soporta impresoras de tickets de 80mm. Ve a la sección `/sistema/impresion` para configurar.

- **Modo USB (Por defecto):**
  - El sistema autodetecta impresoras con Vendor ID `0x0416` y Product ID `0x5011`.
- **Modo Red:**
  - Requiere configurar la IP de la impresora en el panel. La conexión se realiza por el puerto `9100`.

### Red y Otros

- **Hotspot Wi-Fi por defecto:** Si se activa el modo Hotspot, las credenciales por defecto son:
  - **SSID:** `TurnitoAP`
  - **Contraseña:** `turnito1234`
- **Cola Activa por Defecto:** La cola de turnos que se usa para las acciones de GPIO e impresión es, por defecto, la `queue_id = 1`.

---

<details>
<summary>🏛️ Arquitectura del Código y Estructura del Proyecto</summary>

### Arquitectura del Código

La aplicación sigue una arquitectura monolítica donde toda la lógica del backend reside en un único archivo: `index.js`. Este archivo está organizado en secciones bien comentadas que manejan diferentes aspectos de la aplicación en el siguiente orden:

1. **Configuración Base:** Inicialización de Express, Socket.IO y el servidor HTTP.
2. **Base de Datos:** Conexión a SQLite y creación de las tablas si no existen.
3. **Configuración de Express:** Middlewares, motor de plantillas (EJS) y sesiones.
4. **Autenticación:** Rutas de Login/Logout y middleware de protección de rutas.
5. **Rutas Principales:** Dashboard, vistas del sistema y monitor público.
6. **Lógica de GPIO:** Conexión al daemon `pigpiod`, configuración de pines, implementación de anti-rebote (debounce) y manejo de eventos de hardware que disparan acciones en la aplicación (ej. emitir ticket).
7. **API de Turnos (Queues):** Endpoints para crear, leer, actualizar y eliminar colas y turnos.
8. **API de Sistema:** Endpoints para interactuar con el sistema operativo (logs, servicios, red, archivos de configuración, acciones de energía).
9. **API de Publicidad:** Endpoints para gestionar las imágenes del carrusel del monitor.
10. **Manejo de Socket.IO:** Sincronización en tiempo real del estado de los GPIO entre el hardware y la interfaz web.
11. **Monitoreo de Sistema:** Endpoints que proveen datos de CPU, RAM, disco, etc.
12. **Módulo de Impresión:** Lógica para detectar y enviar comandos a impresoras térmicas USB o de red.
13. **Arranque del Servidor:** Inicia el servidor Express.

### Estructura del Proyecto

El directorio principal contiene varios archivos y carpetas. Los elementos clave para el funcionamiento de la aplicación son:

```
turnito/
├── db/
│   └── turnito.db              # Base de datos SQLite (autogenerada)
├── public/                     # Archivos estáticos (CSS, JS, imágenes, media)
│   ├── css/
│   ├── js/
│   ├── img/
│   └── media/                  # Archivos para el carrusel de publicidad
├── views/                      # Plantillas EJS para la interfaz de usuario
│   ├── layout.ejs              # Plantilla principal
│   ├── login.ejs               # Vista de login
│   ├── index.ejs               # Dashboard principal
│   ├── monitor.ejs             # Pantalla pública de turnos
│   └── sistema/                # Vistas del panel de administración
├── index.js                    # ¡El corazón de la aplicación! Servidor y toda la lógica.
├── package.json                # Dependencias y scripts del proyecto
└── README.md                   # Este archivo
```

**Nota sobre otros directorios:** El proyecto contiene directorios como `miturno/`, `respaldo/` y numerosos archivos con el sufijo `copy`. Estos parecen ser copias de seguridad o versiones de desarrollo anteriores y **no son utilizados por la aplicación principal**. El código fuente activo se encuentra en la raíz del directorio `turnito/`.

</details>

<details>
<summary>🗄️ Esquema de la Base de Datos</summary>

La aplicación utiliza una base de datos SQLite3. Al arrancar, se asegura de que las siguientes tablas existan, creándolas si es necesario.

**Tabla `users`**

```sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE,
  password TEXT
);
```

**Tabla `queues`**

```sql
CREATE TABLE IF NOT EXISTS queues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE
);
```

**Tabla `turns`**

```sql
CREATE TABLE IF NOT EXISTS turns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  queue_id INTEGER,
  turn_number INTEGER,
  status TEXT DEFAULT 'waiting', -- (waiting, calling, completed)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

</details>

<details>
<summary>📡 Referencia de API Endpoints</summary>

La mayoría de los endpoints requieren autenticación de sesión.

#### Turnos y Colas (`/api/queues/...`)

- `GET /api/queues`: Lista todas las colas de servicio.
- `POST /api/queues`: Crea una nueva cola. Body: `{ "name": "NombreCola" }`.
- `PUT /api/queues/:id`: Actualiza el nombre de una cola. Body: `{ "name": "NuevoNombre" }`.
- `DELETE /api/queues/:id`: Elimina una cola y todos sus turnos asociados.
- `GET /api/queues/:id/turns`: Lista los turnos de una cola específica.
- `POST /api/queues/:id/turns`: Crea un nuevo turno en una cola.
- `POST /api/queues/:id/call-next`: Marca el turno actual como completado y llama al siguiente en espera.

#### Sistema y Hardware (`/api/system/...`, `/api/gpio/...`)

- `GET /api/system/cpu-temp`: Temperatura del CPU.
- `GET /api/system/cpu-usage`: Uso de CPU en %.
- `GET /api/system/memory-usage`: Uso de RAM en %.
- `GET /api/system/disk-usage`: Uso del disco.
- `GET /api/system/uptime`: Tiempo de actividad del sistema.
- `GET /api/system/hostname`: Nombre del host del equipo.
- `POST /api/system/reboot`: Reinicia el sistema.
- `POST /api/system/shutdown`: Apaga el sistema.
- `POST /api/system/update-os`: Ejecuta `apt update && apt upgrade`.
- `GET /api/gpio/status`: Estado actual de los pines GPIO configurados.

#### Impresión (`/api/print/...`)

- `GET /api/print/status`: Verifica el estado de la impresora conectada (USB o Red).
- `POST /api/print/mode`: Cambia el modo de impresión. Body: `{ "mode": "usb" }` o `{ "mode": "network", "ip": "192.168.1.100" }`.
- `POST /api/print/test`: Imprime un ticket de prueba.

*(Existen más endpoints para logs, servicios, red, etc., que pueden ser consultados en `index.js`)*

</details>

---

## 📄 Licencia

Este proyecto está bajo la Licencia MIT.

## 👨‍💻 Créditos

Desarrollado por **Flavio González – Infratec Networks**
Uruguay – 2025
