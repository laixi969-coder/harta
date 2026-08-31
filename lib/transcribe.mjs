import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readLlm } from "./llm.mjs";

const execFileAsync = promisify(execFile);
const ASR_TIMEOUT_MS = 30 * 60 * 1000;

function qwenAsrProvider() {
  const data = readLlm();
  return Object.values(data.providers || {}).find((p) => {
    const base = String(p.baseUrl || "").toLowerCase();
    return (
      p.kind === "openai" &&
      p.apiKey &&
      base &&
      (base.includes("dashscope") || base.includes("aliyuncs.com") || base.includes(".maas."))
    );
  });
}

function localWhisperModel() {
  const home = os.homedir();
  const candidates = [
    process.env.HARTA_WHISPER_MODEL,
    path.join(process.cwd(), "data", "models", "ggml-medium.bin"),
    path.join(process.cwd(), "data", "models", "ggml-small.bin"),
    path.join(process.cwd(), "data", "models", "ggml-base.bin"),
    path.join(process.cwd(), "data", "models", "ggml-tiny.bin"),
    path.join(home, ".cache", "whisper", "ggml-medium.bin"),
    path.join(home, ".cache", "whisper", "ggml-small.bin"),
    path.join(home, ".cache", "whisper", "ggml-base.bin"),
    path.join(home, ".cache", "whisper", "ggml-tiny.bin"),
    path.join(home, ".opptrix", "whisper-models", "ggml-tiny.bin"),
    path.join(home, ".northa", "whisper-models", "ggml-tiny.bin"),
  ].filter(Boolean);
  return candidates.find((file) => fs.existsSync(file)) || "";
}

async function hasAudio(file) {
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=codec_type", "-of", "csv=p=0", file],
      { timeout: 30000 },
    );
    return String(stdout || "").trim() === "audio";
  } catch {
    return false;
  }
}

async function audioChunks(file, tempDir) {
  if (!(await hasAudio(file))) return [];
  const audioDir = path.join(tempDir, "audio");
  fs.mkdirSync(audioDir, { recursive: true });
  const pattern = path.join(audioDir, "chunk-%03d.wav");
  try {
    // 三分钟一段：16kHz / 单声道 / PCM 的 Base64 仍低于千问 ASR 的 10MB 限制。
    await execFileAsync(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        file,
        "-map",
        "0:a:0",
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "pcm_s16le",
        "-f",
        "segment",
        "-segment_time",
        "180",
        "-reset_timestamps",
        "1",
        pattern,
      ],
      { timeout: ASR_TIMEOUT_MS },
    );
  } catch (err) {
    if (err.code === "ENOENT") throw new Error("当前机器缺少 FFmpeg，不能抽取视频语音");
    throw new Error("视频音轨抽取失败，可能是编码不受支持或文件已损坏");
  }
  return fs
    .readdirSync(audioDir)
    .filter((name) => /^chunk-\d+\.wav$/.test(name))
    .sort()
    .map((name) => path.join(audioDir, name));
}

function cleanTranscript(value) {
  return String(value || "")
    .replace(/\[(?:BLANK_AUDIO|NO_SPEECH|MUSIC)\]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function qwenTranscribe(provider, file) {
  const base = String(provider.baseUrl || "").replace(/\/$/, "");
  const data = fs.readFileSync(file).toString("base64");
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ASR_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      signal: ctl.signal,
      headers: {
        authorization: `Bearer ${provider.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "qwen3-asr-flash",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "input_audio",
                input_audio: { data: `data:audio/wav;base64,${data}` },
              },
            ],
          },
        ],
        asr_options: { enable_itn: true },
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error?.message || `语音模型返回 ${res.status}`);
    return cleanTranscript(json.choices?.[0]?.message?.content || "");
  } finally {
    clearTimeout(timer);
  }
}

async function localTranscribe(model, file) {
  try {
    const { stdout } = await execFileAsync(
      "whisper-cli",
      ["-m", model, "-f", file, "-l", "auto", "-nt", "-np", "-t", "4"],
      { timeout: ASR_TIMEOUT_MS, maxBuffer: 12 * 1024 * 1024 },
    );
    return cleanTranscript(stdout);
  } catch (err) {
    if (err.code === "ENOENT") throw new Error("当前机器缺少 whisper-cli");
    throw new Error("本地 Whisper 没有完成语音转写");
  }
}

/**
 * 自动路由语音识别：只要配置过一个千问百炼渠道，就复用同一密钥调用
 * qwen3-asr-flash；否则使用本机 whisper.cpp。两者都不可用时返回明确警告。
 */
export async function transcribeVideo(file, tempDir) {
  const chunks = await audioChunks(file, tempDir);
  if (!chunks.length) return { text: "", engine: "", warning: "", noAudio: true };

  const qwen = qwenAsrProvider();
  if (qwen) {
    try {
      const rows = [];
      for (const chunk of chunks) rows.push(await qwenTranscribe(qwen, chunk));
      return {
        text: rows.filter(Boolean).join(" ").slice(0, 30000),
        engine: "千问 qwen3-asr-flash",
        warning: "",
        noAudio: false,
      };
    } catch (err) {
      const model = localWhisperModel();
      if (!model) {
        return { text: "", engine: "", warning: `千问语音转写失败：${err.message}`, noAudio: false };
      }
      const rows = [];
      for (const chunk of chunks) rows.push(await localTranscribe(model, chunk));
      return {
        text: rows.filter(Boolean).join(" ").slice(0, 30000),
        engine: `本地 Whisper ${path.basename(model).replace(/^ggml-|\.bin$/g, "")}`,
        warning: `千问语音转写失败，已改用本地 Whisper：${err.message}`,
        noAudio: false,
      };
    }
  }

  const model = localWhisperModel();
  if (!model) {
    return {
      text: "",
      engine: "",
      warning: "没有配置千问百炼语音接口，本机也没有找到 Whisper 模型",
      noAudio: false,
    };
  }
  const rows = [];
  for (const chunk of chunks) rows.push(await localTranscribe(model, chunk));
  return {
    text: rows.filter(Boolean).join(" ").slice(0, 30000),
    engine: `本地 Whisper ${path.basename(model).replace(/^ggml-|\.bin$/g, "")}`,
    warning: "",
    noAudio: false,
  };
}
