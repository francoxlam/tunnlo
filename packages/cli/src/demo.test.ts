import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch for Ollama check
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock dashboard to avoid opening a real HTTP server in tests
vi.mock('@tunnlo/dashboard', () => ({
  MetricsCollector: vi.fn(() => ({
    recordEventReceived: vi.fn(),
    recordEventFiltered: vi.fn(),
    recordEventSentToLlm: vi.fn(),
    recordEventDropped: vi.fn(),
    recordEventBuffered: vi.fn(),
    recordTokensUsed: vi.fn(),
    recordError: vi.fn(),
    updateAdapterStatus: vi.fn(),
    updateEventStatus: vi.fn(),
    recordLlmRequestStart: vi.fn(),
    recordLlmRequestEnd: vi.fn(),
    recordLlmResponse: vi.fn(),
  })),
  DashboardServer: vi.fn(() => ({
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
  })),
}));

describe('demo', () => {
  beforeEach(() => vi.clearAllMocks());

  it('detects when Ollama is not running', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as any);
    const mockError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { runDemo } = await import('./demo.js');

    await expect(runDemo({ noLogs: true })).rejects.toThrow('process.exit');

    expect(mockError).toHaveBeenCalledWith(
      expect.stringContaining('Ollama is not running'),
    );
    expect(mockExit).toHaveBeenCalledWith(1);

    mockExit.mockRestore();
    mockError.mockRestore();
  });

  it('uses first available model when none specified', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('/api/tags')) {
        return {
          ok: true,
          json: async () => ({
            models: [
              { name: 'mistral:7b' },
              { name: 'llama3.1:8b' },
            ],
          }),
        };
      }
      throw new Error('should not reach chat in this test');
    });

    const mockLog = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { runDemo } = await import('./demo.js');

    const mockSigint = vi.spyOn(process, 'on');
    const demoPromise = runDemo({ noLogs: true });

    // Give banner time to print
    await new Promise((r) => setTimeout(r, 100));

    // Check that the banner shows the auto-detected model
    const bannerCalls = mockLog.mock.calls.map((c) => c[0]).join('\n');
    expect(bannerCalls).toContain('mistral:7b');

    mockLog.mockRestore();

    // Force exit the demo by sending SIGINT
    const sigintHandler = mockSigint.mock.calls.find((c) => c[0] === 'SIGINT');
    if (sigintHandler) {
      const mockProcessExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
      await (sigintHandler[1] as Function)();
      mockProcessExit.mockRestore();
    }

    mockSigint.mockRestore();
  });
});
