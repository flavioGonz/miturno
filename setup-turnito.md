
* Estado de `pigpiod`, `pm2`, `node`, `npm`, `sqlite3`
* Verificación de red y servicios escuchando en el puerto 3000
* Información de hardware y carga del sistema
* Detección de procesos huérfanos o fallas comunes

---

## 🧰 Archivo completo

📄 `/home/fgonzalez/turnito/setup-turnito.sh`

<pre class="overflow-visible!" data-start="554" data-end="7577"><div class="contain-inline-size rounded-2xl relative bg-token-sidebar-surface-primary"><div class="sticky top-9"><div class="absolute end-0 bottom-0 flex h-9 items-center pe-2"><div class="bg-token-bg-elevated-secondary text-token-text-secondary flex items-center gap-4 rounded-sm px-2 font-sans text-xs"></div></div></div><div class="overflow-y-auto p-4" dir="ltr"><code class="whitespace-pre! language-bash"><span><span>#!/bin/bash</span><span>
</span><span># ===============================================================</span><span>
</span><span>#  Turnito Admin - Instalador interactivo y reparación de entorno</span><span>
</span><span>#  Autor: Infratec Networks - Flavio González</span><span>
</span><span>#  Versión: 1.2 (Smart Setup + Diagnóstico)</span><span>
</span><span># ===============================================================</span><span>

APP_DIR=</span><span>"/home/fgonzalez/turnito"</span><span>
SERVICE_NAME=</span><span>"turnito"</span><span>

</span><span># --- Colores ---</span><span>
GREEN=</span><span>"\e[92m"</span><span>
YELLOW=</span><span>"\e[93m"</span><span>
RED=</span><span>"\e[91m"</span><span>
CYAN=</span><span>"\e[96m"</span><span>
RESET=</span><span>"\e[0m"</span><span>

</span><span>echo</span><span> -e </span><span>"${CYAN}</span><span>🚀 Instalador interactivo de Turnito Admin</span><span>${RESET}</span><span>"
</span><span>echo</span><span></span><span>"Ubicación actual: $APP_DIR</span><span>"
</span><span>echo</span><span></span><span>"---------------------------------------------"</span><span>

</span><span># --- Verificación de versión de Node.js ---</span><span>
NODE_VER=$(node -v 2>/dev/null)
</span><span>if</span><span> [[ -z </span><span>"$NODE_VER</span><span>" ]]; </span><span>then</span><span>
  </span><span>echo</span><span> -e </span><span>"${RED}</span><span>❌ Node.js no está instalado.</span><span>${RESET}</span><span>"
  </span><span>echo</span><span></span><span>"Instalalo con:"</span><span>
  </span><span>echo</span><span> -e </span><span>"${CYAN}</span><span>curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -</span><span>${RESET}</span><span>"
  </span><span>echo</span><span> -e </span><span>"${CYAN}</span><span>sudo apt install -y nodejs</span><span>${RESET}</span><span>"
  </span><span>exit</span><span> 1
</span><span>else</span><span>
  </span><span>echo</span><span> -e </span><span>"${GREEN}</span><span>✔ Node.js detectado: $NODE_VER</span><span>${RESET}</span><span>"
  NODE_MAJOR=$(node -v | grep -oP </span><span>'\d+'</span><span> | </span><span>head</span><span> -1)
  </span><span>if</span><span> (( NODE_MAJOR < </span><span>18</span><span> )); </span><span>then</span><span>
    </span><span>echo</span><span> -e </span><span>"${RED}</span><span>⚠️ Versión de Node.js obsoleta. Se recomienda >=18.</span><span>${RESET}</span><span>"
    </span><span>read</span><span> -p </span><span>"¿Continuar de todos modos? (s/n): "</span><span> CONTINUE
    [[ </span><span>"$CONTINUE</span><span>" != </span><span>"s"</span><span> && </span><span>"$CONTINUE</span><span>" != </span><span>"S"</span><span> ]] && </span><span>exit</span><span> 1
  </span><span>fi</span><span>
</span><span>fi</span><span>

