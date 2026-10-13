#!/bin/bash
# ====================================================================
# Roraima Exchange - Instalador Autónomo de Node.js & Arranque Web
# ====================================================================

APP_DIR="/home/abelsala596588/web/roraimacripto.vefixy.net/public_html"
NODE_DIR="$APP_DIR/.nodejs"

echo "=== INICIANDO CONTROL DEL SERVIDOR RORAIMA EXCHANGE ==="
date

# 1. Instalar Node.js portátil v20 LTS si no existe
if [ ! -f "$NODE_DIR/bin/node" ]; then
    echo "-> [1/4] Descargando Node.js v20 LTS oficial..."
    cd "$APP_DIR"
    curl -sSL https://nodejs.org/dist/v20.18.0/node-v20.18.0-linux-x64.tar.gz | tar -xz
    rm -rf "$NODE_DIR"
    mv node-v20.18.0-linux-x64 "$NODE_DIR"
    echo "-> Node.js instalado en: $NODE_DIR"
fi

# Permisos de ejecución garantizados
chmod -R 755 "$NODE_DIR" 2>/dev/null || true
chmod -R 755 "$APP_DIR/node_modules/.bin" 2>/dev/null || true

export PATH="$NODE_DIR/bin:$PATH"
export NODE_ENV=production
export PORT=3000

echo "-> [2/4] Verificando binarios: Node $($NODE_DIR/bin/node -v 2>/dev/null) | NPM $($NODE_DIR/bin/npm -v 2>/dev/null)"

# 2. Si hay orden de reinicio (.restart_pending), forzar cierre de puerto 3000
if [ -f "$APP_DIR/.restart_pending" ]; then
    echo "-> [RESTART] Orden de reinicio detectada. Forzando liberación total del puerto 3000..."
    fuser -k -9 3000/tcp 2>/dev/null || true
    pkill -9 -f "node" 2>/dev/null || true
    pkill -9 -f "next" 2>/dev/null || true
    rm -f "$APP_DIR/.restart_pending"
    sleep 3
    echo "-> Puerto 3000 liberado."
fi

# 3. Comprobar si el puerto 3000 responde
IS_ALIVE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/ 2>/dev/null || echo "000")

if [ "$IS_ALIVE" != "200" ] && [ "$IS_ALIVE" != "307" ] && [ "$IS_ALIVE" != "308" ]; then
    echo "-> [3/4] Puerto 3000 no responde (Código: $IS_ALIVE). Liberando y arrancando Next.js..."
    fuser -k -9 3000/tcp 2>/dev/null || true
    pkill -9 -f "node" 2>/dev/null || true
    sleep 2
    cd "$APP_DIR"
    echo "-> Arrancando Next.js con npm start..."
    nohup "$NODE_DIR/bin/npm" start > "$APP_DIR/app.log" 2>&1 &
    sleep 4
    NEW_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/ 2>/dev/null || echo "000")
    echo "-> Servidor Next.js iniciado con respuesta HTTP: $NEW_CODE"
else
    echo "-> [3/4] Next.js se encuentra corriendo activamente en puerto 3000 (HTTP $IS_ALIVE)."
fi

echo "=== CICLO DE SERVIDOR FINALIZADO ==="
date
