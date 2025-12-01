import React, { useState, useEffect, useRef } from 'react';
import { X, Trophy, FlaskConical, Play, RotateCcw } from 'lucide-react';
import type { Theme, AutoRunStats } from '../types';
import { useLayerStack } from '../contexts/LayerStackContext';
import { MODAL_PRIORITIES } from '../constants/modalPriorities';
import { AchievementCard } from './AchievementCard';
import { StandingOvationOverlay } from './StandingOvationOverlay';
import { CONDUCTOR_BADGES, getBadgeForTime } from '../constants/conductorBadges';

interface PlaygroundPanelProps {
  theme: Theme;
  themeMode: 'dark' | 'light';
  onClose: () => void;
}

type TabId = 'achievements';

interface Tab {
  id: TabId;
  label: string;
  icon: React.ReactNode;
}

const TABS: Tab[] = [
  { id: 'achievements', label: 'Achievements', icon: <Trophy className="w-4 h-4" /> },
];

export function PlaygroundPanel({ theme, themeMode, onClose }: PlaygroundPanelProps) {
  const { registerLayer, unregisterLayer, updateLayerHandler } = useLayerStack();
  const layerIdRef = useRef<string>();
  const containerRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  // Keep ref up to date
  onCloseRef.current = onClose;

  const [activeTab, setActiveTab] = useState<TabId>('achievements');

  // Achievement playground state
  const [mockCumulativeTime, setMockCumulativeTime] = useState(0);
  const [mockLongestRun, setMockLongestRun] = useState(0);
  const [mockTotalRuns, setMockTotalRuns] = useState(0);
  const [mockBadgeHistory, setMockBadgeHistory] = useState<{ level: number; unlockedAt: number }[]>([]);
  const [showStandingOvation, setShowStandingOvation] = useState(false);
  const [ovationBadgeLevel, setOvationBadgeLevel] = useState(1);
  const [ovationIsNewRecord, setOvationIsNewRecord] = useState(false);

  // Register layer on mount
  useEffect(() => {
    const id = registerLayer({
      type: 'modal',
      priority: MODAL_PRIORITIES.STANDING_OVATION - 1, // Just below standing ovation
      blocksLowerLayers: true,
      capturesFocus: true,
      focusTrap: 'strict',
      ariaLabel: 'Developer Playground',
      onEscape: () => onCloseRef.current(),
    });
    layerIdRef.current = id;
    containerRef.current?.focus();

    return () => {
      if (layerIdRef.current) {
        unregisterLayer(layerIdRef.current);
      }
    };
  }, [registerLayer, unregisterLayer]);

  // Update handler when dependencies change
  useEffect(() => {
    if (layerIdRef.current) {
      updateLayerHandler(layerIdRef.current, () => onCloseRef.current());
    }
  }, [updateLayerHandler]);

  // Build mock AutoRunStats
  const mockAutoRunStats: AutoRunStats = {
    cumulativeTimeMs: mockCumulativeTime,
    longestRunMs: mockLongestRun,
    longestRunTimestamp: Date.now(),
    totalRuns: mockTotalRuns,
    currentBadgeLevel: getBadgeForTime(mockCumulativeTime)?.level || 0,
    lastBadgeUnlockLevel: mockBadgeHistory.length > 0 ? mockBadgeHistory[mockBadgeHistory.length - 1].level : 0,
    badgeHistory: mockBadgeHistory,
  };

  // Set time to a specific badge level
  const setToBadgeLevel = (level: number) => {
    const badge = CONDUCTOR_BADGES.find(b => b.level === level);
    if (badge) {
      setMockCumulativeTime(badge.requiredTimeMs);
      // Build history up to this level
      const history = CONDUCTOR_BADGES
        .filter(b => b.level <= level)
        .map(b => ({ level: b.level, unlockedAt: Date.now() - (level - b.level) * 86400000 }));
      setMockBadgeHistory(history);
    }
  };

  // Trigger standing ovation
  const triggerOvation = () => {
    const badge = CONDUCTOR_BADGES.find(b => b.level === ovationBadgeLevel);
    if (badge) {
      setShowStandingOvation(true);
    }
  };

  // Reset all mock data
  const resetMockData = () => {
    setMockCumulativeTime(0);
    setMockLongestRun(0);
    setMockTotalRuns(0);
    setMockBadgeHistory([]);
  };

  // Format time for display
  const formatMs = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  return (
    <>
      <div
        ref={containerRef}
        className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[9998] animate-in fade-in duration-200"
        role="dialog"
        aria-modal="true"
        aria-label="Developer Playground"
        tabIndex={-1}
      >
        <div
          className="w-[90vw] h-[90vh] max-w-5xl border rounded-lg shadow-2xl overflow-hidden flex flex-col"
          style={{ backgroundColor: theme.colors.bgSidebar, borderColor: theme.colors.border }}
        >
          {/* Header */}
          <div
            className="p-4 border-b flex items-center justify-between"
            style={{ borderColor: theme.colors.border }}
          >
            <div className="flex items-center gap-2">
              <FlaskConical className="w-5 h-5" style={{ color: theme.colors.accent }} />
              <h2 className="text-lg font-bold" style={{ color: theme.colors.textMain }}>
                Developer Playground
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-white/10 transition-colors"
              style={{ color: theme.colors.textDim }}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b" style={{ borderColor: theme.colors.border }}>
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === tab.id ? 'border-b-2' : ''
                }`}
                style={{
                  color: activeTab === tab.id ? theme.colors.accent : theme.colors.textDim,
                  borderColor: activeTab === tab.id ? theme.colors.accent : 'transparent',
                  backgroundColor: activeTab === tab.id ? `${theme.colors.accent}10` : 'transparent',
                }}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto p-6">
            {activeTab === 'achievements' && (
              <div className="grid grid-cols-2 gap-6">
                {/* Controls */}
                <div className="space-y-6">
                  <div
                    className="p-4 rounded-lg border"
                    style={{ borderColor: theme.colors.border, backgroundColor: theme.colors.bgActivity }}
                  >
                    <h3 className="text-sm font-bold mb-4" style={{ color: theme.colors.textMain }}>
                      Quick Set Badge Level
                    </h3>
                    <div className="grid grid-cols-4 gap-2">
                      {[0, ...CONDUCTOR_BADGES.map(b => b.level)].map(level => (
                        <button
                          key={level}
                          onClick={() => setToBadgeLevel(level)}
                          className="px-3 py-2 rounded text-sm font-medium transition-colors hover:opacity-80"
                          style={{
                            backgroundColor: mockAutoRunStats.currentBadgeLevel === level
                              ? theme.colors.accent
                              : theme.colors.bgMain,
                            color: mockAutoRunStats.currentBadgeLevel === level
                              ? '#fff'
                              : theme.colors.textMain,
                          }}
                        >
                          {level === 0 ? 'None' : `Lv ${level}`}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div
                    className="p-4 rounded-lg border"
                    style={{ borderColor: theme.colors.border, backgroundColor: theme.colors.bgActivity }}
                  >
                    <h3 className="text-sm font-bold mb-4" style={{ color: theme.colors.textMain }}>
                      Manual Time Controls
                    </h3>
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs" style={{ color: theme.colors.textDim }}>
                          Cumulative Time: {formatMs(mockCumulativeTime)}
                        </label>
                        <input
                          type="range"
                          min={0}
                          max={315360000000} // 10 years in ms
                          value={mockCumulativeTime}
                          onChange={e => setMockCumulativeTime(Number(e.target.value))}
                          className="w-full"
                        />
                      </div>
                      <div>
                        <label className="text-xs" style={{ color: theme.colors.textDim }}>
                          Longest Run: {formatMs(mockLongestRun)}
                        </label>
                        <input
                          type="range"
                          min={0}
                          max={86400000 * 7} // 7 days in ms
                          value={mockLongestRun}
                          onChange={e => setMockLongestRun(Number(e.target.value))}
                          className="w-full"
                        />
                      </div>
                      <div>
                        <label className="text-xs" style={{ color: theme.colors.textDim }}>
                          Total Runs: {mockTotalRuns}
                        </label>
                        <input
                          type="range"
                          min={0}
                          max={1000}
                          value={mockTotalRuns}
                          onChange={e => setMockTotalRuns(Number(e.target.value))}
                          className="w-full"
                        />
                      </div>
                    </div>
                  </div>

                  <div
                    className="p-4 rounded-lg border"
                    style={{ borderColor: theme.colors.border, backgroundColor: theme.colors.bgActivity }}
                  >
                    <h3 className="text-sm font-bold mb-4" style={{ color: theme.colors.textMain }}>
                      Standing Ovation Test
                    </h3>
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs block mb-2" style={{ color: theme.colors.textDim }}>
                          Badge Level to Show
                        </label>
                        <select
                          value={ovationBadgeLevel}
                          onChange={e => setOvationBadgeLevel(Number(e.target.value))}
                          className="w-full px-3 py-2 rounded text-sm"
                          style={{
                            backgroundColor: theme.colors.bgMain,
                            color: theme.colors.textMain,
                            border: `1px solid ${theme.colors.border}`,
                          }}
                        >
                          {CONDUCTOR_BADGES.map(badge => (
                            <option key={badge.level} value={badge.level}>
                              Level {badge.level}: {badge.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="isNewRecord"
                          checked={ovationIsNewRecord}
                          onChange={e => setOvationIsNewRecord(e.target.checked)}
                        />
                        <label htmlFor="isNewRecord" className="text-xs" style={{ color: theme.colors.textDim }}>
                          Show as New Record
                        </label>
                      </div>
                      <button
                        onClick={triggerOvation}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded font-medium transition-colors"
                        style={{
                          backgroundColor: theme.colors.accent,
                          color: '#fff',
                        }}
                      >
                        <Play className="w-4 h-4" />
                        Trigger Standing Ovation
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={resetMockData}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded font-medium transition-colors border"
                    style={{
                      borderColor: theme.colors.border,
                      color: theme.colors.textDim,
                    }}
                  >
                    <RotateCcw className="w-4 h-4" />
                    Reset All Mock Data
                  </button>
                </div>

                {/* Preview */}
                <div>
                  <h3 className="text-sm font-bold mb-4" style={{ color: theme.colors.textMain }}>
                    Achievement Card Preview
                  </h3>
                  <AchievementCard theme={theme} autoRunStats={mockAutoRunStats} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Standing Ovation Overlay */}
      {showStandingOvation && (
        <StandingOvationOverlay
          theme={theme}
          themeMode={themeMode}
          badge={CONDUCTOR_BADGES.find(b => b.level === ovationBadgeLevel)!}
          cumulativeTimeMs={mockCumulativeTime}
          recordTimeMs={mockLongestRun}
          isNewRecord={ovationIsNewRecord}
          onClose={() => setShowStandingOvation(false)}
        />
      )}
    </>
  );
}

export default PlaygroundPanel;
