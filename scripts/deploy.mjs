#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const SERVER_URL = 'https://roraimacripto.vefixy.net/deploy.php';
const TOKEN = 'roraima_sec_f98a21d4c8e76b5013a7b9c2e4f0d618a3b5c7e9f1a2d4b6c8e0f2a4b6c8d0e2';

const [,, cmd, arg] = process.argv;

async function request(action, params = {}, options = {}) {
  const url = new URL(SERVER_URL);
  url.searchParams.set('action', action);
  url.searchParams.set('format', 'json');
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    headers: {
      'X-Deploy-Token': TOKEN,
      ...(options.headers || {})
    },
    ...options
  });

  return await res.json();
}

async function main() {
  console.log('🚀 Roraima Exchange · Despliegue Remoto');
  console.log('=======================================');

  if (cmd === 'status') {
    const res = await request('status');
    console.log(res.output);
    console.log(`Tablas activas: ${res.status?.tables_count}`);
    return;
  }

  if (cmd === 'restart') {
    console.log('🔄 Reiniciando servidor Next.js en el host remoto...');
    const res = await request('restart_next');
    console.log(res.output || res.error);
    return;
  }

  if (cmd === 'sh') {
    const shCmd = arg || 'ps aux | grep node';
    console.log(`-> Ejecutando sh: ${shCmd}`);
    const form = new FormData();
    form.append('cmd', shCmd);
    const res = await request('sh', {}, { method: 'POST', body: form });
    console.log(res.output || res.error);
    return;
  }

  if (cmd === 'logs') {
    const res = await request('logs');
    console.log(res.output);
    return;
  }

  if (cmd === 'sql') {
    const query = arg || 'SHOW TABLES;';
    console.log(`-> Ejecutando SQL: ${query}`);
    const form = new FormData();
    form.append('sql_query', query);
    const res = await request('sql', {}, { method: 'POST', body: form });
    console.log(res.output || res.error);
    return;
  }

  if (cmd === 'self-destruct') {
    console.log('⚠️ Eliminando instalador en el servidor...');
    const res = await request('self_destruct');
    console.log(res.output);
    return;
  }

  if (cmd === 'upload' && arg) {
    console.log(`-> Subiendo archivo: ${arg}`);
    const filePath = path.resolve(arg);
    const fileData = fs.readFileSync(filePath);
    const form = new FormData();
    form.append('file', new Blob([fileData]), path.basename(filePath));
    const res = await request('upload', {}, { method: 'POST', body: form });
    console.log(res.output || res.error);
    return;
  }

  if (cmd === 'push' || !cmd) {
    console.log('-> [1/3] Empaquetando cambios locales...');
    execSync('powershell -ExecutionPolicy Bypass -File scripts\\pack-production.ps1', { stdio: 'inherit' });

    const zipPath = 'c:\\xampp\\htdocs\\Roraimaexchange\\roraima-exchange-production.zip';
    if (!fs.existsSync(zipPath)) {
      console.error('❌ Error: no se encontró el zip generado.');
      return;
    }

    console.log('-> [2/3] Subiendo ZIP a roraimacripto.vefixy.net...');
    const fileData = fs.readFileSync(zipPath);
    const form = new FormData();
    form.append('file', new Blob([fileData]), 'roraima-exchange-production.zip');
    form.append('extract', '1');
    const res = await request('upload', { extract: '1' }, { method: 'POST', body: form });
    console.log(res.output || res.error);

    console.log('-> [3/4] Aplicando permisos...');
    const perms = await request('perms');
    console.log(perms.output);

    console.log('-> [4/4] Solicitando reinicio del servidor Next.js...');
    const restart = await request('restart_next');
    console.log(restart.output);

    console.log('\n🎉 ¡DESPLIEGUE REMOTO COMPLETADO CON ÉXITO!');
    return;
  }

  console.log(`Comandos disponibles:
  node scripts/deploy.mjs status       - Verifica estado de Node y MySQL
  node scripts/deploy.mjs logs         - Consulta logs del servidor
  node scripts/deploy.mjs sql "QUERY"  - Ejecuta SQL en el servidor
  node scripts/deploy.mjs upload FILE  - Sube un archivo directamente
  node scripts/deploy.mjs push         - Empaqueta y sube todo el proyecto
  node scripts/deploy.mjs self-destruct - Borra instalador para seguridad final`);
}

main().catch(err => console.error('Error:', err.message));
