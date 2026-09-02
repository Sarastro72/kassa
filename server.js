const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;

const HEARTBEAT_MS = 20000;
const SWEEP_MS = 60 * 60 * 1000;
const SESSION_TTL_MS = 24 * SWEEP_MS;
const MAX_BODY_BYTES = 8 * 1024;

const HEX_ID = /^[0-9a-f]{8,64}$/;
const API_PATH = /^\/api\/s\/([0-9a-f]{8,64})$/;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

const PAGES = {
    '/': 'kassasystem.html',
    '/index.html': 'kassasystem.html',
    '/display': 'display.html',
    '/display.html': 'display.html'
};

const ASSET_DIRS = ['lib', 'static'];

// id -> { key, state, subscribers: Set<ServerResponse>, touched }
const sessions = new Map();

function session(id) {
    let found = sessions.get(id);
    if (!found) {
        found = {key: null, state: null, subscribers: new Set(), touched: 0};
        sessions.set(id, found);
    }
    found.touched = Date.now();
    return found;
}

function respond(res, status, message) {
    if (status === 204) {
        res.writeHead(204);
        res.end();
        return;
    }
    res.writeHead(status, {'Content-Type': 'text/plain; charset=utf-8'});
    res.end(message + '\n');
}

function readBody(req, callback) {
    let body = '';
    let failed = false;
    req.on('data', (chunk) => {
        if (failed) {
            return;
        }
        body += chunk;
        if (body.length > MAX_BODY_BYTES) {
            failed = true;
            req.destroy();
            callback(new Error('body too large'));
        }
    });
    req.on('end', () => {
        if (!failed) {
            callback(null, body);
        }
    });
}

function broadcast(found) {
    const frame = `data: ${JSON.stringify(found.state)}\n\n`;
    for (const subscriber of found.subscribers) {
        subscriber.write(frame);
    }
}

// The register publishes here. The first publish claims the session and binds the key,
// so a server restart heals itself without re-pairing the display.
function handlePublish(req, res, id) {
    const key = req.headers['x-kassa-key'];
    if (!key || !HEX_ID.test(key)) {
        respond(res, 400, 'missing or malformed key');
        return;
    }
    const found = session(id);
    if (found.key === null) {
        found.key = key;
    }
    if (found.key !== key) {
        respond(res, 403, 'wrong key');
        return;
    }
    readBody(req, (err, body) => {
        if (err) {
            respond(res, 413, err.message);
            return;
        }
        try {
            found.state = JSON.parse(body);
        } catch (e) {
            respond(res, 400, 'invalid json');
            return;
        }
        broadcast(found);
        respond(res, 204);
    });
}

function handleSubscribe(req, res, id) {
    const found = session(id);
    res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
    });
    res.write('retry: 2000\n\n');
    if (found.state) {
        // sync a reconnecting display immediately
        res.write(`data: ${JSON.stringify(found.state)}\n\n`);
    }
    found.subscribers.add(res);
    const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);
    req.on('close', () => {
        clearInterval(heartbeat);
        found.subscribers.delete(res);
        found.touched = Date.now();
    });
}

function resolveStatic(pathname) {
    const page = PAGES[pathname];
    if (page) {
        return path.join(ROOT, page);
    }
    const relative = decodeURIComponent(pathname).replace(/^\/+/, '');
    if (!ASSET_DIRS.includes(relative.split('/')[0])) {
        return null;
    }
    const file = path.resolve(ROOT, relative);
    if (!file.startsWith(ROOT + path.sep)) {
        return null;
    }
    return file;
}

function serveStatic(req, res, pathname) {
    const file = resolveStatic(pathname);
    if (!file) {
        respond(res, 404, 'not found');
        return;
    }
    fs.readFile(file, (err, content) => {
        if (err) {
            respond(res, 404, 'not found');
            return;
        }
        res.writeHead(200, {'Content-Type': MIME_TYPES[path.extname(file)] || 'application/octet-stream'});
        res.end(req.method === 'HEAD' ? undefined : content);
    });
}

const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://kassa');
    const api = url.pathname.match(API_PATH);
    if (api) {
        if (req.method === 'POST') {
            handlePublish(req, res, api[1]);
        } else if (req.method === 'GET') {
            handleSubscribe(req, res, api[1]);
        } else {
            respond(res, 405, 'method not allowed');
        }
        return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        respond(res, 405, 'method not allowed');
        return;
    }
    serveStatic(req, res, url.pathname);
});

// Sessions live only in memory. Drop the ones nobody has touched in a day.
setInterval(
    () => {
        const cutoff = Date.now() - SESSION_TTL_MS;
        for (const [id, found] of sessions) {
            if (found.subscribers.size === 0 && found.touched < cutoff) {
                sessions.delete(id);
            }
        }
    },
    SWEEP_MS
).unref();

server.listen(PORT, () => console.log(`Kassan lyssnar på port ${PORT}`));
