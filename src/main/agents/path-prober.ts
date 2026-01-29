/**
 * Path Prober - Platform-specific binary detection
 *
 * Handles detection of agent binaries on Windows and Unix-like systems.
 * Packaged Electron apps don't inherit shell environment, so we need to
 * probe known installation paths directly.
 */

import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { execFileNoThrow } from '../utils/execFile';
import { logger } from '../utils/logger';
import { expandTilde, detectNodeVersionManagerBinPaths } from '../../shared/pathUtils';

const LOG_CONTEXT = 'PathProber';

// ============ Types ============

export interface BinaryDetectionResult {
	exists: boolean;
	path?: string;
}

// ============ Environment Expansion ============

/**
 * Build an expanded PATH that includes common binary installation locations.
 * This is necessary because packaged Electron apps don't inherit shell environment.
 */
export function getExpandedEnv(): NodeJS.ProcessEnv {
	const home = os.homedir();
	const env = { ...process.env };
	const isWindows = process.platform === 'win32';

	// Platform-specific paths
	let additionalPaths: string[];

	if (isWindows) {
		// Windows-specific paths
		const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
		const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
		const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
		const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

		additionalPaths = [
			// Claude Code PowerShell installer (irm https://claude.ai/install.ps1 | iex)
			// This is the primary installation method - installs claude.exe to ~/.local/bin
			path.join(home, '.local', 'bin'),
			// Claude Code winget install (winget install --id Anthropic.ClaudeCode)
			path.join(localAppData, 'Microsoft', 'WinGet', 'Links'),
			path.join(programFiles, 'WinGet', 'Links'),
			path.join(localAppData, 'Microsoft', 'WinGet', 'Packages'),
			path.join(programFiles, 'WinGet', 'Packages'),
			// npm global installs (Claude Code, Codex CLI, Gemini CLI)
			path.join(appData, 'npm'),
			path.join(localAppData, 'npm'),
			// Claude Code CLI install location (npm global)
			path.join(appData, 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'cli'),
			// Codex CLI install location (npm global)
			path.join(appData, 'npm', 'node_modules', '@openai', 'codex', 'bin'),
			// User local programs
			path.join(localAppData, 'Programs'),
			path.join(localAppData, 'Microsoft', 'WindowsApps'),
			// Python/pip user installs (for Aider)
			path.join(appData, 'Python', 'Scripts'),
			path.join(localAppData, 'Programs', 'Python', 'Python312', 'Scripts'),
			path.join(localAppData, 'Programs', 'Python', 'Python311', 'Scripts'),
			path.join(localAppData, 'Programs', 'Python', 'Python310', 'Scripts'),
			// Git for Windows (provides bash, common tools)
			path.join(programFiles, 'Git', 'cmd'),
			path.join(programFiles, 'Git', 'bin'),
			path.join(programFiles, 'Git', 'usr', 'bin'),
			path.join(programFilesX86, 'Git', 'cmd'),
			path.join(programFilesX86, 'Git', 'bin'),
			// Node.js
			path.join(programFiles, 'nodejs'),
			path.join(localAppData, 'Programs', 'node'),
			// Scoop package manager (OpenCode, other tools)
			path.join(home, 'scoop', 'shims'),
			path.join(home, 'scoop', 'apps', 'opencode', 'current'),
			// Chocolatey (OpenCode, other tools)
			path.join(process.env.ChocolateyInstall || 'C:\\ProgramData\\chocolatey', 'bin'),
			// Go binaries (some tools installed via 'go install')
			path.join(home, 'go', 'bin'),
			// Windows system paths
			path.join(process.env.SystemRoot || 'C:\\Windows', 'System32'),
			path.join(process.env.SystemRoot || 'C:\\Windows'),
		];
	} else {
		// Unix-like paths (macOS/Linux)
		additionalPaths = [
			'/opt/homebrew/bin', // Homebrew on Apple Silicon
			'/opt/homebrew/sbin',
			'/usr/local/bin', // Homebrew on Intel, common install location
			'/usr/local/sbin',
			`${home}/.local/bin`, // User local installs (pip, etc.)
			`${home}/.npm-global/bin`, // npm global with custom prefix
			`${home}/bin`, // User bin directory
			`${home}/.claude/local`, // Claude local install location
			`${home}/.opencode/bin`, // OpenCode installer default location
			'/usr/bin',
			'/bin',
			'/usr/sbin',
			'/sbin',
		];
	}

	const currentPath = env.PATH || '';
	// Use platform-appropriate path delimiter
	const pathParts = currentPath.split(path.delimiter);

	// Add paths that aren't already present
	for (const p of additionalPaths) {
		if (!pathParts.includes(p)) {
			pathParts.unshift(p);
		}
	}

	env.PATH = pathParts.join(path.delimiter);
	return env;
}

