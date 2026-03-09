"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");
const { URL } = require("node:url");
const { Readable } = require("node:stream");
const readline = require("node:readline/promises");

loadDotEnvIfPresent(path.join(process.cwd(), ".env"));

const APP_NAME = "SDS FabriX Bridge";
const DEFAULT_BASE_URL = "https://nsds-api.fabrix-s.samsungsds.com/sds/trial/api-llm/openapi/llm";
const DEFAULT_CHAT_PATH = "/chat/completions";
const DEFAULT_MODELS_PATH = "/v1/models";
const DEFAULT_UPSTREAM_MODEL_NAME = "/mnt/models";
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4000;
const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_SETUP_HOST = "127.0.0.1";
const MODELS_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_BODY_BYTES = 5 * 1024 * 1024;
const FABRIX_PROVIDER_ID = "fabrix";
const FABRIX_DEFAULT_MODEL_KEY = "default";
const OPENCODE_CONFIG_SCHEMA = "https://opencode.ai/config.json";

const HELP_TEXT = `
${APP_NAME}

Usage:
  node app.js
  node app.js run
  node app.js configure
  node app.js setup-ui
  node app.js serve
  node app.js models
  node app.js install-opencode
  node app.js config-path
  node app.js show-config

Options:
  --config <path>       Use a custom config file path
  --start               Start server after configure
  --cli                 Use CLI wizard instead of setup UI
  --refresh             Force refresh when listing models
  --opencode <path>     Override OpenCode config path
  --json                Print JSON output when supported
`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const configPath = resolveConfigPath(args.config);
  const command = args._[0] || "run";

  switch (command) {
    case "help":
    case "--help":
    case "-h":
      console.log(HELP_TEXT.trim());
      return;
    case "config-path":
      console.log(configPath);
      return;
    case "show-config":
      await showConfig(configPath, args.json === true);
      return;
    case "configure":
      await configureCommand(configPath, args);
      return;
    case "setup-ui":
      await setupUiCommand(configPath, args);
      return;
    case "models":
      await modelsCommand(configPath, args.refresh === true, args.json === true);
      return;
    case "install-opencode":
      await installOpencodeCommand(configPath, args);
      return;
    case "serve":
      await serveCommand(configPath);
      return;
    case "run":
      await runCommand(configPath);
      return;
    default:
      console.error(`Unknown command: ${command}`);
      console.log(HELP_TEXT.trim());
      process.exitCode = 1;
  }
}

async function runCommand(configPath) {
  let config = loadConfig(configPath);
  if (!isConfigComplete(config)) {
    config = await startSetupApp(config, configPath, { startAfterSave: true });
  }
  await startServer(config, configPath);
}

async function serveCommand(configPath) {
  const config = loadConfig(configPath);
  if (!isConfigComplete(config)) {
    throw new Error(`Config is missing or incomplete. Run "node app.js configure" first. Config path: ${configPath}`);
  }
  await startServer(config, configPath);
}

async function configureCommand(configPath, args) {
  const existing = loadConfig(configPath);
  const startAfterSave = args.start === true;

  if (args.cli === true) {
    const config = await runSetupWizard(existing, configPath);
    if (startAfterSave) {
      await startServer(config, configPath);
    }
    return;
  }

  const config = await startSetupApp(existing, configPath, { startAfterSave });
  if (startAfterSave) {
    await startServer(config, configPath);
  }
}

async function setupUiCommand(configPath, args) {
  const existing = loadConfig(configPath);
  const config = await startSetupApp(existing, configPath, { startAfterSave: args.start === true });
  if (args.start === true) {
    await startServer(config, configPath);
  }
}

async function modelsCommand(configPath, refresh, asJson) {
  const config = loadConfig(configPath);
  if (!isConfigComplete(config)) {
    throw new Error(`Config is missing or incomplete. Run "node app.js configure" first. Config path: ${configPath}`);
  }

  const state = { config, configPath };
  const models = await getModels(state, { forceRefresh: refresh, allowStale: true });

  if (asJson) {
    console.log(JSON.stringify(models, null, 2));
    return;
  }

  console.log(`${models.length} model(s)\n`);
  for (const model of models) {
    const marker = config.defaults.modelAlias === model.alias ? "*" : " ";
    console.log(`${marker} ${model.alias}`);
    console.log(`  name: ${model.displayName}`);
    console.log(`  modelId: ${model.modelId}`);
    if (model.description) {
      console.log(`  description: ${model.description}`);
    }
    console.log("");
  }
}

async function showConfig(configPath, asJson) {
  const config = loadConfig(configPath);
  if (!config) {
    console.log(`No config found at ${configPath}`);
    return;
  }

  const sanitized = sanitizeConfig(config);
  console.log(JSON.stringify(sanitized, null, asJson ? 2 : 2));
}

async function installOpencodeCommand(configPath, args) {
  const config = loadConfig(configPath);
  if (!isConfigComplete(config)) {
    throw new Error(`Config is missing or incomplete. Run "node app.js configure" first. Config path: ${configPath}`);
  }

  const result = installOpenCodeConfig(config, {
    targetPath: args.opencode,
    setDefaultModel: true,
  });

  console.log(`OpenCode config updated: ${result.path}`);
  console.log(`Default OpenCode model: ${result.model}`);
}

async function ensureConfigured(configPath) {
  const config = loadConfig(configPath);
  if (isConfigComplete(config)) {
    return config;
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(`Config is missing or incomplete. Run "node app.js configure" interactively first. Config path: ${configPath}`);
  }

  return runSetupWizard(config, configPath);
}

