#!/bin/bash
# ====================================================================
# Roraima Exchange - Instalador Autónomo de Node.js & Arranque Web
# ====================================================================

APP_DIR="/home/abelsala596588/web/roraimacripto.vefixy.net/public_html"
NODE_DIR="$APP_DIR/.nodejs"

echo "=== INICIANDO INSTALACIÓN DE NODE.JS Y ENTORNO DE RORAIMA EXCHANGE ==="
date

# 1. Instalar Node.js portátil v20 LTS dentro de public_html/.nodejs
if [ ! -f "$NODE_DIR/bin/node" ]; then
    echo "-> [1/4] Descargando Node.js v20 LTS oficial (binario autónomo Linux x64)..."
    cd "$APP_DIR"
    curl -sSL https://nodejs.org/dist/v20.18.0/node-v20.18.0-linux-x64.tar.gz | tar -xz
    rm -rf "$NODE_DIR"
    mv node-v20.18.0-linux-x64 "$NODE_DIR"
    chmod -R 755 "$NODE_DIR"
    echo "-> Node.js descargado e instalado en: $NODE_DIR"
else
    echo "-> [1/4] Node.js ya está instalado en: $NODE_DIR"
fi

# 2. Configurar variables de entorno y PATH
export PATH="$NODE_DIR/bin:$PATH"
export NODE_ENV=production
export PORT=3000

echo "-> [2/4] Verificando binarios:"
echo "   Node: $($NODE_DIR/bin/node -v)"
echo "   NPM:  $($NODE_DIR/bin/npm -v)"

# 3. Instalar dependencias de producción en public_html
cd "$APP_DIR"
echo "-> [3/4] Instalando paquetes de producción (npm install --omit=dev)..."
"$NODE_DIR/bin/npm" install --omit=dev

echo "-> [3/4] Generando cliente de Prisma (npx prisma generate)..."
"$NODE_DIR/bin/npx" prisma generate

chmod -R +x "$APP_DIR/node_modules/.bin" 2>/dev/null || true

# 4. Iniciar Next.js en puerto 3000
echo "-> [4/4] Verificando servidor web Next.js..."
if pgrep -f "next-server" > /dev/null; then
    echo "-> Next.js ya se encuentra corriendo actualmente."
else
    echo "-> Arrancando servidor Next.js en segundo plano (puerto 3000)..."
    nohup "$NODE_DIR/bin/npm" start > "$APP_DIR/app.log" 2>&1 &
    sleep 3
    echo "-> Servidor iniciado."
fi

echo "=== ¡DESPLIEGUE FINALIZADO CON ÉXITO! ==="
date
