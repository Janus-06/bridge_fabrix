"use strict";

const fs = require("fs");
const path = require("path");

loadEnvFile(path.join(process.cwd(), ".env"));

const DEFAULT_BASE_URL =
  "https://nsds-api.fabrix-s.samsungsds.com/sds/trial/api-llm/openapi/llm";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const stream = args.stream === true;
  const message = args.message || "Who are you?";
  const modelId = firstDefined(args.modelId, process.env.FABRIX_MODEL_ID);
  const baseUrl = trimTrailingSlash(firstDefined(args.baseUrl, process.env.FABRIX_BASE_URL, DEFAULT_BASE_URL));
  const pathName = firstDefined(args.path, process.env.FABRIX_PATH, "/chat/completions");
  const client = firstDefined(args.client, process.env.FABRIX_CLIENT);
  const token = firstDefined(args.token, process.env.FABRIX_OPENAPI_TOKEN, process.env.FABRIX_OPENAI_TOKEN);
  const modelName = firstDefined(args.model, process.env.UPSTREAM_MODEL_NAME, "/mnt/models");
  const saveDir = firstDefined(args.saveDir, path.join(process.cwd(), "probe-output"));

  if (!client) {
    fail("FABRIX_CLIENT 또는 --client 가 필요합니다.");
  }

  if (!token) {
    fail("FABRIX_OPENAPI_TOKEN 또는 FABRIX_OPENAI_TOKEN 또는 --token 이 필요합니다.");
  }

  if (!modelId) {
    fail("FABRIX_MODEL_ID 또는 --model-id 가 필요합니다.");
  }

  const url = `${baseUrl}${pathName}`;
  const requestBody = {
    model: modelName,
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: message },
    ],
    stream,
  };

  const headers = {
    "content-type": "application/json",
    "x-fabrix-client": client,
    "x-openapi-token": token,
    "x-llm-model-id": String(modelId),
  };

  printHeader("Request");
  console.log(JSON.stringify({ url, stream, headers: redactHeaders(headers), body: requestBody }, null, 2));

  fs.mkdirSync(saveDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  if (stream) {
    const streamPath = path.join(saveDir, `${stamp}-stream.txt`);
    await probeStream(url, headers, requestBody, streamPath);
    return;
  }

  const jsonPath = path.join(saveDir, `${stamp}-response.json`);
  await probeJson(url, headers, requestBody, jsonPath);
}

async function probeJson(url, headers, body, outputPath) {
  const startedAt = Date.now();
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const elapsedMs = Date.now() - startedAt;
  const raw = await response.text();

  printHeader("Response");
  console.log(JSON.stringify(buildResponseMeta(response, elapsedMs), null, 2));
  console.log(raw);

  fs.writeFileSync(outputPath, raw, "utf8");
  console.log(`\nSaved response: ${outputPath}`);

  try {
    const parsed = JSON.parse(raw);
    printHeader("Compatibility Check");
    console.log(JSON.stringify(summarizeChatCompletionShape(parsed), null, 2));
  } catch {
    console.log("\nCompatibility Check: JSON 파싱 실패");
  }
}

async function probeStream(url, headers, body, outputPath) {
  const startedAt = Date.now();
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const elapsedMs = Date.now() - startedAt;

  printHeader("Response");
  console.log(JSON.stringify(buildResponseMeta(response, elapsedMs), null, 2));

  if (!response.body) {
    fail("스트리밍 응답 body가 없습니다.");
  }

  const file = fs.createWriteStream(outputPath, { flags: "a" });
  const decoder = new TextDecoder();
  let buffer = "";
  let chunkIndex = 0;

  for await (const chunk of response.body) {
    chunkIndex += 1;
    const text = decoder.decode(chunk, { stream: true });
    buffer += text;
    file.write(text);

    printHeader(`Chunk ${chunkIndex}`);
    console.log(text);

    const drained = drainStructuredEvents(buffer);
    buffer = drained.rest;

    for (const event of drained.events) {
      printHeader("Parsed Event");
      console.log(JSON.stringify(event, null, 2));
    }
  }

  const tail = decoder.decode();
  if (tail) {
    buffer += tail;
    file.write(tail);
  }

  file.end();

  if (buffer.trim()) {
    printHeader("Trailing Buffer");
    console.log(buffer);
  }

  console.log(`\nSaved stream: ${outputPath}`);
}