</span><span># --- Confirmar ubicación ---</span><span>
</span><span>read</span><span> -p </span><span>"¿Querés continuar en esta ruta? (s/n): "</span><span> CONFIRM
</span><span>if</span><span> [[ </span><span>"$CONFIRM</span><span>" != </span><span>"s"</span><span> && </span><span>"$CONFIRM</span><span>" != </span><span>"S"</span><span> ]]; </span><span>then</span><span>
  </span><span>echo</span><span> -e </span><span>"${YELLOW}</span><span>Cancelado por el usuario.</span><span>${RESET}</span><span>"
  </span><span>exit</span><span> 0
</span><span>fi</span><span>

</span><span>cd</span><span></span><span>"$APP_DIR</span><span>" || { </span><span>echo</span><span> -e </span><span>"${RED}</span><span>❌ Carpeta no encontrada.</span><span>${RESET}</span><span>"; </span><span>exit</span><span> 1; }

</span><span># --- Menú principal ---</span><span>
clear
</span><span>echo</span><span></span><span>"---------------------------------------------"</span><span>
</span><span>echo</span><span></span><span>"📦 Menú principal:"</span><span>
</span><span>echo</span><span></span><span>"1) Instalación completa (desde cero)"</span><span>
</span><span>echo</span><span></span><span>"2) Reinstalar dependencias"</span><span>
</span><span>echo</span><span></span><span>"3) Actualizar dependencias y reiniciar servicio"</span><span>
</span><span>echo</span><span></span><span>"4) Limpiar entorno (node_modules, lockfiles, cache)"</span><span>
</span><span>echo</span><span></span><span>"5) Salir"</span><span>
</span><span>echo</span><span></span><span>"6) 🧪 Diagnóstico del sistema"</span><span>
</span><span>echo</span><span></span><span>"---------------------------------------------"</span><span>
</span><span>read</span><span> -p </span><span>"Seleccioná una opción [1-6]: "</span><span> OPCION

</span><span># --- Función de instalación segura ---</span><span>
</span><span>install_deps</span><span>() {
  </span><span>echo</span><span> -e </span><span>"${CYAN}</span><span>📥 Instalando dependencias necesarias...</span><span>${RESET}</span><span>"
  npm install express express-session express-ejs-layouts express-fileupload \
    sqlite3 connect-sqlite3 bcrypt socket.io tabler-icons @tabler/core \
    pigpio-client pm2 child_process fs-extra node-fetch escpos escpos-network --save
}

