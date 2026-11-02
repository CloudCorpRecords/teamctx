/**
 * teamctx MCP server. Tools: the 16 buildable ProductNow tools.
 *
 * Why the low-level Server instead of McpServer: the high-level
 * helper converts zod schemas to JSON Schema and injects keys that
 * are not in this tool's public spec ("$schema" and
 * "additionalProperties"), which breaks exact tool-list/schema
 * parity with the spec. This file serves tools/list with the
 * spec's exact input schemas as explicit literals, while zod still
 * validates every tools/call argument set.
 *
 * Every call is forwarded to the hosted ProductNow MCP endpoint
 * (https://api.productnow-prod.com/mcp) with the caller's token
 * from PRODUCTNOW_ACCESS_TOKEN. Two enumerated upstream tools are
 * labelled omissions (no complete published schema) and are not
 * advertised: curate_knowledge_pack, create_help_document.
 * Parameter types are inferred from the docs Input tables.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { callTool, VERSION } from "./teamctx.js";

const SearchArgs = z.object({
  query: z.string().optional(),
  searchScope: z.enum(["workspace", "product_help"]).optional(),
  folderId: z.string().optional(),
  resultType: z.enum(["documents", "folders"]).optional(),
  creatorNames: z.array(z.string()).optional(),
  updatedAfter: z.string().optional(),
  updatedBefore: z.string().optional(),
}).superRefine((v, ctx) => {
  if (v.resultType === "folders" && !v.query) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "query is required when resultType is folders", path: ["query"] });
  }
  if (v.updatedAfter && v.updatedBefore && v.updatedBefore < v.updatedAfter) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "updatedBefore must be >= updatedAfter", path: ["updatedBefore"] });
  }
});
const FetchArgs = z.object({
  documentId: z.string().min(1),
  documentVersionId: z.string().optional(),
});
const FetchFolderArgs = z.object({
  folderId: z.string().optional(),
  deep: z.boolean().optional(),
}).superRefine((v, ctx) => {
  if (v.deep && !v.folderId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "deep is rejected when listing the root (folderId is required)", path: ["deep"] });
  }
});
const ListVersionsArgs = z.object({
  documentId: z.string().min(1),
  status: z.enum(["DRAFT", "REVIEW", "PUBLISHED", "SNAPSHOT", "OUTDATED", "ARCHIVED"]).optional(),
});
const GetStatusArgs = z.object({ documentId: z.string().min(1) });
const RememberArgs = z.object({
  content: z.string().min(1),
  hint: z.string().optional(),
});
const CreateDocumentArgs = z.object({
  name: z.string().min(1),
  prompt: z.string().min(1),
  context: z.string().optional(),
  folderId: z.string().optional(),
  templateId: z.string().optional(),
});
const EditDocumentArgs = z.object({
  documentId: z.string().min(1),
  message: z.string().min(1),
});
const UpdateStatusArgs = z.object({
  documentId: z.string().min(1),
  status: z.enum(["snapshot", "review", "publish"]),
});
const CreateFolderArgs = z.object({
  name: z.string().min(1),
  parentFolderId: z.string().optional(),
});
const MoveArgs = z.object({
  ids: z.array(z.string()).min(1),
  parentFolderId: z.string().optional(),
});
const RenameArgs = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});
const ArchiveArgs = z.object({ ids: z.array(z.string()).min(1) });
const CommentArgs = z.object({
  documentId: z.string().min(1),
  comment: z.string().min(1),
  quotedText: z.string().optional(),
});
const ReplyArgs = z.object({
  threadId: z.string().min(1),
  message: z.string().min(1),
});
const UploadMediaArgs = z.object({
  fileName: z.string().min(1),
  mimeType: z.enum(["image/png", "image/jpeg", "image/gif", "image/webp", "video/mp4", "video/webm", "video/quicktime"]),
});

const SCHEMAS: Record<string, z.ZodTypeAny> = {
  search: SearchArgs,
  fetch: FetchArgs,
  fetch_folder: FetchFolderArgs,
  list_document_versions: ListVersionsArgs,
  get_status: GetStatusArgs,
  remember: RememberArgs,
  create_document: CreateDocumentArgs,
  edit_document: EditDocumentArgs,
  update_document_status: UpdateStatusArgs,
  create_folder: CreateFolderArgs,
  move: MoveArgs,
  rename: RenameArgs,
  archive: ArchiveArgs,
  comment_on_document: CommentArgs,
  reply_to_thread: ReplyArgs,
  upload_media: UploadMediaArgs,
};

const TOOLS = [
  {
    name: "search",
    description: "Search the company's shared context (or ProductNow help via the product_help scope) for query-focused evidence excerpts with citations, or search folder names with resultType folders.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search query text." },
        searchScope: { type: "string", enum: ["workspace", "product_help"], description: "Where to search: the shared workspace or ProductNow help." },
        folderId: { type: "string", description: "Id of the folder; omit to use the root." },
        resultType: { type: "string", enum: ["documents", "folders"], description: "Restrict results to documents or folders." },
        creatorNames: { type: "array", items: { type: "string" }, description: "Only include items created by these people." },
        updatedAfter: { type: "string", description: "Only include items updated at or after this time." },
        updatedBefore: { type: "string", description: "Only include items updated at or before this time." },
      },
    },
  },
  {
    name: "fetch",
    description: "Read one document by id: full text, sections, comment threads, folder, and canonical URL.",
    inputSchema: {
      type: "object" as const,
      properties: {
        documentId: { type: "string", description: "Id of the document." },
        documentVersionId: { type: "string", description: "Id of a specific version to read; omit for the current version." },
      },
      required: ["documentId"],
    },
  },
  {
    name: "fetch_folder",
    description: "List a folder or the warehouse root, optionally as a nested tree.",
    inputSchema: {
      type: "object" as const,
      properties: {
        folderId: { type: "string", description: "Id of the folder; omit to use the root." },
        deep: { type: "boolean", description: "When true, return the folder as a nested tree including descendants." },
      },
    },
  },
  {
    name: "list_document_versions",
    description: "List every version of a document, newest first.",
    inputSchema: {
      type: "object" as const,
      properties: {
        documentId: { type: "string", description: "Id of the document." },
        status: { type: "string", enum: ["DRAFT", "REVIEW", "PUBLISHED", "SNAPSHOT", "OUTDATED", "ARCHIVED"], description: "Only list versions with this status." },
      },
      required: ["documentId"],
    },
  },
  {
    name: "get_status",
    description: "Report whether a document's draft agent is still running an edit or is idle.",
    inputSchema: {
      type: "object" as const,
      properties: {
        documentId: { type: "string", description: "Id of the document." },
      },
      required: ["documentId"],
    },
  },
  {
    name: "remember",
    description: "Store one fact, decision, or note; ProductNow searches the warehouse, edits the covering document, or creates a new one in the right folder.",
    inputSchema: {
      type: "object" as const,
      properties: {
        content: { type: "string", description: "The fact, decision, or note to store." },
        hint: { type: "string", description: "Optional hint about where the content belongs." },
      },
      required: ["content"],
    },
  },
  {
    name: "create_document",
    description: "Create a new document, file it in a folder, and generate content with AI.",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Name for the new document." },
        prompt: { type: "string", description: "Prompt describing the content to generate." },
        context: { type: "string", description: "Additional context for content generation." },
        folderId: { type: "string", description: "Id of the folder; omit to use the root." },
        templateId: { type: "string", description: "Id of a template to base the document on." },
      },
      required: ["name", "prompt"],
    },
  },
  {
    name: "edit_document",
    description: "Hand editing instructions to the document's own editing agent; the only tool that changes document content.",
    inputSchema: {
      type: "object" as const,
      properties: {
        documentId: { type: "string", description: "Id of the document." },
        message: { type: "string", description: "Editing instructions for the document's editing agent." },
      },
      required: ["documentId", "message"],
    },
  },
  {
    name: "update_document_status",
    description: "Promote the current draft with an action verb; each action leaves a fresh draft.",
    inputSchema: {
      type: "object" as const,
      properties: {
        documentId: { type: "string", description: "Id of the document." },
        status: { type: "string", enum: ["snapshot", "review", "publish"], description: "Promotion action to apply: snapshot, review, or publish." },
      },
      required: ["documentId", "status"],
    },
  },
  {
    name: "create_folder",
    description: "Create a folder only when no existing folder fits.",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Name for the new folder." },
        parentFolderId: { type: "string", description: "Id of the folder to place items under; omit for the root." },
      },
      required: ["name"],
    },
  },
  {
    name: "move",
    description: "Move documents and folders, several at once, into one folder or the root.",
    inputSchema: {
      type: "object" as const,
      properties: {
        ids: { type: "array", items: { type: "string" }, description: "Ids of the documents and folders to move." },
        parentFolderId: { type: "string", description: "Id of the folder to place items under; omit for the root." },
      },
      required: ["ids"],
    },
  },
  {
    name: "rename",
    description: "Change one document's or folder's name.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Id of the document or folder to rename." },
        name: { type: "string", description: "The new name." },
      },
      required: ["id", "name"],
    },
  },
  {
    name: "archive",
    description: "Archive documents and folders, several at once; archiving a folder also archives contents the user can manage; nothing is deleted.",
    inputSchema: {
      type: "object" as const,
      properties: {
        ids: { type: "array", items: { type: "string" }, description: "Ids of the documents and folders to archive." },
      },
      required: ["ids"],
    },
  },
  {
    name: "comment_on_document",
    description: "Leave a comment on a document's current review version, posted as the user's personal agent.",
    inputSchema: {
      type: "object" as const,
      properties: {
        documentId: { type: "string", description: "Id of the document." },
        comment: { type: "string", description: "The comment text." },
        quotedText: { type: "string", description: "Document text the comment quotes or anchors to." },
      },
      required: ["documentId", "comment"],
    },
  },
  {
    name: "reply_to_thread",
    description: "Reply to an existing comment thread as the user's personal agent.",
    inputSchema: {
      type: "object" as const,
      properties: {
        threadId: { type: "string", description: "Id of the comment thread to reply to." },
        message: { type: "string", description: "The reply text." },
      },
      required: ["threadId", "message"],
    },
  },
  {
    name: "upload_media",
    description: "Allocate a signed upload URL (valid 5 minutes) for ProductNow-hosted image/video media.",
    inputSchema: {
      type: "object" as const,
      properties: {
        fileName: { type: "string", description: "Name of the media file to upload." },
        mimeType: { type: "string", enum: ["image/png", "image/jpeg", "image/gif", "image/webp", "video/mp4", "video/webm", "video/quicktime"], description: "MIME type of the media file." },
      },
      required: ["fileName", "mimeType"],
    },
  },
];

function textResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

function errorResult(err: unknown) {
  return {
    content: [
      { type: "text" as const, text: err instanceof Error ? err.message : String(err) },
    ],
    isError: true,
  };
}

const server = new Server(
  { name: "teamctx", version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    const schema = SCHEMAS[name];
    if (!schema) {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
    const parsed = schema.parse(args ?? {}) as Record<string, unknown>;
    const out: unknown = await callTool(name, parsed);
    if (
      out !== null &&
      typeof out === "object" &&
      Array.isArray((out as { content?: unknown }).content)
    ) {
      return out as ReturnType<typeof textResult>;
    }
    return textResult(out);
  } catch (err) {
    if (err instanceof McpError) throw err;
    return errorResult(err);
  }
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}

void main();
