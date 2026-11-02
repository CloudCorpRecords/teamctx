# teamctx — Build Report

MCP Rebuild 1000 (Batch 9). Clean-room rebuild of
ProductNowAI/productnow-mcp (rank 502, 0★, Tier C), built from
the spec in `specs-batch9/productnow.md` (README + docs/TOOLS.md
read firsthand by the scout, 2026-10-27). The upstream repo is
public metadata/documentation for a **hosted** server — it
contains no ProductNow application or MCP server implementation —
so this rebuild is a **forwarding client** to the documented
endpoint. Local build only — nothing pushed or published.

Identity: repo `teamctx`, npm `@reneturcios/teamctx`,
MCP name `io.github.CloudCorpRecords/teamctx`, version `0.1.0`,
bin `teamctx` → `dist/cli.js`.

## Files created (19/19 per TEMPLATE.md checklist)

- `package.json` — bin `teamctx: dist/cli.js`, `mcpName` set,
  scripts build=`tsc` / dev=`tsx src/cli.ts` / test=`tsx --test test/*.test.ts`
- `server.json` — description "Shared team context for
  ProductNow: search, read, write and organise workspace
  documents." = **89 chars** (≤100 ✓); npm entry carries
  `version: 0.1.0`; OCI entry
  `ghcr.io/cloudcorprecords/teamctx:0.1.0` carries **no**
  `version` field (verified programmatically)
- `Dockerfile` — node:20-alpine two-stage, ENTRYPOINT
  `node /app/dist/cli.js`, CMD `mcp`, label
  `io.modelcontextprotocol.server.name="io.github.CloudCorpRecords/teamctx"`
- `tsconfig.json` (identical to the fleet template), `.gitignore`,
  `LICENSE` (MIT, Copyright (c) 2026 Rene Turcios), `README.md`
  (fresh text), `CHANGELOG.md` (single 0.1.0 entry, 2026-10-27)
- `src/index.ts`, `src/cli.ts` (generic `call <tool> [json-args]`,
  `mcp`, `--version`; exit 2 usage / 1 runtime), `src/mcp.ts`,
  `src/types.ts`, `src/teamctx.ts` (core logic, `VERSION = "0.1.0"`)
- `test/teamctx.test.ts`
- `.github/workflows/{ci,publish,publish-container,registry-publish}.yml`
  (from the fleet template; image name and smoke-test server name
  changed to teamctx)

## Tools implemented (16) + omissions (2)

Implemented, in documented order: `search`, `fetch`,
`fetch_folder`, `list_document_versions`, `get_status`,
`remember`, `create_document`, `edit_document`,
`update_document_status`, `create_folder`, `move`, `rename`,
`archive`, `comment_on_document`, `reply_to_thread`,
`upload_media` — the full buildable set with a published Input
table.

**Labelled omissions (enumerated upstream, NOT built):**
`curate_knowledge_pack` (feature-flagged, no Input table; prose
mentions only in passing) and `create_help_document`
(ProductNow-org only; only an optional `category` enum in prose,
no other inputs published). No schemas were invented for them;
they are not advertised in `tools/list` and the core rejects them
as unknown tools.

## Implementation notes

- `src/mcp.ts` uses the SDK's low-level `Server`
  (`sdk/server/index.js` + `StdioServerTransport`) with explicit
  inputSchema literals exactly matching the fixture, per the
  standing fleet rule: `McpServer`'s zod-to-JSON-Schema
  conversion injects `$schema` / `additionalProperties` keys
  absent from the defined spec. Zod still validates every
  `tools/call` (including conditional rules: `search.query`
  required when `resultType` is `folders`; `updatedBefore` ≥
  `updatedAfter`; `fetch_folder.deep` rejected at the root).
- Forwarding: each call is POSTed to
  `https://api.productnow-prod.com/mcp` as a JSON-RPC
  `tools/call` request with `Accept: application/json,
  text/event-stream`; both plain-JSON and SSE-framed upstream
  responses are parsed, the upstream `result` is returned (MCP
  `content` results pass through unchanged), and HTTP / JSON-RPC
  / network errors are surfaced as errors — nothing is fabricated.
- Auth: OAuth 2.0 via Auth0, required scope `mcp:use`, per the
  spec. The caller supplies an access token via
  `PRODUCTNOW_ACCESS_TOKEN`; a missing/blank token is an honest
  `isError` (MCP) / exit-1 (CLI) naming that variable, raised
  BEFORE any request. The OAuth flow itself is out of scope.
- CLI choice: a single generic `call <tool> [json-args]`
  subcommand rather than 16 per-tool subcommands, because every
  tool takes a JSON-object argument set; documented in the README
  and the CLI header. Argument validation (known tool, JSON
  parses to an object, no extras) runs before any credential
  check and exits 2.
