#!/bin/bash
# -----------------------------------------------------------------------------
# 🧩 Instalador + Diagnóstico de Turnito Admin
# Repositorio oficial: https://github.com/flavioGonz/miturno.git
# Autor: Flavio González - Infratec Networks, Uruguay (2025)
# Versión: 2.3 - Compatible con Node.js 20.x (raspbian / debian / ubuntu)
# -----------------------------------------------------------------------------
# Este script instala, configura y prueba Turnito Admin completamente.
# Incluye: PM2, pigpiod, SQLite3, dependencias Node, prueba GPIO e impresión.
# -- sudo chmod +x install_turnito_diagnose.sh
# -- sudo ./install_turnito_diagnose.sh | tee /tmp/install_turnito.log
# -----------------------------------------------------------------------------

# -🧠 Resumen de lo que hace
# -Etapa	Descripción
# -1.	Detecta si tenés Node.js 20.x y lo deja intacto.
# -2.	Instala dependencias base del sistema.
# -3.	Instala PM2 (si no está).
# -4.	Clona o actualiza tu repo flavioGonz/miturno.
# -5.	Instala dependencias Node locales (npm install).
# -6.	Activa el daemon pigpiod.
# -7.	Crea base SQLite con cola “Caja Principal”.
# -8.	Inicia Turnito bajo PM2 y lo configura como servicio persistente.
# -9.	Verifica servicios, API, GPIO, impresora y puertos.
# -10.	Imprime un ticket de prueba real.
# -11.	Muestra un reporte final + guarda el log completo.
# -12. RECUERDA INSTALAR FULLPAGEOS COMO SISTEMA DE TU RASPERY PI
#---------------------------------------------------------------------------

set -e
LOG_FILE="/tmp/install_turnito.log"

GREEN="\033[0;32m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
CYAN="\033[0;36m"
RESET="\033[0m"

clear
echo -e "${CYAN}=================================================${RESET}"
echo -e "${CYAN}  TURNITO ADMIN - Instalación + Diagnóstico Full "
echo -e "${CYAN}=================================================${RESET}"
echo -e "🕓 Fecha: $(date)"
echo -e "📂 Log detallado: ${LOG_FILE}"
echo -e "-------------------------------------------------\n"

# --- 1. VERIFICAR NODE.JS ---
NODE_VERSION=$(node -v 2>/dev/null || echo "none")
if [[ "$NODE_VERSION" == "none" ]]; then
  echo -e "${YELLOW}⚙️  Node.js no encontrado. Instalando LTS...${RESET}"
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
else
  echo -e "${GREEN}✅ Node.js detectado: ${NODE_VERSION}${RESET}"
fi

# --- 2. DEPENDENCIAS SISTEMA ---
echo -e "${YELLOW}📦 Instalando dependencias base...${RESET}"
sudo apt-get update -y
sudo apt-get install -y git curl sqlite3 pigpiod lsof net-tools

# --- 3. PM2 GLOBAL ---
if ! command -v pm2 &> /dev/null; then
  echo -e "${YELLOW}🚀 Instalando PM2 globalmente...${RESET}"
  sudo npm install -g pm2
else
  echo -e "${GREEN}✅ PM2 ya está instalado.${RESET}"
fi

# --- 4. CLONAR REPOSITORIO ---
cd /home/fgonzalez || cd /root
if [ ! -d "miturno" ]; then
  echo -e "${YELLOW}📥 Clonando repositorio oficial...${RESET}"
  git clone https://github.com/flavioGonz/miturno.git >> $LOG_FILE 2>&1
else
  echo -e "${YELLOW}⚠️  Repositorio existente. Actualizando...${RESET}"
  cd miturno && git pull >> $LOG_FILE 2>&1
fi
cd miturno

# --- 5. DEPENDENCIAS NODE ---
echo -e "${YELLOW}📦 Instalando dependencias del proyecto...${RESET}"
npm install >> $LOG_FILE 2>&1

# --- 6. CONFIGURAR GPIO ---
echo -e "${YELLOW}🔌 Configurando pigpiod...${RESET}"
sudo systemctl enable pigpiod >> $LOG_FILE 2>&1
sudo systemctl restart pigpiod >> $LOG_FILE 2>&1
sudo usermod -aG gpio $USER

