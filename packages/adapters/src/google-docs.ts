import type { AdapterConfig, RawEvent, CursorState } from '@tunnlo/core';
import { getLogger } from '@tunnlo/core';
import { PollingAdapter } from '@tunnlo/adapter-sdk';

export interface GoogleDocsAdapterConfig {
  /** Google service account credentials JSON file path */
  credentials_path?: string;
  /** Or inline credentials JSON (useful for env-based config) */
  credentials_json?: string;
  /** Document IDs to watch */
  doc_ids: string[];
  /** What to watch: comments, suggestions, edits (default: all) */
  watch?: ('comments' | 'suggestions' | 'edits')[];
  /** Poll interval in ms (default: 15000) */
  poll_interval_ms?: number;
  /** Include resolved comments (default: false) */
  include_resolved?: boolean;
  /** @internal Injected Google API clients for testing */
  _docs_client?: any;
  /** @internal Injected Google API clients for testing */
  _drive_client?: any;
}

interface DocChange {
  type: 'comment' | 'suggestion' | 'edit';
  doc_id: string;
  doc_title: string;
  author: string;
  content: string;
  timestamp: string;
  context?: string;
  resolved?: boolean;
  reply_to?: string;
}

export class GoogleDocsAdapter extends PollingAdapter {
  private docs: any = null;
  private drive: any = null;
  private cfg!: GoogleDocsAdapterConfig;
  private lastPollTimestamps: Map<string, string> = new Map();
  private latestTimestamp = '';
  private watchTypes: Set<string> = new Set();
  /** Track suggestion IDs we've already emitted per doc */
  private seenSuggestionIds: Map<string, Set<string>> = new Map();

  protected async onConnect(config: AdapterConfig): Promise<void> {
    this.cfg = config.config as GoogleDocsAdapterConfig;
    this.pollIntervalMs = this.cfg.poll_interval_ms ?? 15000;

    if (!this.cfg.doc_ids || this.cfg.doc_ids.length === 0) {
      throw new Error('[tunnlo:google-docs] "doc_ids" is required in adapter config');
    }

    this.watchTypes = new Set(this.cfg.watch ?? ['comments', 'suggestions', 'edits']);

    // Allow injected clients for testing
    if (this.cfg._docs_client && this.cfg._drive_client) {
      this.docs = this.cfg._docs_client;
      this.drive = this.cfg._drive_client;
    } else {
      const googleapis = await (Function('return import("googleapis")')() as Promise<any>);
      const { google } = googleapis;

      let auth: any;

      if (this.cfg.credentials_json) {
        const creds = typeof this.cfg.credentials_json === 'string'
          ? JSON.parse(this.cfg.credentials_json)
          : this.cfg.credentials_json;
        auth = new google.auth.GoogleAuth({
          credentials: creds,
          scopes: [
            'https://www.googleapis.com/auth/documents.readonly',
            'https://www.googleapis.com/auth/drive.readonly',
          ],
        });
      } else if (this.cfg.credentials_path) {
        auth = new google.auth.GoogleAuth({
          keyFile: this.cfg.credentials_path,
          scopes: [
            'https://www.googleapis.com/auth/documents.readonly',
            'https://www.googleapis.com/auth/drive.readonly',
          ],
        });
      } else {
        // Fall back to Application Default Credentials
        auth = new google.auth.GoogleAuth({
          scopes: [
            'https://www.googleapis.com/auth/documents.readonly',
            'https://www.googleapis.com/auth/drive.readonly',
          ],
        });
      }

      this.docs = google.docs({ version: 'v1', auth });
      this.drive = google.drive({ version: 'v3', auth });
    }

    getLogger().info(`[tunnlo:google-docs] Connected, watching ${this.cfg.doc_ids.length} document(s)`);
  }

  protected async onDisconnect(): Promise<void> {
    this.docs = null;
    this.drive = null;
    this.lastPollTimestamps.clear();
    this.seenSuggestionIds.clear();
    getLogger().info('[tunnlo:google-docs] Disconnected');
  }