// ============ Custom Path Validation ============

/**
 * Check if a custom path points to a valid executable
 * On Windows, also tries .cmd and .exe extensions if the path doesn't exist as-is
 */
export async function checkCustomPath(customPath: string): Promise<BinaryDetectionResult> {
	const isWindows = process.platform === 'win32';

	// Expand tilde to home directory (Node.js fs doesn't understand ~)
	const expandedPath = expandTilde(customPath);

	// Helper to check if a specific path exists and is a file
	const checkPath = async (pathToCheck: string): Promise<boolean> => {
		try {
			const stats = await fs.promises.stat(pathToCheck);
			return stats.isFile();
		} catch {
			return false;
		}
	};

	try {
		// First, try the exact path provided (with tilde expanded)
		if (await checkPath(expandedPath)) {
			// Check if file is executable (on Unix systems)
			if (!isWindows) {
				try {
					await fs.promises.access(expandedPath, fs.constants.X_OK);
				} catch {
					logger.warn(`Custom path exists but is not executable: ${customPath}`, LOG_CONTEXT);
					return { exists: false };
				}
			}
			// Return the expanded path so it can be used directly
			return { exists: true, path: expandedPath };
		}

		// On Windows, if the exact path doesn't exist, try with .cmd and .exe extensions
		if (isWindows) {
			const lowerPath = expandedPath.toLowerCase();
			// Only try extensions if the path doesn't already have one
			if (!lowerPath.endsWith('.cmd') && !lowerPath.endsWith('.exe')) {
				// Try .exe first (preferred), then .cmd
				const exePath = expandedPath + '.exe';
				if (await checkPath(exePath)) {
					logger.debug(`Custom path resolved with .exe extension`, LOG_CONTEXT, {
						original: customPath,
						resolved: exePath,
					});
					return { exists: true, path: exePath };
				}

				const cmdPath = expandedPath + '.cmd';
				if (await checkPath(cmdPath)) {
					logger.debug(`Custom path resolved with .cmd extension`, LOG_CONTEXT, {
						original: customPath,
						resolved: cmdPath,
					});
					return { exists: true, path: cmdPath };
				}
			}
		}

		return { exists: false };
	} catch {
		return { exists: false };
	}
}

// ============ Windows Path Probing ============

/**
 * Known installation paths for binaries on Windows
 */
function getWindowsKnownPaths(binaryName: string): string[] {
	const home = os.homedir();
	const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
	const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
	const programFiles = process.env.ProgramFiles || 'C:\\Program Files';

	// Define known installation paths for each binary, in priority order
	// Prefer .exe (standalone installers) over .cmd (npm wrappers)
	const knownPaths: Record<string, string[]> = {
		claude: [
			// PowerShell installer (primary method) - installs claude.exe
			path.join(home, '.local', 'bin', 'claude.exe'),
			// Winget installation
			path.join(localAppData, 'Microsoft', 'WinGet', 'Links', 'claude.exe'),
			path.join(programFiles, 'WinGet', 'Links', 'claude.exe'),
			// npm global installation - creates .cmd wrapper
			path.join(appData, 'npm', 'claude.cmd'),
			path.join(localAppData, 'npm', 'claude.cmd'),
			// WindowsApps (Microsoft Store style)
			path.join(localAppData, 'Microsoft', 'WindowsApps', 'claude.exe'),
		],
		codex: [
			// npm global installation (primary method for Codex)
			path.join(appData, 'npm', 'codex.cmd'),
			path.join(localAppData, 'npm', 'codex.cmd'),
			// Possible standalone in future
			path.join(home, '.local', 'bin', 'codex.exe'),
		],
		opencode: [
			// Scoop installation (recommended for OpenCode)
			path.join(home, 'scoop', 'shims', 'opencode.exe'),
			path.join(home, 'scoop', 'apps', 'opencode', 'current', 'opencode.exe'),
			// Chocolatey installation
			path.join(
				process.env.ChocolateyInstall || 'C:\\ProgramData\\chocolatey',
				'bin',
				'opencode.exe'
			),
			// Go install
			path.join(home, 'go', 'bin', 'opencode.exe'),
			// npm (has known issues on Windows, but check anyway)
			path.join(appData, 'npm', 'opencode.cmd'),
		],
		gemini: [
			// npm global installation
			path.join(appData, 'npm', 'gemini.cmd'),
			path.join(localAppData, 'npm', 'gemini.cmd'),
		],
		aider: [
			// pip installation
			path.join(appData, 'Python', 'Scripts', 'aider.exe'),
			path.join(localAppData, 'Programs', 'Python', 'Python312', 'Scripts', 'aider.exe'),
			path.join(localAppData, 'Programs', 'Python', 'Python311', 'Scripts', 'aider.exe'),
			path.join(localAppData, 'Programs', 'Python', 'Python310', 'Scripts', 'aider.exe'),
		],
	};

	return knownPaths[binaryName] || [];
}

