# SDS FabriX Bridge

`SDS FabriX Bridge` is a small OpenAI-compatible local bridge for the FabriX serving API.

Current product direction:

- Upstream is the FabriX `serving api`
- `/v1/models` is fetched from FabriX and converted to OpenAI model objects
- `/v1/chat/completions` is forwarded to FabriX with `x-llm-model-id`
- Streaming is proxied directly from upstream SSE
- Runtime dependencies are built-in Node modules only

## Quick start

Requirements:

- Node.js 24+

First-time setup:

```powershell
node app.js configure
```

Browser-based setup only:

```powershell
node app.js setup-ui
```

Start the bridge:

```powershell
node app.js
```

List available models:

```powershell
node app.js models
```

Install or refresh OpenCode config:

```powershell
node app.js install-opencode
```

Show the active config path:

```powershell
node app.js config-path
```

## User flow

1. Enter `x-fabrix-client` and `x-openapi-token`
2. Query FabriX model list from `/v1/models`
3. Select a default model
4. Optionally install OpenCode config automatically
5. Start the local bridge
6. Connect any OpenAI-compatible client to `http://127.0.0.1:4000`

## Minimal inputs

Required:

- `x-fabrix-client`
- `x-openapi-token`
- Default model selection

Optional:

- Bridge token
- OpenCode config path
- FabriX base URL, paths, timeout
- Bridge host, port, CORS origin

## Local API

- `GET /healthz`
- `GET /v1/models`
- `POST /v1/chat/completions`

If a local bridge token is configured, call the bridge with:

```text
Authorization: Bearer <bridge-token>
```

The bridge also exposes a stable default model id:

```text
fabrix/default
```

That id is useful for OpenCode integration because the bridge can keep the actual upstream model selection internally.

## Config file

Default config location on Windows:

```text
%APPDATA%\sds-fabrix-bridge\config.json
```

You can override the location with:

```powershell
node app.js --config .\config.json
```

## Executable build

This project includes a Windows SEA build script.

Build the executable:

```powershell
npm install
npm run build:sea
```

Expected output:

```text
dist\fabrix-bridge.exe
```

Notes:

- The build uses Node SEA plus `postject`
- The build script expects a Windows environment
- Runtime still works without `npm install` because the bridge itself uses only built-in Node modules

## GitHub artifact build

The repository does not commit the built `exe` binary.

Instead, use the GitHub Actions workflow:

- Workflow: `Build Windows EXE`
- Output artifact: `fabrix-bridge-windows-exe`

That artifact contains:

- `dist/fabrix-bridge.exe`
- `README.md`

## GitHub release build

Tagging the repository with `v*` creates a GitHub Release and uploads:

- `fabrix-bridge-windows-x64.zip`
- `fabrix-bridge.exe`

Example:

```powershell
git tag v0.1.0
git push origin v0.1.0
```

## Probe script

Use the included probe script to inspect upstream responses directly:

```powershell
node serving-api-probe.js --model-id 16 --client "<FABRIX_CLIENT>" --token "<FABRIX_OPENAPI_TOKEN>"
node serving-api-probe.js --stream --model-id 16 --client "<FABRIX_CLIENT>" --token "<FABRIX_OPENAPI_TOKEN>"
```

## OpenCode integration

The setup flow can update OpenCode config automatically.

Default OpenCode config path on Windows:

```text
%USERPROFILE%\.config\opencode\opencode.json
```

Installed provider id:

```text
fabrix
```

Installed model ids:

- `fabrix/default`
- one entry for each fetched FabriX model