  protected async poll(cursor?: CursorState): Promise<RawEvent[]> {
    const events: RawEvent[] = [];
    const sinceTimestamps = this.restoreCursorTimestamps(cursor);

    for (const docId of this.cfg.doc_ids) {
      try {
        const since = sinceTimestamps.get(docId) ?? new Date(Date.now() - this.pollIntervalMs).toISOString();
        const changes = await this.pollDocument(docId, since);

        for (const change of changes) {
          events.push({
            data: JSON.stringify(change),
            received_at: new Date().toISOString(),
          });
        }

        // Track latest timestamp per doc
        if (changes.length > 0) {
          const latest = changes.reduce((a, b) =>
            a.timestamp > b.timestamp ? a : b
          );
          this.lastPollTimestamps.set(docId, latest.timestamp);
          if (latest.timestamp > this.latestTimestamp) {
            this.latestTimestamp = latest.timestamp;
          }
        } else {
          // No new changes — keep current timestamp
          if (!this.lastPollTimestamps.has(docId)) {
            this.lastPollTimestamps.set(docId, since);
          }
        }
      } catch (err) {
        getLogger().error(`[tunnlo:google-docs] Error polling doc ${docId}:`, err);
      }
    }

    return events;
  }

  protected getCursorOffset(): string | number {
    // Serialize per-doc timestamps as cursor
    const timestamps: Record<string, string> = {};
    for (const [docId, ts] of this.lastPollTimestamps) {
      timestamps[docId] = ts;
    }
    return JSON.stringify(timestamps);
  }

  private restoreCursorTimestamps(cursor?: CursorState): Map<string, string> {
    const map = new Map<string, string>();
    if (!cursor?.offset) return map;

    try {
      const parsed = JSON.parse(String(cursor.offset));
      for (const [docId, ts] of Object.entries(parsed)) {
        map.set(docId, ts as string);
      }
    } catch {
      // Invalid cursor, start fresh
    }
    return map;
  }

  private async pollDocument(docId: string, since: string): Promise<DocChange[]> {
    const changes: DocChange[] = [];
    const sinceDate = new Date(since);

    // Get full document (needed for title and suggestions)
    let docTitle = docId;
    let docData: any = null;
    try {
      const docRes = await this.docs.documents.get({
        documentId: docId,
        suggestionsViewMode: 'SUGGESTIONS_INLINE',
      });
      docData = docRes.data;
      docTitle = docData.title ?? docId;
    } catch {
      // Fall back to docId as title
    }

    // Poll comments via Drive API
    if (this.watchTypes.has('comments')) {
      const commentChanges = await this.pollComments(docId, docTitle, sinceDate);
      changes.push(...commentChanges);
    }

    // Poll suggestions from document body via Docs API
    if (this.watchTypes.has('suggestions') && docData) {
      const suggestionChanges = this.extractSuggestions(docId, docTitle, docData);
      changes.push(...suggestionChanges);
    }

    // Poll revision history for edits
    if (this.watchTypes.has('edits')) {
      const editChanges = await this.pollRevisions(docId, docTitle, sinceDate);
      changes.push(...editChanges);
    }

    return changes;
  }

  private async pollComments(docId: string, docTitle: string, since: Date): Promise<DocChange[]> {
    const changes: DocChange[] = [];

    try {
      const res = await this.drive.comments.list({
        fileId: docId,
        fields: 'comments(id,content,author,createdTime,modifiedTime,resolved,quotedFileContent,replies)',
        includeDeleted: false,
      });

      const comments = res.data.comments ?? [];

      for (const comment of comments) {
        const modifiedTime = new Date(comment.modifiedTime ?? comment.createdTime);
        if (modifiedTime <= since) continue;

        // Skip resolved unless configured to include them
        if (comment.resolved && !this.cfg.include_resolved) continue;

        changes.push({
          type: 'comment',
          doc_id: docId,
          doc_title: docTitle,
          author: comment.author?.displayName ?? 'Unknown',
          content: comment.content ?? '',
          timestamp: comment.modifiedTime ?? comment.createdTime,
          context: comment.quotedFileContent?.value,
          resolved: comment.resolved ?? false,
        });

        // Also check for new replies
        for (const reply of comment.replies ?? []) {
          const replyTime = new Date(reply.modifiedTime ?? reply.createdTime);
          if (replyTime <= since) continue;

          changes.push({
            type: 'comment',
            doc_id: docId,
            doc_title: docTitle,
            author: reply.author?.displayName ?? 'Unknown',
            content: reply.content ?? '',
            timestamp: reply.modifiedTime ?? reply.createdTime,
            reply_to: comment.content,
          });
        }
      }
    } catch (err) {
      getLogger().error(`[tunnlo:google-docs] Error fetching comments for ${docId}:`, err);
    }

    return changes;
  }