/**
 * On Windows, directly probe known installation paths for a binary.
 * This is more reliable than `where` command which may fail in packaged Electron apps.
 * Returns the first existing path found, preferring .exe over .cmd.
 */
export async function probeWindowsPaths(binaryName: string): Promise<string | null> {
	const pathsToCheck = getWindowsKnownPaths(binaryName);

	for (const probePath of pathsToCheck) {
		try {
			await fs.promises.access(probePath, fs.constants.F_OK);
			logger.debug(`Direct probe found ${binaryName}`, LOG_CONTEXT, { path: probePath });
			return probePath;
		} catch {
			// Path doesn't exist, continue to next
		}
	}

	return null;
}

// ============ Unix Path Probing ============

/**
 * Known installation paths for binaries on Unix-like systems
 */
function getUnixKnownPaths(binaryName: string): string[] {
	const home = os.homedir();

	// Get dynamic paths from Node version managers (nvm, fnm, volta, etc.)
	const versionManagerPaths = detectNodeVersionManagerBinPaths();

	// Define known installation paths for each binary, in priority order
	const knownPaths: Record<string, string[]> = {
		claude: [
			// Claude Code default installation location (irm https://claude.ai/install.ps1 equivalent on macOS)
			path.join(home, '.claude', 'local', 'claude'),
			// User local bin (pip, manual installs)
			path.join(home, '.local', 'bin', 'claude'),
			// Homebrew on Apple Silicon
			'/opt/homebrew/bin/claude',
			// Homebrew on Intel Mac
			'/usr/local/bin/claude',
			// npm global with custom prefix
			path.join(home, '.npm-global', 'bin', 'claude'),
			// User bin directory
			path.join(home, 'bin', 'claude'),
			// Add paths from Node version managers (nvm, fnm, volta, etc.)
			...versionManagerPaths.map((p) => path.join(p, 'claude')),
		],
		codex: [
			// User local bin
			path.join(home, '.local', 'bin', 'codex'),
			// Homebrew paths
			'/opt/homebrew/bin/codex',
			'/usr/local/bin/codex',
			// npm global
			path.join(home, '.npm-global', 'bin', 'codex'),
			// Add paths from Node version managers (nvm, fnm, volta, etc.)
			...versionManagerPaths.map((p) => path.join(p, 'codex')),
		],
		opencode: [
			// OpenCode installer default location
			path.join(home, '.opencode', 'bin', 'opencode'),
			// Go install location
			path.join(home, 'go', 'bin', 'opencode'),
			// User local bin
			path.join(home, '.local', 'bin', 'opencode'),
			// Homebrew paths
			'/opt/homebrew/bin/opencode',
			'/usr/local/bin/opencode',
			// Add paths from Node version managers (nvm, fnm, volta, etc.)
			...versionManagerPaths.map((p) => path.join(p, 'opencode')),
		],
		gemini: [
			// npm global paths
			path.join(home, '.npm-global', 'bin', 'gemini'),
			'/opt/homebrew/bin/gemini',
			'/usr/local/bin/gemini',
			// Add paths from Node version managers (nvm, fnm, volta, etc.)
			...versionManagerPaths.map((p) => path.join(p, 'gemini')),
		],
		aider: [
			// pip installation
			path.join(home, '.local', 'bin', 'aider'),
			// Homebrew paths
			'/opt/homebrew/bin/aider',
			'/usr/local/bin/aider',
			// Add paths from Node version managers (in case installed via npm)
			...versionManagerPaths.map((p) => path.join(p, 'aider')),
		],
	};

	return knownPaths[binaryName] || [];
}

