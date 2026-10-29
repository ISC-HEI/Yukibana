/**
 * SPDX-License-Identifier: MIT
 */
import { OS, Path, URI } from '@theia/core';
import { Project } from '@yukibana/cli';

/*
 * Words, since the registry and the IDE disagree on them: the registry's "project" is what the
 * welcome screen calls an *assignment*, work a course hands out; a *project* is a folder on this
 * computer, which may or may not be the local copy of an assignment.
 */

/**
 * How pressing an assignment is, which decides its colour and where it sorts.
 *
 * - `late`: past its deadline, by the registry's clock or this one, but still taking submissions.
 * - `soon`: due within a day.
 * - `upcoming`: due within a week.
 * - `later`: due after that.
 * - `none`: no deadline.
 * - `draft`: not published yet, which only staff see.
 */
export type Urgency = 'late' | 'soon' | 'upcoming' | 'later' | 'none' | 'draft';

/** A project from the registry as the welcome screen shows it. */
export interface Assignment {
    /** Registry's project. */
    readonly project: Project;
    /** How pressing it is, as of the moment it was worked out. */
    readonly urgency: Urgency;
    /** Deadline in milliseconds since the epoch, if any. */
    readonly deadline?: number;
    /** When late submissions stop, in milliseconds since the epoch, if ever. */
    readonly closesAt?: number;
    /** `true` iff the person has handed in anything; staff never have. */
    readonly submitted: boolean;
}

/** An hour in milliseconds. */
const HOUR = 60 * 60 * 1000;

/** A day of 24 hours in milliseconds. */
const DAY = 24 * HOUR;

/** Urgencies, most pressing first. */
const URGENCY_ORDER: readonly Urgency[] = ['late', 'soon', 'upcoming', 'later', 'none', 'draft'];

/** Returns `date`, as the registry sends it, in milliseconds since the epoch, or undefined if it is missing or unreadable. */
function time(date: string | null): number | undefined {
    if (!date) {
        return undefined;
    }
    const parsed = Date.parse(date);
    return Number.isNaN(parsed) ? undefined : parsed;
}

/** Returns how pressing `project` is at `now`, given its `deadline` in milliseconds since the epoch, if any. */
function urgencyOf(project: Project, deadline: number | undefined, now: number): Urgency {
    if (!project.availableAfter) {
        return 'draft';
    }
    if (deadline === undefined) {
        return 'none';
    }
    const left = deadline - now;
    // The registry's clock decides lateness, so a slow laptop clock cannot promise a submission is on
    // time; this one only takes over once the deadline has passed here too, as the screen stays open
    return project.late || left < 0 ? 'late' : left < DAY ? 'soon' : left < 7 * DAY ? 'upcoming' : 'later';
}

/**
 * Returns `projects` as of `now`, without those whose submissions have closed, most pressing first.
 *
 * Work not handed in yet comes before work that is; within each, the order is by urgency, then
 * nearest deadline, then title.
 *
 * Takes O(n log n) time for n projects.
 */
export function dueAssignments(projects: readonly Project[], now: number): Assignment[] {
    return projects
        .map((project): Assignment => {
            const deadline = time(project.deadline);
            const closesAt = time(project.closesAt);
            return {
                project,
                urgency: urgencyOf(project, deadline, now),
                ...(deadline === undefined ? {} : { deadline }),
                ...(closesAt === undefined ? {} : { closesAt }),
                submitted: project.mySubmissions > 0,
            };
        })
        .filter(a => a.closesAt === undefined || a.closesAt > now)
        .sort(
            (a, b) =>
                Number(a.submitted) - Number(b.submitted) ||
                URGENCY_ORDER.indexOf(a.urgency) - URGENCY_ORDER.indexOf(b.urgency) ||
                (a.deadline ?? Infinity) - (b.deadline ?? Infinity) ||
                a.project.title.localeCompare(b.project.title),
        );
}

/**
 * Returns `ms` in the largest unit that fits, rounded towards zero and keeping its sign.
 *
 * Suits `Intl.RelativeTimeFormat`: 26 hours is 1 day, 50 minutes is 50 minutes, and anything under
 * a minute is 1 minute.
 */
