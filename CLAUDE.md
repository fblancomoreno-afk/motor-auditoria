# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proyecto

Motor de auditoría Google Ads para Francisco Blanco (consultor independiente, Barcelona).
Desplegado en Railway en `auditoria.franciscoblanco.net`. Repo: `fblancomoreno-afk/motor-auditoria`.

## Reglas de trabajo

- **Nunca tocar `main` directamente** — los cambios van a `desarrollo` y entran por PR (rama protegida en GitHub).
- Usar `/plan` antes de cualquier cambio no trivial y mostrar qué archivos se tocan.
- Francisco no es programador — explicar cada cambio en lenguaje simple.
- Si hay duda, preguntar antes de ejecutar.

## Comandos

```bash
# Desarrollo local
npm install
node server.js          # http://localhost:3000

# Git habitual
git checkout desarrollo
git add <archivos>
git commit -m "tipo: descripción"
git push origin desarrollo
# luego PR en GitHub para merge a main
```

No hay tests ni linter configurados.

## Variables de entorno (`.env` local / Railway en producción)

| Variable | Uso |
|---|---|
| `ANTHROPIC_API_KEY` | API de Claude (claude-sonnet-4-6) |
| `MCP_URL` | Base URL del conector Google Ads MCP |
| `MCP_API_KEY` | API key del MCP — nunca sale al navegador |
| `MOTOR_PASSWORD` | Contraseña de acceso a la app (opcional) |
| `SESSION_SECRET` | Secreto de sesión Express |

## Arquitectura

### `server.js` — único archivo de servidor

Rutas en orden:

| Ruta | Descripción |
|---|---|
| `GET /login` / `POST /auth` | Autenticación por contraseña de sesión |
| `GET /` | Sirve `index.html` con `window.MCP_API_KEY` inyectada en `<head>` |
| `express.static('public')` | Resto de archivos estáticos (protegidos con `requireAuth`) |
| `POST /api/audit` | Proxy a Anthropic API — recibe el body entero del frontend y lo pasa tal cual |
| `GET /api/google-ads/accounts` | Lista cuentas via `fetchMcp()` (filtra MCCs) |
| `POST /api/google-ads/data` | Datos de una cuenta via `fetchMcp()` |
| `POST /api/mcp-import` | Proxy directo al MCP sin `requireAuth` (importación sección 00) |

`fetchMcp()` es la función helper que centraliza las llamadas al MCP con timeout de 60s, gestión de errores de Google Ads y mensajes amigables.

### `public/index.html` — toda la lógica de cliente

Un único archivo HTML (~2200 líneas). Las secciones relevantes del `<script>`:

- **`filtrarCSV(raw)`** (línea ~1631): preprocesa cada CSV antes de enviarlo a la API. Detecta la cabecera real buscando columnas `coste`+`clic`, luego selecciona las 150 filas más relevantes priorizando filas con conversiones y ordenando por coste. Si el CSV es pequeño (<20 filas) o no tiene esas columnas, lo devuelve sin tocar.
- **`runAudit()`** (línea ~1689): función principal. Lee los tres slots de CSV (`_fileData1/2/3`), llama a `filtrarCSV()` en cada uno, construye el prompt completo con datos del cliente + CSVs filtrados y lo envía a `POST /api/audit`.
- **`mcpImportData()`** (línea ~1030): llama a `POST /api/mcp-import` con el Customer ID de la sección 00 y vuelca `csv1/csv2/csv3` de la respuesta en `window._fileData1/2/3`.
- **`gadsFetchData()`**: conecta el selector de cuenta (sección 02, modo "Google Ads automático") a `POST /api/google-ads/data`.

**Estado de los datos CSV en el frontend:**

```
window._fileData1 / _fileData2 / _fileData3
```

Son strings con el contenido raw del CSV. Se escriben desde `handleFile()` (carga de archivo), desde `mcpImportData()` (importación MCP sección 00) y desde `gadsFetchData()` (modo automático sección 02).

**Panel izquierdo — secciones del formulario:**

- `00 — IMPORTAR DESDE GOOGLE ADS` → campo Customer ID + botón que llama a `/api/mcp-import`
- `01 — DATOS DE LA CUENTA` → campos del cliente (nombre, sector, gasto, CPA…)
- `02 — DATOS EXPORTADOS` → tabs CSV manual / Google Ads automático con 3 slots de CSV

### `public/downloads/`

Scripts de Google Ads (`script-negativos-pmax.js`, `script-negativos-search.js`) descargables desde la UI como acciones rápidas.