</span><span># --- Diagnóstico del sistema ---</span><span>
</span><span>diagnostico</span><span>() {
  clear
  </span><span>echo</span><span> -e </span><span>"${CYAN}</span><span>🧪 Diagnóstico del entorno Turnito Admin</span><span>${RESET}</span><span>"
  </span><span>echo</span><span></span><span>"---------------------------------------------"</span><span>

  </span><span>echo</span><span> -e </span><span>"${YELLOW}</span><span>🔹 Versión de Node.js:</span><span>${RESET}</span><span></span><span>$(node -v 2>/dev/null || echo 'No encontrado')</span><span>"
  </span><span>echo</span><span> -e </span><span>"${YELLOW}</span><span>🔹 Versión de NPM:</span><span>${RESET}</span><span></span><span>$(npm -v 2>/dev/null || echo 'No encontrado')</span><span>"
  </span><span>echo</span><span> -e </span><span>"${YELLOW}</span><span>🔹 Versión de SQLite3:</span><span>${RESET}</span><span></span><span>$(sqlite3 --version 2>/dev/null || echo 'No encontrado')</span><span>"
  </span><span>echo</span><span></span><span>"---------------------------------------------"</span><span>

  </span><span>echo</span><span> -e </span><span>"${CYAN}</span><span>⚙️  Servicios:</span><span>${RESET}</span><span>"
  systemctl is-active --quiet pigpiod && </span><span>echo</span><span> -e </span><span>"${GREEN}</span><span>✔ pigpiod activo</span><span>${RESET}</span><span>" || </span><span>echo</span><span> -e </span><span>"${RED}</span><span>❌ pigpiod inactivo</span><span>${RESET}</span><span>"
  pm2 describe </span><span>"$SERVICE_NAME</span><span>" >/dev/null 2>&1 && </span><span>echo</span><span> -e </span><span>"${GREEN}</span><span>✔ PM2 ejecutando $SERVICE_NAME</span><span>${RESET}</span><span>" || </span><span>echo</span><span> -e </span><span>"${RED}</span><span>❌ PM2 no está corriendo $SERVICE_NAME</span><span>${RESET}</span><span>"

  </span><span>echo</span><span></span><span>"---------------------------------------------"</span><span>
  </span><span>echo</span><span> -e </span><span>"${CYAN}</span><span>🌐 Conectividad de red:</span><span>${RESET}</span><span>"
  IP=$(hostname -I | awk </span><span>'{print $1}'</span><span>)
  </span><span>if</span><span> [[ -n </span><span>"$IP</span><span>" ]]; </span><span>then</span><span>
    </span><span>echo</span><span> -e </span><span>"${GREEN}</span><span>✔ IP Local: $IP</span><span>${RESET}</span><span>"
    nc -z localhost 3000 >/dev/null 2>&1 && </span><span>echo</span><span> -e </span><span>"${GREEN}</span><span>✔ Puerto 3000 activo</span><span>${RESET}</span><span>" || </span><span>echo</span><span> -e </span><span>"${RED}</span><span>❌ Puerto 3000 no responde</span><span>${RESET}</span><span>"
  </span><span>else</span><span>
    </span><span>echo</span><span> -e </span><span>"${RED}</span><span>⚠️ No se detectó dirección IP.</span><span>${RESET}</span><span>"
  </span><span>fi</span><span>

  </span><span>echo</span><span></span><span>"---------------------------------------------"</span><span>
  </span><span>echo</span><span> -e </span><span>"${CYAN}</span><span>💽 Estado del sistema:</span><span>${RESET}</span><span>"
  </span><span>echo</span><span> -e </span><span>"Uptime: $(uptime -p)</span><span>"
  </span><span>echo</span><span> -e </span><span>"Carga: $(uptime | awk -F'load average:' '{print $2}')</span><span>"
  </span><span>echo</span><span> -e </span><span>"Uso de disco:"</span><span>
  </span><span>df</span><span> -h / | </span><span>tail</span><span> -1 | awk </span><span>'{print "• " $1 ": " $3 "/" $2 " usados (" $5 ")"}'</span><span>

  </span><span>echo</span><span></span><span>"---------------------------------------------"</span><span>
  </span><span>echo</span><span> -e </span><span>"${CYAN}</span><span>🔍 Procesos relacionados:</span><span>${RESET}</span><span>"
  ps aux | grep -E </span><span>"node|pigpiod|pm2"</span><span> | grep -v grep | awk </span><span>'{print "• PID " $2 " - " $11}'</span><span>

  </span><span>echo</span><span></span><span>"---------------------------------------------"</span><span>
  </span><span>echo</span><span> -e </span><span>"${GREEN}</span><span>✅ Diagnóstico finalizado.</span><span>${RESET}</span><span>"
  </span><span>echo</span><span>
  </span><span>read</span><span> -p </span><span>"Presioná Enter para volver al menú..."</span><span>
  </span><span>exec</span><span></span><span>"$0</span><span>"
}

