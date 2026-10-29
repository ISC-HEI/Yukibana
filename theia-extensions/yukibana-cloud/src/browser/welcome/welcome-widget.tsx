/**
 * SPDX-License-Identifier: MIT
 */
import { CommandService, Disposable, environment, ILogger, isOSX, MessageService, nls, URI } from '@theia/core';
import { codicon, Message, OpenerService, open, ReactWidget } from '@theia/core/lib/browser';
import { ApplicationServer } from '@theia/core/lib/common/application-protocol';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';
import { FileDialogService } from '@theia/filesystem/lib/browser';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceCommands, WorkspaceService } from '@theia/workspace/lib/browser';
import { Project } from '@yukibana/cli';
import * as React from 'react';
import { localizeMarkdown } from 'yukibana-common/lib/localize-markdown';
import { CloudAccount, CloudService } from '../../common/cloud-protocol';
import { OpenWorkspacesServer } from '../../common/open-workspaces-protocol';
import { CloudAccountService, CloudAccountState } from '../cloud-account-service';
import { LoginCommand, LogoutCommand, SwitchAccountCommand } from '../command-contribution';
import {
    Assignment,
    avatarColour,
    calendarDays,
    CONFIG_FILENAME,
    dueAssignments,
    initials,
    matches,
    projectIdOf,
    RecentProject,
    recentProject,
    roughly,
    Urgency,
} from './welcome-model';

/**
 * A page of the screen: `recent` lists the folders opened lately, `assignments` what the registry hands out.
 *
 * Each assignment shows once, on its own page and in one section of it; a folder that is an
 * assignment's copy says which.
 */
type Page = 'recent' | 'assignments';

/** Assignments as last loaded, or why there are none to show. */
type Assignments =
    | { readonly kind: 'loading' }
    /** `list` as it stood at `now`, worked out again every minute while the screen shows. */
    | { readonly kind: 'loaded'; readonly list: readonly Assignment[]; readonly now: number }
    | { readonly kind: 'not-logged-in' }
    | { readonly kind: 'error'; readonly reason: string };

/**
 * Screen a window shows when no project is open, after IntelliJ's: the product, the pages and the
 * cloud account on the left, the page on the right.
 */
@injectable()
export class WelcomeWidget extends ReactWidget {
    /** Widget's ID, the same in every window. */
    static readonly ID = 'yukibana.welcome';
    /** Tab's title. */
    static readonly LABEL = nls.localize('yukibana/cloud/welcome/title', 'Welcome');

    /** Window's workspace and the recently opened ones. */
    @inject(WorkspaceService) protected readonly workspaces!: WorkspaceService;
    /** Account shown, whose assignments are listed. */
    @inject(CloudAccountService) protected readonly accounts!: CloudAccountService;
    /** Registry, which lists the assignments. */
    @inject(CloudService) protected readonly cloud!: CloudService;
    /** Commands the buttons run. */
    @inject(CommandService) protected readonly commands!: CommandService;
    /** Openers of `yukibana://` links, which download a starter. */
    @inject(OpenerService) protected readonly openers!: OpenerService;
    /** Dialogs asking where a new project goes. */
    @inject(FileDialogService) protected readonly fileDialogs!: FileDialogService;
    /** File system holding `yukibana.json` files and new project folders. */
    @inject(FileService) protected readonly files!: FileService;
    /** Environment, which knows the home directory locations are shortened against. */
    @inject(EnvVariablesServer) protected readonly env!: EnvVariablesServer;
    /** Application, which knows the product version the sidebar shows. */
    @inject(ApplicationServer) protected readonly application!: ApplicationServer;
    /** Notifications reporting failures. */
    @inject(MessageService) protected readonly messages!: MessageService;
    /** Backend's registry of the workspaces all windows have open. */
    @inject(OpenWorkspacesServer) protected readonly openWorkspaces!: OpenWorkspacesServer;
    /** Log of failures. */
    @inject(ILogger) @named('yukibana:Welcome') protected readonly logger!: ILogger;

