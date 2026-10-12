# ========================================================
# Roraima Exchange - Empaquetador de Produccion POSIX
# Usa tar para garantizar rutas universales con '/' (Linux)
# ========================================================

$targetZip = "c:\xampp\htdocs\Roraimaexchange\roraima-exchange-production.zip"
if (Test-Path $targetZip) {
    Remove-Item $targetZip -Force
}

# Limpiar cache y locks temporales de desarrollo
$nextCache = "c:\xampp\htdocs\Roraimaexchange\.next\cache"
if (Test-Path $nextCache) {
    Remove-Item -Recurse -Force $nextCache -ErrorAction SilentlyContinue
}
$nextDev = "c:\xampp\htdocs\Roraimaexchange\.next\dev"
if (Test-Path $nextDev) {
    Remove-Item -Recurse -Force $nextDev -ErrorAction SilentlyContinue
}

Write-Host "Empaquetando con tar (formato POSIX para Linux/HestiaCP)..."

$itemsToInclude = @(
    ".next",
    "prisma",
    "public",
    "scripts",
    "src",
    ".env",
    ".env.local",
    ".env.production",
    ".gitignore",
    ".htaccess",
    "AGENTS.md",
    "bot.jpg",
    "deploy.php",
    "fix-permissions.php",
    "limpiar.php",
    "eslint.config.mjs",
    "next-env.d.ts",
    "next.config.ts",
    "package-lock.json",
    "package.json",
    "prisma.config.ts",
    "README.md",
    "simulate.ts",
    "tsconfig.json",
    "tsconfig.tsbuildinfo"
)

# Ejecutar tar con formato zip universal
tar -a -cf $targetZip $itemsToInclude

if (Test-Path $targetZip) {
    $sizeMb = [math]::Round((Get-Item $targetZip).Length / 1MB, 2)
    Write-Host "FINALIZADO CON EXITO: $targetZip ($sizeMb MB)"
} else {
    Write-Error "Fallo la creacion del archivo ZIP"
}