async function runSetupWizard(existingConfig, configPath) {
  const config = mergeConfig(existingConfig);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log(`${APP_NAME} setup`);
  console.log(`Config path: ${configPath}\n`);

  try {
    config.upstream.baseUrl = await promptValue(rl, "FabriX base URL", valueOrDefault(config.upstream.baseUrl, process.env.FABRIX_BASE_URL, DEFAULT_BASE_URL));
    config.upstream.chatPath = await promptValue(rl, "Chat completions path", valueOrDefault(config.upstream.chatPath, process.env.FABRIX_PATH, DEFAULT_CHAT_PATH));
    config.upstream.modelsPath = await promptValue(rl, "Models path", valueOrDefault(config.upstream.modelsPath, DEFAULT_MODELS_PATH));
    config.upstream.client = await promptValue(rl, "x-fabrix-client", valueOrDefault(config.upstream.client, process.env.FABRIX_CLIENT), { required: true });
    config.upstream.token = await promptValue(
      rl,
      "x-openapi-token",
      valueOrDefault(config.upstream.token, process.env.FABRIX_OPENAPI_TOKEN, process.env.FABRIX_OPENAI_TOKEN),
      { required: true }
    );
    config.upstream.requestModelName = await promptValue(
      rl,
      "Upstream request body model",
      valueOrDefault(config.upstream.requestModelName, process.env.UPSTREAM_MODEL_NAME, DEFAULT_UPSTREAM_MODEL_NAME)
    );
    config.upstream.timeoutMs = parseInteger(
      await promptValue(rl, "Upstream timeout (ms)", String(valueOrDefault(config.upstream.timeoutMs, process.env.UPSTREAM_TIMEOUT_MS, DEFAULT_TIMEOUT_MS))),
      DEFAULT_TIMEOUT_MS
    );

    config.bridge.host = await promptValue(rl, "Bridge host", valueOrDefault(config.bridge.host, DEFAULT_HOST));
    config.bridge.port = parseInteger(
      await promptValue(rl, "Bridge port", String(valueOrDefault(config.bridge.port, process.env.PORT, DEFAULT_PORT))),
      DEFAULT_PORT
    );
    config.bridge.token = await promptValue(
      rl,
      "Bridge token (optional, blank disables local auth)",
      valueOrDefault(config.bridge.token, process.env.BRIDGE_TOKEN),
      { required: false, allowEmpty: true }
    );
    config.bridge.corsOrigin = await promptValue(rl, "CORS origin", valueOrDefault(config.bridge.corsOrigin, "*"));

    const tempState = { config, configPath };
    let models;

    try {
      models = await fetchAndCacheModels(tempState);
    } catch (error) {
      console.error(`\nModel lookup failed: ${error.message}`);
      const manualId = await promptValue(rl, "Default modelId for manual fallback", String(config.defaults.modelId || ""), {
        required: true,
      });
      const manualName = await promptValue(rl, "Default model label", valueOrDefault(config.defaults.displayName, "fabrix-default"), {
        required: true,
      });
      const manualAlias = buildModelAlias(manualName, manualId);
      config.defaults = {
        modelAlias: manualAlias,
        modelId: Number(manualId),
        modelGuid: "",
        displayName: manualName,
      };
      saveConfig(configPath, config);
      console.log(`\nSaved config. Default model: ${config.defaults.displayName} (${config.defaults.modelAlias})`);
      return config;
    }

    const chosen = await promptForModelSelection(rl, models, config.defaults.modelAlias);
    config.defaults = {
      modelAlias: chosen.alias,
      modelId: chosen.modelId,
      modelGuid: chosen.modelGuid,
      displayName: chosen.displayName,
    };

    saveConfig(configPath, config);

    console.log(`\nSaved config.`);
    console.log(`Default model: ${chosen.displayName} (${chosen.alias})`);
    console.log(`Bridge URL: http://${config.bridge.host}:${config.bridge.port}`);
    console.log(`Config path: ${configPath}`);

    return config;
  } finally {
    rl.close();
  }
}

async function promptForModelSelection(rl, models, currentAlias) {
  console.log("\nAvailable models:\n");

  for (let index = 0; index < models.length; index += 1) {
    const model = models[index];
    const marker = model.alias === currentAlias ? "*" : " ";
    console.log(`${marker} [${index + 1}] ${model.displayName}`);
    console.log(`    alias: ${model.alias}`);
    console.log(`    modelId: ${model.modelId}`);
    if (model.description) {
      console.log(`    description: ${truncate(model.description, 160)}`);
    }
    console.log("");
  }

  while (true) {
    const defaultIndex = models.findIndex((model) => model.alias === currentAlias);
    const raw = await promptValue(rl, "Select default model number", defaultIndex >= 0 ? String(defaultIndex + 1) : "", {
      required: true,
    });
    const index = Number(raw);
    if (Number.isInteger(index) && index >= 1 && index <= models.length) {
      return models[index - 1];
    }
    console.log(`Please enter a number between 1 and ${models.length}.`);
  }
}

async function startSetupApp(existingConfig, configPath, options = {}) {
  const initialConfig = mergeConfig(existingConfig);
  const autoStart = options.startAfterSave === true;

  return new Promise((resolve, reject) => {
    let resolved = false;

    const server = http.createServer(async (req, res) => {
      try {
        const requestUrl = new URL(req.url, "http://127.0.0.1");

        if (req.method === "GET" && requestUrl.pathname === "/") {
          return sendHtml(res, 200, renderSetupHtml());
        }

        if (req.method === "GET" && requestUrl.pathname === "/api/state") {
          return sendJson(res, 200, {
            config: buildSetupFormState(initialConfig),
            opencodeConfigPath: resolveDefaultOpenCodeConfigPath(),
            autoStart,
            inputSummary: getInputSummary(),
          });
        }

        if (req.method === "POST" && requestUrl.pathname === "/api/models") {
          const payload = parseJsonBody(await readBody(req, MAX_BODY_BYTES));
          const tempConfig = buildConfigFromSetupPayload(initialConfig, payload);
          const tempState = { config: tempConfig, configPath };
          const models = await fetchAndCacheModels(tempState);
          return sendJson(res, 200, { models });
        }

        if (req.method === "POST" && requestUrl.pathname === "/api/save") {
          const payload = parseJsonBody(await readBody(req, MAX_BODY_BYTES));
          const config = buildConfigFromSetupPayload(initialConfig, payload);
          const tempState = { config, configPath };
          const models = await fetchAndCacheModels(tempState);
          const selectedKey = String(payload.selectedModelKey || FABRIX_DEFAULT_MODEL_KEY).trim();
          const selectedModel = resolveSelectedModel(models, selectedKey);

          if (!selectedModel) {
            const error = new Error("Select a model before saving.");
            error.statusCode = 400;
            error.type = "invalid_request_error";
            throw error;
          }

          config.defaults = {
            modelAlias: selectedModel.alias,
            modelId: selectedModel.modelId,
            modelGuid: selectedModel.modelGuid,
            displayName: selectedModel.displayName,
          };

          config.integrations.opencode.configPath = resolveOpenCodeConfigPath(payload.opencode?.configPath);
          config.integrations.opencode.enabled = payload.opencode?.install === true;
          config.integrations.opencode.setDefaultModel = payload.opencode?.setDefaultModel !== false;

          saveConfig(configPath, config);

          let opencodeResult = null;
          if (payload.opencode?.install === true) {
            opencodeResult = installOpenCodeConfig(config, {
              targetPath: payload.opencode?.configPath,
              setDefaultModel: payload.opencode?.setDefaultModel !== false,
            });
          }

          sendJson(res, 200, {
            ok: true,
            bridgeUrl: `http://${config.bridge.host}:${config.bridge.port}`,
            configPath,
            defaultModel: {
              key: modelKeyFromAlias(selectedModel.alias),
              alias: selectedModel.alias,
              displayName: selectedModel.displayName,
            },
            opencode: opencodeResult,
            startAfterSave: autoStart,
          });

          if (!resolved) {
            resolved = true;
            setTimeout(() => {
              server.close(() => resolve(config));
            }, 150);
          }
          return;
        }

        return sendJson(res, 404, {
          error: {
            message: "Not found",
            type: "invalid_request_error",
          },
        });
      } catch (error) {
        handleUnhandledError(error, res);
      }
    });

    server.once("error", reject);
    server.listen(0, DEFAULT_SETUP_HOST, () => {
      const address = server.address();
      const setupUrl = `http://${DEFAULT_SETUP_HOST}:${address.port}`;
      console.log(`${APP_NAME} setup UI: ${setupUrl}`);
      openBrowser(setupUrl);
    });
  });
}

