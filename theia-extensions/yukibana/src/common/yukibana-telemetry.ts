/**
 * SPDX-License-Identifier: MIT
 */
export namespace TypingTelemetry {
    export const EditPath = 'yukibana/edit';
    export type EditOrigin = 'type' | 'cut' | 'paste' | 'completion' | 'drag-drop' | 'delete' | 'command' | 'unknown';

    export interface EditChange {
        inserted: number;
        removed: number;
        origin: EditOrigin;
        command?: string;
    }

    export interface Edit {
        sinceLastTyped: number;
        changes: EditChange[];
        file: string | undefined;
    }

    export interface EditData {
        sinceLastTyped: number;
        file: string;
        changeInserted: number[];
        changeRemoved: number[];
        changeOrigins: EditOrigin[];
        changeCommands: string[];
    }
}

export namespace LiveTelemetry {
    export interface Envelope<T extends string, P> {
        v: 1;
        type: T;
        id: string;
        ts: number;
        payload: P;
    }

    // client -> server
    export type Hello = Envelope<
        'hello',
        {
            studentId: string;
            assignmentId: string;
        }
    >;
    export type DocSync = Envelope<
        'doc',
        {
            uri: string;
            version: number;
            full?: string;
            changes?: unknown[];
            cursor?: [number, number];
        }
    >;
    export interface PasteStats {
        size: number;
        external: boolean;
    }
    export type Stats = Envelope<
        'stats',
        {
            windowMs: number;
            idleMs: number;
            charsInserted: number;
            charsDeleted: number;
            pastes: PasteStats[];
            commands: string[];
            activeFile?: string;
            focused: boolean;
        }
    >;
    export type Event = Envelope<'event', { kind: 'run' | 'test' | 'submit' | 'ai-prompt' | 'file-op'; data: unknown }>;
    export type Problems = Envelope<'problems', { errors: number; warnings: number }>;
    export type Ping = Envelope<'ping', {}>;

    // server -> client
    export type Subscribe = Envelope<'subscribe', { stream: 'doc' }>;
    export type Unsubscribe = Envelope<'unsubscribe', {}>;
    export type Sync = Envelope<'sync', {}>;
}
