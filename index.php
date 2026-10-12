<?php
/**
 * Roraima Exchange - High Performance Web Gateway
 * Proxies traffic to local Next.js instance on port 3000
 */

$backend = "http://127.0.0.1:3000";
$requestUri = $_SERVER['REQUEST_URI'] ?? '/';
if (strpos($requestUri, '/index.php') === 0) {
    $requestUri = substr($requestUri, 10);
    if (empty($requestUri) || $requestUri[0] !== '/') {
        $requestUri = '/' . $requestUri;
    }
}
$url = $backend . $requestUri;

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

// 1. Headers de petición
$headers = [];
$incomingHeaders = function_exists('getallheaders') ? getallheaders() : [];
foreach ($incomingHeaders as $name => $value) {
    if (strtolower($name) === 'host') {
        $headers[] = "Host: " . ($_SERVER['HTTP_HOST'] ?? 'localhost');
    } else {
        $headers[] = "$name: $value";
    }
}
$headers[] = "X-Forwarded-For: " . ($_SERVER['REMOTE_ADDR'] ?? '');
$headers[] = "X-Forwarded-Proto: " . ((isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http');

$ch = curl_init($url);
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HEADER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, false);
curl_setopt($ch, CURLOPT_TCP_NODELAY, true);
curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 3);
curl_setopt($ch, CURLOPT_TIMEOUT, 30);
curl_setopt($ch, CURLOPT_ENCODING, ''); // Permite compresion nativa rapida


// Enviar body si es POST/PUT/PATCH/DELETE
if ($method !== 'GET' && $method !== 'HEAD') {
    $input = file_get_contents('php://input');
    curl_setopt($ch, CURLOPT_POSTFIELDS, $input);
}

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
curl_close($ch);

if ($response === false || $httpCode === 0) {
    http_response_code(502);
    header('Content-Type: text/html; charset=utf-8');
    echo "<!DOCTYPE html><html><body style='background:#09090b;color:#f43f5e;font-family:sans-serif;padding:50px;text-align:center;'>";
    echo "<h2>⚠️ 502 Bad Gateway</h2>";
    echo "<p style='color:#a1a1aa;'>Next.js se está iniciando en el puerto 3000. Espera un momento y recarga la página.</p>";
    echo "</body></html>";
    exit;
}

$responseHeaders = substr($response, 0, $headerSize);
$responseBody = substr($response, $headerSize);

http_response_code($httpCode);

// Enviar cabeceras de respuesta
$headerLines = explode("\r\n", $responseHeaders);
foreach ($headerLines as $line) {
    if (empty($line)) continue;
    if (stripos($line, 'Transfer-Encoding:') === 0) continue;
    if (stripos($line, 'Content-Encoding:') === 0) continue;
    if (stripos($line, 'Content-Length:') === 0) continue;
    if (stripos($line, 'HTTP/') === 0) continue;
    header($line, false);
}


echo $responseBody;