    /** Page shown. */
    protected page: Page = 'recent';
    /** Search text, which both pages share. */
    protected query = '';
    /** Recently opened workspaces, most recent first, the open one included. */
    protected recent: readonly RecentProject[] = [];
    /** Workspaces some window has open, as the recent list writes their URIs. */
    protected openInAWindow: ReadonlySet<string> = new Set();
    /** Assignments, or why there are none to show. */
    protected assignments: Assignments = { kind: 'loading' };
    /** Product version, once known. */
    protected version?: string;
    /** Number of requests for assignments so far, so an older answer arriving late is dropped. */
    protected assignmentsRequest = 0;
    /** Number of requests for the recent list so far, so an older list arriving late is dropped. */
    protected recentRequest = 0;

    /** Sets up the tab, and follows the account and the clock. */
    @postConstruct()
    protected init(): void {
        this.id = WelcomeWidget.ID;
        this.title.label = WelcomeWidget.LABEL;
        this.title.caption = WelcomeWidget.LABEL;
        this.title.iconClass = codicon('home');
        this.title.closable = true;
        this.addClass('yukibana-welcome');
        this.node.tabIndex = 0;

        this.toDispose.push(
            this.accounts.onDidChange(state => {
                this.update();
                this.loadAssignments(state);
            }),
        );
        // Deadlines pass while the screen stays open; the lists themselves load when it shows
        const clock = setInterval(() => this.tick(), 60 * 1000);
        this.toDispose.push(Disposable.create(() => clearInterval(clock)));
        this.application.getApplicationInfo().then(
            info => {
                this.version = info?.version;
                this.update();
            },
            () => undefined,
        );
        this.update();
    }

