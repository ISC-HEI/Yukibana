/**
 * SPDX-License-Identifier: MIT
 */
import { expect } from 'chai';
import { describe, it } from 'vitest';
import { OpenWorkspacesClient } from '../common/open-workspaces-protocol';
import { OpenWorkspaces, OpenWorkspacesServerImpl } from './open-workspaces';

/**
 * Returns a window's connection to `open`, whose window counts how often it is brought to the front
 * and answers with `focus()`.
 */
function connect(open: OpenWorkspaces, focus = async () => {}): { server: OpenWorkspacesServerImpl; focused: () => number } {
    let focused = 0;
    const server = new OpenWorkspacesServerImpl();
    Object.assign(server, { open });
    server.setClient({
        focus: () => {
            focused++;
            return focus();
        },
    } as OpenWorkspacesClient);
    return { server, focused: () => focused };
}

describe('OpenWorkspacesServerImpl', () => {
    const lab = 'file:///home/student/lab-sorting';
    const tracer = 'file:///home/student/ray-tracer';

    it('should list what every window has open, once each', async () => {
        const open = new OpenWorkspaces();
        const [a, b, c] = [connect(open), connect(open), connect(open)];
        await a.server.setWorkspace(lab);
        await b.server.setWorkspace(tracer);
        await c.server.setWorkspace(lab);
        expect((await a.server.list()).sort()).to.deep.equal([lab, tracer]);
    });

    it('should bring the window that has the project to the front, and no other', async () => {
        const open = new OpenWorkspaces();
        const [here, there] = [connect(open), connect(open)];
        await here.server.setWorkspace(tracer);
        await there.server.setWorkspace(lab);
        expect(await here.server.focus(lab)).to.equal(true);
        expect([here.focused(), there.focused()]).to.deep.equal([0, 1]);
    });

    it('should forget a window once it closes or opens nothing', async () => {
        const open = new OpenWorkspaces();
        const [a, b] = [connect(open), connect(open)];
        await a.server.setWorkspace(lab);
        await b.server.setWorkspace(tracer);
        a.server.dispose();
        await b.server.setWorkspace(undefined);
        expect(await b.server.list()).to.deep.equal([]);
        expect(await b.server.focus(lab)).to.equal(false);
    });

    it('should say the window went away when it cannot be brought to the front', async () => {
        const open = new OpenWorkspaces();
        const [here, gone] = [connect(open), connect(open, () => Promise.reject(new Error('closed')))];
        await gone.server.setWorkspace(lab);
        expect(await here.server.focus(lab)).to.equal(false);
    });
});
