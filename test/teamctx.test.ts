import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ACCESS_TOKEN_ENV,
  callTool,
  ENDPOINT,
  isToolName,
  parseUpstreamBody,
  requireAccessToken,
  TOOL_NAMES,
  VERSION,
} from "../src/teamctx.js";
import type { FetchFn } from "../src/types.js";

function fakeFetch(
  handler: (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => {
    ok?: boolean;
    status?: number;
    statusText?: string;
    body: string;
  },
  calls: Array<{ url: string; init?: { method?: string; headers?: Record<string, string>; body?: string } }> = [],
): FetchFn {
  return async (url, init) => {
    calls.push({ url, init });
    const r = handler(url, init);
    return {
      ok: r.ok ?? true,
      status: r.status ?? 200,
      statusText: r.statusText ?? "",
      text: async () => r.body,
    };
  };
}

const okResult = (result: unknown) => ({
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, result }),
});

describe("identity", () => {
  it("exposes VERSION 0.1.0, the documented endpoint and env var", () => {
    assert.equal(VERSION, "0.1.0");
    assert.equal(ENDPOINT, "https://api.productnow-prod.com/mcp");
    assert.equal(ACCESS_TOKEN_ENV, "PRODUCTNOW_ACCESS_TOKEN");
  });

  it("lists exactly the 16 buildable tools, omitting the two labelled omissions", () => {
    assert.equal(TOOL_NAMES.length, 16);
    assert.ok(isToolName("search"));
    assert.ok(isToolName("upload_media"));
    assert.equal(isToolName("curate_knowledge_pack"), false);
    assert.equal(isToolName("create_help_document"), false);
  });
});

describe("requireAccessToken", () => {
  it("returns an explicit token, then the env token", () => {
    assert.equal(requireAccessToken({ accessToken: " tok " }), "tok");
    assert.equal(requireAccessToken({ env: { PRODUCTNOW_ACCESS_TOKEN: "envtok" } }), "envtok");
    assert.equal(
      requireAccessToken({ accessToken: "direct", env: { PRODUCTNOW_ACCESS_TOKEN: "envtok" } }),
      "direct",
    );
  });

  it("fails naming PRODUCTNOW_ACCESS_TOKEN when missing or blank", () => {
    assert.throws(() => requireAccessToken({ env: {} }), /PRODUCTNOW_ACCESS_TOKEN is not set/);
    assert.throws(
      () => requireAccessToken({ accessToken: "  ", env: { PRODUCTNOW_ACCESS_TOKEN: " " } }),
      /PRODUCTNOW_ACCESS_TOKEN/,
    );
  });
});

describe("callTool forwarding", () => {
  it("posts a JSON-RPC tools/call with the Bearer token and returns the result", async () => {
    const calls: Array<{ url: string; init?: { headers?: Record<string, string>; body?: string } }> = [];
    const fetchFn = fakeFetch(() => okResult({ content: [{ type: "text", text: "hi" }] }), calls);
    const out = await callTool("search", { query: "pricing" }, { accessToken: "tok123", fetchFn });
    assert.deepEqual(out, { content: [{ type: "text", text: "hi" }] });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, ENDPOINT);
    assert.equal(calls[0].init?.headers?.Authorization, "Bearer tok123");
    const sent = JSON.parse(calls[0].init?.body ?? "{}");
    assert.equal(sent.jsonrpc, "2.0");
    assert.equal(sent.method, "tools/call");
    assert.equal(sent.params.name, "search");
    assert.deepEqual(sent.params.arguments, { query: "pricing" });
  });

  it("fails naming the env var BEFORE any request when the token is missing", async () => {
    const calls: Array<unknown> = [];
    const fetchFn = fakeFetch(() => okResult({}), calls as never[]);
    await assert.rejects(
      () => callTool("fetch", { documentId: "d1" }, { env: {}, fetchFn }),
      /PRODUCTNOW_ACCESS_TOKEN is not set/,
    );
    assert.equal(calls.length, 0);
  });

  it("rejects unknown and omitted tools before any request", async () => {
    const calls: Array<unknown> = [];
    const fetchFn = fakeFetch(() => okResult({}), calls as never[]);
    await assert.rejects(
      () => callTool("curate_knowledge_pack", {}, { accessToken: "t", fetchFn }),
      /Unknown tool: curate_knowledge_pack/,
    );
    await assert.rejects(
      () => callTool("create_help_document", {}, { accessToken: "t", fetchFn }),
      /Unknown tool: create_help_document/,
    );
    assert.equal(calls.length, 0);
  });

  it("surfaces an upstream HTTP error with its status", async () => {
    const fetchFn = fakeFetch(() => ({ ok: false, status: 401, statusText: "Unauthorized", body: "no auth" }));
    await assert.rejects(
      () => callTool("get_status", { documentId: "d1" }, { accessToken: "t", fetchFn }),
      /HTTP 401 Unauthorized: no auth/,
    );
  });

  it("surfaces a JSON-RPC error from the upstream", async () => {
    const fetchFn = fakeFetch(() => ({
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32602, message: "bad args" } }),
    }));
    await assert.rejects(
      () => callTool("fetch", { documentId: "d1" }, { accessToken: "t", fetchFn }),
      /returned an error: bad args/,
    );
  });

  it("wraps a network failure instead of fabricating a result", async () => {
    const fetchFn: FetchFn = async () => {
      throw new Error("socket hang up");
    };
    await assert.rejects(
      () => callTool("fetch", { documentId: "d1" }, { accessToken: "t", fetchFn }),
      /failed: socket hang up/,
    );
  });

  it("parses an SSE-framed upstream response", async () => {
    const sse =
      "event: message\ndata: " +
      JSON.stringify({ jsonrpc: "2.0", id: 1, result: { uploadUrl: "https://example.invalid/u" } }) +
      "\n\n";
    const fetchFn = fakeFetch(() => ({ body: sse }));
    const out = await callTool(
      "upload_media",
      { fileName: "a.png", mimeType: "image/png" },
      { accessToken: "t", fetchFn },
    );
    assert.deepEqual(out, { uploadUrl: "https://example.invalid/u" });
  });

  it("forwards every documented tool name", async () => {
    for (const name of TOOL_NAMES) {
      const fetchFn = fakeFetch(() => okResult({ forwarded: name }));
      const out = await callTool(name, {}, { accessToken: "t", fetchFn });
      assert.deepEqual(out, { forwarded: name });
    }
  });
});

describe("parseUpstreamBody", () => {
  it("parses plain JSON and rejects empty / non-JSON bodies", () => {
    assert.deepEqual(parseUpstreamBody('{"result":1}'), { result: 1 });
    assert.throws(() => parseUpstreamBody("  "), /empty response/);
    assert.throws(() => parseUpstreamBody("not json at all"), /non-JSON response/);
  });
});
