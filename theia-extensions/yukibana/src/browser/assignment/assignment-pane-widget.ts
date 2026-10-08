/**
 * SPDX-License-Identifier: MIT
 */
import { BaseWidget, Message } from '@theia/core/lib/browser';
import { MarkdownRendererFactory } from '@theia/core/lib/browser/markdown-rendering/markdown-renderer';
import { MarkdownStringImpl } from '@theia/core/lib/common/markdown-rendering';
import URI from '@theia/core/lib/common/uri';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { ConfigProvider } from '../config/config-provider';
import { AssignmentResolver } from './assignment-resolver';

@injectable()
export class AssignmentPaneWidget extends BaseWidget {
    static readonly ID = 'yukibana.assignment-pane';
    static readonly LABEL = 'Assignment';

    @inject(MarkdownRendererFactory) protected readonly rendererFactory!: MarkdownRendererFactory;
    @inject(FileService) protected readonly fileService!: FileService;
    @inject(WorkspaceService) protected readonly workspaceService!: WorkspaceService;
    @inject(ConfigProvider) protected readonly configProvider!: ConfigProvider;
    @inject(AssignmentResolver) protected readonly resolver!: AssignmentResolver;

    protected uri: URI | undefined;

    @postConstruct()
    protected init(): void {
        this.id = AssignmentPaneWidget.ID;
        this.title.label = AssignmentPaneWidget.LABEL;
        this.title.caption = AssignmentPaneWidget.LABEL;
        this.title.closable = true;
        this.title.iconClass = 'codicon codicon-book';
        this.addClass('yukibana-markdown-pane');
        this.node.style.overflow = 'auto';
        this.node.style.padding = '8px 16px';
        this.toDispose.push(this.resolver.onDidChange(() => this.refresh()));
        this.toDispose.push(this.fileService.onDidFilesChange(e => {
            if (this.uri && e.contains(this.uri)) { this.refresh(); }
        }));
        this.refresh();
    }

    protected async refresh(): Promise<void> {
        this.uri = await this.resolver.resolve();
        if (!this.uri) { return; }
        await this.showFile(this.uri);
    }

    async showFile(uri: URI): Promise<void> {
        const content = await this.fileService.read(uri);
        this.showMarkdown(content.value.toString());
    }

    showMarkdown(text: string): void {
        const renderer = this.rendererFactory();
        const md = new MarkdownStringImpl(text, { supportHtml: false });
        const rendered = renderer.render(md);
        this.node.replaceChildren(rendered.element);
        this.toDispose.push(rendered);
    }

    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.node.focus();
    }
}
