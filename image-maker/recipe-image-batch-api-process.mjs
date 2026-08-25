#!/usr/bin/env node

/**
 * Submit an OpenAI image-generation Batch API JSONL file, wait for completion,
 * decode the returned base64 images, and write a reproducibility manifest.
 *
 * Requirements:
 *   Node.js 20+
 *   npm install openai
 *   export OPENAI_API_KEY="..."
 *
 * Usage:
 *   node recipe-image-batch.mjs recipes.jsonl
 *   node recipe-image-batch.mjs recipes.jsonl --out images/recipes
 *
 * custom_id convention:
 *   banana-pudding__modernist-v1__attempt-1
 *
 * Re-run the same command to resume a submitted batch. Use --overwrite only
 * when replacing existing image files is intentional.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import process from "node:process";
import OpenAI from "openai";

const TERMINAL_STATUSES = new Set([
  "completed",
  "failed",
  "expired",
  "cancelled",
]);

function usage(exitCode = 0) {
  const stream = exitCode === 0 ? process.stdout : process.stderr;
  stream.write(`Usage:
  node recipe-image-batch.mjs <recipes.jsonl> [options]

Options:
  --out <directory>       Image output directory (default: images/recipes)
  --manifest <file>       Manifest path (default: <out>/manifest.json)
  --state <file>          Resume-state path (default: <out>/.batch-state.json)
  --poll-seconds <n>      Poll interval (default: 15)
  --overwrite             Replace image files that already exist
  --help                  Show this help
`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const args = [...argv];
  if (args.includes("--help")) usage(0);

  const options = {
    input: null,
    out: "images/recipes",
    manifest: null,
    state: null,
    pollSeconds: 15,
    overwrite: false,
  };

  while (args.length) {
    const arg = args.shift();

    if (arg === "--out") {
      options.out = requireValue(arg, args.shift());
    } else if (arg === "--manifest") {
      options.manifest = requireValue(arg, args.shift());
    } else if (arg === "--state") {
      options.state = requireValue(arg, args.shift());
    } else if (arg === "--poll-seconds") {
      options.pollSeconds = Number(requireValue(arg, args.shift()));

      if (
        !Number.isFinite(options.pollSeconds) ||
        options.pollSeconds < 1
      ) {
        throw new Error(
          "--poll-seconds must be a number greater than or equal to 1",
        );
      }
    } else if (arg === "--overwrite") {
      options.overwrite = true;
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (!options.input) {
      options.input = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }

  if (!options.input) usage(1);

  options.input = path.resolve(options.input);
  options.out = path.resolve(options.out);
  options.manifest = path.resolve(
    options.manifest ?? path.join(options.out, "manifest.json"),
  );
  options.state = path.resolve(
    options.state ?? path.join(options.out, ".batch-state.json"),
  );

  return options;
}

function requireValue(option, value) {
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} requires a value`);
  }

  return value;
}

function readJsonl(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "");

  if (lines.length === 0) {
    throw new Error(`${filePath} contains no requests`);
  }

  const seenIds = new Set();

  return lines.map((line, index) => {
    let request;

    try {
      request = JSON.parse(line);
    } catch (error) {
      throw new Error(
        `Invalid JSON on line ${index + 1}: ${error.message}`,
      );
    }

    if (
      !request.custom_id ||
      typeof request.custom_id !== "string"
    ) {
      throw new Error(
        `Line ${index + 1} must contain a string custom_id`,
      );
    }

    if (seenIds.has(request.custom_id)) {
      throw new Error(
        `Duplicate custom_id: ${request.custom_id}`,
      );
    }

    seenIds.add(request.custom_id);

    if (
      request.method !== "POST" ||
      request.url !== "/v1/images/generations"
    ) {
      throw new Error(
        `Line ${index + 1} must POST to /v1/images/generations`,
      );
    }

    if (!request.body?.model || !request.body?.prompt) {
      throw new Error(
        `Line ${index + 1} must include body.model and body.prompt`,
      );
    }

    return request;
  });
}

function sha256(value) {
  return crypto
    .createHash("sha256")
    .update(value)
    .digest("hex");
}

function parseCustomId(customId) {
  const match = /^(.*?)__(.*?)__attempt-(\d+)$/.exec(customId);

  if (!match) {
    return {
      recipeId: customId,
      promptVersion: null,
      attempt: 1,
    };
  }

  return {
    recipeId: match[1],
    promptVersion: match[2],
    attempt: Number(match[3]),
  };
}

function safeSlug(value) {
  const slug = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!slug) {
    throw new Error(
      `custom_id does not produce a safe filename: ${value}`,
    );
  }

  return slug;
}

function extensionFor(format) {
  const normalized = (format ?? "png").toLowerCase();

  if (normalized === "jpg") return "jpg";

  if (["png", "webp", "jpeg"].includes(normalized)) {
    return normalized;
  }

  throw new Error(
    `Unsupported output_format in input JSONL: ${format}`,
  );
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), {
    recursive: true,
  });

  const temporary = `${filePath}.${process.pid}.tmp`;

  fs.writeFileSync(
    temporary,
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );

  fs.renameSync(temporary, filePath);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadState(statePath, inputHash) {
  if (!fs.existsSync(statePath)) return null;

  const state = JSON.parse(
    fs.readFileSync(statePath, "utf8"),
  );

  if (state.input_sha256 !== inputHash) {
    throw new Error(
      `Resume state ${statePath} belongs to different input content. ` +
        "Remove or rename the state file before submitting a new batch.",
    );
  }

  if (!state.batch_id) {
    throw new Error(`Invalid resume state: ${statePath}`);
  }

  return state;
}

async function submitOrResume(
  client,
  options,
  inputHash,
) {
  const existing = loadState(
    options.state,
    inputHash,
  );

  if (existing) {
    console.log(
      `Resuming batch ${existing.batch_id}`,
    );

    return existing.batch_id;
  }

  console.log(
    `Uploading ${path.basename(options.input)}...`,
  );

  const uploaded = await client.files.create({
    file: fs.createReadStream(options.input),
    purpose: "batch",
  });

  console.log(
    "Creating image-generation batch...",
  );

  const batch = await client.batches.create({
    input_file_id: uploaded.id,
    endpoint: "/v1/images/generations",
    completion_window: "24h",
    metadata: {
      workload: "recipe-header-images",
    },
  });

  writeJsonAtomic(options.state, {
    input_file: options.input,
    input_sha256: inputHash,
    uploaded_file_id: uploaded.id,
    batch_id: batch.id,
    created_at: new Date().toISOString(),
  });

  console.log(
    `Submitted batch ${batch.id}`,
  );

  return batch.id;
}

async function waitForBatch(
  client,
  batchId,
  pollSeconds,
) {
  let previous = "";

  while (true) {
    const batch = await client.batches.retrieve(
      batchId,
    );

    const counts = batch.request_counts;

    const summary = counts
      ? `${batch.status}: ${counts.completed}/${counts.total} completed, ${counts.failed} failed`
      : batch.status;

    if (summary !== previous) {
      console.log(summary);
      previous = summary;
    }

    if (TERMINAL_STATUSES.has(batch.status)) {
      return batch;
    }

    await sleep(pollSeconds * 1000);
  }
}

async function downloadTextFile(
  client,
  fileId,
) {
  if (!fileId) return "";

  const response = await client.files.content(
    fileId,
  );

  return response.text();
}

function parseResultLines(text, label) {
  if (!text.trim()) return [];

  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(
          `Invalid JSON in ${label}, line ${index + 1}: ${error.message}`,
        );
      }
    });
}

function makeBaseManifest(request) {
  const parsed = parseCustomId(
    request.custom_id,
  );

  return {
    recipe_id: parsed.recipeId,
    custom_id: request.custom_id,
    filename: null,
    model: request.body.model,
    quality: request.body.quality ?? "auto",
    size: request.body.size ?? "auto",
    output_format:
      request.body.output_format ?? "png",
    prompt_version: parsed.promptVersion,
    attempt: parsed.attempt,
    status: "pending",
    prompt_sha256: sha256(
      request.body.prompt,
    ),
    prompt: request.body.prompt,
    error: null,
  };
}

function chooseOutputPath(
  outDir,
  recipeId,
  extension,
  imageIndex,
  overwrite,
) {
  const suffix =
    imageIndex === 0
      ? ""
      : `-${imageIndex + 1}`;

  const filename =
    `${safeSlug(recipeId)}${suffix}.${extension}`;

  const outputPath = path.join(
    outDir,
    filename,
  );

  if (
    !overwrite &&
    fs.existsSync(outputPath)
  ) {
    throw new Error(
      `Refusing to overwrite ${outputPath}. ` +
        "Pass --overwrite if replacement is intentional.",
    );
  }

  return {
    filename,
    outputPath,
  };
}

function processResults(
  requests,
  outputRows,
  errorRows,
  options,
  batch,
) {
  const requestsById = new Map(
    requests.map((request) => [
      request.custom_id,
      request,
    ]),
  );

  const rowsById = new Map();

  for (const row of [
    ...outputRows,
    ...errorRows,
  ]) {
    rowsById.set(row.custom_id, row);
  }

  fs.mkdirSync(options.out, {
    recursive: true,
  });

  const manifest = [];

  for (const request of requests) {
    const entry = makeBaseManifest(request);
    const row = rowsById.get(
      request.custom_id,
    );

    if (!row) {
      entry.status = "missing";
      entry.error =
        `No result row was returned; batch status was ${batch.status}`;

      manifest.push(entry);
      continue;
    }

    const statusCode =
      row.response?.status_code;

    if (
      row.error ||
      statusCode !== 200
    ) {
      entry.status = "failed";
      entry.error =
        row.error ??
        row.response?.body?.error ?? {
          message:
            `Unexpected HTTP status ${statusCode}`,
        };

      manifest.push(entry);
      continue;
    }

    const images =
      row.response?.body?.data;

    if (
      !Array.isArray(images) ||
      images.length === 0
    ) {
      entry.status = "failed";
      entry.error = {
        message:
          "Successful response contained no image data",
      };

      manifest.push(entry);
      continue;
    }

    const extension = extensionFor(
      request.body.output_format,
    );

    const writtenFiles = [];

    for (
      const [imageIndex, image] of
      images.entries()
    ) {
      if (!image.b64_json) {
        entry.status = "failed";
        entry.error = {
          message:
            `Image ${imageIndex + 1} contained no b64_json`,
        };

        break;
      }

      const destination =
        chooseOutputPath(
          options.out,
          entry.recipe_id,
          extension,
          imageIndex,
          options.overwrite,
        );

      fs.writeFileSync(
        destination.outputPath,
        Buffer.from(
          image.b64_json,
          "base64",
        ),
      );

      writtenFiles.push(
        destination.filename,
      );
    }

    if (entry.status !== "failed") {
      entry.filename =
        writtenFiles.length === 1
          ? writtenFiles[0]
          : writtenFiles;

      // Generated means the API succeeded;
      // visual acceptance remains a human
      // QA decision.
      entry.status = "generated";
    }

    manifest.push(entry);
  }

  // Flag any result whose custom_id was
  // not present in the submitted local file.
  for (const customId of rowsById.keys()) {
    if (!requestsById.has(customId)) {
      console.warn(
        `Ignoring unexpected result custom_id: ${customId}`,
      );
    }
  }

  return manifest;
}

async function main() {
  const options = parseArgs(
    process.argv.slice(2),
  );

  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY is not set",
    );
  }

  if (!fs.existsSync(options.input)) {
    throw new Error(
      `Input file not found: ${options.input}`,
    );
  }

  const requests = readJsonl(
    options.input,
  );

  const inputHash = sha256(
    fs.readFileSync(options.input),
  );

  fs.mkdirSync(options.out, {
    recursive: true,
  });

  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const batchId = await submitOrResume(
    client,
    options,
    inputHash,
  );

  const batch = await waitForBatch(
    client,
    batchId,
    options.pollSeconds,
  );

  const [outputText, errorText] =
    await Promise.all([
      downloadTextFile(
        client,
        batch.output_file_id,
      ),
      downloadTextFile(
        client,
        batch.error_file_id,
      ),
    ]);

  const outputRows = parseResultLines(
    outputText,
    "batch output",
  );

  const errorRows = parseResultLines(
    errorText,
    "batch error output",
  );

  const manifest = processResults(
    requests,
    outputRows,
    errorRows,
    options,
    batch,
  );

  const summary = {
    batch_id: batch.id,
    batch_status: batch.status,
    input_file: options.input,
    input_sha256: inputHash,
    generated_at:
      new Date().toISOString(),
    counts: {
      total: manifest.length,
      generated: manifest.filter(
        (item) =>
          item.status === "generated",
      ).length,
      failed: manifest.filter(
        (item) =>
          item.status === "failed",
      ).length,
      missing: manifest.filter(
        (item) =>
          item.status === "missing",
      ).length,
    },
    recipes: manifest,
  };

  writeJsonAtomic(
    options.manifest,
    summary,
  );

  console.log(
    `Manifest: ${options.manifest}`,
  );

  console.log(
    `Finished: ${summary.counts.generated} generated, ` +
      `${summary.counts.failed} failed, ` +
      `${summary.counts.missing} missing`,
  );

  if (
    summary.counts.failed ||
    summary.counts.missing ||
    batch.status !== "completed"
  ) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.stack
      : error,
  );

  process.exitCode = 1;
});
