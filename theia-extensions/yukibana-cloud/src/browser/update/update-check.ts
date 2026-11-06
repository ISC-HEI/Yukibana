/**
 * SPDX-License-Identifier: MIT
 */
import { UpdateState } from '../../common/update-protocol';

/**
 * Asking whether an update is waiting, for code that only needs the answer (the submit dialog), without the view, the
 * editors and the merge editor that come with {@link AssignmentUpdates}.
 */
export const UpdateCheck = Symbol('UpdateCheck');
/** Checking the workspace folder for an update. */
export interface UpdateCheck {
    /**
     * Checks the workspace folder again and returns its state.
     *
     * Never rejects: a registry that cannot be asked is the state's `problem`, and a backend that cannot be reached
     * leaves the state as it was.
     */
    refresh(): Promise<UpdateState>;
}
