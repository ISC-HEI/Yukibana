/**
 * SPDX-License-Identifier: MIT
 */
import { Disposable, MaybePromise, RpcServer } from '@theia/core';
import { editor } from '@theia/monaco-editor-core';

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
    export interface Envelope<P extends Payload> {
        v: 1;
        seq: number;
        ts: number;
        payload: P;
    }

    export interface Payload {
        type: string;
    }

    // client -> server
    export interface Hello extends Payload {
        type: 'hello';
        studentId: string;
        projectId: string;
    }
    export interface DocSync extends Payload {
        type: 'doc';
        uri: string;
        version: number;
        full?: string;
        changes?: editor.IModelContentChange[];
        cursor?: [number, number];
    }
    export interface PasteStats {
        size: number;
        external: boolean;
    }
    export interface Stats extends Payload {
        type: 'stats';
        windowMs: number;
        idleMs: number;
        charsInserted: number;
        charsDeleted: number;
        pastes: PasteStats[];
        commands: string[];
        activeFile?: string;
        focused: boolean;
    }
    export interface Event extends Payload {
        type: 'event';
        kind: 'run' | 'test' | 'submit' | 'ai-prompt' | 'file-op';
        data: unknown;
    }
    export interface Problems extends Payload {
        type: 'problems';
        errors: number;
        warnings: number;
    }
    export interface Ping extends Payload {
        type: 'ping';
    }

    // server -> client
    export interface Welcome extends Payload {
        type: 'welcome';
        sessionId: string;
        serverTime: number;
        heartbeatMs: number;
    }
    export interface Subscribe extends Payload {
        type: 'subscribe';
        stream: 'doc';
    }
    export interface Unsubscribe extends Payload {
        type: 'unsubscribe';
        stream: 'doc';
    }
    export interface Sync extends Payload {
        type: 'sync';
        uri: string;
    }

    export type ClientToServerPayload = Hello | DocSync | Stats | Event | Problems | Ping;
    export type ServerToClientPayload = Welcome | Subscribe | Unsubscribe | Sync;
}

export interface LiveSessionContext {
    projectId: string;
}

export const LiveTelemetrySink = Symbol('LiveTelemetrySink');
export interface LiveTelemetrySink {
    start(ctx: LiveSessionContext): MaybePromise<void>;
    send(payload: LiveTelemetry.ClientToServerPayload): void;
    onCommand?(listener: (cmd: LiveTelemetry.ServerToClientPayload) => void): Disposable;
    dispose(): void;
}

export const LiveTelemetryReporter = Symbol('LiveTelemetryReporter');
export interface LiveTelemetryReporter extends RpcServer<LiveTelemetryFrontend> {
    start(ctx: LiveSessionContext): Promise<void>;
    send(payload: LiveTelemetry.ClientToServerPayload): void;
}

export const LiveTelemetryFrontend = Symbol('LiveTelemetryFrontend');
export interface LiveTelemetryFrontend {
    onCommand(cmd: LiveTelemetry.ServerToClientPayload): void;
}
