/**
 * @file UpdateCheckModal.test.tsx
 * @description Tests for the UpdateCheckModal component
 *
 * UpdateCheckModal displays:
 * - Loading state while checking for updates
 * - Error state if check fails
 * - Update available state with release notes
 * - Up to date state when on latest version
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// Add updates mock to window.maestro if not present
if (!(window.maestro as any).updates) {
  (window.maestro as any).updates = {
    check: vi.fn(),
  };
}

// Mock __APP_VERSION__ global
(globalThis as any).__APP_VERSION__ = '1.0.0';

// Mock react-markdown
vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => (
    <div data-testid="react-markdown">{children}</div>
  ),
}));

// Mock LayerStackContext
const mockRegisterLayer = vi.fn(() => 'layer-123');
const mockUnregisterLayer = vi.fn();

vi.mock('../../../renderer/contexts/LayerStackContext', () => ({
  useLayerStack: () => ({
    registerLayer: mockRegisterLayer,
    unregisterLayer: mockUnregisterLayer,
  }),
}));

// Import component after mocks
import { UpdateCheckModal } from '../../../renderer/components/UpdateCheckModal';

// Helper to create mock theme
const createMockTheme = () => ({
  colors: {
    bgMain: '#1e1e1e',
    bgSidebar: '#252526',
    bgActivity: '#333333',
    textMain: '#ffffff',
    textDim: '#888888',
    accent: '#007acc',
    border: '#404040',
    error: '#f44336',
    success: '#4caf50',
    warning: '#ff9800',
  },
});

// Helper to create mock release
const createMockRelease = (overrides: Partial<{
  tag_name: string;
  name: string;
  body: string;
  html_url: string;
  published_at: string;
}> = {}) => ({
  tag_name: 'v1.1.0',
  name: 'Version 1.1.0',
  body: '## New Features\n- Added feature X\n- Fixed bug Y',
  html_url: 'https://github.com/pedramamini/Maestro/releases/tag/v1.1.0',
  published_at: '2024-01-15T12:00:00Z',
  ...overrides,
});

// Helper to create mock update result
const createMockUpdateResult = (overrides: Partial<{
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  versionsBehind: number;
  releases: any[];
  releasesUrl: string;
  error?: string;
}> = {}) => ({
  currentVersion: '1.0.0',
  latestVersion: '1.1.0',
  updateAvailable: true,
  versionsBehind: 1,
  releases: [createMockRelease()],
  releasesUrl: 'https://github.com/pedramamini/Maestro/releases',
  ...overrides,
});

describe('UpdateCheckModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock: update available
    (window.maestro as any).updates.check = vi.fn().mockResolvedValue(createMockUpdateResult());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =============================================================================
  // LOADING STATE
  // =============================================================================

  describe('loading state', () => {
    it('shows loading message initially', async () => {
      // Make check take some time
      (window.maestro as any).updates.check.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(createMockUpdateResult()), 100))
      );

      render(
        <UpdateCheckModal
          theme={createMockTheme()}
          onClose={vi.fn()}
        />
      );

      expect(screen.getByText('Checking for updates...')).toBeInTheDocument();
    });

    it('shows spinning loader during check', async () => {
      (window.maestro as any).updates.check.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(createMockUpdateResult()), 100))
      );

      render(
        <UpdateCheckModal
          theme={createMockTheme()}
          onClose={vi.fn()}
        />
      );

      // The Loader2 icon has animate-spin class
      const loadingIndicator = screen.getByText('Checking for updates...').previousElementSibling;
      expect(loadingIndicator).toHaveClass('animate-spin');
    });
  });

  // =============================================================================
  // UPDATE AVAILABLE STATE
  // =============================================================================

  describe('update available state', () => {
    it('shows update available banner', async () => {
      render(
        <UpdateCheckModal
          theme={createMockTheme()}
          onClose={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Update Available!')).toBeInTheDocument();
      });
    });

    it('shows versions behind count', async () => {
      (window.maestro as any).updates.check.mockResolvedValue(
        createMockUpdateResult({ versionsBehind: 3 })
      );

      render(
        <UpdateCheckModal
          theme={createMockTheme()}
          onClose={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('3 versions')).toBeInTheDocument();
      });
    });

    it('shows singular version when 1 behind', async () => {
      (window.maestro as any).updates.check.mockResolvedValue(
        createMockUpdateResult({ versionsBehind: 1 })
      );

      render(
        <UpdateCheckModal
          theme={createMockTheme()}
          onClose={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('1 version')).toBeInTheDocument();
      });
    });

    it('shows current and latest version', async () => {
      render(
        <UpdateCheckModal
          theme={createMockTheme()}
          onClose={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/Current: v1\.0\.0/)).toBeInTheDocument();
        expect(screen.getByText(/Latest: v1\.1\.0/)).toBeInTheDocument();
      });
    });

    it('shows upgrade instructions', async () => {
      render(
        <UpdateCheckModal
          theme={createMockTheme()}
          onClose={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('How to Upgrade')).toBeInTheDocument();
      });
    });

    it('shows release notes section', async () => {
      render(
        <UpdateCheckModal
          theme={createMockTheme()}
          onClose={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Release Notes')).toBeInTheDocument();
      });
    });

    it('shows download button', async () => {
      render(
        <UpdateCheckModal
          theme={createMockTheme()}
          onClose={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Download Latest Release')).toBeInTheDocument();
      });
    });

    it('opens releases URL when download button clicked', async () => {
      render(
        <UpdateCheckModal
          theme={createMockTheme()}
          onClose={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Download Latest Release')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Download Latest Release'));

      expect(window.maestro.shell.openExternal).toHaveBeenCalledWith(
        'https://github.com/pedramamini/Maestro/releases'
      );
    });
  });

  // =============================================================================
  // RELEASE NOTES
  // =============================================================================

  describe('release notes', () => {
    it('shows release tag name', async () => {
      render(
        <UpdateCheckModal
          theme={createMockTheme()}
          onClose={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('v1.1.0')).toBeInTheDocument();
      });
    });

    it('shows release date', async () => {
      render(
        <UpdateCheckModal
          theme={createMockTheme()}
          onClose={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Jan 15, 2024')).toBeInTheDocument();
      });
    });

    it('auto-expands single release', async () => {
      render(
        <UpdateCheckModal
          theme={createMockTheme()}
          onClose={vi.fn()}
        />
      );

      await waitFor(() => {
        // When 1 version behind, release is auto-expanded
        expect(screen.getByTestId('react-markdown')).toBeInTheDocument();
      });
    });

    it('toggles release expansion on click', async () => {
      (window.maestro as any).updates.check.mockResolvedValue(
        createMockUpdateResult({
          versionsBehind: 2,
          releases: [
            createMockRelease({ tag_name: 'v1.1.0' }),
            createMockRelease({ tag_name: 'v1.0.5' }),
          ],
        })
      );

      render(
        <UpdateCheckModal
          theme={createMockTheme()}
          onClose={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('v1.1.0')).toBeInTheDocument();
      });

      // Initially collapsed (more than 1 version)
      expect(screen.queryByTestId('react-markdown')).not.toBeInTheDocument();

      // Click to expand
      fireEvent.click(screen.getByText('v1.1.0'));

      await waitFor(() => {
        expect(screen.getByTestId('react-markdown')).toBeInTheDocument();
      });

      // Click again to collapse
      fireEvent.click(screen.getByText('v1.1.0'));

      await waitFor(() => {
        expect(screen.queryByTestId('react-markdown')).not.toBeInTheDocument();
      });
    });

    it('shows release name if different from tag', async () => {
      (window.maestro as any).updates.check.mockResolvedValue(
        createMockUpdateResult({
          releases: [
            createMockRelease({
              tag_name: 'v1.1.0',
              name: 'Cool Feature Release',
            }),
          ],
        })
      );

      render(
        <UpdateCheckModal
          theme={createMockTheme()}
          onClose={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('- Cool Feature Release')).toBeInTheDocument();
      });
    });

    it('does not show release name if same as tag', async () => {
      (window.maestro as any).updates.check.mockResolvedValue(
        createMockUpdateResult({
          releases: [
            createMockRelease({
              tag_name: 'v1.1.0',
              name: 'v1.1.0',
            }),
          ],
        })
      );

      render(
        <UpdateCheckModal
          theme={createMockTheme()}
          onClose={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('v1.1.0')).toBeInTheDocument();
      });

      // Should not show duplicate
      expect(screen.queryByText('- v1.1.0')).not.toBeInTheDocument();
    });

    it('shows fallback text when no release body', async () => {
      (window.maestro as any).updates.check.mockResolvedValue(
        createMockUpdateResult({
          releases: [createMockRelease({ body: '' })],
        })
      );

      render(
        <UpdateCheckModal
          theme={createMockTheme()}
          onClose={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('No release notes available.')).toBeInTheDocument();
      });
    });
  });

  // =============================================================================
  // UP TO DATE STATE
  // =============================================================================

  describe('up to date state', () => {
    it('shows up to date message', async () => {
      (window.maestro as any).updates.check.mockResolvedValue(
        createMockUpdateResult({
          updateAvailable: false,
          versionsBehind: 0,
          latestVersion: '1.0.0',
        })
      );

      render(
        <UpdateCheckModal
          theme={createMockTheme()}
          onClose={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("You're up to date!")).toBeInTheDocument();
      });
    });

    it('shows current version', async () => {
      (window.maestro as any).updates.check.mockResolvedValue(
        createMockUpdateResult({
          currentVersion: '1.2.3',
          updateAvailable: false,
          versionsBehind: 0,
        })
      );

      render(
        <UpdateCheckModal
          theme={createMockTheme()}
          onClose={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Maestro v1.2.3')).toBeInTheDocument();
      });
    });

    it('shows view all releases link', async () => {
      (window.maestro as any).updates.check.mockResolvedValue(
        createMockUpdateResult({
          updateAvailable: false,
          versionsBehind: 0,
        })
      );

      render(
        <UpdateCheckModal
          theme={createMockTheme()}
          onClose={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('View all releases')).toBeInTheDocument();
      });
    });

    it('opens releases URL when view all releases clicked', async () => {
      (window.maestro as any).updates.check.mockResolvedValue(
        createMockUpdateResult({
          updateAvailable: false,
          versionsBehind: 0,
        })
      );

      render(
        <UpdateCheckModal
          theme={createMockTheme()}
          onClose={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('View all releases')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('View all releases'));

      expect(window.maestro.shell.openExternal).toHaveBeenCalledWith(
        'https://github.com/pedramamini/Maestro/releases'
      );
    });
  });

  // =============================================================================
  // ERROR STATE
  // =============================================================================

  describe('error state', () => {
    it('shows error message', async () => {
      (window.maestro as any).updates.check.mockRejectedValue(new Error('Network error'));

      render(
        <UpdateCheckModal
          theme={createMockTheme()}
          onClose={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });

    it('shows manual check link on error', async () => {
      (window.maestro as any).updates.check.mockRejectedValue(new Error('Failed'));

      render(
        <UpdateCheckModal
          theme={createMockTheme()}
          onClose={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Check releases manually')).toBeInTheDocument();
      });
    });

    it('opens releases URL when manual check clicked', async () => {
      (window.maestro as any).updates.check.mockRejectedValue(new Error('Failed'));

      render(
        <UpdateCheckModal
          theme={createMockTheme()}
          onClose={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Check releases manually')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Check releases manually'));

      expect(window.maestro.shell.openExternal).toHaveBeenCalledWith(
        'https://github.com/pedramamini/Maestro/releases'
      );
    });

    it('handles non-Error exceptions', async () => {
      (window.maestro as any).updates.check.mockRejectedValue('String error');

      render(
        <UpdateCheckModal
          theme={createMockTheme()}
          onClose={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Failed to check for updates')).toBeInTheDocument();
      });
    });
  });

  // =============================================================================
  // REFRESH BUTTON
  // =============================================================================

  describe('refresh button', () => {
    it('re-checks for updates when clicked', async () => {
      render(
        <UpdateCheckModal
          theme={createMockTheme()}
          onClose={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Update Available!')).toBeInTheDocument();
      });

      // Click refresh
      const refreshButton = screen.getByTitle('Refresh');
      fireEvent.click(refreshButton);

      // Should call check again
      expect((window.maestro as any).updates.check).toHaveBeenCalledTimes(2);
    });

    it('is disabled while loading', async () => {
      (window.maestro as any).updates.check.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(createMockUpdateResult()), 100))
      );

      render(
        <UpdateCheckModal
          theme={createMockTheme()}
          onClose={vi.fn()}
        />
      );

      const refreshButton = screen.getByTitle('Refresh');
      expect(refreshButton).toBeDisabled();
    });

    it('shows spinning icon while refreshing', async () => {
      let resolveCheck: (value: any) => void;
      (window.maestro as any).updates.check.mockImplementation(
        () => new Promise((resolve) => { resolveCheck = resolve; })
      );

      render(
        <UpdateCheckModal
          theme={createMockTheme()}
          onClose={vi.fn()}
        />
      );

      // Initially loading, refresh icon should spin
      const refreshButton = screen.getByTitle('Refresh');
      const refreshIcon = refreshButton.querySelector('svg');
      expect(refreshIcon).toHaveClass('animate-spin');

      // Resolve the check
      resolveCheck!(createMockUpdateResult());

      await waitFor(() => {
        expect(screen.getByText('Update Available!')).toBeInTheDocument();
      });

      // Icon should stop spinning
      expect(refreshIcon).not.toHaveClass('animate-spin');
    });
  });

  // =============================================================================
  // CLOSE BUTTON
  // =============================================================================

  describe('close button', () => {
    it('calls onClose when clicked', async () => {
      const onClose = vi.fn();

      render(
        <UpdateCheckModal
          theme={createMockTheme()}
          onClose={onClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Update Available!')).toBeInTheDocument();
      });

      // Find close button (X icon button)
      const buttons = screen.getAllByRole('button');
      const closeButton = buttons.find((btn) => btn.querySelector('.lucide-x'));
      expect(closeButton).toBeDefined();
      fireEvent.click(closeButton!);

      expect(onClose).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // LAYER STACK INTEGRATION
  // =============================================================================

  describe('layer stack integration', () => {
    it('registers layer on mount', async () => {
      render(
        <UpdateCheckModal
          theme={createMockTheme()}
          onClose={vi.fn()}
        />
      );

      expect(mockRegisterLayer).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'modal',
          blocksLowerLayers: true,
          capturesFocus: true,
          focusTrap: 'strict',
          ariaLabel: 'Check for Updates',
        })
      );
    });

    it('unregisters layer on unmount', async () => {
      const { unmount } = render(
        <UpdateCheckModal
          theme={createMockTheme()}
          onClose={vi.fn()}
        />
      );

      unmount();

      expect(mockUnregisterLayer).toHaveBeenCalledWith('layer-123');
    });

    it('calls onClose on escape via layer', async () => {
      const onClose = vi.fn();

      render(
        <UpdateCheckModal
          theme={createMockTheme()}
          onClose={onClose}
        />
      );

      // Get the onEscape callback from registerLayer call
      const registerCall = mockRegisterLayer.mock.calls[0][0];
      expect(registerCall.onEscape).toBeDefined();

      // Call it to simulate escape
      registerCall.onEscape();

      expect(onClose).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // ACCESSIBILITY
  // =============================================================================

  describe('accessibility', () => {
    it('has dialog role', async () => {
      render(
        <UpdateCheckModal
          theme={createMockTheme()}
          onClose={vi.fn()}
        />
      );

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('has aria-modal attribute', async () => {
      render(
        <UpdateCheckModal
          theme={createMockTheme()}
          onClose={vi.fn()}
        />
      );

      expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    });

    it('has aria-label', async () => {
      render(
        <UpdateCheckModal
          theme={createMockTheme()}
          onClose={vi.fn()}
        />
      );

      expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', 'Check for Updates');
    });
  });

  // =============================================================================
  // THEME STYLING
  // =============================================================================

  describe('theme styling', () => {
    it('applies theme colors to modal', async () => {
      const theme = createMockTheme();

      render(
        <UpdateCheckModal
          theme={theme}
          onClose={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Update Available!')).toBeInTheDocument();
      });

      // Check modal background
      const dialog = screen.getByRole('dialog');
      const modalContent = dialog.querySelector('[class*="w-"]');
      expect(modalContent).toHaveStyle({ backgroundColor: theme.colors.bgSidebar });
    });
  });

  // =============================================================================
  // HEADER
  // =============================================================================

  describe('header', () => {
    it('shows title', async () => {
      render(
        <UpdateCheckModal
          theme={createMockTheme()}
          onClose={vi.fn()}
        />
      );

      expect(screen.getByText('Check for Updates')).toBeInTheDocument();
    });
  });

  // =============================================================================
  // MULTIPLE RELEASES
  // =============================================================================

  describe('multiple releases', () => {
    it('shows all releases', async () => {
      (window.maestro as any).updates.check.mockResolvedValue(
        createMockUpdateResult({
          versionsBehind: 3,
          releases: [
            createMockRelease({ tag_name: 'v1.3.0', published_at: '2024-01-20T12:00:00Z' }),
            createMockRelease({ tag_name: 'v1.2.0', published_at: '2024-01-15T12:00:00Z' }),
            createMockRelease({ tag_name: 'v1.1.0', published_at: '2024-01-10T12:00:00Z' }),
          ],
        })
      );

      render(
        <UpdateCheckModal
          theme={createMockTheme()}
          onClose={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('v1.3.0')).toBeInTheDocument();
        expect(screen.getByText('v1.2.0')).toBeInTheDocument();
        expect(screen.getByText('v1.1.0')).toBeInTheDocument();
      });
    });

    it('keeps all releases collapsed when multiple', async () => {
      (window.maestro as any).updates.check.mockResolvedValue(
        createMockUpdateResult({
          versionsBehind: 2,
          releases: [
            createMockRelease({ tag_name: 'v1.2.0' }),
            createMockRelease({ tag_name: 'v1.1.0' }),
          ],
        })
      );

      render(
        <UpdateCheckModal
          theme={createMockTheme()}
          onClose={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('v1.2.0')).toBeInTheDocument();
      });

      // Should be collapsed (no markdown visible)
      expect(screen.queryByTestId('react-markdown')).not.toBeInTheDocument();
    });
  });
});
