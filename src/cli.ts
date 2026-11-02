#!/usr/bin/env node
/**
 * teamctx CLI.
 *
 *   teamctx call <tool> [json-args]
 *   teamctx mcp
 *   teamctx --version
 *
 * CLI choice: a single generic `call` subcommand (rather than one
 * subcommand per tool) because teamctx is a forwarding client for
 * 16 tools whose argument shapes are JSON objects; `call` takes the
 * tool name and an optional JSON-object argument string and forwards
 * it unchanged. Example:
 *   teamctx call search '{"query":"pricing"}'
 *   teamctx call fetch '{"documentId":"doc_123"}'
 *
 * Requires PRODUCTNOW_ACCESS_TOKEN in the environment (a ProductNow
 * access token, OAuth 2.0 via Auth0, scope mcp:use). The OAuth flow
 * itself is out of scope.
 * Exit codes: 0 success, 1 runtime error, 2 usage error.
 * Argument validation runs BEFORE any credential check.
 */
import { callTool, isToolName, TOOL_NAMES, VERSION } from "./teamctx.js";

function usage(): never {
  console.error(`Usage:
  teamctx call <tool> [json-args]
  teamctx mcp
  teamctx --version

Tools: ${TOOL_NAMES.join(", ")}
Example: teamctx call search '{"query":"pricing"}'`);
  process.exit(2);
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "--version" || cmd === "-v") {
    console.log(VERSION);
    return;
  }
  if (cmd === "mcp") {
    await import("./mcp.js");
    return;
  }
  if (cmd !== "call") usage();
  const [tool, jsonArg, ...extra] = rest;
  if (!tool || extra.length > 0) usage();
  if (!isToolName(tool)) usage();
  let args: Record<string, unknown> = {};
  if (jsonArg !== undefined) {
    try {
      const parsed: unknown = JSON.parse(jsonArg);
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) usage();
      args = parsed as Record<string, unknown>;
    } catch {
      usage();
    }
  }
  // Argument validation above happens before the credential check
  // inside callTool (missing PRODUCTNOW_ACCESS_TOKEN -> exit 1).
  try {
    const out = await callTool(tool, args);
    console.log(typeof out === "string" ? out : JSON.stringify(out, null, 2));
  } catch (err) {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

void main();
