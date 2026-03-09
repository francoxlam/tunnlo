import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoogleDocsAdapter } from './google-docs.js';

/** Helper: create a Docs API document body with suggestion-mode edits */
function makeDocWithSuggestions(suggestionIds: string[], text = 'suggested text') {
  return {
    title: 'Test Document',
    body: {
      content: [
        {
          paragraph: {
            elements: [
              {
                textRun: {
                  content: text,
                  suggestedInsertionIds: suggestionIds,
                },
              },
            ],
          },
        },
      ],
    },
  };
}

function createMockClients(docData?: any) {
  const mockDocumentsGet = vi.fn().mockResolvedValue({
    data: docData ?? { title: 'Test Document', body: { content: [] } },
  });
  const mockCommentsList = vi.fn().mockResolvedValue({
    data: { comments: [] },
  });
  const mockRevisionsList = vi.fn().mockResolvedValue({
    data: { revisions: [] },
  });

  return {
    docsClient: { documents: { get: mockDocumentsGet } },
    driveClient: {
      comments: { list: mockCommentsList },
      revisions: { list: mockRevisionsList },
    },
    mockDocumentsGet,
    mockCommentsList,
    mockRevisionsList,
  };
}

describe('GoogleDocsAdapter', () => {
  let adapter: GoogleDocsAdapter;
  let mocks: ReturnType<typeof createMockClients>;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new GoogleDocsAdapter();
    mocks = createMockClients();
  });

  function baseConfig(overrides: Record<string, any> = {}) {
    return {
      id: 'test-gdocs',
      adapter: 'google-docs',
      config: {
        doc_ids: ['doc123'],
        _docs_client: mocks.docsClient,
        _drive_client: mocks.driveClient,
        poll_interval_ms: 100,
        ...overrides,
      },
    };
  }

  it('reports health as disconnected initially', () => {
    expect(adapter.health().status).toBe('disconnected');
  });

  it('connects with injected clients', async () => {
    await adapter.connect(baseConfig());
    expect(adapter.health().status).toBe('connected');
  });

  it('throws when doc_ids is missing', async () => {
    await expect(
      adapter.connect({
        id: 'test-gdocs',
        adapter: 'google-docs',
        config: { _docs_client: mocks.docsClient, _drive_client: mocks.driveClient },
      })
    ).rejects.toThrow('"doc_ids" is required');
  });

  it('throws when doc_ids is empty', async () => {
    await expect(
      adapter.connect(baseConfig({ doc_ids: [] }))
    ).rejects.toThrow('"doc_ids" is required');
  });

  it('polls comments and returns them as events', async () => {
    const now = new Date();
    mocks.mockCommentsList.mockResolvedValue({
      data: {
        comments: [
          {
            id: 'c1',
            content: 'Please review this section',
            author: { displayName: 'Alice' },
            createdTime: now.toISOString(),
            modifiedTime: now.toISOString(),
            resolved: false,
          },
        ],
      },
    });

    await adapter.connect(baseConfig({ watch: ['comments'] }));

    const events: any[] = [];
    for await (const raw of adapter.read()) {
      events.push(raw);
      if (events.length >= 1) break;
    }

    expect(events.length).toBe(1);
    const parsed = JSON.parse(events[0].data);
    expect(parsed.type).toBe('comment');
    expect(parsed.author).toBe('Alice');
    expect(parsed.content).toBe('Please review this section');
    expect(parsed.doc_title).toBe('Test Document');

    await adapter.disconnect();
  });

  it('skips resolved comments by default', async () => {
    const now = new Date();
    mocks.mockCommentsList.mockResolvedValue({
      data: {
        comments: [
          {
            id: 'c1',
            content: 'Old resolved comment',
            author: { displayName: 'Alice' },
            createdTime: now.toISOString(),
            modifiedTime: now.toISOString(),
            resolved: true,
          },
        ],
      },
    });

    await adapter.connect(baseConfig({ watch: ['comments'] }));

    const events: any[] = [];
    const timeout = setTimeout(() => adapter.disconnect(), 250);
    for await (const raw of adapter.read()) {
      events.push(raw);
    }
    clearTimeout(timeout);

    expect(events.length).toBe(0);
  });

  it('includes resolved comments when configured', async () => {
    const now = new Date();
    mocks.mockCommentsList.mockResolvedValue({
      data: {
        comments: [
          {
            id: 'c1',
            content: 'Resolved comment',
            author: { displayName: 'Alice' },
            createdTime: now.toISOString(),
            modifiedTime: now.toISOString(),
            resolved: true,
          },
        ],
      },
    });

    await adapter.connect(baseConfig({ watch: ['comments'], include_resolved: true }));

    const events: any[] = [];
    for await (const raw of adapter.read()) {
      events.push(raw);
      break;
    }

    expect(events.length).toBe(1);
    const parsed = JSON.parse(events[0].data);
    expect(parsed.resolved).toBe(true);

    await adapter.disconnect();
  });

  it('polls revisions for edits', async () => {
    const now = new Date();
    mocks.mockRevisionsList.mockResolvedValue({
      data: {
        revisions: [
          {
            id: 'rev1',
            modifiedTime: now.toISOString(),
            lastModifyingUser: { displayName: 'Charlie' },
          },
        ],
      },
    });

    await adapter.connect(baseConfig({ watch: ['edits'] }));

    const events: any[] = [];
    for await (const raw of adapter.read()) {
      events.push(raw);
      break;
    }

    const parsed = JSON.parse(events[0].data);
    expect(parsed.type).toBe('edit');
    expect(parsed.author).toBe('Charlie');

    await adapter.disconnect();
  });

  // --- Suggestion mode tests ---

  it('seeds existing suggestions on first poll without emitting events', async () => {
    const docWithSuggestion = makeDocWithSuggestions(['sug-existing'], 'old text');
    mocks.mockDocumentsGet.mockResolvedValue({ data: docWithSuggestion });

    await adapter.connect(baseConfig({ watch: ['suggestions'] }));

    // First poll should seed, not emit
    const events: any[] = [];
    const timeout = setTimeout(() => adapter.disconnect(), 250);
    for await (const raw of adapter.read()) {
      events.push(raw);
    }
    clearTimeout(timeout);

    // No events — first poll only seeds
    expect(events.length).toBe(0);
  });

  it('emits new suggestions detected after first poll', async () => {
    // First poll: no suggestions
    const emptyDoc = { title: 'Test Document', body: { content: [] } };
    mocks.mockDocumentsGet.mockResolvedValueOnce({ data: emptyDoc });

    // Second poll: new suggestion appears
    const docWithSuggestion = makeDocWithSuggestions(['sug-new'], 'new suggested text');
    mocks.mockDocumentsGet.mockResolvedValue({ data: docWithSuggestion });

    await adapter.connect(baseConfig({ watch: ['suggestions'] }));

    const events: any[] = [];
    let pollCount = 0;
    for await (const raw of adapter.read()) {
      events.push(raw);
      pollCount++;
      if (pollCount >= 1) break;
    }

    expect(events.length).toBe(1);
    const parsed = JSON.parse(events[0].data);
    expect(parsed.type).toBe('suggestion');
    expect(parsed.content).toContain('new suggested text');

    await adapter.disconnect();
  });

  it('does not re-emit already seen suggestions', async () => {
    // First poll: seed with one suggestion
    const doc = makeDocWithSuggestions(['sug-1'], 'text');
    mocks.mockDocumentsGet.mockResolvedValue({ data: doc });

    await adapter.connect(baseConfig({ watch: ['suggestions'] }));

    // Collect events over 3 poll cycles — should get 0 (first poll seeds, subsequent polls see same ID)
    const events: any[] = [];
    const timeout = setTimeout(() => adapter.disconnect(), 350);
    for await (const raw of adapter.read()) {
      events.push(raw);
    }
    clearTimeout(timeout);

    expect(events.length).toBe(0);

    await adapter.disconnect();
  });

  it('detects deletion-type suggestions', async () => {
    // First poll: empty
    mocks.mockDocumentsGet.mockResolvedValueOnce({
      data: { title: 'Test Document', body: { content: [] } },
    });

    // Second poll: deletion suggestion
    const docWithDeletion = {
      title: 'Test Document',
      body: {
        content: [
          {
            paragraph: {
              elements: [
                {
                  textRun: {
                    content: 'text to delete',
                    suggestedDeletionIds: ['sug-del-1'],
                  },
                },
              ],
            },
          },
        ],
      },
    };
    mocks.mockDocumentsGet.mockResolvedValue({ data: docWithDeletion });

    await adapter.connect(baseConfig({ watch: ['suggestions'] }));

    const events: any[] = [];
    for await (const raw of adapter.read()) {
      events.push(raw);
      break;
    }

    const parsed = JSON.parse(events[0].data);
    expect(parsed.type).toBe('suggestion');
    expect(parsed.content).toContain('Delete');
    expect(parsed.content).toContain('text to delete');

    await adapter.disconnect();
  });

  it('detects replace-type suggestions (delete + insert with same ID)', async () => {
    // First poll: empty
    mocks.mockDocumentsGet.mockResolvedValueOnce({
      data: { title: 'Meal plan', body: { content: [] } },
    });

    // Second poll: replacement suggestion (delete "hummus" + insert "beef")
    const docWithReplace = {
      title: 'Meal plan',
      body: {
        content: [
          {
            paragraph: {
              elements: [
                {
                  textRun: {
                    content: 'hummus',
                    suggestedDeletionIds: ['sug-replace-1'],
                  },
                },
                {
                  textRun: {
                    content: 'beef',
                    suggestedInsertionIds: ['sug-replace-1'],
                  },
                },
              ],
            },
          },
        ],
      },
    };
    mocks.mockDocumentsGet.mockResolvedValue({ data: docWithReplace });

    await adapter.connect(baseConfig({ watch: ['suggestions'] }));

    const events: any[] = [];
    for await (const raw of adapter.read()) {
      events.push(raw);
      break;
    }

    const parsed = JSON.parse(events[0].data);
    expect(parsed.type).toBe('suggestion');
    expect(parsed.content).toContain('Replace');
    expect(parsed.content).toContain('hummus');
    expect(parsed.content).toContain('beef');
    expect(parsed.doc_title).toBe('Meal plan');

    await adapter.disconnect();
  });

  // --- Transform tests ---

  it('transforms raw events with google_docs metadata', async () => {
    const change = {
      type: 'comment',
      doc_id: 'doc123',
      doc_title: 'Test Doc',
      author: 'Alice',
      content: 'Test comment',
      timestamp: new Date().toISOString(),
    };

    await adapter.connect(baseConfig());

    const event = adapter.transform({
      data: JSON.stringify(change),
      received_at: new Date().toISOString(),
    });

    expect(event.source_id).toBe('test-gdocs');
    expect(event.event_type).toBe('DATA');
    expect(event.metadata?.google_docs).toEqual({
      type: 'comment',
      doc_id: 'doc123',
      doc_title: 'Test Doc',
      author: 'Alice',
      resolved: undefined,
    });
    expect(event.priority).toBe(5);

    await adapter.disconnect();
  });

  it('assigns higher priority to suggestions', async () => {
    await adapter.connect(baseConfig());

    const event = adapter.transform({
      data: JSON.stringify({
        type: 'suggestion',
        doc_id: 'doc1',
        doc_title: 'Doc',
        author: 'Bob',
        content: 'suggestion',
        timestamp: new Date().toISOString(),
      }),
      received_at: new Date().toISOString(),
    });

    expect(event.priority).toBe(7);
    await adapter.disconnect();
  });

  it('assigns lower priority to edits', async () => {
    await adapter.connect(baseConfig());

    const event = adapter.transform({
      data: JSON.stringify({
        type: 'edit',
        doc_id: 'doc1',
        doc_title: 'Doc',
        author: 'Charlie',
        content: 'Document revised',
        timestamp: new Date().toISOString(),
      }),
      received_at: new Date().toISOString(),
    });

    expect(event.priority).toBe(3);
    await adapter.disconnect();
  });

  it('disconnects cleanly', async () => {
    await adapter.connect(baseConfig());
    await adapter.disconnect();
    expect(adapter.health().status).toBe('disconnected');
  });
});
