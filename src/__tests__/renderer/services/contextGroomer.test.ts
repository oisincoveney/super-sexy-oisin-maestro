import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ContextGroomingService,
  contextGroomingService,
} from '../../../renderer/services/contextGroomer';
import type { MergeRequest, GroomingProgress, ContextSource } from '../../../renderer/types/contextMerge';
import type { LogEntry } from '../../../renderer/types';

// Mock window.maestro for IPC calls
const mockCreateGroomingSession = vi.fn();
const mockSendGroomingPrompt = vi.fn();
const mockCleanupGroomingSession = vi.fn();

vi.stubGlobal('window', {
  maestro: {
    context: {
      createGroomingSession: mockCreateGroomingSession,
      sendGroomingPrompt: mockSendGroomingPrompt,
      cleanupGroomingSession: mockCleanupGroomingSession,
    },
  },
});

// Helper to create a mock log entry
function createMockLog(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    id: `log-${Math.random().toString(36).slice(2)}`,
    timestamp: Date.now(),
    source: 'user',
    text: 'Test message',
    ...overrides,
  };
}

// Helper to create a mock context source
function createMockContext(overrides: Partial<ContextSource> = {}): ContextSource {
  return {
    type: 'tab',
    sessionId: 'session-123',
    projectRoot: '/test/project',
    name: 'Test Context',
    logs: [
      createMockLog({ source: 'user', text: 'How do I implement X?' }),
      createMockLog({ source: 'ai', text: 'To implement X, you should...' }),
    ],
    agentType: 'claude-code',
    ...overrides,
  };
}

