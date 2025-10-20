#!/bin/bash
# ===============================================================
#  Turnito Admin - Instalador interactivo y reparación de entorno
#  Autor: Infratec Networks - Flavio González
#  Versión: 1.2 (Smart Setup + Diagnóstico)
# ===============================================================

APP_DIR="/home/fgonzalez/turnito"
SERVICE_NAME="turnito"

# --- Colores ---
GREEN="\e[92m"
YELLOW="\e[93m"
RED="\e[91m"
CYAN="\e[96m"
RESET="\e[0m"

echo -e "${CYAN}🚀 Instalador interactivo de Turnito Admin${RESET}"
echo "Ubicación actual: $APP_DIR"
echo "---------------------------------------------"

# --- Verificación de versión de Node.js ---
NODE_VER=$(node -v 2>/dev/null)
if [[ -z "$NODE_VER" ]]; then
  echo -e "${RED}❌ Node.js no está instalado.${RESET}"
  echo "Instalalo con:"
  echo -e "${CYAN}curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -${RESET}"
  echo -e "${CYAN}sudo apt install -y nodejs${RESET}"
  exit 1
else
  echo -e "${GREEN}✔ Node.js detectado: $NODE_VER${RESET}"
  NODE_MAJOR=$(node -v | grep -oP '\d+' | head -1)
  if (( NODE_MAJOR < 18 )); then
    echo -e "${RED}⚠️ Versión de Node.js obsoleta. Se recomienda >=18.${RESET}"
    read -p "¿Continuar de todos modos? (s/n): " CONTINUE
    [[ "$CONTINUE" != "s" && "$CONTINUE" != "S" ]] && exit 1
  fi
fi

# --- Confirmar ubicación ---
read -p "¿Querés continuar en esta ruta? (s/n): " CONFIRM
if [[ "$CONFIRM" != "s" && "$CONFIRM" != "S" ]]; then
  echo -e "${YELLOW}Cancelado por el usuario.${RESET}"
  exit 0
fi

cd "$APP_DIR" || { echo -e "${RED}❌ Carpeta no encontrada.${RESET}"; exit 1; }

# --- Menú principal ---
clear
echo "---------------------------------------------"
echo "📦 Menú principal:"
echo "1) Instalación completa (desde cero)"
echo "2) Reinstalar dependencias"
echo "3) Actualizar dependencias y reiniciar servicio"
echo "4) Limpiar entorno (node_modules, lockfiles, cache)"
echo "5) Salir"
echo "6) 🧪 Diagnóstico del sistema"
echo "---------------------------------------------"
read -p "Seleccioná una opción [1-6]: " OPCION

# --- Función de instalación segura ---
install_deps() {
  echo -e "${CYAN}📥 Instalando dependencias necesarias...${RESET}"
  npm install express express-session express-ejs-layouts express-fileupload \
    sqlite3 connect-sqlite3 bcrypt socket.io tabler-icons @tabler/core \
    pigpio-client pm2 child_process fs-extra node-fetch escpos escpos-network --save
}

# --- Diagnóstico del sistema ---
diagnostico() {
  clear
  echo -e "${CYAN}🧪 Diagnóstico del entorno Turnito Admin${RESET}"
  echo "---------------------------------------------"

  echo -e "${YELLOW}🔹 Versión de Node.js:${RESET} $(node -v 2>/dev/null || echo 'No encontrado')"
  echo -e "${YELLOW}🔹 Versión de NPM:${RESET} $(npm -v 2>/dev/null || echo 'No encontrado')"
  echo -e "${YELLOW}🔹 Versión de SQLite3:${RESET} $(sqlite3 --version 2>/dev/null || echo 'No encontrado')"
  echo "---------------------------------------------"

  echo -e "${CYAN}⚙️  Servicios:${RESET}"
  systemctl is-active --quiet pigpiod && echo -e "${GREEN}✔ pigpiod activo${RESET}" || echo -e "${RED}❌ pigpiod inactivo${RESET}"
  pm2 describe "$SERVICE_NAME" >/dev/null 2>&1 && echo -e "${GREEN}✔ PM2 ejecutando $SERVICE_NAME${RESET}" || echo -e "${RED}❌ PM2 no está corriendo $SERVICE_NAME${RESET}"

  echo "---------------------------------------------"
  echo -e "${CYAN}🌐 Conectividad de red:${RESET}"
  IP=$(hostname -I | awk '{print $1}')
  if [[ -n "$IP" ]]; then
    echo -e "${GREEN}✔ IP Local: $IP${RESET}"
    nc -z localhost 3000 >/dev/null 2>&1 && echo -e "${GREEN}✔ Puerto 3000 activo${RESET}" || echo -e "${RED}❌ Puerto 3000 no responde${RESET}"
  else
    echo -e "${RED}⚠️ No se detectó dirección IP.${RESET}"
  fi

  echo "---------------------------------------------"
  echo -e "${CYAN}💽 Estado del sistema:${RESET}"
  echo -e "Uptime: $(uptime -p)"
  echo -e "Carga: $(uptime | awk -F'load average:' '{print $2}')"
  echo -e "Uso de disco:"
  df -h / | tail -1 | awk '{print "• " $1 ": " $3 "/" $2 " usados (" $5 ")"}'

  echo "---------------------------------------------"
  echo -e "${CYAN}🔍 Procesos relacionados:${RESET}"
  ps aux | grep -E "node|pigpiod|pm2" | grep -v grep | awk '{print "• PID " $2 " - " $11}'

  echo "---------------------------------------------"
  echo -e "${GREEN}✅ Diagnóstico finalizado.${RESET}"
  echo
  read -p "Presioná Enter para volver al menú..."
  exec "$0"
}