/**
 * On macOS/Linux, directly probe known installation paths for a binary.
 * This is necessary because packaged Electron apps don't inherit shell aliases,
 * and 'which' may fail to find binaries in non-standard locations.
 * Returns the first existing executable path found.
 */
export async function probeUnixPaths(binaryName: string): Promise<string | null> {
	const pathsToCheck = getUnixKnownPaths(binaryName);

	for (const probePath of pathsToCheck) {
		try {
			// Check both existence and executability
			await fs.promises.access(probePath, fs.constants.F_OK | fs.constants.X_OK);
			logger.debug(`Direct probe found ${binaryName}`, LOG_CONTEXT, { path: probePath });
			return probePath;
		} catch {
			// Path doesn't exist or isn't executable, continue to next
		}
	}

	return null;
}

// ============ Binary Detection ============

/**
 * Check if a binary exists in PATH or known installation locations.
 * On Windows, this also handles .cmd and .exe extensions properly.
 *
 * Detection order:
 * 1. Direct probe of known installation paths (most reliable)
 * 2. Fall back to which/where command with expanded PATH
 */
export async function checkBinaryExists(binaryName: string): Promise<BinaryDetectionResult> {
	const isWindows = process.platform === 'win32';

	// First try direct file probing of known installation paths
	// This is more reliable than which/where in packaged Electron apps
	if (isWindows) {
		const probedPath = await probeWindowsPaths(binaryName);
		if (probedPath) {
			return { exists: true, path: probedPath };
		}
		logger.debug(`Direct probe failed for ${binaryName}, falling back to where`, LOG_CONTEXT);
	} else {
		// macOS/Linux: probe known paths first
		const probedPath = await probeUnixPaths(binaryName);
		if (probedPath) {
			return { exists: true, path: probedPath };
		}
		logger.debug(`Direct probe failed for ${binaryName}, falling back to which`, LOG_CONTEXT);
	}

	try {
		// Use 'which' on Unix-like systems, 'where' on Windows
		const command = isWindows ? 'where' : 'which';

		// Use expanded PATH to find binaries in common installation locations
		// This is critical for packaged Electron apps which don't inherit shell env
		const env = getExpandedEnv();
		const result = await execFileNoThrow(command, [binaryName], undefined, env);

		if (result.exitCode === 0 && result.stdout.trim()) {
			// Get all matches (Windows 'where' can return multiple)
			// Handle both Unix (\n) and Windows (\r\n) line endings
			const matches = result.stdout
				.trim()
				.split(/\r?\n/)
				.map((p) => p.trim())
				.filter((p) => p);

			if (process.platform === 'win32' && matches.length > 0) {
				// On Windows, prefer .exe over .cmd over extensionless
				// This helps with proper execution handling
				const exeMatch = matches.find((p) => p.toLowerCase().endsWith('.exe'));
				const cmdMatch = matches.find((p) => p.toLowerCase().endsWith('.cmd'));

				// Return the best match: .exe > .cmd > first result
				let bestMatch = exeMatch || cmdMatch || matches[0];

				// If the first match doesn't have an extension, check if .cmd or .exe version exists
				// This handles cases where 'where' returns a path without extension
				if (
					!bestMatch.toLowerCase().endsWith('.exe') &&
					!bestMatch.toLowerCase().endsWith('.cmd')
				) {
					const cmdPath = bestMatch + '.cmd';
					const exePath = bestMatch + '.exe';

					// Check if the .exe or .cmd version exists
					try {
						await fs.promises.access(exePath, fs.constants.F_OK);
						bestMatch = exePath;
						logger.debug(`Found .exe version of ${binaryName}`, LOG_CONTEXT, {
							path: exePath,
						});
					} catch {
						try {
							await fs.promises.access(cmdPath, fs.constants.F_OK);
							bestMatch = cmdPath;
							logger.debug(`Found .cmd version of ${binaryName}`, LOG_CONTEXT, {
								path: cmdPath,
							});
						} catch {
							// Neither .exe nor .cmd exists, use the original path
						}
					}
				}

				logger.debug(`Windows binary detection for ${binaryName}`, LOG_CONTEXT, {
					allMatches: matches,
					selectedMatch: bestMatch,
					isCmd: bestMatch.toLowerCase().endsWith('.cmd'),
					isExe: bestMatch.toLowerCase().endsWith('.exe'),
				});

				return {
					exists: true,
					path: bestMatch,
				};
			}

			return {
				exists: true,
				path: matches[0], // First match for Unix
			};
		}

		return { exists: false };
	} catch {
		return { exists: false };
	}
}