# --- 7. BASE DE DATOS ---
echo -e "${YELLOW}🗄️  Verificando base de datos SQLite...${RESET}"
mkdir -p db
if [ ! -f db/turnito.db ]; then
  echo -e "${YELLOW}🧱 Creando base de datos inicial...${RESET}"
  sqlite3 db/turnito.db "CREATE TABLE IF NOT EXISTS queues(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT UNIQUE);
  CREATE TABLE IF NOT EXISTS turns(id INTEGER PRIMARY KEY AUTOINCREMENT,queue_id INTEGER,turn_number INTEGER,status TEXT DEFAULT 'waiting',created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
  INSERT INTO queues (name) VALUES ('Caja Principal');
  INSERT INTO turns (queue_id, turn_number) VALUES (1, 1);" >> $LOG_FILE 2>&1
else
  echo -e "${GREEN}✅ Base de datos existente detectada.${RESET}"
fi

# --- 8. INICIAR CON PM2 ---
echo -e "${YELLOW}🚀 Iniciando Turnito con PM2...${RESET}"
pm2 start index.js --name turnito >> $LOG_FILE 2>&1 || true
pm2 save >> $LOG_FILE 2>&1
pm2 startup systemd -u $USER --hp /home/$USER >> $LOG_FILE 2>&1

sleep 4
IP=$(hostname -I | awk '{print $1}')

# --- 9. SERVICIOS ---
echo -e "${YELLOW}🧠 Verificando servicios activos...${RESET}"
systemctl is-active --quiet pigpiod && echo -e "✅ pigpiod activo" || echo -e "❌ pigpiod no activo"
pm2 list | grep -q "turnito" && echo -e "✅ PM2 ejecutando Turnito" || echo -e "❌ PM2 no detecta Turnito"

# --- 10. LOGIN API ---
echo -e "${YELLOW}🌐 Verificando API de autenticación...${RESET}"
curl -s -X POST -c cookies.txt -d "username=admin&password=password" http://localhost:3000/login >> $LOG_FILE 2>&1
LOGIN_OK=$(curl -s -b cookies.txt http://localhost:3000/api/queues 2>/dev/null | grep -c "Caja Principal" || true)
[ "$LOGIN_OK" -gt 0 ] && echo -e "✅ API responde correctamente" || echo -e "⚠️  Error accediendo a API local"

# --- 11. GPIO ---
echo -e "${YELLOW}🔩 Probando conexión a pigpiod...${RESET}"
sudo lsof -i :8888 | grep -q "pigpiod" && echo -e "✅ pigpiod responde en puerto 8888" || echo -e "⚠️  pigpiod no responde"

# --- 12. IMPRESORA POS ---
echo -e "${YELLOW}🖨️  Verificando impresora POS...${RESET}"
USB_DEV=$(lsusb | grep -E "0416:5011" || true)
if [ -n "$USB_DEV" ]; then
  echo -e "✅ Impresora USB detectada (${USB_DEV})"
  echo -e "🧾 Enviando ticket de prueba..."
  curl -s -X POST -b cookies.txt http://localhost:3000/api/print/test > /tmp/print_test.log 2>&1 || true
  echo -e "📄 Resultado: $(grep -o 'message' /tmp/print_test.log || echo 'Error al imprimir')"
else
  echo -e "⚠️  No se detecta impresora USB. Intentando modo red..."
  NET_RES=$(curl -s -X POST -b cookies.txt http://localhost:3000/api/print/test | grep -o 'success' || true)
  [ -n "$NET_RES" ] && echo -e "✅ Impresión por red OK" || echo -e "❌ Ninguna impresora detectada"
fi

# --- 13. PUERTOS ---
echo -e "${YELLOW}🔍 Verificando puertos abiertos (3000/8888)...${RESET}"
sudo netstat -tulnp | grep -E "3000|8888" || echo -e "⚠️  Puertos esperados no detectados"

# --- 14. REPORTE FINAL ---
echo -e "\n${GREEN}=================================================${RESET}"
echo -e "${GREEN}✅ INSTALACIÓN Y DIAGNÓSTICO COMPLETADOS${RESET}"
echo -e "${GREEN}=================================================${RESET}"
echo "🌐 Acceso web: http://${IP}:3000"
echo "👤 Usuario: admin"
echo "🔑 Contraseña: password"
echo ""
echo "📦 Proyecto: Turnito Admin (miturno)"
echo "📄 Log detallado: ${LOG_FILE}"
echo ""
echo -e "${CYAN}🧾 Si la impresora está conectada, recibirás un ticket de prueba.${RESET}"
echo -e "${CYAN}🧠 Control GPIO disponible en /sistema/gpio${RESET}"
echo -e "${CYAN}🖥️  Panel completo: /sistema/control${RESET}"
echo -e "${CYAN}🖨️  Impresión POS: /sistema/impresion${RESET}"
echo ""
echo -e "${CYAN}📘 Infratec Networks - Uruguay (2025)${RESET}"
