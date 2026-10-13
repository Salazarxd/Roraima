<?php
/**
 * Roraima Exchange - High Performance Web Gateway
 * Proxies traffic to local Next.js instance on port 3000
 */

@ini_set('memory_limit', '256M');
@ini_set('max_execution_time', '300');

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

// 1. Filtrar cabeceras entrantes
$headers = [];
$incomingHeaders = function_exists('getallheaders') ? getallheaders() : [];
foreach ($incomingHeaders as $name => $value) {
    $lower = strtolower($name);
    if ($lower === 'host') {
        $headers[] = "Host: 127.0.0.1:3000";
    } elseif ($lower === 'content-length') {
        // cURL calculará y enviará el Content-Length exacto del body
        continue;
    } else {
        $headers[] = "$name: $value";
    }
}
$headers[] = "X-Forwarded-For: " . ($_SERVER['REMOTE_ADDR'] ?? '');
$headers[] = "X-Forwarded-Proto: " . ((isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http');
$headers[] = "X-Forwarded-Host: " . ($_SERVER['HTTP_HOST'] ?? 'localhost');

// 2. CASO ESPECIAL: Server-Sent Events (/api/realtime)
$isSse = (strpos($requestUri, '/api/realtime') !== false) || (isset($_SERVER['HTTP_ACCEPT']) && strpos($_SERVER['HTTP_ACCEPT'], 'text/event-stream') !== false);

if ($isSse) {
    @ini_set('zlib.output_compression', '0');
    @ini_set('implicit_flush', '1');
    while (ob_get_level()) ob_end_clean();

    header('Content-Type: text/event-stream');
    header('Cache-Control: no-cache, no-transform');
    header('Connection: keep-alive');
    header('X-Accel-Buffering: no');
    flush();

    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, false);
    curl_setopt($ch, CURLOPT_TCP_NODELAY, true);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
    curl_setopt($ch, CURLOPT_TIMEOUT, 0); // Streaming continuo sin timeout
    curl_setopt($ch, CURLOPT_WRITEFUNCTION, function($ch, $data) {
        echo $data;
        if (ob_get_level() > 0) ob_flush();
        flush();
        return strlen($data);
    });
    curl_exec($ch);
    curl_close($ch);
    exit;
}

// 3. Peticiones HTTP regulares (GET, POST, etc.)
$ch = curl_init($url);
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HEADER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, false);
curl_setopt($ch, CURLOPT_TCP_NODELAY, true);
curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
curl_setopt($ch, CURLOPT_TIMEOUT, 120); // 120s para subidas de fotos y procesamiento
curl_setopt($ch, CURLOPT_ENCODING, '');

if ($method !== 'GET' && $method !== 'HEAD') {
    $input = file_get_contents('php://input');
    
    // Si php://input está vacío porque PHP ya parseó multipart/form-data
    if (empty($input) && (!empty($_POST) || !empty($_FILES))) {
        $postData = $_POST;
        foreach ($_FILES as $key => $file) {
            if (is_array($file['tmp_name'])) {
                foreach ($file['tmp_name'] as $idx => $tmpName) {
                    if (!empty($tmpName)) {
                        $postData["{$key}[$idx]"] = new CURLFile($tmpName, $file['type'][$idx], $file['name'][$idx]);
                    }
                }
            } else if (!empty($file['tmp_name'])) {
                $postData[$key] = new CURLFile($file['tmp_name'], $file['type'], $file['name']);
            }
        }
        
        // Quitar Content-Type previo para que cURL cree el boundary correcto
        $cleanHeaders = [];
        foreach ($headers as $h) {
            if (stripos($h, 'Content-Type:') === false) {
                $cleanHeaders[] = $h;
            }
        }
        $headers = $cleanHeaders;
        curl_setopt($ch, CURLOPT_POSTFIELDS, $postData);
    } else {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $input);
    }
}

curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
$curlErr = curl_error($ch);
curl_close($ch);

if ($response === false || $httpCode === 0) {
    http_response_code(502);
    header('Content-Type: text/html; charset=utf-8');
    echo "<!DOCTYPE html><html><body style='background:#09090b;color:#f43f5e;font-family:sans-serif;padding:50px;text-align:center;'>";
    echo "<h2>⚠️ 502 Bad Gateway</h2>";
    echo "<p style='color:#a1a1aa;'>Next.js no respondió a tiempo. Detalle: " . htmlspecialchars($curlErr) . "</p>";
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
