#!/bin/bash
# RHLZ node agent installer (rhlz-node). --yes for non-interactive.
# Persistence: pm2 + @reboot cron. Does not use systemd.

set -euo pipefail

PORT=6768
CF_TOKEN=""
YES=0
ALLOWED_ORIGIN="${RHLZ_NODE_CORS:-}"

while [[ $# -gt 0 ]]; do
    case $1 in
        -p|--port) PORT="$2"; shift ;;
        -c|--cf-token) CF_TOKEN="$2"; shift ;;
        --yes|-y) YES=1 ;;
        --cors) ALLOWED_ORIGIN="$2"; shift ;;
        --help|-h)
            echo "Usage: bash node.sh [--yes] [-p PORT] [--cors ORIGIN] [-c CF_TOKEN]"
            exit 0
            ;;
        *) echo "Unknown parameter: $1"; exit 1 ;;
    esac
    shift
done

echo "======================================"
echo "    RHLZ Node Setup (rhlz-node)"
echo "======================================"

if [ "${EUID:-$(id -u)}" -ne 0 ]; then
  echo "Please run as root"
  exit 1
fi

if ! command -v docker &>/dev/null; then
    echo "[+] Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
    service docker start 2>/dev/null || true
else
    echo "[+] Docker is already installed."
fi

need_node=0
if ! command -v node &>/dev/null; then
    need_node=1
else
    ver=$(node -v | cut -d'.' -f1 | tr -d 'v')
    if [ "$ver" -lt 20 ]; then need_node=1; fi
fi
if [ "$need_node" -eq 1 ]; then
    echo "[+] Installing Node.js 22..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
fi

if ! command -v pm2 &>/dev/null; then
    echo "[+] Installing PM2..."
    npm install -g pm2
fi

AGENT_DIR=/opt/rhlz-node
mkdir -p "$AGENT_DIR"
cd "$AGENT_DIR"

cat << 'PKGEOF' > package.json
{
  "name": "rhlz-node",
  "version": "3.1.0",
  "description": "RHLZ node agent",
  "main": "agent.js",
  "dependencies": {
    "express": "^4.18.2",
    "http-proxy-middleware": "^2.0.6",
    "dotenv": "^16.4.5"
  }
}
PKGEOF

cat << 'AGENTEOF' > agent.js
require('dotenv').config({ path: __dirname + '/.env' });
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
app.disable('x-powered-by');

const allowedOrigin = process.env.CORS_ORIGIN || '';
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin) return next();
  if (allowedOrigin && origin === allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-RHLZ-Date, X-RHLZ-Sign');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    if (req.method === 'OPTIONS') return res.status(204).end();
    return next();
  }
  return res.status(403).json({ error: 'CORS denied' });
});

app.get('/health', (req, res) => {
  res.status(200).json({ ok: true, service: 'rhlz-node', status: 'online' });
});

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function verifyHmac(req) {
  const date = req.headers['x-rhlz-date'];
  const sign = req.headers['x-rhlz-sign'];
  if (!date || !sign || !process.env.NODE_KEY) return false;
  const ts = Date.parse(String(date));
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > 5 * 60 * 1000) return false;
  const body = req.rawBody ? crypto.createHash('sha256').update(req.rawBody).digest('hex') : crypto.createHash('sha256').update('').digest('hex');
  const payload = `${req.method}\n${req.path}\n${date}\n${body}`;
  const expected = crypto.createHmac('sha256', process.env.NODE_KEY).update(payload).digest('hex');
  return safeEqual(String(sign), expected);
}

app.use(express.json({
  limit: '2mb',
  verify: (req, _res, buf) => { req.rawBody = buf; }
}));

const hits = new Map();
app.use((req, res, next) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const rec = hits.get(ip) || { n: 0, t: now };
  if (now - rec.t > 60000) { rec.n = 0; rec.t = now; }
  rec.n += 1;
  hits.set(ip, rec);
  if (rec.n > 120) return res.status(429).send('Too many requests');
  next();
});

app.use((req, res, next) => {
  if (!process.env.NODE_KEY) {
    return res.status(500).send('Node key not configured properly.');
  }
  if (verifyHmac(req)) return next();
  const auth = req.headers.authorization;
  if (!auth || !safeEqual(auth, 'Bearer ' + process.env.NODE_KEY)) {
    return res.status(401).send('Unauthorized');
  }
  next();
});

const socketPath = '/var/run/docker.sock';
if (!fs.existsSync(socketPath)) {
  console.error(`Warning: Docker socket not found at ${socketPath}`);
}

app.use('/', createProxyMiddleware({
  target: { host: 'localhost', protocol: 'http:', socketPath: socketPath },
  changeOrigin: true
}));

const PORT = process.env.PORT || 6768;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`rhlz-node agent listening on port ${PORT}`);
});
AGENTEOF

echo "[+] Installing agent dependencies..."
npm install --omit=dev --no-audit --no-fund

EXISTING_KEY=""
if [ -f .env ]; then
  EXISTING_KEY=$(grep -E '^NODE_KEY=' .env | head -1 | cut -d= -f2- || true)
fi
if [ -n "$EXISTING_KEY" ]; then
  NODE_KEY="$EXISTING_KEY"
else
  NODE_KEY=$(head -c 32 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 32)
fi

umask 077
{
  echo "NODE_KEY=$NODE_KEY"
  echo "PORT=$PORT"
  echo "CORS_ORIGIN=$ALLOWED_ORIGIN"
} > .env
chmod 600 .env

echo "[+] Starting rhlz-node..."
pm2 stop rhlz-node 2>/dev/null || true
pm2 delete rhlz-node 2>/dev/null || true
pm2 start agent.js --name rhlz-node
pm2 save

if command -v crontab &>/dev/null; then
  ( crontab -l 2>/dev/null | grep -v "pm2 resurrect" ; echo "@reboot $(command -v pm2) resurrect" ) | crontab - 2>/dev/null || true
fi

IP_ADDR=$(curl -s --max-time 4 ifconfig.me || echo "YOUR_VPS_IP")

if [ -n "$CF_TOKEN" ]; then
    echo "[+] Installing cloudflared..."
    if ! command -v cloudflared &>/dev/null; then
      curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
      dpkg -i cloudflared.deb
      rm cloudflared.deb
    fi
    cloudflared service install "$CF_TOKEN" || true
fi

echo "======================================"
echo "    Node Setup Complete"
echo "======================================"
echo "  IP Address : $IP_ADDR"
echo "  Port       : $PORT"
echo "  Node Key   : $NODE_KEY"
echo "  Health     : http://$IP_ADDR:$PORT/health"
echo "======================================"
