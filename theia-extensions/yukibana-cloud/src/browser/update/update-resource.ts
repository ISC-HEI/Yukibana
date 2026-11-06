/**
 * SPDX-License-Identifier: MIT
 */
import { Resource, ResourceResolver, URI } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { UpdateService, UpdateUri } from '../../common/update-protocol';

/**
 * The read-only versions the diff and merge editors show for an update: a release's file, or the student's file as it
 * was before the last update. The backend reads them; nothing here can write.
 */
@injectable()
export class UpdateResourceResolver implements ResourceResolver {
    @inject(UpdateService) protected readonly service!: UpdateService;

    /**
     * Returns the read-only resource `uri` names.
     *
     * - Requires: `uri` is a `yukibana-update:` URI that {@link UpdateUri.encode} made.
     */
    resolve(uri: URI): Resource {
        const parts = UpdateUri.decode(uri);
        if (parts === undefined) {
            throw new Error(`Not an assignment update version: ${uri.toString()}`);
        }
        return {
            uri,
            readOnly: true,
            readContents: () => this.service.read(parts.workspace, parts.side, parts.path),
            dispose: () => undefined,
        };
    }
}
