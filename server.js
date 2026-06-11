const express = require('express');
const path    = require('path');
const fs      = require('fs');
const session = require('express-session');
require('dotenv').config();

const app = express();
app.set('trust proxy', 1);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'ads-audit-secret-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax' }
}));

/* ------------------------------------------------
   AUTH
------------------------------------------------ */
function requireAuth(req, res, next) {
  if (!process.env.MOTOR_PASSWORD) return next();
  if (req.session.authenticated) return next();
  res.redirect('/login');
}

function loginHTML(hasError) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ADS ENGINE AUDIT — Acceso</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;700&display=swap" rel="stylesheet">
<style>
:root {
  --bg: #0a0a0a; --surface: #111111; --border: #222222;
  --gold: #c9a96e; --fail: #ef4444; --t1: #f5f5f5; --t2: #888888;
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; font-family: 'Inter', sans-serif; background: var(--bg); color: var(--t1); }
body { display: flex; flex-direction: column; }
.hdr {
  flex-shrink: 0; display: flex; align-items: center;
  padding: 22px 40px; border-bottom: 1px solid var(--border);
}
.hdr-logo { font-size: 20px; font-weight: 700; color: var(--gold); letter-spacing: 5px; }
.hdr-sub  { font-size: 10px; font-weight: 300; color: var(--t2); letter-spacing: 2px; margin-top: 3px; }
.login-wrap { flex: 1; display: flex; align-items: center; justify-content: center; padding: 40px 20px; }
.login-card { width: 100%; max-width: 360px; background: var(--surface); border: 1px solid var(--border); padding: 36px 32px; }
.login-title {
  font-size: 9px; font-weight: 700; letter-spacing: 3px; color: var(--gold);
  padding-bottom: 10px; border-bottom: 1px solid var(--border); margin-bottom: 28px;
}
.lbl { display: block; font-size: 10px; color: var(--t2); letter-spacing: 1px; text-transform: uppercase; margin-bottom: 7px; }
.inp {
  width: 100%; background: var(--bg); border: 1px solid var(--border);
  color: var(--t1); padding: 9px 12px;
  font-family: 'Inter', sans-serif; font-size: 13px; outline: none; transition: border-color .2s;
}
.inp:focus { border-color: var(--gold); }
.btn-run {
  width: 100%; height: 52px; background: var(--gold); color: #000; border: none;
  font-family: 'Inter', sans-serif; font-size: 12px; font-weight: 700;
  letter-spacing: 3px; cursor: pointer; margin-top: 18px; transition: all .2s;
}
.btn-run:hover { background: #d4b880; box-shadow: 0 0 24px rgba(201,169,110,.35); }
.login-err { margin-top: 14px; font-size: 12px; color: var(--fail); text-align: center; letter-spacing: 1px; }
.ftr { flex-shrink: 0; border-top: 1px solid var(--border); padding: 14px 40px; }
.ftr-txt { font-size: 10px; font-weight: 300; color: var(--t2); letter-spacing: 1px; }
</style>
</head>
<body>
<header class="hdr">
  <div>
    <div class="hdr-logo">ADS ENGINE AUDIT</div>
    <div class="hdr-sub">MOTOR DE AUDITORÍA GOOGLE ADS V2.0</div>
  </div>
</header>
<div class="login-wrap">
  <div class="login-card">
    <div class="login-title">ACCESO RESTRINGIDO</div>
    <form method="POST" action="/auth">
      <label class="lbl" for="pwd">Contraseña</label>
      <input id="pwd" class="inp" type="password" name="password"
             autofocus autocomplete="current-password" placeholder="Introduce la contraseña">
      <button type="submit" class="btn-run">ENTRAR</button>
      ${hasError ? '<div class="login-err">Contraseña incorrecta. Inténtalo de nuevo.</div>' : ''}
    </form>
  </div>
</div>
<footer class="ftr">
  <div class="ftr-txt">Francisco Blanco © 2026 — franciscoblanco.net</div>
</footer>
</body>
</html>`;
}

app.get('/login', (req, res) => {
  if (!process.env.MOTOR_PASSWORD || req.session.authenticated) return res.redirect('/');
  res.send(loginHTML(req.query.error === '1'));
});

app.post('/auth', (req, res) => {
  if (req.body.password === process.env.MOTOR_PASSWORD) {
    req.session.authenticated = true;
    res.redirect('/');
  } else {
    res.redirect('/login?error=1');
  }
});

/* ------------------------------------------------
   ARCHIVOS ESTÁTICOS (protegidos)
   index.html se sirve con MCP_API_KEY inyectada
------------------------------------------------ */
app.get('/', requireAuth, (req, res) => {
  const htmlPath = path.join(__dirname, 'public', 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const apiKey = process.env.MCP_API_KEY || '';
  const injected = html.replace(
    '</head>',
    `<script>window.MCP_API_KEY = ${JSON.stringify(apiKey)};</script>\n</head>`
  );
  res.send(injected);
});

app.use(requireAuth, express.static(path.join(__dirname, 'public')));

/* ------------------------------------------------
   API
------------------------------------------------ */
app.post('/api/audit', requireAuth, async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: { message: 'ANTHROPIC_API_KEY no configurada en el servidor. Revisa el archivo .env.' } });
  }

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json'
      },
      body: JSON.stringify(req.body)
    });

    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
});

/* ------------------------------------------------
   GOOGLE ADS (proxy al MCP — la API key nunca
   sale del servidor)
------------------------------------------------ */
const MCC_EXCLUIDA = '8706409693'; // cuenta manager: el endpoint de datos no funciona con MCCs
const RANGOS_VALIDOS = ['LAST_7_DAYS', 'LAST_30_DAYS', 'LAST_90_DAYS'];

function getMcpConfig() {
  const url = process.env.MCP_URL;
  const apiKey = process.env.MCP_API_KEY;
  if (!url || !apiKey) {
    return { error: 'MCP_URL / MCP_API_KEY no configuradas en el servidor. Añádelas en las variables de Railway del motor.' };
  }
  return { url: url.replace(/\/+$/, ''), apiKey };
}

async function fetchMcp(pathName, options = {}) {
  const cfg = getMcpConfig();
  if (cfg.error) return { status: 500, body: { error: { message: cfg.error } } };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const upstream = await fetch(cfg.url + pathName, {
      ...options,
      headers: {
        'X-API-Key': cfg.apiKey,
        'content-type': 'application/json',
        ...(options.headers || {})
      },
      signal: controller.signal
    });
    const data = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const detail = data?.detail;
      const detailMsg = typeof detail === 'string'
        ? detail
        : (detail?.google_ads_errors || []).join(' | ');
      return {
        status: 502,
        body: { error: { message: `El conector de Google Ads devolvió un error${detailMsg ? ': ' + detailMsg : ` (HTTP ${upstream.status})`}. Puedes usar la subida manual de CSV mientras tanto.` } }
      };
    }
    return { status: 200, body: data };
  } catch (err) {
    const motivo = err.name === 'AbortError' ? 'tarda demasiado en responder' : 'no responde';
    return {
      status: 502,
      body: { error: { message: `El conector de Google Ads ${motivo}. Puedes usar la subida manual de CSV mientras tanto.` } }
    };
  } finally {
    clearTimeout(timer);
  }
}

app.get('/api/google-ads/accounts', requireAuth, async (req, res) => {
  const result = await fetchMcp('/api/accounts');
  if (result.status !== 200) return res.status(result.status).json(result.body);

  const cuentas = (result.body.accounts || [])
    .filter(a => !a.es_manager && String(a.id) !== MCC_EXCLUIDA)
    .map(a => ({ id: String(a.id), nombre: a.nombre || `Cuenta ${a.id}`, moneda: a.moneda || '' }));

  res.json({ accounts: cuentas });
});

app.post('/api/google-ads/data', requireAuth, async (req, res) => {
  const customerId = String(req.body?.customer_id || '').replace(/-/g, '');
  const dateRange = req.body?.date_range || 'LAST_30_DAYS';

  if (!customerId) {
    return res.status(400).json({ error: { message: 'Selecciona una cuenta de Google Ads.' } });
  }
  if (customerId === MCC_EXCLUIDA) {
    return res.status(400).json({ error: { message: 'Esa cuenta es la cuenta manager (MCC) y no se puede auditar directamente. Selecciona una cuenta hija.' } });
  }
  if (!RANGOS_VALIDOS.includes(dateRange)) {
    return res.status(400).json({ error: { message: 'Rango de fechas no válido.' } });
  }

  const result = await fetchMcp('/api/google-ads-data', {
    method: 'POST',
    body: JSON.stringify({ customer_id: customerId, date_range: dateRange })
  });
  res.status(result.status).json(result.body);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`ADS ENGINE AUDIT V2.0 — http://localhost:${PORT}`);
});