    /** Focuses the search field, or the screen when the page has none. */
    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        const search = this.node.querySelector<HTMLInputElement>('.yukibana-welcome-search input');
        (search ?? this.node).focus();
    }

    /** Loads the lists iff the screen is visible. */
    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        // Attached already visible, a widget gets no after-show; attached hidden, it gets one when shown
        if (this.isVisible) {
            this.refresh();
        }
    }

    /** Loads the lists again. */
    protected override onAfterShow(msg: Message): void {
        super.onAfterShow(msg);
        this.refresh();
    }

    /** Loads both lists again: another window may have opened something, or the deadlines moved on. */
    protected refresh(): void {
        this.loadRecent();
        this.loadAssignments(this.accounts.state);
    }

    /**
     * Loads the recent list, each folder linked to the assignment it is a copy of.
     *
     * Reads the `yukibana.json` of every recent folder, so it takes time linear in their number.
     */
    protected async loadRecent(): Promise<void> {
        const request = ++this.recentRequest;
        let recent: RecentProject[] = [];
        let openUris: string[] = [];
        try {
            const [uris, home, openNow] = await Promise.all([
                this.workspaces.recentWorkspaces(),
                this.env.getHomeDirUri(),
                // Without it every project opens as if no window had it, which is still an answer
                this.openWorkspaces.list().catch(() => []),
            ]);
            openUris = openNow;
            recent = await Promise.all(
                uris.map(async uri => {
                    const project = recentProject(new URI(uri), new URI(home));
                    return { ...project, projectId: await this.projectIdIn(project) };
                }),
            );
        } catch (e) {
            this.logger.warn('Could not list recent projects', e);
        }
        // A newer list, from a later show, knows better
        if (request === this.recentRequest) {
            this.recent = recent;
            this.openInAWindow = new Set(openUris);
            this.update();
        }
    }

    /** Returns the registry project `project`'s `yukibana.json` names, if any. */
    protected async projectIdIn(project: RecentProject): Promise<string | undefined> {
        if (project.workspaceFile) {
            return undefined;
        }
        try {
            return projectIdOf((await this.files.read(project.uri.resolve(CONFIG_FILENAME))).value);
        } catch {
            // Most folders have no yukibana.json, and a missing one is no news
            return undefined;
        }
    }

    /** Loads the assignments `state`'s account can see, keeping the shown ones until the new ones arrive. */
    protected async loadAssignments(state: CloudAccountState): Promise<void> {
        const request = ++this.assignmentsRequest;
        const settle = (assignments: Assignments) => {
            if (request === this.assignmentsRequest) {
                this.assignments = assignments;
                this.update();
            }
        };
        if (state.kind === 'logged-out') {
            settle({ kind: 'not-logged-in' });
            return;
        }
        if (state.kind === 'unknown') {
            // The account service answers soon and calls back here
            settle({ kind: 'loading' });
            return;
        }
        if (this.assignments.kind !== 'loaded') {
            settle({ kind: 'loading' });
        }
        try {
            const listing = await this.cloud.listProjects();
            settle(listing.kind === 'found' ? loaded(listing.projects, Date.now()) : listing);
        } catch (e) {
            settle({ kind: 'error', reason: e instanceof Error ? e.message : String(e) });
        }
    }

    /** Works out the shown assignments again as of now: a deadline may have passed, or come within a day. */
    protected tick(): void {
        if (this.assignments.kind === 'loaded' && this.isVisible) {
            // The projects left out are those whose window closed, and those stay closed
            this.assignments = loaded(
                this.assignments.list.map(a => a.project),
                Date.now(),
            );
            this.update();
        }
    }

    /**
     * Assignments as last loaded, or none.
     *
     * Not `loaded`, which the shell sets on a widget it activates.
     */
    protected get loadedAssignments(): readonly Assignment[] {
        return this.assignments.kind === 'loaded' ? this.assignments.list : [];
    }

    /** Shows `page`. */
    protected setPage(page: Page): void {
        this.page = page;
        this.update();
    }

    /** Asks where to create a project, creates its folder if needed and opens it. */
    protected newProject = async (): Promise<void> => {
        const target = await this.fileDialogs.showSaveDialog({
            title: nls.localize('yukibana/cloud/welcome/newProjectTitle', 'New project'),
            saveLabel: nls.localize('yukibana/cloud/welcome/create', 'Create'),
            inputValue: nls.localize('yukibana/cloud/welcome/newProjectName', 'my-project'),
        });
        if (!target) {
            return;
        }
        try {
            if (!(await this.files.exists(target))) {
                await this.files.createFolder(target);
            }
            this.workspaces.open(target);
        } catch (e) {
            this.logger.error(`Could not create project at ${target.toString()}`, e);
            this.messages.error(localizeMarkdown('yukibana/cloud/welcome/newProjectFailed', 'Could not create the project: {0}', e instanceof Error ? e.message : String(e)));
        }
    };

    /** Asks for a folder, or on macOS and in browsers also a workspace file, and opens it. */
    protected openProject = (): void => {
        // The same choice Theia's File menu makes: macOS and browsers open files and folders with one command
        const command = isOSX || !environment.electron.is() ? WorkspaceCommands.OPEN : WorkspaceCommands.OPEN_FOLDER;
        this.commands.executeCommand(command.id);
    };

    /** Returns where `uri` is open, as of the last load: in this window, in another, or nowhere. */
    protected whereOpen(uri: URI): 'here' | 'elsewhere' | undefined {
        const key = uri.toString();
        return key === this.workspaces.workspace?.resource.toString() ? 'here' : this.openInAWindow.has(key) ? 'elsewhere' : undefined;
    }

    /**
     * Opens `uri` in the window that has it, or in a new one if none does.
     *
     * Other windows are asked even when the last load said none has `uri`, which may have changed since.
     * A browser cannot raise another tab, so there `uri` opens again.
     */
    protected async openFolder(uri: URI): Promise<void> {
        if (this.whereOpen(uri) === 'here') {
            this.close();
        } else if (!environment.electron.is() || !(await this.openWorkspaces.focus(uri.toString()).catch(() => false))) {
            this.workspaces.open(uri);
        }
    }

    /** Removes `project` from the recent list and shows the list again. */
    protected async removeRecent(project: RecentProject): Promise<void> {
        await this.workspaces.removeRecentWorkspace(project.uri.toString());
        await this.loadRecent();
    }

    /** Opens the copy of `assignment` already on this computer, or downloads its starter if there is none. */
    protected openAssignment(assignment: Assignment): void {
        const local = this.localCopyOf(assignment);
        if (local) {
            this.openFolder(local.uri);
            return;
        }
        // The same way in as a link from the registry's web page, which downloads the starter first
        const uri = new URI('yukibana://project/open').withQuery(`id=${encodeURIComponent(assignment.project.projectId)}`);
        open(this.openers, uri);
    }

    /** Returns the sidebar and the page shown. */
    protected render(): React.ReactNode {
        return (
            <div className="yukibana-welcome-frame">
                {this.renderSidebar()}
                <main className="yukibana-welcome-main">{this.page === 'recent' ? this.renderRecentPage() : this.renderAssignmentsPage()}</main>
            </div>
        );
    }

    /** Returns the product, the pages and the account. */
    protected renderSidebar(): React.ReactNode {
        return (
            <nav className="yukibana-welcome-sidebar">
                <div className="yukibana-welcome-brand">
                    <div className="yukibana-welcome-logo" aria-hidden />
                    <div>
                        <div className="yukibana-welcome-product">Yukibana</div>
                        {this.version && <div className="yukibana-welcome-version">{this.version}</div>}
                    </div>
                </div>
                <ul className="yukibana-welcome-nav" role="tablist">
                    {this.renderNavItem('recent', 'history', nls.localize('yukibana/cloud/welcome/recent', 'Recent'))}
                    {this.renderNavItem(
                        'assignments',
                        'mortar-board',
                        nls.localize('yukibana/cloud/welcome/assignments', 'Assignments'),
                        this.loadedAssignments.filter(isToDo).length,
                    )}
                </ul>
                <div className="yukibana-welcome-spacer" />
                {this.renderAccount(this.accounts.state)}
            </nav>
        );
    }

    /** Returns the tab of `page`, with a count of `badge` iff it is positive. */
    protected renderNavItem(page: Page, icon: string, label: string, badge = 0): React.ReactNode {
        const selected = this.page === page;
        return (
            <li>
                <button role="tab" aria-selected={selected} className={`yukibana-welcome-nav-item${selected ? ' selected' : ''}`} onClick={() => this.setPage(page)}>
                    <span className={codicon(icon)} />
                    <span className="yukibana-welcome-nav-label">{label}</span>
                    {badge > 0 && (
                        <span className="yukibana-welcome-badge" title={nls.localize('yukibana/cloud/welcome/toDoCount', 'Assignments to hand in')}>
                            {badge}
                        </span>
                    )}
                </button>
            </li>
        );
    }

    /** Returns the account `state` describes, with the actions it allows. */
    protected renderAccount(state: CloudAccountState): React.ReactNode {
        if (state.kind === 'logged-in') {
            const name = CloudAccount.displayName(state.account);
            const label = CloudAccount.label(state.account);
            return (
                <div className="yukibana-welcome-account">
                    <div className="yukibana-welcome-account-who">
                        {this.renderAvatar(name, 'round')}
                        <div className="yukibana-welcome-account-text">
                            <div className="yukibana-welcome-account-name" title={name}>
                                {name}
                            </div>
                            {label !== name && (
                                <div className="yukibana-welcome-account-detail" title={label}>
                                    {label}
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="yukibana-welcome-account-actions">
                        <button className="yukibana-welcome-link" onClick={() => this.commands.executeCommand(SwitchAccountCommand.id)}>
                            {nls.localize('yukibana/cloud/submission/switchAccount', 'Switch account')}
                        </button>
                        <button className="yukibana-welcome-link" onClick={() => this.commands.executeCommand(LogoutCommand.id)}>
                            {nls.localize('yukibana/cloud/account/logOut', 'Log out')}
                        </button>
                    </div>
                </div>
            );
        }
        const detail = {
            'logged-out': nls.localize('yukibana/cloud/welcome/loggedOutDetail', 'Log in to see your assignments.'),
            error: nls.localize('yukibana/cloud/account/unavailable', 'Could not check your account: {0}', state.kind === 'error' ? state.reason : ''),
            unknown: nls.localize('yukibana/cloud/account/checking', 'Checking your account...'),
        }[state.kind];
        return (
            <div className="yukibana-welcome-account">
                <div className="yukibana-welcome-account-who">
                    <div className="yukibana-welcome-avatar round anonymous">
                        <span className={codicon('account')} />
                    </div>
                    <div className="yukibana-welcome-account-text">
                        <div className="yukibana-welcome-account-detail" title={detail}>
                            {detail}
                        </div>
                    </div>
                </div>
                {state.kind !== 'unknown' && (
                    <button className="theia-button main yukibana-welcome-login" onClick={() => this.commands.executeCommand(LoginCommand.id)}>
                        {nls.localize('yukibana/cloud/account/logIn', 'Log in')}
                    </button>
                )}
            </div>
        );
    }

    /** Returns the initials of `name` in a `shape` avatar, coloured after `key`. */
    protected renderAvatar(name: string, shape: 'round' | 'square', key = name): React.ReactNode {
        return (
            <div className={`yukibana-welcome-avatar ${shape} colour-${avatarColour(key)}`} aria-hidden>
                {initials(name)}
            </div>
        );
    }

    /** Returns the search field, saying `placeholder` when empty, followed by `actions`. */
    protected renderToolbar(placeholder: string, actions: React.ReactNode): React.ReactNode {
        return (
            <div className="yukibana-welcome-toolbar">
                <label className="yukibana-welcome-search">
                    <span className={codicon('search')} />
                    <input
                        className="theia-input"
                        type="search"
                        placeholder={placeholder}
                        value={this.query}
                        spellCheck={false}
                        onChange={e => {
                            this.query = e.currentTarget.value;
                            this.update();
                        }}
                        onKeyDown={e => {
                            if (e.key === 'Escape' && this.query) {
                                this.query = '';
                                this.update();
                                e.stopPropagation();
                            }
                        }}
                    />
                </label>
                <div className="yukibana-welcome-actions">{actions}</div>
            </div>
        );
    }

    /** Returns `assignments` under `title`, in order. */
    protected renderSection(title: string, assignments: readonly Assignment[]): React.ReactNode {
        return (
            <section>
                <header className="yukibana-welcome-section-header">
                    <h3>{title}</h3>
                </header>
                <ul className="yukibana-welcome-list">{assignments.map(a => this.renderAssignment(a))}</ul>
            </section>
        );
    }

    // Recent

    /** Returns the Recent page: the recent workspaces matching the search, or a start page when there are none. */
    protected renderRecentPage(): React.ReactNode {
        if (this.recent.length === 0) {
            return this.renderHero();
        }
        const recent = this.recent.filter(p => this.matchesRecent(p));
        const actions = (
            <>
                <button className="theia-button main" onClick={this.newProject}>
                    <span className={codicon('add')} /> {nls.localize('yukibana/cloud/welcome/newProject', 'New Project')}
                </button>
                <button className="theia-button secondary" onClick={this.openProject}>
                    <span className={codicon('folder-opened')} /> {nls.localize('yukibana/cloud/welcome/open', 'Open')}
                </button>
            </>
        );
        return (
            <>
                {this.renderToolbar(nls.localize('yukibana/cloud/welcome/searchProjects', 'Search projects'), actions)}
                <div className="yukibana-welcome-scroll">
                    {recent.length > 0 ? (
                        <ul className="yukibana-welcome-list">{recent.map(p => this.renderRecent(p))}</ul>
                    ) : (
                        <p className="yukibana-welcome-empty-line">{nls.localize('yukibana/cloud/welcome/noMatch', 'Nothing matches your search.')}</p>
                    )}
                </div>
            </>
        );
    }

    /** Returns the start page shown when nothing was opened yet. */
    protected renderHero(): React.ReactNode {
        const loggedOut = this.accounts.state.kind === 'logged-out';
        return (
            <div className="yukibana-welcome-hero">
                <div className="yukibana-welcome-hero-logo" aria-hidden />
                <h1>{nls.localize('yukibana/cloud/welcome/heading', 'Welcome to Yukibana')}</h1>
                <p>{nls.localize('yukibana/cloud/welcome/heroDetail', 'Create a new project, open one from disk, or get an assignment from your course.')}</p>
                <div className="yukibana-welcome-tiles">
                    {this.renderTile('add', nls.localize('yukibana/cloud/welcome/newProject', 'New Project'), this.newProject)}
                    {this.renderTile('folder-opened', nls.localize('yukibana/cloud/welcome/open', 'Open'), this.openProject)}
                    {loggedOut
                        ? this.renderTile('account', nls.localize('yukibana/cloud/account/logIn', 'Log in'), () => this.commands.executeCommand(LoginCommand.id))
                        : this.renderTile('mortar-board', nls.localize('yukibana/cloud/welcome/assignments', 'Assignments'), () => this.setPage('assignments'))}
                </div>
            </div>
        );
    }

    /** Returns a large button showing `icon` and `label` that calls `onClick`. */
    protected renderTile(icon: string, label: string, onClick: () => unknown): React.ReactNode {
        return (
            <button className="yukibana-welcome-tile" onClick={onClick}>
                <span className={`yukibana-welcome-tile-icon ${codicon(icon)}`} />
                <span>{label}</span>
            </button>
        );
    }

    /** Returns the assignment `project` is a copy of, if the registry still lists it. */
    protected assignmentOf(project: RecentProject): Assignment | undefined {
        return project.projectId === undefined ? undefined : this.loadedAssignments.find(a => a.project.projectId === project.projectId);
    }

    /** Returns the most recently opened copy of `assignment`, if any. */
    protected localCopyOf(assignment: Assignment): RecentProject | undefined {
        return this.recent.find(p => p.projectId === assignment.project.projectId);
    }

    /** Returns `true` iff `project`, or the assignment it is a copy of, matches the search. */
    protected matchesRecent(project: RecentProject): boolean {
        const a = this.assignmentOf(project);
        return matches(this.query, project.name, project.location, a?.project.title ?? '', a?.project.courseCode ?? '');
    }

    /** Returns the row of `project`. */
    protected renderRecent(project: RecentProject): React.ReactNode {
        const assignment = this.assignmentOf(project);
        return (
            <li key={project.uri.toString()}>
                <div className="yukibana-welcome-row" title={project.location} {...activate(() => this.openFolder(project.uri))}>
                    {/* A copy of an assignment takes its course's colour, so it matches its row under Assignments */}
                    {this.renderAvatar(project.name, 'square', assignment?.project.courseCode ?? project.name)}
                    <div className="yukibana-welcome-row-text">
                        <div className="yukibana-welcome-row-title">
                            {project.name}
                            {this.renderOpenChip(project)}
                        </div>
                        <div className="yukibana-welcome-row-detail">
                            {assignment && (
                                <span className="yukibana-welcome-course">
                                    {assignment.project.courseCode} · {assignment.project.title}
                                </span>
                            )}
                            {project.location}
                        </div>
                    </div>
                    {assignment && <div className="yukibana-welcome-row-status">{this.renderStatus(assignment)}</div>}
                    <button
                        className={`yukibana-welcome-row-remove ${codicon('close')}`}
                        title={nls.localize('yukibana/cloud/welcome/removeRecent', 'Remove from recent projects')}
                        aria-label={nls.localize('yukibana/cloud/welcome/removeRecent', 'Remove from recent projects')}
                        onKeyDown={e => e.stopPropagation()}
                        onClick={e => {
                            e.stopPropagation();
                            this.removeRecent(project);
                        }}
                    />
                </div>
            </li>
        );
    }

    /** Returns a chip saying which window has `project` open, if any. */
    protected renderOpenChip(project: RecentProject): React.ReactNode {
        const where = this.whereOpen(project.uri);
        return (
            where && (
                <span className="yukibana-welcome-chip">
                    {where === 'here' ? nls.localize('yukibana/cloud/welcome/thisWindow', 'This window') : nls.localize('yukibana/cloud/welcome/openInWindow', 'Open')}
                </span>
            )
        );
    }

    // Assignments

    /** Returns `true` iff `a` matches the search. */
    protected matchesAssignment(a: Assignment): boolean {
        return matches(this.query, a.project.title, a.project.courseCode, a.project.editionLabel, a.project.slug);
    }

    /** Returns the Assignments page. */
    protected renderAssignmentsPage(): React.ReactNode {
        const refresh = (
            <button className="theia-button secondary" onClick={() => this.loadAssignments(this.accounts.state)}>
                <span className={codicon('refresh')} /> {nls.localize('yukibana/cloud/welcome/refresh', 'Refresh')}
            </button>
        );
        return (
            <>
                {this.renderToolbar(nls.localize('yukibana/cloud/welcome/searchAssignments', 'Search assignments'), refresh)}
                <div className="yukibana-welcome-scroll">{this.renderAssignmentsBody()}</div>
            </>
        );
    }

    /** Returns the assignments matching the search in To do, Handed in and Teaching, or why there are none. */
    protected renderAssignmentsBody(): React.ReactNode {
        switch (this.assignments.kind) {
            case 'loading':
                return this.renderEmpty(`${codicon('loading')} codicon-modifier-spin`, nls.localize('yukibana/cloud/welcome/loadingAssignments', 'Getting your assignments...'));
            case 'not-logged-in':
                return this.renderEmpty(
                    codicon('mortar-board'),
                    nls.localize('yukibana/cloud/welcome/logInForAssignments', 'Log in to see the assignments of your courses.'),
                    <button className="theia-button main" onClick={() => this.commands.executeCommand(LoginCommand.id)}>
                        {nls.localize('yukibana/cloud/account/logIn', 'Log in')}
                    </button>,
                );
            case 'error':
                return this.renderEmpty(
                    codicon('warning'),
                    nls.localize('yukibana/cloud/welcome/assignmentsFailed', 'Could not get your assignments: {0}', this.assignments.reason),
                    <button className="theia-button secondary" onClick={() => this.loadAssignments(this.accounts.state)}>
                        {nls.localize('yukibana/cloud/account/retry', 'Try again')}
                    </button>,
                );
            case 'loaded':
        }
        if (this.assignments.list.length === 0) {
            return this.renderEmpty(codicon('check-all'), nls.localize('yukibana/cloud/welcome/noAssignments', 'Nothing due. Enjoy the break!'));
        }
        const list = this.assignments.list.filter(a => this.matchesAssignment(a));
        if (list.length === 0) {
            return <p className="yukibana-welcome-empty-line">{nls.localize('yukibana/cloud/welcome/noMatch', 'Nothing matches your search.')}</p>;
        }
        const todo = list.filter(isToDo);
        // Staff who hand in to test their own project still find it under Teaching only
        const done = list.filter(a => a.submitted && a.project.role === 'student');
        const teaching = list.filter(a => a.project.role !== 'student');
        return (
            <>
                {todo.length > 0 && this.renderSection(nls.localize('yukibana/cloud/welcome/toDo', 'To do'), todo)}
                {done.length > 0 && this.renderSection(nls.localize('yukibana/cloud/welcome/handedIn', 'Handed in'), done)}
                {teaching.length > 0 && this.renderSection(nls.localize('yukibana/cloud/welcome/teaching', 'Teaching'), teaching)}
            </>
        );
    }

    /** Returns a placeholder with the `iconClass` icon, `text` and `action`, if any. */
    protected renderEmpty(iconClass: string, text: string, action?: React.ReactNode): React.ReactNode {
        return (
            <div className="yukibana-welcome-empty">
                <span className={iconClass} />
                <p>{text}</p>
                {action}
            </div>
        );
    }

    /** Returns the row of `a`, which opens it iff there is a copy or a starter to open. */
    protected renderAssignment(a: Assignment): React.ReactNode {
        const { project } = a;
        const local = this.localCopyOf(a);
        const canOpen = !!local || project.starterReady;
        const title = local
            ? nls.localize('yukibana/cloud/welcome/openLocalCopy', 'Open your copy in {0}', local.location)
            : project.starterReady
              ? nls.localize('yukibana/cloud/welcome/openAssignment', "Download and open '{0}'", project.title)
              : nls.localize('yukibana/cloud/welcome/noStarter', 'No starter files yet');
        return (
            <li key={project.projectId}>
                <div
                    className={`yukibana-welcome-row${canOpen ? '' : ' disabled'}`}
                    title={title}
                    {...(canOpen ? activate(() => this.openAssignment(a)) : { 'aria-disabled': true })}
                >
                    {/* Named after the assignment, coloured after the course, so a course's work looks alike */}
                    {this.renderAvatar(project.title, 'square', project.courseCode)}
                    <div className="yukibana-welcome-row-text">
                        <div className="yukibana-welcome-row-title">{project.title}</div>
                        <div className="yukibana-welcome-row-detail">
                            {project.courseCode} · {project.editionLabel}
                            {project.role !== 'student' && <span className="yukibana-welcome-chip">{this.roleLabel(project.role)}</span>}
                            {local && (
                                <span className="yukibana-welcome-local">
                                    <span className={codicon('folder')} /> {local.location}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="yukibana-welcome-row-status">{this.renderStatus(a)}</div>
                </div>
            </li>
        );
    }

    /** Returns the deadline of `a` and how often it was handed in. */
    protected renderStatus(a: Assignment): React.ReactNode {
        const { project } = a;
        return (
            <>
                {/* Work handed in before the deadline is not late; only a deadline still ahead says anything then */}
                {!(a.submitted && a.urgency === 'late') && this.renderDue(a)}
                {a.submitted && (
                    <span className="yukibana-welcome-submitted" title={project.myLastSubmittedAt ? new Date(project.myLastSubmittedAt).toLocaleString(nls.locale) : undefined}>
                        <span className={codicon('pass-filled')} />
                        {project.mySubmissions === 1
                            ? nls.localize('yukibana/cloud/welcome/submittedOnce', 'Handed in')
                            : nls.localize('yukibana/cloud/welcome/submittedTimes', 'Handed in {0} times', String(project.mySubmissions))}
                    </span>
                )}
            </>
        );
    }

    /** Returns the name of the staff `role`, or `role` itself if it is not a known one. */
    protected roleLabel(role: string): string {
        switch (role) {
            case 'owner':
                return nls.localize('yukibana/cloud/welcome/roleOwner', 'Teacher');
            case 'assistant':
                return nls.localize('yukibana/cloud/welcome/roleAssistant', 'Assistant');
            default:
                return role;
        }
    }

    /** Returns the deadline of `a` in words, coloured by its urgency, with the exact date as tooltip. */
    protected renderDue(a: Assignment): React.ReactNode {
        const when = a.deadline !== undefined ? new Date(a.deadline).toLocaleString(nls.locale) : undefined;
        return (
            <span className={`yukibana-welcome-due urgency-${a.urgency}`} title={when}>
                <span className={codicon(DUE_ICONS[a.urgency])} />
                {this.dueText(a)}
            </span>
        );
    }

    /** Returns the deadline of `a` in words, as of the moment its urgency was worked out. */
    protected dueText(a: Assignment): string {
        // The moment the urgency was worked out at, so the words and the colour agree
        const now = this.assignments.kind === 'loaded' ? this.assignments.now : Date.now();
        const relative = (at: number) => {
            const { value, unit } = roughly(at - now);
            // "Tomorrow" names a date, so days count dates rather than 24-hour spans
            const amount = unit === 'day' ? calendarDays(now, at) : value;
            return new Intl.RelativeTimeFormat(nls.locale ?? 'en', { numeric: 'auto' }).format(amount, unit);
        };
        switch (a.urgency) {
            case 'draft':
                return nls.localize('yukibana/cloud/welcome/draft', 'Not published');
            case 'none':
                return nls.localize('yukibana/cloud/welcome/noDeadline', 'No deadline');
            case 'late':
                return a.closesAt !== undefined
                    ? nls.localize('yukibana/cloud/welcome/lateCloses', 'Late, closes {0}', relative(a.closesAt))
                    : nls.localize('yukibana/cloud/welcome/late', 'Late');
            default:
                return nls.localize('yukibana/cloud/welcome/due', 'Due {0}', relative(a.deadline!));
        }
    }
}

/** Returns `projects` loaded as of `now`. */
function loaded(projects: readonly Project[], now: number): Assignments {
    return { kind: 'loaded', list: dueAssignments(projects, now), now };
}

/** Returns what makes an element a button calling `action`, for the mouse and the keyboard alike. */
function activate(action: () => unknown): React.HTMLAttributes<HTMLElement> {
    return {
        role: 'button',
        tabIndex: 0,
        onClick: action,
        onKeyDown: e => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                action();
            }
        },
    };
}

/**
 * Returns `true` iff the person still has to hand in `a`.
 *
 * Only students hand in, and only published work; staff cannot submit to what they teach.
 */
function isToDo(a: Assignment): boolean {
    return a.project.role === 'student' && !a.submitted && a.urgency !== 'draft';
}

/** Icon of each urgency. */
const DUE_ICONS: Record<Urgency, string> = {
    late: 'warning',
    soon: 'flame',
    upcoming: 'clock',
    later: 'calendar',
    none: 'circle-large-outline',
    draft: 'eye-closed',
};
