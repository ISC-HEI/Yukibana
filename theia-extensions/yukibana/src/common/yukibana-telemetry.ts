/**
 * SPDX-License-Identifier: MIT
 */
export namespace TypingTelemetry {
    export const EditPath = 'yukibana/edit';
    export type EditOrigin = 'type' | 'cut' | 'paste' | 'completion' | 'drag-drop' | 'delete' | 'command' | 'unknown';

    export interface EditChange {
        inserted: number
        removed: number
        origin: EditOrigin
        command?: string
    }

    export interface Edit {
        sinceLastTyped: number
        changes: EditChange[]
        file: string | undefined
    }

    export interface EditData {
        sinceLastTyped: number
        file: string
        changeInserted: number[]
        changeRemoved: number[]
        changeOrigins: EditOrigin[]
        changeCommands: string[]
    }
}