function buildSetupFormState(configInput) {
  const config = mergeConfig(configInput);
  return {
    upstream: {
      baseUrl: config.upstream.baseUrl,
      chatPath: config.upstream.chatPath,
      modelsPath: config.upstream.modelsPath,
      client: config.upstream.client,
      token: config.upstream.token,
      requestModelName: config.upstream.requestModelName,
      timeoutMs: config.upstream.timeoutMs,
    },
    bridge: {
      host: config.bridge.host,
      port: config.bridge.port,
      token: config.bridge.token,
      corsOrigin: config.bridge.corsOrigin,
    },
    defaults: {
      selectedModelKey: config.defaults.modelAlias ? modelKeyFromAlias(config.defaults.modelAlias) : FABRIX_DEFAULT_MODEL_KEY,
      displayName: config.defaults.displayName,
    },
    opencode: {
      install: config.integrations.opencode.enabled,
      configPath: config.integrations.opencode.configPath,
      setDefaultModel: config.integrations.opencode.setDefaultModel,
    },
  };
}

function buildConfigFromSetupPayload(existingConfig, payload) {
  const config = mergeConfig(existingConfig);

  config.upstream.baseUrl = requireNonEmpty(payload.upstream?.baseUrl, "FabriX base URL");
  config.upstream.chatPath = ensureLeadingSlash(requireNonEmpty(payload.upstream?.chatPath, "Chat completions path"));
  config.upstream.modelsPath = ensureLeadingSlash(requireNonEmpty(payload.upstream?.modelsPath, "Models path"));
  config.upstream.client = requireNonEmpty(payload.upstream?.client, "x-fabrix-client");
  config.upstream.token = requireNonEmpty(payload.upstream?.token, "x-openapi-token");
  config.upstream.requestModelName = requireNonEmpty(payload.upstream?.requestModelName, "Upstream request body model");
  config.upstream.timeoutMs = parseInteger(payload.upstream?.timeoutMs, DEFAULT_TIMEOUT_MS);

  config.bridge.host = requireNonEmpty(payload.bridge?.host, "Bridge host");
  config.bridge.port = parseInteger(payload.bridge?.port, DEFAULT_PORT);
  config.bridge.token = String(payload.bridge?.token || "");
  config.bridge.corsOrigin = String(payload.bridge?.corsOrigin || "*");

  config.integrations.opencode.configPath = resolveOpenCodeConfigPath(payload.opencode?.configPath);
  config.integrations.opencode.enabled = payload.opencode?.install === true;
  config.integrations.opencode.setDefaultModel = payload.opencode?.setDefaultModel !== false;

  return config;
}

function resolveSelectedModel(models, selectedKey) {
  const key = String(selectedKey || FABRIX_DEFAULT_MODEL_KEY).trim();
  if (!key || key === FABRIX_DEFAULT_MODEL_KEY) {
    return models[0] || null;
  }

  return models.find((model) => modelKeyFromAlias(model.alias) === key) || null;
}

function requireNonEmpty(value, label) {
  const text = String(value ?? "").trim();
  if (!text) {
    const error = new Error(`${label} is required.`);
    error.statusCode = 400;
    error.type = "invalid_request_error";
    throw error;
  }
  return text;
}

function sendHtml(res, statusCode, html) {
  if (res.writableEnded) return;
  res.writeHead(statusCode, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
}

function openBrowser(url) {
  try {
    if (process.platform === "win32") {
      spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
      return;
    }
    if (process.platform === "darwin") {
      spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
      return;
    }
    spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
  } catch {
    console.log(`Open the setup URL manually: ${url}`);
  }
}

function resolveDefaultOpenCodeConfigPath() {
  return path.join(os.homedir(), ".config", "opencode", "opencode.json");
}

function resolveOpenCodeConfigPath(customPath) {
  if (customPath && String(customPath).trim()) {
    return path.resolve(String(customPath).trim());
  }
  return resolveDefaultOpenCodeConfigPath();
}

function installOpenCodeConfig(configInput, options = {}) {
  const config = mergeConfig(configInput);
  const targetPath = resolveOpenCodeConfigPath(options.targetPath || config.integrations.opencode.configPath);
  const existing = loadJsonObjectOrDefault(targetPath, {
    $schema: OPENCODE_CONFIG_SCHEMA,
    provider: {},
  });

  if (!existing.$schema) {
    existing.$schema = OPENCODE_CONFIG_SCHEMA;
  }
  if (!existing.provider || typeof existing.provider !== "object") {
    existing.provider = {};
  }

  existing.provider[FABRIX_PROVIDER_ID] = {
    npm: "@ai-sdk/openai-compatible",
    name: "FabriX Bridge",
    options: buildOpenCodeProviderOptions(config),
    models: buildOpenCodeProviderModels(config),
  };

  if (options.setDefaultModel !== false) {
    existing.model = `${FABRIX_PROVIDER_ID}/${FABRIX_DEFAULT_MODEL_KEY}`;
    existing.small_model = `${FABRIX_PROVIDER_ID}/${FABRIX_DEFAULT_MODEL_KEY}`;
  }

  writeJsonFile(targetPath, existing);

  return {
    path: targetPath,
    model: `${FABRIX_PROVIDER_ID}/${FABRIX_DEFAULT_MODEL_KEY}`,
  };
}

function buildOpenCodeProviderOptions(config) {
  const options = {
    baseURL: `http://${config.bridge.host}:${config.bridge.port}/v1`,
    timeout: Math.max(config.upstream.timeoutMs, 600000),
  };

  if (config.bridge.token) {
    options.apiKey = config.bridge.token;
  }

  return options;
}

function buildOpenCodeProviderModels(config) {
  const models = {
    [FABRIX_DEFAULT_MODEL_KEY]: {
      name: `FabriX Default (${config.defaults.displayName || "Configured model"})`,
    },
  };

  for (const model of config.cache.models) {
    const key = modelKeyFromAlias(model.alias);
    models[key] = {
      name: model.displayName,
    };
  }

  return models;
}

function modelKeyFromAlias(alias) {
  const text = String(alias || "");
  const slashIndex = text.indexOf("/");
  return slashIndex >= 0 ? text.slice(slashIndex + 1) : text;
}

function loadJsonObjectOrDefault(filePath, fallback) {
  if (!fs.existsSync(filePath)) {
    return JSON.parse(JSON.stringify(fallback));
  }

  const raw = fs.readFileSync(filePath, "utf8");
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : JSON.parse(JSON.stringify(fallback));
  } catch {
    const error = new Error(`Cannot update OpenCode config because it is not valid JSON: ${filePath}`);
    error.statusCode = 400;
    error.type = "invalid_request_error";
    throw error;
  }
}

