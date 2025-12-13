/**
 * IPC Handler Registration Module
 *
 * This module consolidates all IPC handler registrations, extracted from the main index.ts
 * to improve code organization and maintainability.
 *
 * Each handler module exports a register function that sets up the relevant ipcMain.handle calls.
 */

import { registerGitHandlers } from './git';

// Re-export individual handlers for selective registration
export { registerGitHandlers };

/**
 * Register all IPC handlers.
 * Call this once during app initialization.
 */
export function registerAllHandlers(): void {
  registerGitHandlers();
  // Future handlers will be registered here:
  // registerAutorunHandlers();
  // registerPlaybooksHandlers();
  // registerHistoryHandlers();
  // registerAgentsHandlers();
  // registerProcessHandlers();
  // registerPersistenceHandlers();
  // registerSystemHandlers();
}
