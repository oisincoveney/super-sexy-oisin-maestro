/**
 * Parsed OpenSpec types for spec content representation.
 *
 * These types represent the **parsed** spec data read from the openspec/ directory
 * structure. They are distinct from the prompt/command types in openspec-manager.ts
 * (OpenSpecCommand, OpenSpecMetadata) which deal with prompt management.
 *
 * Shared between main process (parser) and renderer (UI components).
 *
 * Directory structure reference (from openspec.help.md):
 *   openspec/
 *   ├── project.md
 *   ├── specs/[capability]/spec.md
 *   └── changes/[change-id]/{proposal.md, tasks.md, design.md, specs/}
 *       └── archive/YYYY-MM-DD-[change-id]/
 */

/** Status of an individual task within a change */
export type TaskStatus = 'pending' | 'in-progress' | 'done';

/** Status of a change (proposal lifecycle) */
export type ChangeStatus = 'proposed' | 'approved' | 'in-progress' | 'done' | 'archived';

/** Severity level for parse errors */
export type ParseErrorSeverity = 'warning' | 'error';

/**
 * A single task parsed from a change's tasks.md file.
 * Tasks use checkbox format: `- [ ] T001: Description` or `- [x] T001: Done task`
 */
export interface ParsedTask {
	/** Task identifier, e.g. "T001" */
	id: string;
	/** Short task title/description */
	title: string;
	/** Extended description, if available */
	description?: string;
	/** Current completion status */
	status: TaskStatus;
	/** Worktree assigned to this task, if any */
	assignedWorktree?: string;
}

/**
 * A parsed change directory (openspec/changes/[change-id]/).
 * Changes represent proposed modifications moving through a lifecycle.
 */
export interface ParsedChange {
	/** Directory name used as the change identifier (kebab-case, verb-led) */
	id: string;
	/** Title extracted from proposal.md */
	title: string;
	/** Lifecycle status of the change */
	status: ChangeStatus;
	/** Tasks parsed from tasks.md */
	tasks: ParsedTask[];
	/** Path to proposal.md, if it exists */
	proposalPath?: string;
	/** Path to tasks.md, if it exists */
	tasksPath?: string;
	/** Path to design.md, if it exists */
	designPath?: string;
	/** When the change was created (from directory name or file metadata) */
	creationDate?: string;
}

/**
 * A parsed spec directory (openspec/specs/[capability]/).
 * Specs represent deployed capability specifications (source of truth).
 */
export interface ParsedSpec {
	/** Directory name used as the spec identifier */
	id: string;
	/** Title extracted from spec.md */
	title: string;
	/** Description extracted from spec.md */
	description: string;
	/** Absolute path to the spec directory */
	path: string;
	/** Changes that reference or modify this spec */
	changes: ParsedChange[];
}

/**
 * Summary statistics for an OpenSpec directory.
 */
export interface SpecSummaryStats {
	/** Total number of specs */
	totalSpecs: number;
	/** Total number of changes (excluding archived) */
	totalChanges: number;
	/** Total number of tasks across all changes */
	totalTasks: number;
	/** Number of completed tasks */
	completedTasks: number;
}

/**
 * The fully parsed openspec/ directory for a project.
 * Entry-point type returned by parseOpenSpecDirectory().
 */
export interface ParsedSpecDirectory {
	/** Absolute path to the project root (parent of openspec/) */
	rootPath: string;
	/** Content of openspec/project.md, if it exists */
	projectMd?: string;
	/** All parsed specs from openspec/specs/ */
	specs: ParsedSpec[];
	/** All parsed changes from openspec/changes/ (excluding archived) */
	changes: ParsedChange[];
	/** Aggregate statistics */
	stats: SpecSummaryStats;
	/** Non-fatal parse issues encountered */
	errors: SpecParseError[];
}

/**
 * A non-fatal error encountered during spec directory parsing.
 * Collected rather than thrown to allow graceful degradation.
 */
export interface SpecParseError {
	/** File or directory path where the error occurred */
	path: string;
	/** Human-readable error description */
	message: string;
	/** Severity: warnings are informational, errors indicate data loss */
	severity: ParseErrorSeverity;
}
