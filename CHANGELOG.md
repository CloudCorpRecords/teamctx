# Changelog

## 0.1.0 (2026-10-27)

- Initial release.
- CLI: `teamctx call <tool> [json-args]` (a single generic
  subcommand, documented in the README), `teamctx mcp`, and
  `teamctx --version`. Usage errors exit 2 and are validated
  before any credential check; runtime errors exit 1.
- MCP server (`teamctx mcp`, stdio) with 16 tools: `search`,
  `fetch`, `fetch_folder`, `list_document_versions`, `get_status`,
  `remember`, `create_document`, `edit_document`,
  `update_document_status`, `create_folder`, `move`, `rename`,
  `archive`, `comment_on_document`, `reply_to_thread`, and
  `upload_media`.
- Forwarding client for the hosted ProductNow MCP endpoint
  (`https://api.productnow-prod.com/mcp`, Streamable HTTP,
  OAuth 2.0 via Auth0, scope `mcp:use`). The caller supplies an
  access token via `PRODUCTNOW_ACCESS_TOKEN`; a missing token is
  an honest error naming the variable, raised before any request.
  The OAuth flow itself is out of scope.
- Labelled omissions: `curate_knowledge_pack` and
  `create_help_document` are enumerated upstream but no complete
  parameter schema is published for them, so they are not built.
- Parameter types are inferred from the documentation Input
  tables (the upstream catalogue publishes no JSON-Schema
  property definitions).
- All upstream access goes through an injectable fetch, so the
  test suite runs entirely on a fake fetch with no network.