export function roughly(ms: number): { readonly value: number; readonly unit: 'minute' | 'hour' | 'day' | 'week' } {
    const sign = ms < 0 ? -1 : 1;
    const abs = Math.abs(ms);
    const pick = (value: number, unit: 'minute' | 'hour' | 'day' | 'week') => ({ value: sign * Math.trunc(value) || 0, unit });
    if (abs < HOUR) {
        return pick(Math.max(abs / (60 * 1000), 1), 'minute');
    }
    if (abs < DAY) {
        return pick(abs / HOUR, 'hour');
    }
    if (abs < 14 * DAY) {
        return pick(abs / DAY, 'day');
    }
    return pick(abs / (7 * DAY), 'week');
}

/**
 * Returns how many dates, in local time, `to` is after `from`; negative if it is before.
 *
 * From 22:00 Monday to 20:00 Wednesday is 2 although it is under 48 hours, so "tomorrow" only ever
 * means the next date.
 */
export function calendarDays(from: number, to: number): number {
    const midnight = (ms: number) => new Date(ms).setHours(0, 0, 0, 0);
    // Rounded, since a day with a daylight saving change is an hour shorter or longer
    return Math.round((midnight(to) - midnight(from)) / DAY);
}

/**
 * Returns up to two capital letters for an avatar of `name`.
 *
 * They are the first letters of the first two words, or the first two letters of a single word;
 * `-`, `_` and `.` split words too, so `lab-sorting` is "LS". An empty name is "?".
 */
export function initials(name: string): string {
    const words = name.split(/[\s\-_.]+/u).filter(w => w.length > 0);
    const letters = words.length > 1 ? [...words[0]].slice(0, 1).concat([...words[1]].slice(0, 1)) : [...(words[0] ?? '?')].slice(0, 2);
    return letters.join('').toUpperCase();
}

/** Number of avatar colours `welcome.css` defines, as `--yukibana-welcome-avatar-N`. */
export const AVATAR_COLOURS = 5;

/** Returns the avatar colour of `key`, in `[0, AVATAR_COLOURS)`, always the same for the same key. */
export function avatarColour(key: string): number {
    let hash = 0;
    for (const char of key) {
        hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
    }
    return hash % AVATAR_COLOURS;
}

/** A recently opened workspace, named and placed the way the welcome screen shows it. */
export interface RecentProject {
    /** Workspace folder or file. */
    readonly uri: URI;
    /** Folder's name, or workspace file's name without its extension. */
    readonly name: string;
    /** Path on disk in the computer's separators, with the home directory shortened to `~`. */
    readonly location: string;
    /** `true` iff it is a workspace file rather than a folder; only a folder can be an assignment's copy. */
    readonly workspaceFile: boolean;
    /** Registry project its `yukibana.json` names, if any. */
    readonly projectId?: string;
}

/** Name endings of workspace files. */
const WORKSPACE_FILE = /\.(theia|code)-workspace$/;

/**
 * Returns the recent workspace at `uri`, its location shortened against `home` and written in `format`.
 *
 * `format` is the backend's by default: the folders are on that computer, and named its way.
 */
export function recentProject(uri: URI, home?: URI, format = OS.backend.isWindows ? Path.Format.Windows : Path.Format.Posix): RecentProject {
    const workspaceFile = WORKSPACE_FILE.test(uri.path.base);
    const name = uri.path.base.replace(WORKSPACE_FILE, '') || uri.path.toString();
    const relative = home?.path.relative(uri.path);
    const path = relative !== undefined && home?.scheme === uri.scheme ? new Path(relative.toString() ? `~/${relative.toString()}` : '~') : uri.path;
    return { uri, name, location: path.fsPath(format), workspaceFile };
}

/** Name of the file at a project's root that says how the IDE treats it; the same one `yukibana-ext` reads. */
export const CONFIG_FILENAME = 'yukibana.json';

/**
 * Returns the registry project `configText`, a `yukibana.json`, names, or undefined if it names none or is not JSON.
 *
 * A downloaded starter names the project it came from; a course repository does not. Only this
 * field is read, so a config the IDE would otherwise reject still links its folder.
 */
export function projectIdOf(configText: string): string | undefined {
    try {
        // Any JSON value reads as a field lookup here: `null` and numbers have no projectId either
        const id = (JSON.parse(configText) as { projectId?: unknown } | undefined)?.projectId;
        return typeof id === 'string' && id.length > 0 ? id : undefined;
    } catch {
        return undefined;
    }
}

/** Returns `true` iff every word of `query` appears in `fields`, ignoring case: "lab 3 cs" finds "Lab 3" of CS101. */
export function matches(query: string, ...fields: readonly string[]): boolean {
    const haystack = fields.join(' ').toLocaleLowerCase();
    return query
        .toLocaleLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 0)
        .every(w => haystack.includes(w));
}
