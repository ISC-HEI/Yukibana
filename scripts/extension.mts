import * as fs from 'node:fs';
import path from 'node:path';

interface TemplateDirectory {
    readonly path: string;
}

interface TemplateFile {
    readonly path: string;
    readonly content: string | ((name: string) => string);
}

type TemplateEntry = TemplateDirectory | TemplateFile;

const EXTENSION_TEMPLATE: TemplateEntry[] = [
    {
        path: 'src',
    },
    {
        path: 'package.json',
        content: name => `
        {
          "name": "${name}-ext",
          "keywords": [
            "theia-extension"
          ],
          "version": "0.1.0",
          "files": [
            "lib",
            "src"
          ],
          "dependencies": {},
          "devDependencies": {
            "rimraf": "^6.1.3",
            "typescript": "7.0.2"
          },
          "scripts": {
            "prepare": "tsc --build",
            "clean": "rimraf lib tsconfig.tsbuildinfo"
          },
          "theiaExtensions": []
        }
        `,
    },
    {
        path: 'tsconfig.json',
        content: `
        {
          "extends": "../../configs/base.tsconfig",
          "compilerOptions": {
            "rootDir": "src",
            "outDir": "lib"
          },
          "include": ["src"],
          "references": []
        }
        `,
    },
];

function dedent(content: string): string {
    const lines = content.split('\n');
    let dedentBy: number | undefined;

    for (const line of lines) {
        const indent = line.match(/^ */)?.[0]?.length ?? 0;
        if (indent !== 0 && (dedentBy === undefined || indent < dedentBy)) {
            dedentBy = indent;
        }
    }
    if (dedentBy === undefined) {
        return content;
    }
    for (const [i, line] of lines.entries()) {
        lines[i] = line.slice(dedentBy);
    }
    return lines.join('\n');
}

function removeExtraLines(content: string): string {
    return content.replace(/^\n+/, '').replace(/\n+$/, '\n');
}

export function initExtension(name: string, rootPath: string): void {
    fs.mkdirSync(rootPath);
    EXTENSION_TEMPLATE.forEach(entry => {
        const entryPath = path.join(rootPath, entry.path);
        if ('content' in entry) {
            const rawContent = typeof entry.content === 'function' ? entry.content(name) : entry.content;
            const content = removeExtraLines(dedent(rawContent));
            fs.writeFileSync(entryPath, content);
        } else {
            fs.mkdirSync(entryPath);
        }
    });
}
