# ====================================================================
# Roraima Exchange - Cliente de Despliegue Remoto Autónomo
# Comunica esta máquina local directamente con roraimacripto.vefixy.net
# ====================================================================
param (
    [switch]$UploadZip,
    [string]$UploadFile = "",
    [string]$RunSql = "",
    [switch]$GetLogs,
    [switch]$Status,
    [switch]$SelfDestruct
)

$ServerUrl = "https://roraimacripto.vefixy.net/deploy.php"
$MasterToken = "roraima_sec_f98a21d4c8e76b5013a7b9c2e4f0d618a3b5c7e9f1a2d4b6c8e0f2a4b6c8d0e2"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Roraima Exchange - Despliegue Remoto Seguro" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Subir archivo individual
if ($UploadFile -ne "") {
    if (-not (Test-Path $UploadFile)) {
        Write-Error "El archivo '$UploadFile' no existe localmente."
        exit 1
    }
    Write-Host "-> Subiendo '$UploadFile' al servidor..." -ForegroundColor Yellow
    $url = $ServerUrl + "?action=upload&format=json"
    curl.exe -s -F "file=@$UploadFile" -H "X-Deploy-Token: $MasterToken" $url
    Write-Host "`nSubida finalizada." -ForegroundColor Green
    exit 0
}

# 2. Ejecutar consulta SQL remota
if ($RunSql -ne "") {
    Write-Host "-> Ejecutando SQL en MySQL remoto..." -ForegroundColor Yellow
    $url = $ServerUrl + "?action=sql&format=json"
    curl.exe -s -X POST -F "sql_query=$RunSql" -H "X-Deploy-Token: $MasterToken" $url
    Write-Host "`n"
    exit 0
}

# 3. Obtener Logs
if ($GetLogs) {
    Write-Host "-> Consultando logs remotos del servidor..." -ForegroundColor Yellow
    $url = $ServerUrl + "?action=logs&format=json"
    curl.exe -s -H "X-Deploy-Token: $MasterToken" $url
    Write-Host "`n"
    exit 0
}

# 4. Ver Estado
if ($Status) {
    Write-Host "-> Consultando estado del servidor y BD..." -ForegroundColor Yellow
    $url = $ServerUrl + "?action=status&format=json"
    curl.exe -s -H "X-Deploy-Token: $MasterToken" $url
    Write-Host "`n"
    exit 0
}

# 5. Auto-destrucción
if ($SelfDestruct) {
    Write-Host "ATENCIÓN: Eliminando instalador y limpiando servidor..." -ForegroundColor Red
    $url = $ServerUrl + "?action=self_destruct&format=json"
    curl.exe -s -H "X-Deploy-Token: $MasterToken" $url
    Write-Host "`n"
    exit 0
}

# 6. Subir ZIP completo y extraer
if ($UploadZip -or ($PSBoundParameters.Count -eq 0)) {
    $zipPath = "c:\xampp\htdocs\Roraimaexchange\roraima-exchange-production.zip"
    
    Write-Host "-> [1/3] Empaquetando cambios locales en ZIP..." -ForegroundColor Yellow
    powershell -ExecutionPolicy Bypass -File "c:\xampp\htdocs\Roraimaexchange\scripts\pack-production.ps1"

    if (Test-Path $zipPath) {
        $sizeMb = [math]::Round((Get-Item $zipPath).Length / 1MB, 2)
        Write-Host "-> [2/3] Subiendo ZIP ($sizeMb MB) al servidor remoto..." -ForegroundColor Yellow
        $uploadUrl = $ServerUrl + "?action=upload&extract=1&format=json"
        curl.exe -# -F "file=@$zipPath" -F "extract=1" -H "X-Deploy-Token: $MasterToken" $uploadUrl
        
        Write-Host "`n-> [3/3] Aplicando permisos y verificando estado..." -ForegroundColor Yellow
        $permsUrl = $ServerUrl + "?action=perms&format=json"
        curl.exe -s -H "X-Deploy-Token: $MasterToken" $permsUrl
        Write-Host "`nDESPLIEGUE REMOTO COMPLETADO CON EXITO!" -ForegroundColor Green
    }
}
