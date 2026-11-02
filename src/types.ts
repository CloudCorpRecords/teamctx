/**
 * teamctx types.
 *
 * teamctx is a forwarding client for the hosted ProductNow MCP
 * endpoint. It defines no local document store: every tool call is
 * forwarded upstream as a JSON-RPC `tools/call` request and the
 * upstream result is returned to the caller. HTTP access is
 * described by a minimal injectable fetch surface so tests can run
 * entirely against a fake fetch with no network.
 */

/** Minimal fetch signature (compatible with the global fetch). */
export type FetchFn = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<{
  ok: boolean;
  status: number;
  statusText?: string;
  text(): Promise<string>;
  headers?: { get(name: string): string | null };
}>;

/** Options accepted by the forwarding core. */
export interface ForwardOptions {
  /** Caller-supplied ProductNow access token. */
  accessToken?: string;
  /** Injectable fetch; defaults to the global fetch. */
  fetchFn?: FetchFn;
  /** Upstream endpoint override (tests / staging); defaults to ENDPOINT. */
  endpoint?: string;
  /** Environment map used to resolve the access token. */
  env?: Record<string, string | undefined>;
}

export interface SearchArgs {
  query?: string;
  searchScope?: "workspace" | "product_help";
  folderId?: string;
  resultType?: "documents" | "folders";
  creatorNames?: string[];
  updatedAfter?: string;
  updatedBefore?: string;
}

export interface FetchArgs {
  documentId: string;
  documentVersionId?: string;
}

export interface FetchFolderArgs {
  folderId?: string;
  deep?: boolean;
}

export interface ListDocumentVersionsArgs {
  documentId: string;
  status?: "DRAFT" | "REVIEW" | "PUBLISHED" | "SNAPSHOT" | "OUTDATED" | "ARCHIVED";
}

export interface GetStatusArgs {
  documentId: string;
}

export interface RememberArgs {
  content: string;
  hint?: string;
}

export interface CreateDocumentArgs {
  name: string;
  prompt: string;
  context?: string;
  folderId?: string;
  templateId?: string;
}

export interface EditDocumentArgs {
  documentId: string;
  message: string;
}

export interface UpdateDocumentStatusArgs {
  documentId: string;
  status: "snapshot" | "review" | "publish";
}

export interface CreateFolderArgs {
  name: string;
  parentFolderId?: string;
}

export interface MoveArgs {
  ids: string[];
  parentFolderId?: string;
}

export interface RenameArgs {
  id: string;
  name: string;
}

export interface ArchiveArgs {
  ids: string[];
}

export interface CommentOnDocumentArgs {
  documentId: string;
  comment: string;
  quotedText?: string;
}

export interface ReplyToThreadArgs {
  threadId: string;
  message: string;
}

export interface UploadMediaArgs {
  fileName: string;
  mimeType:
    | "image/png"
    | "image/jpeg"
    | "image/gif"
    | "image/webp"
    | "video/mp4"
    | "video/webm"
    | "video/quicktime";
}
