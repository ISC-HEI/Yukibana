/**
 * SPDX-License-Identifier: MIT
 */
/* eslint-disable no-null/no-null */ // the registry sends missing dates as null
import { Path, URI } from '@theia/core';
import { Project } from '@yukibana/cli';
import { expect } from 'chai';
import { describe, it } from 'vitest';
import { avatarColour, AVATAR_COLOURS, calendarDays, dueAssignments, initials, matches, projectIdOf, recentProject, roughly } from './welcome-model';

/** An hour in milliseconds. */
const HOUR = 60 * 60 * 1000;
/** A day of 24 hours in milliseconds. */
const DAY = 24 * HOUR;
/** Present moment of the tests, in milliseconds since the epoch. */
const NOW = Date.parse('2026-10-22T08:00:00Z');

/** Returns the moment `ms` after `NOW` as the registry writes dates. */
const at = (ms: number) => new Date(NOW + ms).toISOString();

/** Returns a published student project with ID `id`, no deadline and nothing handed in, changed by `fields`. */
function project(id: string, fields: Partial<Project> = {}): Project {
    return {
        projectId: id,
        editionId: 'edition',
        courseCode: 'CS101',
        editionLabel: 'Fall 2026',
        slug: id,
        title: id,
        kind: 'lab',
        availableAfter: at(-7 * DAY),
        deadline: null,
        closesAt: null,
        late: false,
        role: 'student',
        starterReady: true,
        canSubmit: true,
        mySubmissions: 0,
        myLastSubmittedAt: null,
        ...fields,
    };
}

/** Returns the IDs of the projects of `projects`, in order. */
const ids = (projects: readonly { project: Project }[]) => projects.map(a => a.project.projectId);

