#!/bin/bash
# Script para iniciar Turnito limpiamente

echo "🔄 Limpiando procesos antiguos..."
pm2 delete turnito 2>/dev/null || true
sudo fuser -k 3000/tcp 2>/dev/null || true
sleep 2

echo "🚀 Iniciando Turnito..."
cd ~/turnito
pm2 start index.js --name turnito
pm2 save

echo "✅ Turnito iniciado correctamente"
pm2 status