  /**
   * Extract suggestions from the Docs API document body.
   * Suggestions in Google Docs are inline edits tracked via suggestedInsertionIds
   * and suggestedDeletionIds on text runs, plus suggestedChanges on the document.
   * We track seen IDs to only emit new ones.
   */
  private extractSuggestions(docId: string, docTitle: string, docData: any): DocChange[] {
    const changes: DocChange[] = [];
    const now = new Date().toISOString();

    if (!this.seenSuggestionIds.has(docId)) {
      // First poll — seed with all current suggestion IDs without emitting events
      const allIds = this.collectSuggestionIds(docData);
      this.seenSuggestionIds.set(docId, allIds);
      getLogger().info(`[tunnlo:google-docs] Seeded ${allIds.size} existing suggestion(s) for ${docTitle}`);
      return changes;
    }

    const seen = this.seenSuggestionIds.get(docId)!;
    const currentIds = this.collectSuggestionIds(docData);

    // Find new suggestion IDs
    for (const id of currentIds) {
      if (seen.has(id)) continue;

      // Look up suggestion metadata from suggestedChanges or suggestionsViewMode
      const suggestionInfo = this.getSuggestionDetail(docData, id);

      changes.push({
        type: 'suggestion',
        doc_id: docId,
        doc_title: docTitle,
        author: suggestionInfo.author,
        content: suggestionInfo.description,
        timestamp: now,
        context: suggestionInfo.context,
      });

      seen.add(id);
    }

    // Clean up removed suggestions (accepted/rejected)
    for (const id of seen) {
      if (!currentIds.has(id)) {
        seen.delete(id);
      }
    }

    return changes;
  }

  /** Walk document body to collect all suggestion IDs */
  private collectSuggestionIds(docData: any): Set<string> {
    const ids = new Set<string>();

    // Collect from document-level suggestedChanges
    if (docData.suggestedDocumentStyleChanges) {
      for (const id of Object.keys(docData.suggestedDocumentStyleChanges)) {
        ids.add(id);
      }
    }

    // Walk body content for inline suggestions
    const body = docData.body;
    if (!body?.content) return ids;

    for (const element of body.content) {
      this.collectFromElement(element, ids);
    }

    return ids;
  }

  /** Recursively collect suggestion IDs from a document element */
  private collectFromElement(element: any, ids: Set<string>): void {
    // Paragraph-level suggestions
    if (element.paragraph) {
      for (const el of element.paragraph.elements ?? []) {
        if (el.textRun) {
          for (const id of el.textRun.suggestedInsertionIds ?? []) ids.add(id);
          for (const id of el.textRun.suggestedDeletionIds ?? []) ids.add(id);
          if (el.textRun.suggestedTextStyleChanges) {
            for (const id of Object.keys(el.textRun.suggestedTextStyleChanges)) ids.add(id);
          }
        }
        if (el.inlineObjectElement) {
          for (const id of el.inlineObjectElement.suggestedInsertionIds ?? []) ids.add(id);
          for (const id of el.inlineObjectElement.suggestedDeletionIds ?? []) ids.add(id);
        }
      }
      // Paragraph style suggestions
      if (element.paragraph.suggestedParagraphStyleChanges) {
        for (const id of Object.keys(element.paragraph.suggestedParagraphStyleChanges)) ids.add(id);
      }
    }

    // Table elements
    if (element.table) {
      for (const row of element.table.tableRows ?? []) {
        for (const cell of row.tableCells ?? []) {
          for (const cellElement of cell.content ?? []) {
            this.collectFromElement(cellElement, ids);
          }
        }
      }
    }
  }