describe('ContextGroomingService', () => {
  let service: ContextGroomingService;
  let progressUpdates: GroomingProgress[];

  beforeEach(() => {
    service = new ContextGroomingService();
    progressUpdates = [];
    vi.clearAllMocks();

    // Default mock implementations
    mockCreateGroomingSession.mockResolvedValue('grooming-session-123');
    mockSendGroomingPrompt.mockResolvedValue(`## Summary
Implemented feature X with proper error handling.

## Key Decisions
- Decision 1: Used async/await pattern

## Code Changes
- \`src/feature.ts\` - Added main implementation

## Current State
Feature is working with basic functionality.

## Next Steps
Add tests and documentation.`);
    mockCleanupGroomingSession.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with default config', () => {
      const instance = new ContextGroomingService();
      expect(instance).toBeInstanceOf(ContextGroomingService);
    });

    it('should create instance with custom config', () => {
      const instance = new ContextGroomingService({
        timeoutMs: 60000,
        defaultAgentType: 'opencode',
      });
      expect(instance).toBeInstanceOf(ContextGroomingService);
    });
  });

  describe('groomContexts', () => {
    it('should successfully groom multiple contexts', async () => {
      const request: MergeRequest = {
        sources: [createMockContext(), createMockContext({ name: 'Context 2' })],
        targetAgent: 'claude-code',
        targetProjectRoot: '/test/project',
      };

      const result = await service.groomContexts(
        request,
        (progress) => progressUpdates.push(progress)
      );

      expect(result.success).toBe(true);
      expect(result.groomedLogs.length).toBeGreaterThan(0);
      expect(result.error).toBeUndefined();
    });

    it('should report progress through all stages', async () => {
      const request: MergeRequest = {
        sources: [createMockContext()],
        targetAgent: 'claude-code',
        targetProjectRoot: '/test/project',
      };

      await service.groomContexts(
        request,
        (progress) => progressUpdates.push(progress)
      );

      // Check that we went through all stages
      const stages = progressUpdates.map((p) => p.stage);
      expect(stages).toContain('collecting');
      expect(stages).toContain('grooming');
      expect(stages).toContain('creating');
      expect(stages).toContain('complete');

      // Progress should end at 100%
      const lastProgress = progressUpdates[progressUpdates.length - 1];
      expect(lastProgress.progress).toBe(100);
    });

    it('should call IPC handlers in correct order', async () => {
      const request: MergeRequest = {
        sources: [createMockContext()],
        targetAgent: 'claude-code',
        targetProjectRoot: '/test/project',
      };

      await service.groomContexts(
        request,
        (progress) => progressUpdates.push(progress)
      );

      // Verify IPC calls were made in order
      expect(mockCreateGroomingSession).toHaveBeenCalledWith('/test/project', 'claude-code');
      expect(mockSendGroomingPrompt).toHaveBeenCalled();
      expect(mockCleanupGroomingSession).toHaveBeenCalledWith('grooming-session-123');
    });

    it('should use custom grooming prompt when provided', async () => {
      const customPrompt = 'Custom grooming instructions here';
      const request: MergeRequest = {
        sources: [createMockContext()],
        targetAgent: 'claude-code',
        targetProjectRoot: '/test/project',
        groomingPrompt: customPrompt,
      };

      await service.groomContexts(
        request,
        (progress) => progressUpdates.push(progress)
      );

      const sentPrompt = mockSendGroomingPrompt.mock.calls[0][1];
      expect(sentPrompt).toContain(customPrompt);
    });

    it('should calculate token savings', async () => {
      // Create contexts with known token counts
      const request: MergeRequest = {
        sources: [
          createMockContext({
            usageStats: {
              inputTokens: 500,
              outputTokens: 500,
              cacheReadTokens: 0,
              cacheCreationTokens: 0,
              costUsd: 0,
            },
          }),
        ],
        targetAgent: 'claude-code',
        targetProjectRoot: '/test/project',
      };

      // Mock a short groomed response to show token savings
      mockSendGroomingPrompt.mockResolvedValue('## Summary\nShort summary.');

      const result = await service.groomContexts(
        request,
        (progress) => progressUpdates.push(progress)
      );

      // Original: 1000 tokens, groomed: much less
      expect(result.tokensSaved).toBeGreaterThan(0);
    });

    it('should handle IPC errors gracefully', async () => {
      mockSendGroomingPrompt.mockRejectedValue(new Error('IPC connection failed'));

      const request: MergeRequest = {
        sources: [createMockContext()],
        targetAgent: 'claude-code',
        targetProjectRoot: '/test/project',
      };

      const result = await service.groomContexts(
        request,
        (progress) => progressUpdates.push(progress)
      );

      expect(result.success).toBe(false);
      // Error could be the original IPC error or a wrapped error
      expect(result.error).toBeDefined();
      expect(result.groomedLogs).toHaveLength(0);
    });

    it('should cleanup grooming session on error', async () => {
      mockSendGroomingPrompt.mockRejectedValue(new Error('Processing failed'));

      const request: MergeRequest = {
        sources: [createMockContext()],
        targetAgent: 'claude-code',
        targetProjectRoot: '/test/project',
      };

      await service.groomContexts(
        request,
        (progress) => progressUpdates.push(progress)
      );

      // Should still attempt cleanup even on error
      expect(mockCleanupGroomingSession).toHaveBeenCalled();
    });

    it('should include context metadata in formatted output', async () => {
      const context = createMockContext({
        name: 'Feature Branch Work',
        agentType: 'claude-code',
        projectRoot: '/my/project',
      });

      const request: MergeRequest = {
        sources: [context],
        targetAgent: 'claude-code',
        targetProjectRoot: '/my/project',
      };

      await service.groomContexts(
        request,
        (progress) => progressUpdates.push(progress)
      );

      const sentPrompt = mockSendGroomingPrompt.mock.calls[0][1];
      expect(sentPrompt).toContain('Feature Branch Work');
      expect(sentPrompt).toContain('claude-code');
      expect(sentPrompt).toContain('/my/project');
    });
  });

  describe('cancelGrooming', () => {
    it('should cleanup active grooming session', async () => {
      // Start a grooming operation that we'll cancel
      const request: MergeRequest = {
        sources: [createMockContext()],
        targetAgent: 'claude-code',
        targetProjectRoot: '/test/project',
      };

      // Don't await - let it run
      const groomingPromise = service.groomContexts(
        request,
        (progress) => progressUpdates.push(progress)
      );

      // Give it time to create the session
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Cancel while in progress
      await service.cancelGrooming();

      // Wait for the original promise to complete (may error)
      await groomingPromise.catch(() => {});

      // Cleanup should have been called
      expect(mockCleanupGroomingSession).toHaveBeenCalled();
    });

    it('should handle cancel when no session is active', async () => {
      // Should not throw
      await expect(service.cancelGrooming()).resolves.not.toThrow();
    });
  });

  describe('isGroomingActive', () => {
    it('should return false when no grooming is active', () => {
      expect(service.isGroomingActive()).toBe(false);
    });

    it('should return false after grooming completes', async () => {
      const request: MergeRequest = {
        sources: [createMockContext()],
        targetAgent: 'claude-code',
        targetProjectRoot: '/test/project',
      };

      await service.groomContexts(
        request,
        (progress) => progressUpdates.push(progress)
      );

      expect(service.isGroomingActive()).toBe(false);
    });
  });

  describe('singleton instance', () => {
    it('should export a default singleton instance', () => {
      expect(contextGroomingService).toBeInstanceOf(ContextGroomingService);
    });
  });
});