function buildResponseMeta(response, elapsedMs) {
  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    elapsedMs,
    contentType: response.headers.get("content-type"),
    transferEncoding: response.headers.get("transfer-encoding"),
    cacheControl: response.headers.get("cache-control"),
  };
}

function summarizeChatCompletionShape(payload) {
  const choice = Array.isArray(payload?.choices) ? payload.choices[0] : undefined;
  const message = choice?.message;
  return {
    object: payload?.object,
    hasId: typeof payload?.id === "string",
    hasCreated: typeof payload?.created === "number",
    hasModel: typeof payload?.model === "string",
    hasChoicesArray: Array.isArray(payload?.choices),
    hasAssistantMessage: message?.role === "assistant",
    hasContent: typeof message?.content === "string",
    hasToolCallsArray: Array.isArray(message?.tool_calls),
    hasUsage: typeof payload?.usage === "object" && payload?.usage !== null,
    finishReason: choice?.finish_reason ?? null,
    extraMessageKeys: message ? Object.keys(message).filter((key) => !STANDARD_MESSAGE_KEYS.has(key)) : [],
    extraTopLevelKeys: Object.keys(payload || {}).filter((key) => !STANDARD_TOP_LEVEL_KEYS.has(key)),
  };
}

function drainStructuredEvents(input) {
  const events = [];
  let rest = input;

  while (true) {
    const sseIndex = rest.indexOf("\n\n");
    const lineIndex = rest.indexOf("\n");
    if (sseIndex === -1 && lineIndex === -1) break;

    if (rest.startsWith("data:")) {
      if (sseIndex === -1) break;
      const block = rest.slice(0, sseIndex);
      rest = rest.slice(sseIndex + 2);
      events.push(parseSseBlock(block));
      continue;
    }

    if (lineIndex === -1) break;
    const line = rest.slice(0, lineIndex).trim();
    rest = rest.slice(lineIndex + 1);
    if (!line) continue;

    const maybeJson = tryParseJson(line);
    if (maybeJson !== null) {
      events.push({ kind: "json-line", data: maybeJson });
      continue;
    }
  }

  return { events, rest };
}

function parseSseBlock(block) {
  const lines = block.split(/\r?\n/);
  const dataLines = [];
  for (const line of lines) {
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  const rawData = dataLines.join("\n");
  if (rawData === "[DONE]") {
    return { kind: "sse", done: true };
  }

  const maybeJson = tryParseJson(rawData);
  return {
    kind: "sse",
    done: false,
    data: maybeJson === null ? rawData : maybeJson,
  };
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function parseArgs(argv) {
  const out = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;

    const key = token.slice(2);
    const next = argv[i + 1];

    if (key === "stream") {
      out.stream = true;
      continue;
    }

    if (!next || next.startsWith("--")) {
      out[camelCase(key)] = "";
      continue;
    }

    out[camelCase(key)] = next;
    i += 1;
  }

  return out;
}

function camelCase(value) {
  return String(value).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
}

function printHeader(title) {
  console.log(`\n=== ${title} ===`);
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value) !== "") return value;
  }
  return undefined;
}

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function redactHeaders(headers) {
  return {
    ...headers,
    "x-fabrix-client": redactValue(headers["x-fabrix-client"]),
    "x-openapi-token": redactValue(headers["x-openapi-token"]),
  };
}

function redactValue(value) {
  const text = String(value || "");
  if (text.length <= 8) return "***";
  return `${text.slice(0, 4)}...${text.slice(-4)}`;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

const STANDARD_TOP_LEVEL_KEYS = new Set([
  "id",
  "object",
  "created",
  "model",
  "choices",
  "usage",
  "service_tier",
  "system_fingerprint",
]);

const STANDARD_MESSAGE_KEYS = new Set([
  "role",
  "content",
  "refusal",
  "annotations",
  "audio",
  "function_call",
  "tool_calls",
]);

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
