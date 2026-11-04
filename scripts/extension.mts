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

const RIMRAF_VERSION = '^6.1.3';
const TYPESCRIPT_VERSION = '7.0.2';

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
            "rimraf": "${RIMRAF_VERSION}",
            "typescript": "${TYPESCRIPT_VERSION}"
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

const LANG_EXTENSION_TEMPLATE: TemplateEntry[] = [
    {
        path: 'src',
    },
    {
        path: 'package.json',
        content: name => `
        {
          "name": "yukibana-${name}-lang-ext",
          "keywords": [
            "theia-extension",
            "language"
          ],
          "version": "0.1.0",
          "files": [
            "lib",
            "src"
          ],
          "dependencies": {},
          "devDependencies": {
            "rimraf": "${RIMRAF_VERSION}",
            "typescript": "${TYPESCRIPT_VERSION}"
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
          "extends": "../../../configs/base.tsconfig",
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

function mkdir(dirPath: string): void {
    try {
        fs.mkdirSync(dirPath);
    } catch (e) {
        if (e.code !== 'EEXIST') {
            throw e;
        }
    }
}

export function initExtension(name: string, rootPath: string, lang: boolean): void {
    mkdir(rootPath);
    const template = lang ? LANG_EXTENSION_TEMPLATE : EXTENSION_TEMPLATE;
    template.forEach(entry => {
        const entryPath = path.join(rootPath, entry.path);
        if ('content' in entry) {
            const rawContent = typeof entry.content === 'function' ? entry.content(name) : entry.content;
            const content = removeExtraLines(dedent(rawContent));
            fs.writeFileSync(entryPath, content);
        } else {
            mkdir(entryPath);
        }
    });
}
