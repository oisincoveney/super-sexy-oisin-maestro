/**
 * SessionStatusBanner component for Maestro mobile web interface
 *
 * Displays a compact status banner showing the current session's key information.
 * Positioned below the header/session pill bar, this provides at-a-glance
 * visibility into what the active session is doing.
 *
 * Features:
 * - Session name and working directory (truncated)
 * - Color-coded status indicator
 * - Thinking indicator when AI is processing
 * - Cost tracker showing session spend
 * - Compact design optimized for mobile viewports
 */

import React from 'react';
import { useThemeColors } from '../components/ThemeProvider';
import { StatusDot, type SessionStatus } from '../components/Badge';
import type { Session, UsageStats } from '../hooks/useSessions';

/**
 * Props for SessionStatusBanner component
 */
export interface SessionStatusBannerProps {
  /** The currently active session to display */
  session: Session | null;
  /** Optional className for additional styling */
  className?: string;
  /** Optional inline styles */
  style?: React.CSSProperties;
}

/**
 * Get a human-readable status label based on session state
 */
function getStatusLabel(state: string): string {
  switch (state) {
    case 'idle':
      return 'Ready';
    case 'busy':
      return 'Thinking...';
    case 'connecting':
      return 'Connecting...';
    case 'error':
      return 'Error';
    default:
      return 'Unknown';
  }
}

/**
 * Truncate a file path for display, preserving the most relevant parts
 * Shows ".../<parent>/<current>" format for long paths
 */
function truncatePath(path: string, maxLength: number = 30): string {
  if (!path) return '';
  if (path.length <= maxLength) return path;

  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) return path;

  // Show the last two parts with ellipsis
  if (parts.length === 1) {
    return `...${path.slice(-maxLength + 3)}`;
  }

  const lastTwo = parts.slice(-2).join('/');
  if (lastTwo.length > maxLength - 4) {
    return `.../${parts[parts.length - 1].slice(-(maxLength - 5))}`;
  }

  return `.../${lastTwo}`;
}

/**
 * Format cost in USD for display
 * Shows appropriate precision based on amount:
 * - Less than $0.01: shows 4 decimal places (e.g., $0.0012)
 * - Less than $1.00: shows 2-3 decimal places (e.g., $0.12)
 * - $1.00 or more: shows 2 decimal places (e.g., $1.50)
 */
function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`;
  } else if (cost < 1.0) {
    return `$${cost.toFixed(3)}`;
  }
  return `$${cost.toFixed(2)}`;
}

/**
 * CostTracker component - displays session cost in a compact format
 */
function CostTracker({ usageStats }: { usageStats?: UsageStats | null }) {
  const colors = useThemeColors();

  // Don't render if no usage stats or no cost data
  if (!usageStats || usageStats.totalCostUsd === undefined || usageStats.totalCostUsd === null) {
    return null;
  }

  const cost = usageStats.totalCostUsd;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '3px',
        fontSize: '11px',
        fontWeight: 500,
        color: colors.textDim,
        backgroundColor: `${colors.textDim}15`,
        padding: '2px 6px',
        borderRadius: '4px',
        lineHeight: 1,
        flexShrink: 0,
      }}
      title={`Session cost: ${formatCost(cost)}`}
      aria-label={`Session cost: ${formatCost(cost)}`}
    >
      {/* Dollar icon using Unicode */}
      <span style={{ fontSize: '10px' }}>💰</span>
      <span>{formatCost(cost)}</span>
    </span>
  );
}

/**
 * Thinking animation component - three dots that animate in sequence
 */
function ThinkingIndicator() {
  const colors = useThemeColors();

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '2px',
        marginLeft: '4px',
      }}
      aria-label="AI is thinking"
    >
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          style={{
            width: '4px',
            height: '4px',
            borderRadius: '50%',
            backgroundColor: colors.warning,
            animation: `thinkingBounce 1.4s infinite ease-in-out both`,
            animationDelay: `${index * 0.16}s`,
          }}
        />
      ))}
      <style>{`
        @keyframes thinkingBounce {
          0%, 80%, 100% {
            transform: scale(0.6);
            opacity: 0.5;
          }
          40% {
            transform: scale(1);
            opacity: 1;
          }
        }
      `}</style>
    </span>
  );
}

/**
 * SessionStatusBanner component
 *
 * Renders a compact banner showing the active session's status.
 * Designed to sit directly below the header/session pill bar.
 *
 * @example
 * ```tsx
 * <SessionStatusBanner session={activeSession} />
 * ```
 */
export function SessionStatusBanner({
  session,
  className = '',
  style,
}: SessionStatusBannerProps) {
  const colors = useThemeColors();

  // Don't render if no session is selected
  if (!session) {
    return null;
  }

  const sessionState = (session.state as string) || 'idle';
  const status: SessionStatus =
    sessionState === 'idle' || sessionState === 'busy' || sessionState === 'connecting' || sessionState === 'error'
      ? sessionState as SessionStatus
      : 'error';
  const isThinking = sessionState === 'busy';
  const statusLabel = getStatusLabel(sessionState);
  const truncatedCwd = truncatePath(session.cwd);

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 16px',
        backgroundColor: colors.bgMain,
        borderBottom: `1px solid ${colors.border}`,
        ...style,
      }}
      role="status"
      aria-live="polite"
      aria-label={`Current session: ${session.name}, status: ${statusLabel}`}
    >
      {/* Left side: Session name and working directory */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
          flex: 1,
          minWidth: 0, // Allow text truncation
        }}
      >
        {/* Session name */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span
            style={{
              fontSize: '14px',
              fontWeight: 600,
              color: colors.textMain,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {session.name}
          </span>

          {/* Mode indicator */}
          <span
            style={{
              fontSize: '10px',
              fontWeight: 600,
              color: session.inputMode === 'ai' ? colors.accent : colors.textDim,
              backgroundColor:
                session.inputMode === 'ai' ? `${colors.accent}20` : `${colors.textDim}20`,
              padding: '2px 5px',
              borderRadius: '4px',
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            {session.inputMode === 'ai' ? 'AI' : 'Terminal'}
          </span>

          {/* Cost tracker */}
          <CostTracker usageStats={session.usageStats} />
        </div>

        {/* Working directory */}
        <span
          style={{
            fontSize: '11px',
            color: colors.textDim,
            fontFamily: 'monospace',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={session.cwd}
        >
          {truncatedCwd}
        </span>
      </div>

      {/* Right side: Status indicator */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          flexShrink: 0,
          paddingLeft: '12px',
        }}
      >
        <StatusDot status={status} size="sm" />
        <span
          style={{
            fontSize: '12px',
            fontWeight: 500,
            color:
              status === 'idle'
                ? colors.success
                : status === 'busy'
                  ? colors.warning
                  : status === 'connecting'
                    ? '#f97316' // Orange
                    : colors.error,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          {statusLabel}
          {isThinking && <ThinkingIndicator />}
        </span>
      </div>
    </div>
  );
}

export default SessionStatusBanner;
