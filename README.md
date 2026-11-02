# teamctx

teamctx is a forwarding client for ProductNow's shared team
context. The real ProductNow server is hosted, not self-hosted:
teamctx takes MCP tool calls (or CLI calls) for searching,
reading, writing, and organising workspace documents and forwards
them to the hosted ProductNow MCP endpoint, returning whatever
that server returns. One binary serves a command-line interface
and a stdio MCP server.

The upstream endpoint is `https://api.productnow-prod.com/mcp`
(Streamable HTTP), protected by OAuth 2.0 via Auth0 with the
required scope `mcp:use`. teamctx does not run the OAuth flow
itself: you supply an access token you already hold through the
`PRODUCTNOW_ACCESS_TOKEN` environment variable, and teamctx sends
it as a Bearer credential on every forwarded call. If the variable
is missing or blank, teamctx fails with an error naming it before
any request is attempted.

This package implements 16 of the 18 enumerated upstream tools —
the labelled core subset for which the public docs publish a full
Input table. Two tools are deliberate omissions because no
complete parameter schema is published for them:
`curate_knowledge_pack` and `create_help_document`. They are not
advertised and not forwarded. Parameter types for the 16 built
tools are inferred from the Input tables in the public
documentation (the upstream tool catalogue publishes no
JSON-Schema property definitions); names, requiredness, and enum
values are as published.

## Install

```bash
npx @reneturcios/teamctx call search '{"query":"pricing"}'
```

Or run the container image:

```bash
docker run -i ghcr.io/cloudcorprecords/teamctx
```

The container defaults to the MCP server (see below). Pass CLI
arguments to use it as a CLI instead.

## CLI

The CLI uses one generic subcommand rather than a subcommand per
tool, because every tool takes a JSON-object argument set:

```bash
teamctx call <tool> [json-args]
teamctx call search '{"query":"pricing","resultType":"documents"}'
teamctx call fetch '{"documentId":"doc_123"}'
teamctx call fetch_folder '{}'
teamctx call remember '{"content":"We ship on Fridays."}'

teamctx --version
```

`json-args` must be a single JSON object when given; invalid JSON,
a non-object value, an unknown tool, or extra arguments are usage
errors (exit 2) and are rejected before any credential check.
Runtime failures — including a missing `PRODUCTNOW_ACCESS_TOKEN`
or an upstream error — exit 1. Success exits 0 and prints the
upstream result as JSON.

## MCP server

One bin serves both faces. The `mcp` subcommand starts a stdio
MCP server:

```bash
npx -y @reneturcios/teamctx mcp
```

MCP client configuration:

```json
{
  "mcpServers": {
    "teamctx": {
      "command": "npx",
      "args": ["-y", "@reneturcios/teamctx", "mcp"],
      "env": {
        "PRODUCTNOW_ACCESS_TOKEN": "<your ProductNow access token>"
      }
    }
  }
}
```

### Tools

| Tool | Required inputs | What it does |
| --- | --- | --- |
| `search` | — (`query` required for folder search) | Search shared context or ProductNow help for evidence excerpts with citations, or search folder names. |
| `fetch` | `documentId` | Read one document: full text, sections, comment threads, folder, canonical URL. |
| `fetch_folder` | — | List a folder or the warehouse root, optionally as a nested tree (`deep`). |
| `list_document_versions` | `documentId` | List every version of a document, newest first; optional version-status filter. |
| `get_status` | `documentId` | Report whether a document's draft agent is `running` or `idle`. |
| `remember` | `content` | Store one fact, decision, or note in the right document/folder. |
| `create_document` | `name`, `prompt` | Create a document, file it in a folder, and generate content with AI. |
| `edit_document` | `documentId`, `message` | Hand editing instructions to the document's own editing agent. |
| `update_document_status` | `documentId`, `status` | Promote the current draft with an action verb: `snapshot`, `review`, or `publish`. |
| `create_folder` | `name` | Create a folder, optionally under a parent folder. |
| `move` | `ids` | Move documents and folders, several at once, into one folder or the root. |
| `rename` | `id`, `name` | Change one document's or folder's name. |
| `archive` | `ids` | Archive documents and folders, several at once; nothing is deleted. |
| `comment_on_document` | `documentId`, `comment` | Comment on a document's current review version, optionally anchored to quoted text. |
| `reply_to_thread` | `threadId`, `message` | Reply to an existing comment thread. |
| `upload_media` | `fileName`, `mimeType` | Allocate a signed upload URL (valid 5 minutes) for image/video media. |

Notes on the less obvious rules, as documented upstream:
`search` defaults to the `workspace` scope and `documents` result
type; creator and date filters combine as documented in the tool
schema. `list_document_versions` filters by *version* statuses
(`DRAFT` … `ARCHIVED`), while `update_document_status` takes
*action verbs* (`snapshot` / `review` / `publish`) — do not mix
them up. `create_document`'s `folderId` is required in practice:
omit it only for the warehouse root.

## Development

```bash
npm install
npm run build   # tsc -> dist/
npm test        # node test runner over test/*.test.ts, no network (fake fetch only)
npm run dev     # run the CLI from source via tsx
```

## License

MIT — see `LICENSE`.