  /** Get details about a suggestion from the document data.
   *
   * Google Docs represents suggestions as text runs tagged with suggestion IDs.
   * A run can be:
   *   - insertion only: new text being added
   *   - deletion only: old text being removed
   *   - both insertion AND deletion: shared/overlapping text (context, not a change)
   */
  private getSuggestionDetail(docData: any, suggestionId: string): {
    author: string;
    description: string;
    context: string;
  } {
    let author = 'Unknown';
    const insertionOnly: string[] = [];
    const deletionOnly: string[] = [];
    const surroundingText: string[] = [];

    // Walk body including tables
    this.walkElements(docData.body?.content ?? [], (el, paragraphText) => {
      if (!el.textRun) return false;
      const text = el.textRun.content ?? '';

      const isInsertion = (el.textRun.suggestedInsertionIds ?? []).includes(suggestionId);
      const isDeletion = (el.textRun.suggestedDeletionIds ?? []).includes(suggestionId);

      if (isInsertion && isDeletion) {
        // Shared text — part of both old and new, skip for diff
        return true;
      } else if (isInsertion) {
        insertionOnly.push(text);
        return true;
      } else if (isDeletion) {
        deletionOnly.push(text);
        return true;
      }
      return false;
    }, surroundingText);

    const oldText = deletionOnly.join('').trim();
    const newText = insertionOnly.join('').trim();

    // Build a human-readable description
    let description = '';
    if (oldText && newText) {
      description = `Replace "${oldText}" → "${newText}"`;
    } else if (newText) {
      description = `Insert: "${newText}"`;
    } else if (oldText) {
      description = `Delete: "${oldText}"`;
    } else {
      description = `Style/formatting change (${suggestionId})`;
    }

    return {
      author,
      description,
      context: surroundingText.join(' ') || '',
    };
  }

  /** Walk document elements (including tables) and call visitor for each paragraph element */
  private walkElements(
    content: any[],
    visitor: (el: any, paragraphText: string) => boolean,
    surroundingText: string[],
  ): void {
    for (const element of content) {
      if (element.paragraph) {
        let paragraphText = '';
        let hasSuggestion = false;

        for (const el of element.paragraph.elements ?? []) {
          if (el.textRun) paragraphText += el.textRun.content ?? '';
          if (visitor(el, paragraphText)) hasSuggestion = true;
        }

        if (hasSuggestion && paragraphText.trim()) {
          surroundingText.push(paragraphText.trim());
        }
      }

      if (element.table) {
        for (const row of element.table.tableRows ?? []) {
          for (const cell of row.tableCells ?? []) {
            this.walkElements(cell.content ?? [], visitor, surroundingText);
          }
        }
      }
    }
  }

  private async pollRevisions(docId: string, docTitle: string, since: Date): Promise<DocChange[]> {
    const changes: DocChange[] = [];

    try {
      const res = await this.drive.revisions.list({
        fileId: docId,
        fields: 'revisions(id,modifiedTime,lastModifyingUser)',
      });

      const revisions = res.data.revisions ?? [];

      for (const revision of revisions) {
        const modifiedTime = new Date(revision.modifiedTime);
        if (modifiedTime <= since) continue;

        changes.push({
          type: 'edit',
          doc_id: docId,
          doc_title: docTitle,
          author: revision.lastModifyingUser?.displayName ?? 'Unknown',
          content: `Document revised (revision ${revision.id})`,
          timestamp: revision.modifiedTime,
        });
      }
    } catch (err) {
      getLogger().error(`[tunnlo:google-docs] Error fetching revisions for ${docId}:`, err);
    }

    return changes;
  }

  transform(raw: RawEvent) {
    const event = super.transform(raw);

    // Enrich metadata with Google Docs specifics
    try {
      const change: DocChange = JSON.parse(typeof raw.data === 'string' ? raw.data : raw.data.toString('utf-8'));
      event.metadata = {
        ...event.metadata,
        google_docs: {
          type: change.type,
          doc_id: change.doc_id,
          doc_title: change.doc_title,
          author: change.author,
          resolved: change.resolved,
        },
      };

      // Map change types to event priorities
      if (change.type === 'suggestion') {
        event.priority = 7;
      } else if (change.type === 'comment') {
        event.priority = 5;
      } else {
        event.priority = 3;
      }
    } catch {
      // Keep default transform
    }

    return event;
  }
}
