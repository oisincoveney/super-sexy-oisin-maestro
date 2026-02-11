/**
 * OpenSpec directory parser.
 *
 * Reads and parses openspec/ directory structures into structured data
 * for display in the Spec Browser UI. This is separate from openspec-manager.ts
 * which handles prompt/command management.
 *
 * All file operations use fs/promises for async I/O.
 * Errors are collected (not thrown) for graceful degradation.
 */

import fs from 'fs/promises';
import path from 'path';
import { logger } from './utils/logger';
import type {
	ParsedSpecDirectory,
	ParsedSpec,
	ParsedChange,
	ParsedTask,
	SpecParseError,
	SpecSummaryStats,
	ChangeStatus,
	TaskStatus,
} from '../shared/openspec-types';

const LOG_CONTEXT = '[OpenSpec Parser]';

/**
 * Check if a path exists and is a directory.
 */
async function isDirectory(dirPath: string): Promise<boolean> {
	try {
		const stat = await fs.stat(dirPath);
		return stat.isDirectory();
	} catch {
		return false;
	}
}

/**
 * Safely read a file's text content. Returns null if the file doesn't exist.
 */
async function readFileOptional(filePath: string): Promise<string | null> {
	try {
		return await fs.readFile(filePath, 'utf-8');
	} catch {
		return null;
	}
}

/**
 * Check if a file exists (without reading its content).
 */
async function fileExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

/**
 * Extract the first H1 title from markdown content.
 * Looks for `# Title` at the start of a line.
 */
