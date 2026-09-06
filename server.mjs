import http from 'node:http';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const publicRoot = await realpath(root);
const port = Number(process.env.PORT ?? 5173);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error('PORT должен быть целым числом от 0 до 65535.');
  process.exit(1);
}

const publicFiles = new Set([
  'index.html', 'styles.css', 'app.js', 'effects.js', 'tracking.js', 'media.js',
  'base video.mp4', 'tracking-worker.js', 'tracking-client.js', 'analysis-cache.js',
  'effect-catalog.js', 'reference-marks.js', 'reference-compositions.js',
  'boot.js', 'legacy/gpt-5.6-sol.html',
]);
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.task': 'application/octet-stream',
  '.mp4': 'video/mp4',
};

function isPublicRelative(relative) {
  if (relative.includes('\\') || relative.includes('\0') || relative.split('/').some(part => part.startsWith('.'))) return null;
  return publicFiles.has(relative) || relative.startsWith('vendor/') || relative.startsWith('models/');
}

function publicPath(url) {
  const pathname = decodeURIComponent(new URL(url, 'http://127.0.0.1').pathname);
  const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
  if (!isPublicRelative(relative)) return null;
  return path.join(root, relative);
}

/** A single byte range, including suffix and open-ended ranges used by video. */
function byteRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2]) || size === 0) return null;
  let start;
  let end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    const requestedEnd = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start >= size || start > requestedEnd) return null;
    end = Math.min(requestedEnd, size - 1);
  }
  return { start, end };
}

const server = http.createServer(async (request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Cache-Control', 'no-cache');
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end();
    return;
  }
  let file;
  try { file = publicPath(request.url); }
  catch { response.writeHead(400); response.end(); return; }
  if (!file) { response.writeHead(404); response.end(); return; }
  try {
    const resolved = await realpath(file);
    if (!resolved.startsWith(publicRoot + path.sep) || !isPublicRelative(path.relative(publicRoot, resolved))) {
      response.writeHead(404); response.end(); return;
    }
    const info = await stat(resolved);
    if (!info.isFile()) { response.writeHead(404); response.end(); return; }
    const headers = {
      'Content-Type': contentTypes[path.extname(resolved)] || 'application/octet-stream',
      'Content-Length': info.size,
      'Accept-Ranges': 'bytes',
      'Last-Modified': info.mtime.toUTCString(),
    };
    let range;
    if (request.headers.range) {
      range = byteRange(request.headers.range, info.size);
      if (!range) {
        response.writeHead(416, { 'Content-Range': `bytes */${info.size}` });
        response.end();
        return;
      }
      headers['Content-Range'] = `bytes ${range.start}-${range.end}/${info.size}`;
      headers['Content-Length'] = range.end - range.start + 1;
    }
    response.writeHead(range ? 206 : 200, headers);
    if (request.method === 'HEAD') { response.end(); return; }
    const stream = createReadStream(resolved, range);
    stream.on('error', () => response.destroy());
    response.on('close', () => stream.destroy());
    stream.pipe(response);
  } catch (error) {
    if (!response.headersSent) response.writeHead(error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 404 : 500);
    response.end();
  }
});

server.on('error', error => {
  console.error(error.code === 'EADDRINUSE'
    ? `Порт ${port} занят. Запустите с другим портом: PORT=5174 npm start`
    : `Не удалось запустить сервер: ${error.message}`);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => {
  console.log(`SOYLOK Motion Studio → http://127.0.0.1:${server.address().port}`);
});