</span><span>case</span><span></span><span>$OPCION</span><span></span><span>in</span><span>
  1)
    </span><span>echo</span><span> -e </span><span>"${CYAN}</span><span>🧹 Limpieza de entorno anterior...</span><span>${RESET}</span><span>"
    </span><span>rm</span><span> -rf node_modules package-lock.json
    </span><span>sleep</span><span> 1
    </span><span>echo</span><span> -e </span><span>"${CYAN}</span><span>📦 Instalando Turnito Admin completo...</span><span>${RESET}</span><span>"
    install_deps
    ;;

  2)
    </span><span>echo</span><span> -e </span><span>"${CYAN}</span><span>♻️ Reinstalando dependencias...</span><span>${RESET}</span><span>"
    </span><span>rm</span><span> -rf node_modules
    npm install
    ;;

  3)
    </span><span>echo</span><span> -e </span><span>"${CYAN}</span><span>🔄 Actualizando dependencias...</span><span>${RESET}</span><span>"
    npm update
    ;;

  4)
    </span><span>echo</span><span> -e </span><span>"${YELLOW}</span><span>🧽 Limpiando todo el entorno...</span><span>${RESET}</span><span>"
    </span><span>rm</span><span> -rf node_modules package-lock.json npm-shrinkwrap.json
    npm cache clean --force
    </span><span>echo</span><span> -e </span><span>"${GREEN}</span><span>✅ Entorno limpio.</span><span>${RESET}</span><span>"
    ;;

  5)
    </span><span>echo</span><span> -e </span><span>"${YELLOW}</span><span>👋 Saliendo del instalador.</span><span>${RESET}</span><span>"
    </span><span>exit</span><span> 0
    ;;

  6)
    diagnostico
    </span><span>exit</span><span> 0
    ;;

  *)
    </span><span>echo</span><span> -e </span><span>"${RED}</span><span>❌ Opción inválida.</span><span>${RESET}</span><span>"
    </span><span>exit</span><span> 1
    ;;
</span><span>esac</span><span>

</span><span># --- Confirmar configuración de PM2 ---</span><span>
</span><span>echo</span><span>
</span><span>read</span><span> -p </span><span>"¿Querés configurar o reiniciar el servicio PM2 para Turnito? (s/n): "</span><span> PM2CONFIRM
</span><span>if</span><span> [[ </span><span>"$PM2CONFIRM</span><span>" == </span><span>"s"</span><span> || </span><span>"$PM2CONFIRM</span><span>" == </span><span>"S"</span><span> ]]; </span><span>then</span><span>
  </span><span>echo</span><span> -e </span><span>"${CYAN}</span><span>⚙️ Configurando PM2...</span><span>${RESET}</span><span>"
  sudo systemctl </span><span>enable</span><span> pigpiod
  sudo systemctl start pigpiod
  pm2 stop </span><span>"$SERVICE_NAME</span><span>" >/dev/null 2>&1
  pm2 delete </span><span>"$SERVICE_NAME</span><span>" >/dev/null 2>&1
  pm2 start index.js --name </span><span>"$SERVICE_NAME</span><span>"
  pm2 save
  pm2 startup
  </span><span>echo</span><span> -e </span><span>"${GREEN}</span><span>✅ Turnito Admin configurado en PM2.</span><span>${RESET}</span><span>"
</span><span>fi</span><span>

</span><span># --- Detección de IP del Raspberry Pi ---</span><span>
IP=$(hostname -I | awk </span><span>'{print $1}'</span><span>)
</span><span>if</span><span> [[ -n </span><span>"$IP</span><span>" ]]; </span><span>then</span><span>
  </span><span>echo</span><span>
  </span><span>echo</span><span> -e </span><span>"${CYAN}</span><span>🌐 Dirección IP detectada: </span><span>${GREEN}</span><span>$IP</span><span>${RESET}</span><span>"
  </span><span>echo</span><span> -e </span><span>"Podés acceder desde: ${CYAN}</span><span>http://</span><span>$IP</span><span>:3000</span><span>${RESET}</span><span>"
</span><span>else</span><span>
  </span><span>echo</span><span> -e </span><span>"${RED}</span><span>⚠️ No se pudo detectar la IP automáticamente.</span><span>${RESET}</span><span>"
</span><span>fi</span><span>

