/**
 * MessageHistory component for Maestro mobile web interface
 *
 * Displays the conversation history (AI logs and shell logs) for the active session.
 * Shows messages in a scrollable container with user/AI differentiation.
 */

import { useEffect, useRef } from 'react';
import { useThemeColors } from '../components/ThemeProvider';

export interface LogEntry {
  id?: string;
  timestamp: number;
  text?: string;
  content?: string;
  source?: 'user' | 'stdout' | 'stderr' | 'system';
  type?: string;
}

export interface MessageHistoryProps {
  /** Log entries to display */
  logs: LogEntry[];
  /** Input mode to determine which logs to show */
  inputMode: 'ai' | 'terminal';
  /** Whether to auto-scroll to bottom on new messages */
  autoScroll?: boolean;
  /** Max height of the container */
  maxHeight?: string;
  /** Callback when user taps a message */
  onMessageTap?: (entry: LogEntry) => void;
}

/**
 * Format timestamp for display
 */
function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * MessageHistory component
 */
export function MessageHistory({
  logs,
  inputMode,
  autoScroll = true,
  maxHeight = '300px',
  onMessageTap,
}: MessageHistoryProps) {
  const colors = useThemeColors();
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  if (!logs || logs.length === 0) {
    return (
      <div
        style={{
          padding: '16px',
          textAlign: 'center',
          color: colors.textDim,
          fontSize: '13px',
        }}
      >
        No messages yet
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '12px',
        maxHeight,
        overflowY: 'auto',
        overflowX: 'hidden',
        backgroundColor: colors.bgMain,
        borderRadius: '8px',
        border: `1px solid ${colors.border}`,
      }}
    >
      {logs.map((entry, index) => {
        const text = entry.text || entry.content || '';
        const source = entry.source || (entry.type === 'user' ? 'user' : 'stdout');
        const isUser = source === 'user';
        const isError = source === 'stderr';
        const isSystem = source === 'system';

        return (
          <div
            key={entry.id || `${entry.timestamp}-${index}`}
            onClick={() => onMessageTap?.(entry)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              padding: '10px 12px',
              borderRadius: '8px',
              backgroundColor: isUser
                ? `${colors.accent}15`
                : isError
                  ? `${colors.error}10`
                  : isSystem
                    ? `${colors.textDim}10`
                    : colors.bgSidebar,
              border: `1px solid ${isUser
                ? `${colors.accent}30`
                : isError
                  ? `${colors.error}30`
                  : colors.border
              }`,
              cursor: onMessageTap ? 'pointer' : 'default',
              // Align user messages to the right
              alignSelf: isUser ? 'flex-end' : 'flex-start',
              maxWidth: '90%',
            }}
          >
            {/* Header: source and time */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '10px',
                color: colors.textDim,
              }}
            >
              <span
                style={{
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  color: isUser
                    ? colors.accent
                    : isError
                      ? colors.error
                      : colors.textDim,
                }}
              >
                {isUser ? 'You' : isError ? 'Error' : isSystem ? 'System' : inputMode === 'ai' ? 'AI' : 'Output'}
              </span>
              <span style={{ opacity: 0.7 }}>{formatTime(entry.timestamp)}</span>
            </div>

            {/* Message content */}
            <div
              style={{
                fontSize: '13px',
                lineHeight: 1.5,
                color: isError ? colors.error : colors.textMain,
                fontFamily: inputMode === 'terminal' || isUser ? 'ui-monospace, monospace' : 'inherit',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                // Limit very long messages
                maxHeight: '200px',
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              {text.length > 500 ? (
                <>
                  {text.slice(0, 500)}
                  <span style={{ color: colors.textDim }}>... (tap to expand)</span>
                </>
              ) : (
                text
              )}
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}

export default MessageHistory;
