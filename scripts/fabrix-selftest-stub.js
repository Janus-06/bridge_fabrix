"use strict";

const http = require("node:http");

const host = process.env.FABRIX_STUB_HOST || "127.0.0.1";
const port = Number.parseInt(process.env.FABRIX_STUB_PORT || "4300", 10);

const models = [
  {
    modelId: 16,
    modelGuid: "stub-16",
    name: [{ languageCode: "en", content: "gpt-oss-120b(Mid)" }],
    description: [{ languageCode: "en", content: "Stub reasoning model." }],
  },
  {
    modelId: 13,
    modelGuid: "stub-13",
    name: [{ languageCode: "en", content: "gpt-oss-120b(Low)" }],
    description: [{ languageCode: "en", content: "Stub fast model." }],
  },
];

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/v1/models") {
    return sendJson(res, 200, models);
  }

  if (req.method === "POST" && req.url === "/chat/completions") {
    const rawBody = await readBody(req);
    const body = rawBody ? JSON.parse(rawBody) : {};
    return sendJson(res, 200, {
      id: "chatcmpl-stub",
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: body.model || "/mnt/models",
      choices: [
        {
          index: 0,
          finish_reason: "stop",
          message: {
            role: "assistant",
            content: "hello from stub",
          },
        },
      ],
      usage: {
        prompt_tokens: 5,
        completion_tokens: 4,
        total_tokens: 9,
      },
    });
  }

  sendJson(res, 404, { error: "not found" });
});

server.listen(port, host, () => {
  console.log(`FabriX self-test stub listening on http://${host}:${port}`);
});

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(payload));
}
