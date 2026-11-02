/**
 * teamctx core: a forwarding client for the hosted ProductNow MCP
 * server.
 *
 * The upstream server is hosted at
 * https://api.productnow-prod.com/mcp (Streamable HTTP) and is
 * protected by OAuth 2.0 via Auth0 with required scope `mcp:use`.
 * This rebuild contains no ProductNow application code: it forwards
 * each documented tool call to that endpoint as a JSON-RPC
 * `tools/call` request, carrying the caller's access token as a
 * Bearer credential, and returns the upstream result.
 *
 * Auth: the caller supplies an access token via the
 * PRODUCTNOW_ACCESS_TOKEN environment variable. A missing or blank
 * token is an error naming that variable, raised BEFORE any request
 * is attempted. Obtaining a token (the OAuth flow itself) is out of
 * scope for this client.
 *
 * Parameter types are inferred from the Input tables in the public
 * docs/TOOLS.md (the upstream tools.json publishes no JSON-Schema
 * property definitions); names, requiredness, defaults and enum
 * values are as published. Two enumerated upstream tools are
 * labelled omissions and are NOT forwarded or advertised here
 * because no complete parameter schema is published for them:
 * curate_knowledge_pack and create_help_document.
 *
 * All HTTP goes through an injectable FetchFn so the forwarding is
 * fully testable offline with a fake fetch; tests make no live
 * network calls.
 */
import type { ForwardOptions } from "./types.js";

export const VERSION = "0.1.0";

export const ENDPOINT = "https://api.productnow-prod.com/mcp";

export const ACCESS_TOKEN_ENV = "PRODUCTNOW_ACCESS_TOKEN";

export const OAUTH_SCOPE = "mcp:use";

/** The 16 buildable tool names, in documented order. */
export const TOOL_NAMES = [
  "search",
  "fetch",
  "fetch_folder",
  "list_document_versions",
  "get_status",
  "remember",
  "create_document",
  "edit_document",
  "update_document_status",
  "create_folder",
  "move",
  "rename",
  "archive",
  "comment_on_document",
  "reply_to_thread",
  "upload_media",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export function isToolName(value: string): value is ToolName {
  return (TOOL_NAMES as readonly string[]).includes(value);
}

/** Resolve the access token, or fail naming the env var before any request. */
export function requireAccessToken(
  options: Pick<ForwardOptions, "accessToken" | "env"> = {},
): string {
  const direct =
    typeof options.accessToken === "string" ? options.accessToken.trim() : "";
  if (direct) return direct;
  const env = options.env ?? process.env;
  const fromEnv = typeof env[ACCESS_TOKEN_ENV] === "string" ? env[ACCESS_TOKEN_ENV].trim() : "";
  if (fromEnv) return fromEnv;
  throw new Error(
    `${ACCESS_TOKEN_ENV} is not set. Set ${ACCESS_TOKEN_ENV} to a ProductNow access token ` +
      `(OAuth 2.0 via Auth0, scope ${OAUTH_SCOPE}) to use teamctx.`,
  );
}

interface JsonRpcResponse {
  result?: unknown;
  error?: { code?: unknown; message?: unknown };
}

/** Extract the JSON payload from a JSON or SSE (text/event-stream) body. */
export function parseUpstreamBody(bodyText: string): JsonRpcResponse {
  const trimmed = bodyText.trim();
  if (!trimmed) throw new Error("ProductNow MCP endpoint returned an empty response");
  // Direct JSON first.
  try {
    return JSON.parse(trimmed) as JsonRpcResponse;
  } catch {
    // Fall through to SSE framing: take the last `data:` line.
  }
  const dataLines = trimmed
    .split(/\r?\n/)
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice("data:".length).trim())
    .filter(Boolean);
  for (let i = dataLines.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(dataLines[i]) as JsonRpcResponse;
    } catch {
      continue;
    }
  }
  throw new Error("ProductNow MCP endpoint returned a non-JSON response");
}

/**
 * Forward one tool call to the hosted ProductNow MCP endpoint and
 * return its `result`. Upstream HTTP errors and JSON-RPC errors are
 * surfaced as errors naming the status / message; nothing is
 * fabricated when the upstream cannot be reached.
 */
export async function callTool(
  toolName: string,
  args: Record<string, unknown>,
  options: ForwardOptions = {},
): Promise<unknown> {
  if (!isToolName(toolName)) {
    throw new Error(`Unknown tool: ${toolName}`);
  }
  const token = requireAccessToken(options);
  const endpoint = options.endpoint ?? ENDPOINT;
  const fetchFn = options.fetchFn ?? (globalThis.fetch as unknown as NonNullable<ForwardOptions["fetchFn"]>);
  if (typeof fetchFn !== "function") {
    throw new Error("No fetch implementation available to reach the ProductNow MCP endpoint");
  }
  const payload = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: toolName, arguments: args },
  };
  let response;
  try {
    response = await fetchFn(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    throw new Error(
      `ProductNow MCP request to ${endpoint} failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const bodyText = await response.text();
  if (!response.ok) {
    const detail = bodyText.trim() ? `: ${bodyText.trim().slice(0, 500)}` : "";
    throw new Error(
      `ProductNow MCP request to ${endpoint} failed: HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}${detail}`,
    );
  }
  const parsed = parseUpstreamBody(bodyText);
  if (parsed.error) {
    const msg =
      typeof parsed.error.message === "string" ? parsed.error.message : JSON.stringify(parsed.error);
    throw new Error(`ProductNow MCP tool ${toolName} returned an error: ${msg}`);
  }
  return parsed.result;
}

/** Convenience wrappers, one per documented tool. */
export const search = (args: Record<string, unknown>, o?: ForwardOptions) => callTool("search", args, o);
export const fetchDocument = (args: Record<string, unknown>, o?: ForwardOptions) => callTool("fetch", args, o);
export const fetchFolder = (args: Record<string, unknown>, o?: ForwardOptions) => callTool("fetch_folder", args, o);
export const listDocumentVersions = (args: Record<string, unknown>, o?: ForwardOptions) => callTool("list_document_versions", args, o);
export const getStatus = (args: Record<string, unknown>, o?: ForwardOptions) => callTool("get_status", args, o);
export const remember = (args: Record<string, unknown>, o?: ForwardOptions) => callTool("remember", args, o);
export const createDocument = (args: Record<string, unknown>, o?: ForwardOptions) => callTool("create_document", args, o);
export const editDocument = (args: Record<string, unknown>, o?: ForwardOptions) => callTool("edit_document", args, o);
export const updateDocumentStatus = (args: Record<string, unknown>, o?: ForwardOptions) => callTool("update_document_status", args, o);
export const createFolder = (args: Record<string, unknown>, o?: ForwardOptions) => callTool("create_folder", args, o);
export const move = (args: Record<string, unknown>, o?: ForwardOptions) => callTool("move", args, o);
export const rename = (args: Record<string, unknown>, o?: ForwardOptions) => callTool("rename", args, o);
export const archive = (args: Record<string, unknown>, o?: ForwardOptions) => callTool("archive", args, o);
export const commentOnDocument = (args: Record<string, unknown>, o?: ForwardOptions) => callTool("comment_on_document", args, o);
export const replyToThread = (args: Record<string, unknown>, o?: ForwardOptions) => callTool("reply_to_thread", args, o);
export const uploadMedia = (args: Record<string, unknown>, o?: ForwardOptions) => callTool("upload_media", args, o);

/** Extract displayable text from an upstream tools/call result, if it has MCP content. */
export function formatPayload(payload: unknown): string {
  return typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
}