describe('ContextGroomingService edge cases', () => {
  let service: ContextGroomingService;

  beforeEach(() => {
    service = new ContextGroomingService();
    vi.clearAllMocks();

    mockCreateGroomingSession.mockResolvedValue('grooming-session-456');
    mockSendGroomingPrompt.mockResolvedValue('## Summary\nGroomed content.');
    mockCleanupGroomingSession.mockResolvedValue(undefined);
  });

  it('should handle empty source array', async () => {
    const request: MergeRequest = {
      sources: [],
      targetAgent: 'claude-code',
      targetProjectRoot: '/test/project',
    };

    const result = await service.groomContexts(request, () => {});

    expect(result.success).toBe(true);
    expect(result.groomedLogs.length).toBeGreaterThanOrEqual(0);
  });

  it('should handle single source context', async () => {
    const request: MergeRequest = {
      sources: [createMockContext()],
      targetAgent: 'claude-code',
      targetProjectRoot: '/test/project',
    };

    const result = await service.groomContexts(request, () => {});

    expect(result.success).toBe(true);
  });

  it('should handle context with empty logs', async () => {
    const request: MergeRequest = {
      sources: [createMockContext({ logs: [] })],
      targetAgent: 'claude-code',
      targetProjectRoot: '/test/project',
    };

    const result = await service.groomContexts(request, () => {});

    expect(result.success).toBe(true);
  });

  it('should handle context with very long logs', async () => {
    const longText = 'A'.repeat(10000);
    const request: MergeRequest = {
      sources: [
        createMockContext({
          logs: [createMockLog({ text: longText })],
        }),
      ],
      targetAgent: 'claude-code',
      targetProjectRoot: '/test/project',
    };

    const result = await service.groomContexts(request, () => {});

    expect(result.success).toBe(true);
    expect(mockSendGroomingPrompt.mock.calls[0][1]).toContain(longText);
  });

  it('should handle contexts from different agent types', async () => {
    const request: MergeRequest = {
      sources: [
        createMockContext({ agentType: 'claude-code', name: 'Claude Context' }),
        createMockContext({ agentType: 'opencode', name: 'OpenCode Context' }),
      ],
      targetAgent: 'claude-code',
      targetProjectRoot: '/test/project',
    };

    const result = await service.groomContexts(request, () => {});

    expect(result.success).toBe(true);
    const sentPrompt = mockSendGroomingPrompt.mock.calls[0][1];
    expect(sentPrompt).toContain('claude-code');
    expect(sentPrompt).toContain('opencode');
  });

  it('should handle cleanup failure gracefully', async () => {
    mockCleanupGroomingSession.mockRejectedValue(new Error('Cleanup failed'));

    const request: MergeRequest = {
      sources: [createMockContext()],
      targetAgent: 'claude-code',
      targetProjectRoot: '/test/project',
    };

    // Should not throw even if cleanup fails
    const result = await service.groomContexts(request, () => {});

    expect(result.success).toBe(true);
  });

  it('should handle session creation failure', async () => {
    mockCreateGroomingSession.mockRejectedValue(new Error('Session creation failed'));
    mockSendGroomingPrompt.mockRejectedValue(new Error('Context grooming IPC not available'));

    const request: MergeRequest = {
      sources: [createMockContext()],
      targetAgent: 'claude-code',
      targetProjectRoot: '/test/project',
    };

    const result = await service.groomContexts(request, () => {});

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should parse various groomed output formats', async () => {
    // Test with different output formats
    const outputs = [
      '## Summary\nBrief summary here.',
      'Just plain text without headers.',
      '## User\nQuestion\n\n## Assistant\nAnswer',
      '',
    ];

    for (const output of outputs) {
      mockSendGroomingPrompt.mockResolvedValueOnce(output);

      const request: MergeRequest = {
        sources: [createMockContext()],
        targetAgent: 'claude-code',
        targetProjectRoot: '/test/project',
      };

      const result = await service.groomContexts(request, () => {});

      // Should handle all formats without throwing
      expect(result.success).toBe(true);
    }
  });
});
