#!/bin/bash
# ========================================================
# Roraima Exchange - Corrector de Permisos Linux (HestiaCP)
# ========================================================
# Rutas:
TARGET_DIR="/home/abelsala596588/web/roraimacripto.vefixy.net/public_html"

if [ ! -d "$TARGET_DIR" ]; then
    # Si no existe la ruta absoluta de HestiaCP, usar el directorio actual
    TARGET_DIR="$(pwd)"
fi

echo "=== Aplicando permisos seguros en: $TARGET_DIR ==="

# 1. Carpetas: 755 (rwxr-xr-x) - Necesario para que Nginx / Apache puedan navegar
echo "-> Ajustando carpetas a 755..."
find "$TARGET_DIR" -type d -exec chmod 755 {} +

# 2. Archivos: 644 (rw-r--r--) - Necesario para lectura web segura
echo "-> Ajustando archivos a 644..."
find "$TARGET_DIR" -type f -exec chmod 644 {} +

# 3. Binarios de Node.js: +x (755) - Necesario para que Next.js y Prisma puedan ejecutarse
if [ -d "$TARGET_DIR/node_modules/.bin" ]; then
    echo "-> Habilitando ejecución (+x) en node_modules/.bin..."
    chmod -R +x "$TARGET_DIR/node_modules/.bin"
fi

# 4. Proteger archivos sensibles de entorno
if [ -f "$TARGET_DIR/.env" ]; then
    chmod 600 "$TARGET_DIR/.env"
fi
if [ -f "$TARGET_DIR/.env.production" ]; then
    chmod 600 "$TARGET_DIR/.env.production"
fi

echo "✅ ¡Permisos corregidos con éxito!"