function extractMarkdownTitle(content: string): string | null {
	const match = content.match(/^#\s+(.+)$/m);
	return match ? match[1].trim() : null;
}

/**
 * Extract description text from markdown content (first non-heading paragraph).
 */
function extractMarkdownDescription(content: string): string {
	const lines = content.split('\n');
	const descLines: string[] = [];
	let foundHeading = false;

	for (const line of lines) {
		const trimmed = line.trim();
		// Skip empty lines before content
		if (!foundHeading && trimmed.startsWith('#')) {
			foundHeading = true;
			continue;
		}
		if (!foundHeading) continue;
		// Skip empty lines right after heading
		if (descLines.length === 0 && trimmed === '') continue;
		// Stop at the next heading or horizontal rule
		if (trimmed.startsWith('#') || trimmed.startsWith('---')) break;
		descLines.push(trimmed);
	}

	return descLines.join(' ').trim();
}

/**
 * Try to extract a status from proposal.md front matter or content.
 * Looks for `status: proposed|approved|in-progress|done` in YAML front matter
 * or `**Status:** value` in body text.
 */
function extractChangeStatus(content: string): ChangeStatus {
	// Check YAML front matter
	const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
	if (fmMatch) {
		const statusMatch = fmMatch[1].match(/^status:\s*(.+)$/m);
		if (statusMatch) {
			const raw = statusMatch[1].trim().toLowerCase();
			if (isValidChangeStatus(raw)) return raw;
		}
	}

	// Check inline bold status marker
	const inlineMatch = content.match(/\*\*Status:\*\*\s*(\S+)/i);
	if (inlineMatch) {
		const raw = inlineMatch[1].trim().toLowerCase();
		if (isValidChangeStatus(raw)) return raw;
	}

	return 'proposed';
}

function isValidChangeStatus(value: string): value is ChangeStatus {
	return ['proposed', 'approved', 'in-progress', 'done', 'archived'].includes(value);
}

/**
 * Try to extract a creation date from a change directory name.
 * Change IDs may start with YYYY-MM-DD prefix.
 */
function extractCreationDate(changeId: string): string | undefined {
	const match = changeId.match(/^(\d{4}-\d{2}-\d{2})/);
	return match ? match[1] : undefined;
}

/**
 * Parse a tasks.md file into structured task data.
 *
 * Tasks use checkbox format:
 *   - [ ] T001: Description of pending task
 *   - [x] T002: Description of completed task
 *
 * Also handles tasks without explicit IDs:
 *   - [ ] Description (auto-generates an ID)
 */
export async function parseTasks(tasksPath: string): Promise<ParsedTask[]> {
	const content = await readFileOptional(tasksPath);
	if (content === null) return [];

	const tasks: ParsedTask[] = [];
	const lines = content.split('\n');
	let autoId = 1;

	for (const line of lines) {
		// Match checkbox lines: - [ ] or - [x] or - [X]
		const match = line.match(/^[\s]*-\s+\[([ xX])\]\s+(.+)$/);
		if (!match) continue;

		const isChecked = match[1].toLowerCase() === 'x';
		const rawText = match[2].trim();

		// Try to extract task ID: T001: Description or TASK-001: Description
		const idMatch = rawText.match(/^(T\d+|TASK-\d+):\s*(.+)$/i);

		let id: string;
		let title: string;

		if (idMatch) {
			id = idMatch[1].toUpperCase();
			title = idMatch[2].trim();
		} else {
			id = `T${String(autoId).padStart(3, '0')}`;
			title = rawText;
			autoId++;
		}

		const status: TaskStatus = isChecked ? 'done' : 'pending';

		tasks.push({ id, title, status });
	}

	return tasks;
}

/**
 * Parse a single spec directory (openspec/specs/[capability]/).
 * Reads spec.md for title and description.
 */
export async function parseSpec(specDir: string): Promise<ParsedSpec> {
	const id = path.basename(specDir);
	const specMdPath = path.join(specDir, 'spec.md');

	const content = await readFileOptional(specMdPath);

	let title = id;
	let description = '';

	if (content) {
		title = extractMarkdownTitle(content) || id;
		description = extractMarkdownDescription(content);
	}

	return {
		id,
		title,
		description,
		path: specDir,
		changes: [], // Populated by parseOpenSpecDirectory after changes are parsed
	};
}

/**
 * Parse a single change directory (openspec/changes/[change-id]/).
 * Reads proposal.md for title/status and tasks.md for task list.
 */
export async function parseChange(changeDir: string): Promise<ParsedChange> {
	const id = path.basename(changeDir);
	const proposalPath = path.join(changeDir, 'proposal.md');
	const tasksFilePath = path.join(changeDir, 'tasks.md');
	const designPath = path.join(changeDir, 'design.md');

	const proposalContent = await readFileOptional(proposalPath);

	let title = id;
	let status: ChangeStatus = 'proposed';

	if (proposalContent) {
		title = extractMarkdownTitle(proposalContent) || id;
		status = extractChangeStatus(proposalContent);
	}

	const tasks = await parseTasks(tasksFilePath);

	// Check which optional files exist (use stat to avoid re-reading content)
	const proposalExists = proposalContent !== null;
	const tasksExists = tasks.length > 0 || (await fileExists(tasksFilePath));
	const designExists = await fileExists(designPath);

	const creationDate = extractCreationDate(id);

	return {
		id,
		title,
		status,
		tasks,
		proposalPath: proposalExists ? proposalPath : undefined,
		tasksPath: tasksExists ? tasksFilePath : undefined,
		designPath: designExists ? designPath : undefined,
		creationDate,
	};
}

/**
 * Parse an entire openspec/ directory structure.
 *
 * Entry point for spec parsing. Checks for openspec/ subdirectory,
 * reads project.md, enumerates specs and changes.
 *
 * Returns a default empty structure if openspec/ doesn't exist
 * (graceful degradation, no errors).
 */
export async function parseOpenSpecDirectory(rootPath: string): Promise<ParsedSpecDirectory> {
	const errors: SpecParseError[] = [];
	const openspecDir = path.join(rootPath, 'openspec');

	// Default empty result
	const emptyResult: ParsedSpecDirectory = {
		rootPath,
		specs: [],
		changes: [],
		stats: { totalSpecs: 0, totalChanges: 0, totalTasks: 0, completedTasks: 0 },
		errors: [],
	};

	// Check if openspec/ directory exists
	if (!(await isDirectory(openspecDir))) {
		return emptyResult;
	}

	logger.info(LOG_CONTEXT, `Parsing OpenSpec directory: ${openspecDir}`);

	// Read project.md
	const projectMd = await readFileOptional(path.join(openspecDir, 'project.md'));

	// Parse specs
	const specs: ParsedSpec[] = [];
	const specsDir = path.join(openspecDir, 'specs');

	if (await isDirectory(specsDir)) {
		try {
			const specEntries = await fs.readdir(specsDir, { withFileTypes: true });
			for (const entry of specEntries) {
				if (!entry.isDirectory()) continue;
				try {
					const spec = await parseSpec(path.join(specsDir, entry.name));
					specs.push(spec);
				} catch (err) {
					errors.push({
						path: path.join(specsDir, entry.name),
						message: `Failed to parse spec: ${err instanceof Error ? err.message : String(err)}`,
						severity: 'warning',
					});
				}
			}
		} catch (err) {
			errors.push({
				path: specsDir,
				message: `Failed to read specs directory: ${err instanceof Error ? err.message : String(err)}`,
				severity: 'error',
			});
		}
	}

	// Parse changes
	const changes: ParsedChange[] = [];
	const changesDir = path.join(openspecDir, 'changes');

	if (await isDirectory(changesDir)) {
		try {
			const changeEntries = await fs.readdir(changesDir, { withFileTypes: true });
			for (const entry of changeEntries) {
				if (!entry.isDirectory()) continue;
				// Skip the archive directory
				if (entry.name === 'archive') continue;
				try {
					const change = await parseChange(path.join(changesDir, entry.name));
					changes.push(change);
				} catch (err) {
					errors.push({
						path: path.join(changesDir, entry.name),
						message: `Failed to parse change: ${err instanceof Error ? err.message : String(err)}`,
						severity: 'warning',
					});
				}
			}
		} catch (err) {
			errors.push({
				path: changesDir,
				message: `Failed to read changes directory: ${err instanceof Error ? err.message : String(err)}`,
				severity: 'error',
			});
		}
	}

	// Link changes to specs by checking if a change has a specs/ subdirectory
	// with matching spec names
	for (const change of changes) {
		const changeSpecsDir = path.join(changesDir, change.id, 'specs');
		if (await isDirectory(changeSpecsDir)) {
			try {
				const deltaEntries = await fs.readdir(changeSpecsDir, { withFileTypes: true });
				for (const delta of deltaEntries) {
					if (!delta.isDirectory()) continue;
					const matchingSpec = specs.find((s) => s.id === delta.name);
					if (matchingSpec) {
						matchingSpec.changes.push(change);
					}
				}
			} catch {
				// Non-fatal: change just won't be linked to specs
			}
		}
	}

	// Compute summary stats
	const stats: SpecSummaryStats = {
		totalSpecs: specs.length,
		totalChanges: changes.length,
		totalTasks: changes.reduce((sum, c) => sum + c.tasks.length, 0),
		completedTasks: changes.reduce(
			(sum, c) => sum + c.tasks.filter((t) => t.status === 'done').length,
			0
		),
	};

	logger.info(
		LOG_CONTEXT,
		`Parsed ${stats.totalSpecs} specs, ${stats.totalChanges} changes, ${stats.totalTasks} tasks (${stats.completedTasks} done)`
	);

	return {
		rootPath,
		projectMd: projectMd ?? undefined,
		specs,
		changes,
		stats,
		errors,
	};
}