case $OPCION in
  1)
    echo -e "${CYAN}🧹 Limpieza de entorno anterior...${RESET}"
    rm -rf node_modules package-lock.json
    sleep 1
    echo -e "${CYAN}📦 Instalando Turnito Admin completo...${RESET}"
    install_deps
    ;;

  2)
    echo -e "${CYAN}♻️ Reinstalando dependencias...${RESET}"
    rm -rf node_modules
    npm install
    ;;

  3)
    echo -e "${CYAN}🔄 Actualizando dependencias...${RESET}"
    npm update
    ;;

  4)
    echo -e "${YELLOW}🧽 Limpiando todo el entorno...${RESET}"
    rm -rf node_modules package-lock.json npm-shrinkwrap.json
    npm cache clean --force
    echo -e "${GREEN}✅ Entorno limpio.${RESET}"
    ;;

  5)
    echo -e "${YELLOW}👋 Saliendo del instalador.${RESET}"
    exit 0
    ;;

  6)
    diagnostico
    exit 0
    ;;

  *)
    echo -e "${RED}❌ Opción inválida.${RESET}"
    exit 1
    ;;
esac

# --- Confirmar configuración de PM2 ---
echo
read -p "¿Querés configurar o reiniciar el servicio PM2 para Turnito? (s/n): " PM2CONFIRM
if [[ "$PM2CONFIRM" == "s" || "$PM2CONFIRM" == "S" ]]; then
  echo -e "${CYAN}⚙️ Configurando PM2...${RESET}"
  sudo systemctl enable pigpiod
  sudo systemctl start pigpiod
  pm2 stop "$SERVICE_NAME" >/dev/null 2>&1
  pm2 delete "$SERVICE_NAME" >/dev/null 2>&1
  pm2 start index.js --name "$SERVICE_NAME"
  pm2 save
  pm2 startup
  echo -e "${GREEN}✅ Turnito Admin configurado en PM2.${RESET}"
fi

# --- Detección de IP del Raspberry Pi ---
IP=$(hostname -I | awk '{print $1}')
if [[ -n "$IP" ]]; then
  echo
  echo -e "${CYAN}🌐 Dirección IP detectada: ${GREEN}$IP${RESET}"
  echo -e "Podés acceder desde: ${CYAN}http://$IP:3000${RESET}"
else
  echo -e "${RED}⚠️ No se pudo detectar la IP automáticamente.${RESET}"
fi

# --- FullPageOS Integration ---
if [[ -f /boot/fullpageos.txt ]]; then
  echo
  echo -e "${YELLOW}🖥️ Se detectó FullPageOS.${RESET}"
  read -p "¿Querés configurar la pantalla HDMI para mostrar /pantalla al inicio? (s/n): " FPCONFIRM
  if [[ "$FPCONFIRM" == "s" || "$FPCONFIRM" == "S" ]]; then
    sudo sed -i '/FULLPAGEOS_URL=/d' /boot/fullpageos.txt
    echo "FULLPAGEOS_URL=http://localhost:3000/pantalla" | sudo tee -a /boot/fullpageos.txt >/dev/null
    echo -e "${GREEN}✅ FullPageOS configurado correctamente.${RESET}"
  fi
fi

# --- Finalización ---
echo
echo -e "${GREEN}✅ Instalación finalizada.${RESET}"
echo -e "Verificá estado con: ${CYAN}pm2 logs turnito${RESET}"
echo -e "Servicio en ejecución: ${CYAN}http://$IP:3000${RESET}"
echo -e "${YELLOW}Reiniciá la Raspberry Pi si acabás de instalar pigpiod o PM2.${RESET}"
echo "---------------------------------------------"