</span><span># --- FullPageOS Integration ---</span><span>
</span><span>if</span><span> [[ -f /boot/fullpageos.txt ]]; </span><span>then</span><span>
  </span><span>echo</span><span>
  </span><span>echo</span><span> -e </span><span>"${YELLOW}</span><span>🖥️ Se detectó FullPageOS.</span><span>${RESET}</span><span>"
  </span><span>read</span><span> -p </span><span>"¿Querés configurar la pantalla HDMI para mostrar /pantalla al inicio? (s/n): "</span><span> FPCONFIRM
  </span><span>if</span><span> [[ </span><span>"$FPCONFIRM</span><span>" == </span><span>"s"</span><span> || </span><span>"$FPCONFIRM</span><span>" == </span><span>"S"</span><span> ]]; </span><span>then</span><span>
    sudo sed -i </span><span>'/FULLPAGEOS_URL=/d'</span><span> /boot/fullpageos.txt
    </span><span>echo</span><span></span><span>"FULLPAGEOS_URL=http://localhost:3000/pantalla"</span><span> | sudo </span><span>tee</span><span> -a /boot/fullpageos.txt >/dev/null
    </span><span>echo</span><span> -e </span><span>"${GREEN}</span><span>✅ FullPageOS configurado correctamente.</span><span>${RESET}</span><span>"
  </span><span>fi</span><span>
</span><span>fi</span><span>

</span><span># --- Finalización ---</span><span>
</span><span>echo</span><span>
</span><span>echo</span><span> -e </span><span>"${GREEN}</span><span>✅ Instalación finalizada.</span><span>${RESET}</span><span>"
</span><span>echo</span><span> -e </span><span>"Verificá estado con: ${CYAN}</span><span>pm2 logs turnito</span><span>${RESET}</span><span>"
</span><span>echo</span><span> -e </span><span>"Servicio en ejecución: ${CYAN}</span><span>http://</span><span>$IP</span><span>:3000</span><span>${RESET}</span><span>"
</span><span>echo</span><span> -e </span><span>"${YELLOW}</span><span>Reiniciá la Raspberry Pi si acabás de instalar pigpiod o PM2.</span><span>${RESET}</span><span>"
</span><span>echo</span><span></span><span>"---------------------------------------------"</span><span>
</span></span></code></div></div></pre>

---

## 🧭 Nuevas funciones

| Opción                                | Descripción                                               |
| -------------------------------------- | ---------------------------------------------------------- |
| **6 - Diagnóstico del sistema** | Revisa automáticamente todos los servicios y dependencias |
| 🔍**Node/NPM check**             | Muestra versiones y advierte si la versión es obsoleta    |
| ⚙️**pigpiod / PM2**            | Informa si están activos                                  |
| 🌐**Conectividad / puerto 3000** | Comprueba si Turnito responde en local                     |
| 💽**Uptime, carga y disco**      | Datos del estado del sistema                               |
| 🧠**Procesos activos**           | Lista node, pigpiod y pm2                                  |
| 🖥️**FullPageOS**               | Integración opcional automática                          |

---

## 🧾 Ejemplo de salida

<pre class="overflow-visible!" data-start="8178" data-end="8950"><div class="contain-inline-size rounded-2xl relative bg-token-sidebar-surface-primary"><div class="sticky top-9"><div class="absolute end-0 bottom-0 flex h-9 items-center pe-2"><div class="bg-token-bg-elevated-secondary text-token-text-secondary flex items-center gap-4 rounded-sm px-2 font-sans text-xs"></div></div></div><div class="overflow-y-auto p-4" dir="ltr"><code class="whitespace-pre!"><span><span>🧪 Diagnóstico del entorno Turnito Admin
---------------------------------------------
🔹 Versión de Node.js: v18.20.3
🔹 Versión de NPM: 10.6.0
🔹 Versión de SQLite3: 3.44.2
---------------------------------------------
⚙️  Servicios:
✔ pigpiod activo
✔ PM2 ejecutando turnito
---------------------------------------------
🌐 Conectividad de red:
✔ IP Local: 192.168.0.124
✔ Puerto 3000 activo
---------------------------------------------
💽 Estado del sistema:
Uptime: up 2 hours, 31 minutes
Carga: 0.12, 0.08, 0.03
Uso de disco: • /dev/root: 3.2G/15G usados (21%)
---------------------------------------------
🔍 Procesos relacionados:
• PID 645 - node
• PID 318 - pigpiod
• PID 432 - pm2
---------------------------------------------
✅ Diagnóstico finalizado.</span></span></code></div></div></pre>