function writeJsonFile(filePath, value) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function getInputSummary() {
  return {
    required: [
      "x-fabrix-client",
      "x-openapi-token",
      "Default model selection",
    ],
    optional: [
      "Bridge token",
      "OpenCode config path",
      "FabriX base URL and advanced network settings",
      "Host, port, CORS origin",
    ],
  };
}

function renderSetupHtml() {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${APP_NAME} Setup</title>
  <style>
    :root {
      --bg: #f6f1e8;
      --panel: rgba(255,255,255,0.78);
      --ink: #1e2220;
      --muted: #5d665f;
      --line: rgba(30,34,32,0.12);
      --accent: #0f766e;
      --accent-2: #164e63;
      --danger: #b42318;
      --shadow: 0 24px 60px rgba(39, 57, 51, 0.14);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI Variable", "Noto Sans KR", sans-serif;
      color: var(--ink);
      background:
        radial-gradient(circle at top left, rgba(15,118,110,0.22), transparent 24rem),
        radial-gradient(circle at bottom right, rgba(22,78,99,0.18), transparent 28rem),
        linear-gradient(135deg, #f8f4ec 0%, #eef5f1 48%, #edf1f7 100%);
      min-height: 100vh;
      padding: 40px 20px;
    }
    .shell {
      max-width: 1120px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: 340px 1fr;
      gap: 24px;
    }
    .card {
      background: var(--panel);
      backdrop-filter: blur(18px);
      border: 1px solid rgba(255,255,255,0.56);
      border-radius: 24px;
      box-shadow: var(--shadow);
    }
    .hero {
      padding: 28px;
      position: sticky;
      top: 24px;
      height: fit-content;
    }
    .hero h1 {
      margin: 0 0 14px;
      font-size: 30px;
      line-height: 1.05;
      letter-spacing: -0.03em;
    }
    .hero p, .hero li, .status, .hint {
      color: var(--muted);
      line-height: 1.55;
    }
    .hero ul {
      margin: 18px 0 0;
      padding-left: 18px;
    }
    .form {
      padding: 28px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px 16px;
    }
    .full { grid-column: 1 / -1; }
    label {
      display: block;
      font-size: 13px;
      font-weight: 700;
      margin-bottom: 8px;
    }
    input, select, textarea {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 12px 14px;
      font: inherit;
      background: rgba(255,255,255,0.84);
      color: var(--ink);
    }
    input:focus, select:focus {
      outline: 2px solid rgba(15,118,110,0.24);
      border-color: rgba(15,118,110,0.4);
    }
    .section {
      margin-top: 28px;
      padding-top: 24px;
      border-top: 1px solid var(--line);
    }
    .section h2 {
      margin: 0 0 8px;
      font-size: 18px;
      letter-spacing: -0.02em;
    }
    .section p {
      margin: 0 0 14px;
      color: var(--muted);
    }
    .toolbar {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin-top: 16px;
    }
    button {
      border: 0;
      border-radius: 999px;
      padding: 12px 18px;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
      transition: transform .12s ease, opacity .12s ease, box-shadow .12s ease;
    }
    button:hover { transform: translateY(-1px); }
    button.primary {
      color: white;
      background: linear-gradient(135deg, var(--accent), var(--accent-2));
      box-shadow: 0 12px 28px rgba(15,118,110,0.24);
    }
    button.secondary {
      background: rgba(255,255,255,0.86);
      color: var(--ink);
      border: 1px solid var(--line);
    }
    details {
      margin-top: 8px;
      border: 1px solid var(--line);
      border-radius: 18px;
      background: rgba(255,255,255,0.56);
      padding: 8px 16px 16px;
    }
    summary {
      cursor: pointer;
      font-weight: 700;
      padding: 10px 0;
    }
    .models {
      display: grid;
      gap: 10px;
      margin-top: 16px;
    }
    .model {
      border: 1px solid var(--line);
      border-radius: 16px;
      background: rgba(255,255,255,0.74);
      padding: 14px;
    }
    .model strong { display: block; margin-bottom: 6px; }
    .model small { color: var(--muted); display: block; margin-top: 6px; }
    .inline {
      display: flex;
      gap: 12px;
      align-items: center;
      flex-wrap: wrap;
    }
    .check {
      display: flex;
      gap: 10px;
      align-items: center;
      padding: 10px 0;
    }
    .check input {
      width: 18px;
      height: 18px;
      margin: 0;
    }
    .status {
      min-height: 24px;
      margin-top: 14px;
      white-space: pre-wrap;
    }
    .status.error { color: var(--danger); }
    .banner {
      background: rgba(15,118,110,0.1);
      border: 1px solid rgba(15,118,110,0.18);
      border-radius: 18px;
      padding: 14px 16px;
      margin-bottom: 18px;
    }
    @media (max-width: 920px) {
      .shell { grid-template-columns: 1fr; }
      .hero { position: static; }
      .grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <aside class="card hero">
      <div class="banner">초기 설정은 필수 입력 3개만 먼저 받습니다. 나머지는 고급 설정으로 접어두었습니다.</div>
      <h1>FabriX Bridge Setup</h1>
      <p>FabriX 토큰을 입력하고 모델을 선택하면 로컬 브릿지와 OpenCode 설정을 같이 준비할 수 있습니다.</p>
      <ul>
        <li>x-fabrix-client</li>
        <li>x-openapi-token</li>
        <li>기본 모델 선택</li>
      </ul>
      <div class="section">
        <h2>OpenCode 자동 연결</h2>
        <p>원하면 OpenCode 설정 파일에 <code>FabriX Bridge</code> provider를 자동 추가합니다.</p>
      </div>
    </aside>
    <main class="card form">
      <div class="grid">
        <div class="full">
          <h2 style="margin:0 0 8px;font-size:22px;letter-spacing:-0.02em;">필수 입력</h2>
          <p class="hint" style="margin:0 0 16px;">모델 목록을 불러오려면 아래 두 값이 먼저 필요합니다.</p>
        </div>
        <div>
          <label for="client">x-fabrix-client</label>
          <input id="client" autocomplete="off" />
        </div>
        <div>
          <label for="token">x-openapi-token</label>
          <input id="token" type="password" autocomplete="off" />
        </div>
      </div>

      <div class="section">
        <div class="inline" style="justify-content:space-between;">
          <div>
            <h2>모델 선택</h2>
            <p>FabriX 모델 목록을 조회해서 기본 모델을 고릅니다.</p>
          </div>
          <button id="loadModels" class="secondary" type="button">모델 목록 불러오기</button>
        </div>
        <div id="models" class="models"></div>
      </div>

      <div class="section">
        <h2>OpenCode 연동</h2>
        <div class="check">
          <input id="installOpencode" type="checkbox" />
          <label for="installOpencode" style="margin:0;">OpenCode 설정 자동 추가</label>
        </div>
        <div class="grid">
          <div class="full">
            <label for="opencodePath">OpenCode config path</label>
            <input id="opencodePath" />
          </div>
          <div class="full check">
            <input id="setDefaultModel" type="checkbox" />
            <label for="setDefaultModel" style="margin:0;">OpenCode 기본 모델도 FabriX로 변경</label>
          </div>
        </div>
      </div>

      <details class="section">
        <summary>고급 설정</summary>
        <div class="grid">
          <div class="full">
            <label for="baseUrl">FabriX base URL</label>
            <input id="baseUrl" />
          </div>
          <div>
            <label for="chatPath">Chat completions path</label>
            <input id="chatPath" />
          </div>
          <div>
            <label for="modelsPath">Models path</label>
            <input id="modelsPath" />
          </div>
          <div>
            <label for="requestModelName">Upstream request body model</label>
            <input id="requestModelName" />
          </div>
          <div>
            <label for="timeoutMs">Upstream timeout (ms)</label>
            <input id="timeoutMs" type="number" />
          </div>
          <div>
            <label for="host">Bridge host</label>
            <input id="host" />
          </div>
          <div>
            <label for="port">Bridge port</label>
            <input id="port" type="number" />
          </div>
          <div>
            <label for="bridgeToken">Bridge token</label>
            <input id="bridgeToken" type="password" />
          </div>
          <div class="full">
            <label for="corsOrigin">CORS origin</label>
            <input id="corsOrigin" />
          </div>
        </div>
      </details>

      <div class="toolbar">
        <button id="save" class="primary" type="button">저장${optionsLabelPlaceholder()}</button>
      </div>
      <div id="status" class="status"></div>
    </main>
  </div>
  <script>
    const els = {
      client: document.getElementById("client"),
      token: document.getElementById("token"),
      baseUrl: document.getElementById("baseUrl"),
      chatPath: document.getElementById("chatPath"),
      modelsPath: document.getElementById("modelsPath"),
      requestModelName: document.getElementById("requestModelName"),
      timeoutMs: document.getElementById("timeoutMs"),
      host: document.getElementById("host"),
      port: document.getElementById("port"),
      bridgeToken: document.getElementById("bridgeToken"),
      corsOrigin: document.getElementById("corsOrigin"),
      installOpencode: document.getElementById("installOpencode"),
      opencodePath: document.getElementById("opencodePath"),
      setDefaultModel: document.getElementById("setDefaultModel"),
      models: document.getElementById("models"),
      status: document.getElementById("status"),
      loadModels: document.getElementById("loadModels"),
      save: document.getElementById("save"),
    };
    let setupState = null;
    let loadedModels = [];
    let selectedModelKey = "default";

    function setStatus(message, isError = false) {
      els.status.textContent = message || "";
      els.status.className = isError ? "status error" : "status";
    }

    function currentPayload() {
      return {
        upstream: {
          baseUrl: els.baseUrl.value.trim(),
          chatPath: els.chatPath.value.trim(),
          modelsPath: els.modelsPath.value.trim(),
          client: els.client.value.trim(),
          token: els.token.value,
          requestModelName: els.requestModelName.value.trim(),
          timeoutMs: Number(els.timeoutMs.value || 0),
        },
        bridge: {
          host: els.host.value.trim(),
          port: Number(els.port.value || 0),
          token: els.bridgeToken.value,
          corsOrigin: els.corsOrigin.value.trim(),
        },
        opencode: {
          install: els.installOpencode.checked,
          configPath: els.opencodePath.value.trim(),
          setDefaultModel: els.setDefaultModel.checked,
        },
        selectedModelKey,
      };
    }

    function renderModels(models) {
      loadedModels = models;
      if (!Array.isArray(models) || models.length === 0) {
        els.models.innerHTML = "<div class='hint'>조회된 모델이 없습니다.</div>";
        return;
      }

      const current = loadedModels.find((model) => model.alias.endsWith("/" + selectedModelKey)) || loadedModels[0];
      selectedModelKey = current ? current.alias.split("/")[1] : "default";

      els.models.innerHTML = models.map((model) => {
        const key = model.alias.split("/")[1];
        const checked = key === selectedModelKey ? "checked" : "";
        const desc = model.description ? model.description.replace(/</g, "&lt;").replace(/>/g, "&gt;") : "";
        return \`
          <label class="model">
            <input type="radio" name="model" value="\${key}" \${checked} style="margin-right:10px;" />
            <strong>\${model.displayName}</strong>
            <div class="hint">\${model.alias}</div>
            <small>modelId: \${model.modelId}</small>
            \${desc ? \`<small>\${desc}</small>\` : ""}
          </label>
        \`;
      }).join("");

      document.querySelectorAll('input[name="model"]').forEach((input) => {
        input.addEventListener("change", () => {
          selectedModelKey = input.value;
        });
      });
    }

    async function loadState() {
      const response = await fetch("/api/state");
      setupState = await response.json();
      const config = setupState.config;

      els.client.value = config.upstream.client || "";
      els.token.value = config.upstream.token || "";
      els.baseUrl.value = config.upstream.baseUrl || "";
      els.chatPath.value = config.upstream.chatPath || "";
      els.modelsPath.value = config.upstream.modelsPath || "";
      els.requestModelName.value = config.upstream.requestModelName || "";
      els.timeoutMs.value = config.upstream.timeoutMs || "";
      els.host.value = config.bridge.host || "";
      els.port.value = config.bridge.port || "";
      els.bridgeToken.value = config.bridge.token || "";
      els.corsOrigin.value = config.bridge.corsOrigin || "";
      els.installOpencode.checked = config.opencode.install !== false;
      els.opencodePath.value = config.opencode.configPath || setupState.opencodeConfigPath || "";
      els.setDefaultModel.checked = config.opencode.setDefaultModel !== false;
      selectedModelKey = config.defaults.selectedModelKey || "default";
      els.save.textContent = setupState.autoStart ? "저장하고 브릿지 시작" : "저장";
    }

    async function loadModels() {
      setStatus("FabriX 모델 목록을 조회하는 중입니다...");
      const response = await fetch("/api/models", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(currentPayload())
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error?.message || "모델 조회에 실패했습니다.");
      }
      renderModels(data.models || []);
      setStatus(\`모델 \${(data.models || []).length}개를 불러왔습니다.\`);
    }

    async function save() {
      if (!loadedModels.length) {
        await loadModels();
      }
      setStatus("설정을 저장하는 중입니다...");
      const response = await fetch("/api/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(currentPayload())
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error?.message || "설정 저장에 실패했습니다.");
      }
      const lines = [
        "설정을 저장했습니다.",
        \`기본 모델: \${data.defaultModel.displayName}\`,
        \`브릿지 주소: \${data.bridgeUrl}\`,
      ];
      if (data.opencode?.path) {
        lines.push(\`OpenCode config: \${data.opencode.path}\`);
      }
      if (data.startAfterSave) {
        lines.push("브릿지를 시작합니다. 이 창은 닫아도 됩니다.");
      }
      setStatus(lines.join("\\n"));
    }

    els.loadModels.addEventListener("click", async () => {
      try {
        await loadModels();
      } catch (error) {
        setStatus(error.message, true);
      }
    });

    els.save.addEventListener("click", async () => {
      try {
        await save();
      } catch (error) {
        setStatus(error.message, true);
      }
    });

    loadState().catch((error) => setStatus(error.message, true));
  </script>
</body>
</html>`;
}

function optionsLabelPlaceholder() {
  return "";
}

async function startServer(configInput, configPath) {
  const config = mergeConfig(configInput);
  const state = { config, configPath };

  const server = http.createServer(async (req, res) => {
    try {
      await handleRequest(req, res, state);
    } catch (error) {
      handleUnhandledError(error, res);
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.bridge.port, config.bridge.host, resolve);
  });

  const baseUrl = `http://${config.bridge.host}:${config.bridge.port}`;
  console.log(`${APP_NAME} listening on ${baseUrl}`);
  console.log(`Config path: ${configPath}`);
  console.log(`Default model: ${config.defaults.displayName || config.defaults.modelAlias || "not set"}`);
  console.log(`Local auth: ${config.bridge.token ? "enabled" : "disabled"}`);

  const closeServer = () => {
    server.close(() => process.exit(0));
  };

  process.on("SIGINT", closeServer);
  process.on("SIGTERM", closeServer);
}

async function handleRequest(req, res, state) {
  const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  applyCorsHeaders(res, state.config.bridge.corsOrigin, req.headers.origin);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (requestUrl.pathname === "/healthz" && req.method === "GET") {
    return sendJson(res, 200, {
      ok: true,
      service: APP_NAME,
      defaultModel: state.config.defaults.modelAlias || null,
      configPath: state.configPath,
    });
  }

  if (!isBridgeAuthorized(req, state.config.bridge.token)) {
    return sendJson(res, 401, {
      error: {
        message: "Unauthorized",
        type: "auth_error",
      },
    });
  }

  if (requestUrl.pathname === "/v1/models" && req.method === "GET") {
    return handleModelsRoute(res, state);
  }

  if (requestUrl.pathname === "/v1/chat/completions" && req.method === "POST") {
    return handleChatCompletionsRoute(req, res, state);
  }

  return sendJson(res, 404, {
    error: {
      message: "Not found",
      type: "invalid_request_error",
    },
  });
}

async function handleModelsRoute(res, state) {
  try {
    const models = await getModels(state, { forceRefresh: true, allowStale: true });
    return sendJson(res, 200, {
      object: "list",
      data: [toDefaultOpenAIModelObject(state.config), ...models.map(toOpenAIModelObject)],
    });
  } catch (error) {
    return sendJson(res, 502, {
      error: {
        message: error.message,
        type: "upstream_error",
      },
    });
  }
}

async function handleChatCompletionsRoute(req, res, state) {
  const rawBody = await readBody(req, MAX_BODY_BYTES);
  const clientBody = parseJsonBody(rawBody);

  if (!Array.isArray(clientBody.messages)) {
    return sendJson(res, 400, {
      error: {
        message: "`messages` must be an array.",
        type: "invalid_request_error",
      },
    });
  }

  const requestedModel = typeof clientBody.model === "string" ? clientBody.model.trim() : "";
  const resolvedModel = await resolveModelForRequest(state, requestedModel);

  if (!resolvedModel) {
    return sendJson(res, 400, {
      error: {
        message: `Unknown model: ${requestedModel || "(empty)"}. Call /v1/models to inspect available ids.`,
        type: "invalid_request_error",
      },
    });
  }

  const upstreamUrl = joinUrl(state.config.upstream.baseUrl, state.config.upstream.chatPath);
  const upstreamHeaders = {
    "content-type": "application/json",
    "x-fabrix-client": state.config.upstream.client,
    "x-openapi-token": state.config.upstream.token,
    "x-llm-model-id": String(resolvedModel.modelId),
  };

  const upstreamBody = {
    ...clientBody,
    model: state.config.upstream.requestModelName,
    stream: clientBody.stream === true,
  };

  const upstreamResponse = await fetchWithTimeout(
    upstreamUrl,
    {
      method: "POST",
      headers: upstreamHeaders,
      body: JSON.stringify(upstreamBody),
    },
    state.config.upstream.timeoutMs
  );

  if (!upstreamResponse.ok) {
    const errorText = await upstreamResponse.text();
    return sendUpstreamError(res, upstreamResponse.status, errorText);
  }

  if (clientBody.stream === true) {
    return pipeStreamResponse(res, upstreamResponse);
  }

  const responseText = await upstreamResponse.text();
  res.writeHead(200, {
    "content-type": upstreamResponse.headers.get("content-type") || "application/json; charset=utf-8",
    "cache-control": "no-cache",
  });
  res.end(responseText);
}

async function resolveModelForRequest(state, requestedModel) {
  const defaultAlias = state.config.defaults.modelAlias || "default";

  const tryResolve = async (forceRefresh) => {
    const models = await getModels(state, { forceRefresh, allowStale: true });
    return findMatchingModel(models, requestedModel || defaultAlias, state.config.defaults);
  };

  const direct = await tryResolve(false);
  if (direct) return direct;
  return tryResolve(true);
}

async function getModels(state, options) {
  const config = state.config;
  const models = Array.isArray(config.cache.models) ? config.cache.models : [];
  const fetchedAt = config.cache.fetchedAt ? Date.parse(config.cache.fetchedAt) : 0;
  const freshEnough = fetchedAt > 0 && Date.now() - fetchedAt < MODELS_CACHE_TTL_MS;

  if (!options.forceRefresh && models.length > 0 && freshEnough) {
    return models;
  }

  try {
    return await fetchAndCacheModels(state);
  } catch (error) {
    if (options.allowStale && models.length > 0) {
      return models;
    }
    throw error;
  }
}

async function fetchAndCacheModels(state) {
  const url = joinUrl(state.config.upstream.baseUrl, state.config.upstream.modelsPath);
  const response = await fetchWithTimeout(
    url,
    {
      method: "GET",
      headers: {
        "x-fabrix-client": state.config.upstream.client,
        "x-openapi-token": state.config.upstream.token,
      },
    },
    state.config.upstream.timeoutMs
  );

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`Model lookup failed with status ${response.status}: ${truncate(raw, 300)}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Model lookup did not return valid JSON.");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Model lookup did not return an array.");
  }

  const normalized = parsed.map(normalizeModel).filter(Boolean);
  state.config.cache.models = normalized;
  state.config.cache.fetchedAt = new Date().toISOString();

  if (!state.config.defaults.modelAlias && normalized[0]) {
    state.config.defaults = {
      modelAlias: normalized[0].alias,
      modelId: normalized[0].modelId,
      modelGuid: normalized[0].modelGuid,
      displayName: normalized[0].displayName,
    };
  }

  saveConfig(state.configPath, state.config);
  return normalized;
}

function normalizeModel(rawModel) {
  if (!rawModel || typeof rawModel !== "object") return null;

  const modelId = Number(rawModel.modelId);
  if (!Number.isFinite(modelId)) return null;

  const names = Array.isArray(rawModel.name) ? rawModel.name : [];
  const descriptions = Array.isArray(rawModel.description) ? rawModel.description : [];
  const displayName = pickLocalizedContent(names) || `model-${modelId}`;
  const description = pickLocalizedContent(descriptions);
  const alias = buildModelAlias(displayName, modelId);

  return {
    modelId,
    modelGuid: String(rawModel.modelGuid || ""),
    alias,
    displayName,
    description,
    names: names.map(normalizeLocalizedContent).filter(Boolean),
    descriptions: descriptions.map(normalizeLocalizedContent).filter(Boolean),
  };
}

function normalizeLocalizedContent(item) {
  if (!item || typeof item !== "object") return null;
  const content = typeof item.content === "string" ? item.content.trim() : "";
  if (!content) return null;
  return {
    languageCode: typeof item.languageCode === "string" ? item.languageCode.trim() : "",
    content,
  };
}

function pickLocalizedContent(items) {
  const normalized = items.map(normalizeLocalizedContent).filter(Boolean);
  return (
    normalized.find((item) => item.languageCode === "en")?.content ||
    normalized.find((item) => item.languageCode === "ko")?.content ||
    normalized[0]?.content ||
    ""
  );
}

function buildModelAlias(displayName, modelId) {
  const slug = slugify(displayName) || `model-${modelId}`;
  return `fabrix/${slug}-${modelId}`;
}

function findMatchingModel(models, requestedModel, defaults) {
  const needle = String(requestedModel || "").trim();
  if (!needle || needle === "default" || needle.toLowerCase() === `${FABRIX_PROVIDER_ID}/${FABRIX_DEFAULT_MODEL_KEY}`) {
    return models.find((model) => model.alias === defaults.modelAlias) || models[0] || null;
  }

  const lowered = needle.toLowerCase();
  return (
    models.find((model) => model.alias.toLowerCase() === lowered) ||
    models.find((model) => modelKeyFromAlias(model.alias).toLowerCase() === lowered) ||
    models.find((model) => model.displayName.toLowerCase() === lowered) ||
    models.find((model) => String(model.modelId) === needle) ||
    models.find((model) => model.modelGuid.toLowerCase() === lowered) ||
    models.find((model) => slugify(model.displayName) === slugify(needle)) ||
    models.find((model) => model.names.some((entry) => entry.content.toLowerCase() === lowered)) ||
    null
  );
}

function toOpenAIModelObject(model) {
  return {
    id: model.alias,
    object: "model",
    created: 0,
    owned_by: "fabrix",
    display_name: model.displayName,
    model_id: model.modelId,
    model_guid: model.modelGuid,
    description: model.description,
  };
}

function toDefaultOpenAIModelObject(config) {
  return {
    id: `${FABRIX_PROVIDER_ID}/${FABRIX_DEFAULT_MODEL_KEY}`,
    object: "model",
    created: 0,
    owned_by: "fabrix",
    display_name: `FabriX Default (${config.defaults.displayName || "configured"})`,
    model_id: config.defaults.modelId || null,
    model_guid: config.defaults.modelGuid || null,
    description: "Currently selected default model for the local FabriX bridge.",
  };
}

function pipeStreamResponse(res, upstreamResponse) {
  if (!upstreamResponse.body) {
    return sendJson(res, 502, {
      error: {
        message: "Upstream returned an empty stream body.",
        type: "upstream_error",
      },
    });
  }

  res.writeHead(200, {
    "content-type": upstreamResponse.headers.get("content-type") || "text/event-stream; charset=utf-8",
    "cache-control": upstreamResponse.headers.get("cache-control") || "no-cache, no-transform",
    connection: "keep-alive",
  });

  const nodeStream = Readable.fromWeb(upstreamResponse.body);
  nodeStream.on("error", (error) => {
    if (!res.writableEnded) {
      res.destroy(error);
    }
  });
  nodeStream.pipe(res);
}

function sendUpstreamError(res, statusCode, rawText) {
  let details = rawText;
  try {
    details = rawText ? JSON.parse(rawText) : null;
  } catch {
    details = rawText;
  }

  return sendJson(res, statusCode, {
    error: {
      message: "Upstream(FabriX) error",
      type: "upstream_error",
      code: String(statusCode),
      details,
    },
  });
}

function parseJsonBody(rawBody) {
  try {
    return rawBody ? JSON.parse(rawBody) : {};
  } catch {
    const error = new Error("Request body is not valid JSON.");
    error.statusCode = 400;
    error.type = "invalid_request_error";
    throw error;
  }
}

async function readBody(req, limitBytes) {
  const chunks = [];
  let total = 0;

  for await (const chunk of req) {
    total += chunk.length;
    if (total > limitBytes) {
      const error = new Error(`Request body exceeds ${limitBytes} bytes.`);
      error.statusCode = 413;
      error.type = "invalid_request_error";
      throw error;
    }
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function isBridgeAuthorized(req, bridgeToken) {
  if (!bridgeToken) return true;
  const auth = typeof req.headers.authorization === "string" ? req.headers.authorization : "";
  const prefix = "Bearer ";
  return auth.startsWith(prefix) && auth.slice(prefix.length) === bridgeToken;
}

function applyCorsHeaders(res, configuredOrigin, requestOrigin) {
  const allowOrigin = configuredOrigin === "*" ? "*" : configuredOrigin || requestOrigin || "*";
  res.setHeader("access-control-allow-origin", allowOrigin);
  res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
  res.setHeader("access-control-allow-headers", "Authorization, Content-Type");
}

function handleUnhandledError(error, res) {
  const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
  const type = error.type || (statusCode >= 500 ? "server_error" : "invalid_request_error");
  sendJson(res, statusCode, {
    error: {
      message: error.message || "Internal server error",
      type,
    },
  });
}

function sendJson(res, statusCode, payload) {
  if (res.writableEnded) return;
  res.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function resolveConfigPath(customPath) {
  if (customPath) {
    return path.resolve(customPath);
  }

  const appData = process.env.APPDATA || path.join(os.homedir(), ".config");
  return path.join(appData, "sds-fabrix-bridge", "config.json");
}

function loadConfig(configPath) {
  if (!fs.existsSync(configPath)) return null;
  const raw = fs.readFileSync(configPath, "utf8");
  return mergeConfig(JSON.parse(raw));
}

function saveConfig(configPath, config) {
  const normalized = mergeConfig(config);
  const dir = path.dirname(configPath);
  fs.mkdirSync(dir, { recursive: true });
  const tempPath = `${configPath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, configPath);
}

function sanitizeConfig(config) {
  const safe = JSON.parse(JSON.stringify(mergeConfig(config)));
  if (safe.upstream.token) {
    safe.upstream.token = redact(safe.upstream.token);
  }
  if (safe.bridge.token) {
    safe.bridge.token = redact(safe.bridge.token);
  }
  return safe;
}

function mergeConfig(config) {
  const merged = {
    version: 1,
    upstream: {
      baseUrl: DEFAULT_BASE_URL,
      chatPath: DEFAULT_CHAT_PATH,
      modelsPath: DEFAULT_MODELS_PATH,
      client: "",
      token: "",
      requestModelName: DEFAULT_UPSTREAM_MODEL_NAME,
      timeoutMs: DEFAULT_TIMEOUT_MS,
    },
    bridge: {
      host: DEFAULT_HOST,
      port: DEFAULT_PORT,
      token: "",
      corsOrigin: "*",
    },
    defaults: {
      modelAlias: "",
      modelId: 0,
      modelGuid: "",
      displayName: "",
    },
    cache: {
      models: [],
      fetchedAt: "",
    },
    integrations: {
      opencode: {
        enabled: true,
        configPath: resolveDefaultOpenCodeConfigPath(),
        setDefaultModel: true,
      },
    },
  };

  if (!config || typeof config !== "object") {
    return merged;
  }

  if (config.upstream && typeof config.upstream === "object") {
    Object.assign(merged.upstream, config.upstream);
  }
  if (config.bridge && typeof config.bridge === "object") {
    Object.assign(merged.bridge, config.bridge);
  }
  if (config.defaults && typeof config.defaults === "object") {
    Object.assign(merged.defaults, config.defaults);
  }
  if (config.cache && typeof config.cache === "object") {
    Object.assign(merged.cache, config.cache);
  }
  if (config.integrations && typeof config.integrations === "object") {
    if (config.integrations.opencode && typeof config.integrations.opencode === "object") {
      Object.assign(merged.integrations.opencode, config.integrations.opencode);
    }
  }

  merged.upstream.baseUrl = trimTrailingSlash(String(merged.upstream.baseUrl || DEFAULT_BASE_URL));
  merged.upstream.chatPath = ensureLeadingSlash(String(merged.upstream.chatPath || DEFAULT_CHAT_PATH));
  merged.upstream.modelsPath = ensureLeadingSlash(String(merged.upstream.modelsPath || DEFAULT_MODELS_PATH));
  merged.upstream.requestModelName = String(merged.upstream.requestModelName || DEFAULT_UPSTREAM_MODEL_NAME);
  merged.upstream.timeoutMs = parseInteger(merged.upstream.timeoutMs, DEFAULT_TIMEOUT_MS);
  merged.bridge.host = String(merged.bridge.host || DEFAULT_HOST);
  merged.bridge.port = parseInteger(merged.bridge.port, DEFAULT_PORT);
  merged.bridge.token = String(merged.bridge.token || "");
  merged.bridge.corsOrigin = String(merged.bridge.corsOrigin || "*");
  merged.defaults.modelAlias = String(merged.defaults.modelAlias || "");
  merged.defaults.modelId = parseInteger(merged.defaults.modelId, 0);
  merged.defaults.modelGuid = String(merged.defaults.modelGuid || "");
  merged.defaults.displayName = String(merged.defaults.displayName || "");
  merged.integrations.opencode.enabled = merged.integrations.opencode.enabled !== false;
  merged.integrations.opencode.configPath = resolveOpenCodeConfigPath(merged.integrations.opencode.configPath);
  merged.integrations.opencode.setDefaultModel = merged.integrations.opencode.setDefaultModel !== false;

  if (!Array.isArray(merged.cache.models)) {
    merged.cache.models = [];
  }

  return merged;
}

function isConfigComplete(config) {
  if (!config) return false;
  const merged = mergeConfig(config);
  return Boolean(
    merged.upstream.baseUrl &&
      merged.upstream.chatPath &&
      merged.upstream.modelsPath &&
      merged.upstream.client &&
      merged.upstream.token &&
      merged.bridge.host &&
      merged.bridge.port
  );
}

async function promptValue(rl, label, defaultValue, options = {}) {
  const suffix = defaultValue !== undefined && defaultValue !== "" ? ` [${defaultValue}]` : "";
  const answer = (await rl.question(`${label}${suffix}: `)).trim();
  if (!answer) {
    if (defaultValue !== undefined && defaultValue !== "") {
      return String(defaultValue);
    }
    if (options.required) {
      console.log(`${label} is required.`);
      return promptValue(rl, label, defaultValue, options);
    }
    if (options.allowEmpty) {
      return "";
    }
  }
  return answer;
}

function parseArgs(argv) {
  const out = { _: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      out._.push(token);
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      out[camelCase(key)] = true;
      continue;
    }
    out[camelCase(key)] = next;
    index += 1;
  }

  return out;
}

function camelCase(value) {
  return String(value).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

function joinUrl(baseUrl, pathname) {
  return `${trimTrailingSlash(baseUrl)}${ensureLeadingSlash(pathname)}`;
}

function trimTrailingSlash(value) {
  return String(value).replace(/\/+$/, "");
}

function ensureLeadingSlash(value) {
  return value.startsWith("/") ? value : `/${value}`;
}

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function valueOrDefault(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value) !== "") {
      return value;
    }
  }
  return "";
}

function truncate(value, maxLength) {
  const text = String(value || "");
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
}

function redact(value) {
  const text = String(value || "");
  if (text.length <= 8) return "***";
  return `${text.slice(0, 4)}...${text.slice(-4)}`;
}

function slugify(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function loadDotEnvIfPresent(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