- All upstream access goes through an injectable `FetchFn`
  (types.ts), so tests run entirely on a fake fetch with no
  network and no live claims.

## Spec ambiguities resolved

- **Parameter types are inferred.** Upstream `tools.json` has no
  JSON-Schema properties; types in the fixture and `src/mcp.ts`
  are inferred from the TOOLS.md Input tables, as the spec flags.
  Recorded in the fixture `_source` and here.
- **`search.query` requiredness is conditional** (optional for
  document search/listing, required when `resultType` is
  `folders`). The JSON schema therefore carries no `required`
  list for `search`; the conditional rule is enforced by the zod
  validator at call time.
- **`create_document.folderId`** is labelled "Required in
  practice" (omit only for the warehouse root), not a plain Yes,
  so it is **not** in the schema's `required` list
  (`["name","prompt"]`); the README records the in-practice rule.
- **Access-token env var name:** the spec names the OAuth scheme
  and scope but no env var for a pre-obtained token; this rebuild
  uses `PRODUCTNOW_ACCESS_TOKEN` (the assignment's suggested
  naming).
- **Forwarding wire format:** the spec documents the endpoint and
  Streamable HTTP transport but not a client-side request shape;
  the client forwards standard MCP JSON-RPC `tools/call` requests
  and accepts JSON or SSE responses, which is the documented
  transport's normal framing.

## Verification (foreground, exact outputs)

### 1. Typecheck and build
```
$ ./node_modules/.bin/tsc --noEmit ; echo exit=$?
exit=0
$ npm run build   # tsc -> dist/, including dist/cli.js
exit=0
```

### 2. Tests
```
$ npm test   # tsx --test test/*.test.ts
ℹ tests 13
ℹ pass 13
ℹ fail 0
```
Covers, all on a fake fetch with no network: VERSION / endpoint /
env-var identity; exactly 16 tool names with both omissions
rejected; token resolution (explicit wins over env) and the
missing-token error naming `PRODUCTNOW_ACCESS_TOKEN`; the
missing-token failure occurring BEFORE any request (zero fake
calls recorded); JSON-RPC request shaping (method, tool name,
arguments, `Authorization: Bearer …` header, documented endpoint
URL); upstream HTTP 401, JSON-RPC error, and network failure each
surfaced honestly; SSE-framed response parsing; every documented
tool name forwarding; and plain-JSON / empty / non-JSON body
parsing.

### 3. CLI / MCP smoke
`--version` → `0.1.0` (exit 0); no args and invalid JSON print
Usage and exit 2 (the invalid-JSON case proves validation runs
before the credential check); `call search '{}'` with no token
exits 1 with the error naming `PRODUCTNOW_ACCESS_TOKEN`. MCP
`initialize` / `tools/list` are exercised by the parity harness
below. No live upstream call was made or claimed: no token exists
in this VM and none was used.

### 4. Parity (harness)
```
$ python3 ~/workspace/mcp-rebuild-100/harness/parity.py \
    --original ~/workspace/mcp-rebuild-100/harness/fixtures/productnow-mcp-tools-original.json \
    --rebuild "stdio:node /home/hatch/workspace/mcp-rebuild-100/builds/teamctx/dist/cli.js mcp" \
    --out ~/workspace/mcp-rebuild-100/builds/teamctx/parity-out
verdict=PASS parity_pct=100.0 original_tools=16 rebuild_tools=16 missing=[] extra=[] schema_diffs=[]
(exit 0)
```
(parity.json: identical_tools 16/16.) Original side is tools-file
mode, so `fixture_results` records `SKIPPED-TOOLS-FILE-MODE` —
expected harness semantics, not an error.

## Lockfile status

`package-lock.json` was generated clean via Route 3: a temp copy
holding only `package.json` (no `node_modules`, no `dist`),
offline `npm install --package-lock-only --ignore-scripts
--offline`, verified after generation — parses as JSON, top-level
`name` is `@reneturcios/teamctx`, version `0.1.0`,
`lockfileVersion` 3, **128 package entries** — then only the
lockfile was copied back. Local `node_modules` is a symlink to
the sibling burnmeter build's tree, used only for the local
build/test; it is gitignored and not part of lockfile generation.

## Gaps / honest notes

- Docs-derived spec: parameter types are inferred (see above), so
  parity proves the rebuild matches this program's defined spec
  (tool names + exact input schemas as documented), not a
  hand-probed original. The live server's `tools/list` remains
  the runtime source of truth per the upstream docs themselves.
- No live upstream behaviour is proven: behaviour is proven on a
  fake fetch only, and return shapes are whatever the hosted
  server returns at call time (this client defines none locally).
- Container build not exercised locally; the publish-container
  workflow smoke-tests the image at publish time.
