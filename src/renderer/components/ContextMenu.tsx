import React, { useRef, useEffect } from 'react';
import type { Theme } from '../types';
import { useClickOutside } from '../hooks';

export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean; // Use error color for destructive actions
  dividerAfter?: boolean; // Add divider after this item
}

export interface ContextMenuProps {
  x: number;
  y: number;
  theme: Theme;
  items: ContextMenuItem[];
  onClose: () => void;
  minWidth?: string;
}

/**
 * Reusable context menu component with viewport-aware positioning.
 *
 * Features:
 * - Adjusts position to stay within viewport bounds
 * - Closes on Escape key or click outside
 * - Themed styling with hover states
 * - Support for disabled items and dividers
 * - Optional danger/destructive styling
 *
 * Usage:
 * ```tsx
 * {contextMenu && (
 *   <ContextMenu
 *     x={contextMenu.x}
 *     y={contextMenu.y}
 *     theme={theme}
 *     items={[
 *       { label: 'Rename', icon: <Edit2 />, onClick: () => handleRename() },
 *       { label: 'Delete', icon: <Trash2 />, onClick: () => handleDelete(), danger: true },
 *     ]}
 *     onClose={() => setContextMenu(null)}
 *   />
 * )}
 * ```
 */
export function ContextMenu({
  x,
  y,
  theme,
  items,
  onClose,
  minWidth = '160px'
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Use ref to avoid re-registering listener when onClose changes
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Close on click outside
  useClickOutside(menuRef, onClose);

  // Close on Escape - stable listener that never re-registers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Adjust menu position to stay within viewport
  const adjustedPosition = {
    left: Math.min(x, window.innerWidth - 200),
    top: Math.min(y, window.innerHeight - (items.length * 32 + 20)) // Estimate menu height
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-50 py-1 rounded-md shadow-xl border"
      style={{
        left: adjustedPosition.left,
        top: adjustedPosition.top,
        backgroundColor: theme.colors.bgSidebar,
        borderColor: theme.colors.border,
        minWidth
      }}
      onClick={(e) => e.stopPropagation()} // Prevent clicks from bubbling
    >
      {items.map((item, index) => (
        <React.Fragment key={index}>
          <button
            onClick={() => {
              if (!item.disabled) {
                item.onClick();
                onClose();
              }
            }}
            disabled={item.disabled}
            className={`
              w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center gap-2
              ${item.disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white/5'}
            `}
            style={{
              color: item.danger ? theme.colors.error : theme.colors.textMain
            }}
          >
            {item.icon && (
              <span className="w-3.5 h-3.5 shrink-0" style={{ color: item.danger ? theme.colors.error : theme.colors.textDim }}>
                {item.icon}
              </span>
            )}
            {item.label}
          </button>
          {item.dividerAfter && (
            <div className="my-1 border-t" style={{ borderColor: theme.colors.border }} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