describe('welcome screen', () => {
    describe('dueAssignments', () => {
        it('should put late work first, then the nearest deadline, then work without one', () => {
            const list = dueAssignments(
                [
                    project('no-deadline'),
                    project('next-month', { deadline: at(30 * DAY) }),
                    project('tomorrow', { deadline: at(20 * HOUR) }),
                    project('late', { deadline: at(-HOUR), closesAt: at(DAY), late: true }),
                    project('in-three-days', { deadline: at(3 * DAY) }),
                ],
                NOW,
            );
            expect(ids(list)).to.deep.equal(['late', 'tomorrow', 'in-three-days', 'next-month', 'no-deadline']);
            expect(list.map(a => a.urgency)).to.deep.equal(['late', 'soon', 'upcoming', 'later', 'none']);
        });

        it('should put work already handed in after work that is not', () => {
            const list = dueAssignments([project('handed-in', { deadline: at(HOUR), mySubmissions: 2 }), project('to-do', { deadline: at(10 * DAY) })], NOW);
            expect(ids(list)).to.deep.equal(['to-do', 'handed-in']);
            expect(list.map(a => a.submitted)).to.deep.equal([false, true]);
        });

        it('should leave out projects whose window has closed', () => {
            const list = dueAssignments([project('closed', { deadline: at(-2 * DAY), closesAt: at(-DAY) }), project('open')], NOW);
            expect(ids(list)).to.deep.equal(['open']);
        });

        it('should show staff their drafts, after everything published', () => {
            const list = dueAssignments([project('draft', { availableAfter: null, role: 'owner' }), project('published', { role: 'owner', deadline: at(30 * DAY) })], NOW);
            expect(ids(list)).to.deep.equal(['published', 'draft']);
            expect(list[1].urgency).to.equal('draft');
        });

        it('should take the word of the registry that work is late, whatever this clock says', () => {
            const [a] = dueAssignments([project('slow-clock', { deadline: at(5 * 60 * 1000), late: true })], NOW);
            expect(a.urgency).to.equal('late');
        });

        it('should treat a date it cannot read as no date rather than fail', () => {
            const [a] = dueAssignments([project('odd', { deadline: 'soon-ish' })], NOW);
            expect(a.urgency).to.equal('none');
            expect(a.deadline).to.equal(undefined);
        });
    });

    describe('roughly', () => {
        it('should say a duration in the largest unit that fits', () => {
            expect(roughly(50 * 60 * 1000)).to.deep.equal({ value: 50, unit: 'minute' });
            expect(roughly(5 * HOUR + 59 * 60 * 1000)).to.deep.equal({ value: 5, unit: 'hour' });
            expect(roughly(26 * HOUR)).to.deep.equal({ value: 1, unit: 'day' });
            expect(roughly(13 * DAY)).to.deep.equal({ value: 13, unit: 'day' });
            expect(roughly(30 * DAY)).to.deep.equal({ value: 4, unit: 'week' });
        });

        it('should keep the past in the past, and never say zero minutes', () => {
            expect(roughly(-3 * HOUR)).to.deep.equal({ value: -3, unit: 'hour' });
            expect(roughly(10 * 1000)).to.deep.equal({ value: 1, unit: 'minute' });
        });
    });

    describe('calendarDays', () => {
        it('should count dates, not 24-hour spans', () => {
            const mondayEvening = new Date(2026, 9, 19, 22, 0).getTime();
            expect(calendarDays(mondayEvening, new Date(2026, 9, 21, 20, 0).getTime())).to.equal(2);
            expect(calendarDays(mondayEvening, new Date(2026, 9, 20, 1, 0).getTime())).to.equal(1);
            expect(calendarDays(mondayEvening, new Date(2026, 9, 18, 23, 0).getTime())).to.equal(-1);
        });
    });

    describe('initials', () => {
        it('should take the first letters of the first two words, however they are separated', () => {
            expect(initials('lab-sorting')).to.equal('LS');
            expect(initials('Ambrus Tóth')).to.equal('AT');
            expect(initials('my_first.project')).to.equal('MF');
        });

        it('should take two letters of a single word', () => {
            expect(initials('CS101')).to.equal('CS');
            expect(initials('x')).to.equal('X');
            expect(initials('')).to.equal('?');
        });
    });

    describe('avatarColour', () => {
        it('should give the same name the same colour, within the palette', () => {
            expect(avatarColour('CS101')).to.equal(avatarColour('CS101'));
            for (const name of ['CS101', 'MATH200', 'lab-sorting', '']) {
                expect(avatarColour(name)).to.be.within(0, AVATAR_COLOURS - 1);
            }
        });
    });

    describe('recentProject', () => {
        const home = new URI('file:///home/student');

        it('should shorten the home directory to ~', () => {
            const recent = recentProject(new URI('file:///home/student/code/lab-sorting'), home, Path.Format.Posix);
            expect(recent.name).to.equal('lab-sorting');
            expect(recent.location).to.equal('~/code/lab-sorting');
            expect(recentProject(home, home, Path.Format.Posix).location).to.equal('~');
        });

        it('should name a workspace file without its extension, and know it is not a folder', () => {
            const recent = recentProject(new URI('file:///home/student/course.theia-workspace'), home);
            expect(recent.name).to.equal('course');
            expect(recent.workspaceFile).to.equal(true);
            expect(recentProject(new URI('file:///home/student/lab'), home).workspaceFile).to.equal(false);
        });

        it('should show folders outside the home directory in full', () => {
            expect(recentProject(new URI('file:///srv/labs/lab1'), home, Path.Format.Posix).location).to.equal('/srv/labs/lab1');
        });

        it('should write paths the Windows way on Windows, inside the home directory and out', () => {
            const windowsHome = new URI('file:///c%3A/Users/student');
            expect(recentProject(new URI('file:///c%3A/Users/student/code/lab-sorting'), windowsHome, Path.Format.Windows).location).to.equal('~\\code\\lab-sorting');
            expect(recentProject(new URI('file:///d%3A/labs/lab1'), windowsHome, Path.Format.Windows).location).to.equal('D:\\labs\\lab1');
        });
    });

    describe('projectIdOf', () => {
        it('should find the project a downloaded starter came from', () => {
            expect(projectIdOf('{ "version": 1, "projectId": "5f0c" }')).to.equal('5f0c');
        });

        it('should link nothing for a course repository, which names no project', () => {
            expect(projectIdOf('{ "version": 1 }')).to.equal(undefined);
            expect(projectIdOf('{ "projectId": "" }')).to.equal(undefined);
            expect(projectIdOf('{ "projectId": 42 }')).to.equal(undefined);
        });

        it('should link nothing, rather than fail, for a file that is not a JSON object', () => {
            expect(projectIdOf('{ not json')).to.equal(undefined);
            expect(projectIdOf('null')).to.equal(undefined);
            expect(projectIdOf('7')).to.equal(undefined);
        });
    });

    describe('matches', () => {
        it('should find a project when every word appears somewhere, in any case', () => {
            expect(matches('lab cs', 'Lab 3: Sorting', 'CS101')).to.equal(true);
            expect(matches('  ', 'anything')).to.equal(true);
            expect(matches('lab math', 'Lab 3: Sorting', 'CS101')).to.equal(false);
        });
    });
});
