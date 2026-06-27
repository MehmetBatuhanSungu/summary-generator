"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");

loadEnvFile();

const HOST = process.env.HOST || "127.0.0.1";
const PORT = process.env.PORT || 3000;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const MAX_TRANSCRIPT_CHARS = 20000;

const server = http.createServer(async (request, response) => {
  setCorsHeaders(response);
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method === "GET" && pathname === "/") {
    sendJson(response, 200, {
      ok: true,
      message: "Backend calisiyor.",
      endpoints: {
        health: "GET /health",
        summarize: "POST /summarize"
      }
    });
    return;
  }

  if (request.method === "GET" && pathname === "/health") {
    sendJson(response, 200, {
      ok: true,
      message: "Backend calisiyor.",
      hasOpenAiKey: isOpenAiKeyConfigured()
    });
    return;
  }

  if (request.method !== "POST" && pathname === "/summarize") {
    sendJson(response, 405, {
      error: "Bu endpoint POST istegi bekliyor."
    });
    return;
  }

  if (request.method === "POST" && pathname === "/summarize") {
    const body = await readJsonBody(request);
    const transcript = body.transcript || "";

    if (!transcript.trim()) {
      sendJson(response, 400, {
        error: "Transcript bos olamaz."
      });
      return;
    }

    if (!isOpenAiKeyConfigured()) {
      sendJson(response, 500, {
        error: "OpenAI API key ayarlanmamis."
      });
      return;
    }

    try {
      const summary = await createAiSummary(transcript);

      sendJson(response, 200, {
        summary
      });
    } catch (error) {
      console.error("OpenAI summary error:", error.message);

      sendJson(response, 500, {
        error: `OpenAI ozeti olusturulamadi: ${error.message}`
      });
    }

    return;
  }

  sendJson(response, 404, {
    error: "Endpoint bulunamadi."
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Backend http://${HOST}:${PORT} adresinde calisiyor.`);
});

function loadEnvFile() {
  const envPath = path.join(__dirname, ".env");

  if (!fs.existsSync(envPath)) {
    return;
  }

  const envFile = fs.readFileSync(envPath, "utf8");
  const lines = envFile.split("\n");

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmedLine.indexOf("=");

    if (equalsIndex === -1) {
      continue;
    }

    const key = trimmedLine.slice(0, equalsIndex).trim();
    const value = trimmedLine.slice(equalsIndex + 1).trim();

    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

function isOpenAiKeyConfigured() {
  const apiKey = process.env.OPENAI_API_KEY || "";

  return apiKey.trim() !== "" && apiKey !== "buraya_openai_api_key_yaz";
}

function setCorsHeaders(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json"
  });
  response.end(JSON.stringify(data));
}

function readJsonBody(request) {
  return new Promise((resolve) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
    });

    request.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch (error) {
        resolve({});
      }
    });
  });
}

async function createAiSummary(transcript) {
  const trimmedTranscript = transcript.trim().slice(0, MAX_TRANSCRIPT_CHARS);
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      instructions: [
        "You summarize YouTube transcripts for Turkish users.",
        "Write in Turkish.",
        "Focus on critical information, decisions, warnings, tools, steps, and takeaways.",
        "Do not mention that you are an AI."
      ].join(" "),
      input: [
        "Asagidaki YouTube transcriptini kritik bilgi ozeti formatinda ozetle.",
        "",
        "Format:",
        "Baslik: videonun ana konusu",
        "Kisa ozet: 3-5 cumle",
        "Kritik bilgiler: madde madde",
        "Uygulanabilir adimlar: madde madde",
        "Dikkat edilmesi gerekenler: madde madde",
        "",
        "Transcript:",
        trimmedTranscript
      ].join("\n"),
      max_output_tokens: 900
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || "OpenAI istegi basarisiz oldu.");
  }

  return extractOutputText(data);
}

function extractOutputText(data) {
  if (data.output_text) {
    return data.output_text;
  }

  const output = data.output || [];
  const textParts = [];

  for (const item of output) {
    const content = item.content || [];

    for (const contentItem of content) {
      if (contentItem.type === "output_text" && contentItem.text) {
        textParts.push(contentItem.text);
      }
    }
  }

  return textParts.join("\n").trim();
}
