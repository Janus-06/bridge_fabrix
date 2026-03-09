"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
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
const MODELS_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_BODY_BYTES = 5 * 1024 * 1024;

const HELP_TEXT = `
${APP_NAME}

Usage:
  node app.js
  node app.js run
  node app.js configure
  node app.js serve
  node app.js models
  node app.js config-path
  node app.js show-config

Options:
  --config <path>       Use a custom config file path
  --start               Start server after configure
  --refresh             Force refresh when listing models
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
      await configureCommand(configPath, args.start === true);
      return;
    case "models":
      await modelsCommand(configPath, args.refresh === true, args.json === true);
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
  const config = await ensureConfigured(configPath);
  await startServer(config, configPath);
}

async function serveCommand(configPath) {
  const config = loadConfig(configPath);
  if (!isConfigComplete(config)) {
    throw new Error(`Config is missing or incomplete. Run "node app.js configure" first. Config path: ${configPath}`);
  }
  await startServer(config, configPath);
}

async function configureCommand(configPath, startAfterSave) {
  const existing = loadConfig(configPath);
  const config = await runSetupWizard(existing, configPath);
  if (startAfterSave) {
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
      data: models.map(toOpenAIModelObject),
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
  if (!needle || needle === "default") {
    return models.find((model) => model.alias === defaults.modelAlias) || models[0] || null;
  }

  const lowered = needle.toLowerCase();
  return (
    models.find((model) => model.alias.toLowerCase() === lowered) ||
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
