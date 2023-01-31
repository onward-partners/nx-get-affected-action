import * as core from '@actions/core';
import { readFile, stat } from 'fs/promises';
import { join } from 'path';
import { CommandBuilder, CommandWrapper } from './command-builder';


const semverRegex = /^([0-9]+)\.([0-9]+)\.([0-9]+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+)?$/g;

interface PackageJsonLike {
  scripts?: Record<string, string>;
}

async function loadPackageJson(): Promise<PackageJsonLike> {
  return JSON.parse(
    await readFile('package.json', 'utf8'),
  ) as PackageJsonLike;
}

async function assertHasNxPackageScript(): Promise<void> {
  try {
    const packageJson = await loadPackageJson();

    core.info('Found package.json file');

    if (typeof packageJson.scripts?.nx !== 'string') {
      throw new Error(`Failed to locate the 'nx' script in package.json, did you setup your project with Nx's CLI?`);
    }

    core.info(`Found 'nx' script inside package.json file`);

  } catch (err) {
    throw new Error('Failed to load the \'package.json\' file, did you setup your project correctly?');
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function tryLocate<T extends any>(
  entries: [pmName: string, filePath: string, factory: () => T | PromiseLike<T>][],
  info: (name: string) => string,
): Promise<T> {
  if (entries.length === 0) {
    throw new Error('Could not locate');
  }

  const [entry, ...rest] = entries;

  return stat(entry[1])
    .then(() => {
      core.info(info(entry[0]));
      return entry[2]();
    })
    .catch(async () => tryLocate<T>(rest, info));
}

export async function locateNx(): Promise<CommandWrapper> {
  await assertHasNxPackageScript();

  try {
    return tryLocate([
      [
        'npm',
        'package-lock.json',
        () =>
          new CommandBuilder()
            .withCommand('npm')
            .withArgs('run', 'nx', '--')
            .build(),
      ],
      [
        'yarn',
        'yarn.lock',
        () => new CommandBuilder().withCommand('yarn').withArgs('nx').build(),
      ],
      [
        'pnpm',
        'pnpm-lock.yaml',
        async () => {
          const versionExecutor = new CommandBuilder()
            .withCommand('pnpm')
            .withArgs('--version')
            .build();

          const version = (await versionExecutor())
            .filter(line => !!line && line !== '')
            .find(line => semverRegex.test(line.trim()));

          let builder = new CommandBuilder()
            .withCommand('pnpm')
            .withArgs('run', 'nx');

          if (!(version?.startsWith('7'))) {
            builder = builder.withArgs('--');
          }

          return builder.build();
        },
      ],
    ], (name) => `Using ${ name } as package manager`);
  } catch (e) {
    if (e.message === 'Could not locate') {
      throw new Error('Failed to detect your package manager, are you using npm or yarn?');
    } else {
      throw e;
    }
  }
}

export async function getNxAffectedApps(
  lastSuccesfulCommitSha: string,
  tags: string[],
  nx: CommandWrapper,
): Promise<string[]> {
  const args = [
    'affected:apps',
    '--plain',
  ];
  if (lastSuccesfulCommitSha) {
    args.push(
      `--base=${ lastSuccesfulCommitSha }`,
      '--head=HEAD',
    );
  } else {
    args.push(
      '--all',
    );
  }
  let output = await nx(args);
  core.debug(`CONTENT>>${ output }<<`);
  output = output
    .map(line => line.trim())
    .filter(line => line !== '')
    .map(line => {
      core.debug(`LINE>>${ line }<<`);
      return line;
    });
  const iStart = output.findIndex(line => line.includes('nx') && line.includes('affected:apps'));
  const iEnd = output.findIndex(line => line.startsWith('Done in'));
  core.debug(`iStart: ${ iStart }`);
  core.debug(`iEnd: ${ iEnd }`);
  if (iStart !== -1 && (iEnd === iStart + 2 || iEnd === -1)) {
    output = [output[iStart + 1]];
  } else {
    output = [];
  }
  output = output
    .join(' ')
    .split(/\s+/gm)
    .filter(line => line !== '');

  if (tags.length > 0) {
    output = await filterAppsByTags(output, tags);
  }

  return output;
}

async function filterAppsByTags(apps: string[], tags: string[]): Promise<string[]> {
  try {
    const workspaceContent = await tryLocate([
      [
        'angular.json',
        'angular.json',
        async () => JSON.parse(await readFile('angular.json', 'utf-8')),
      ],
      [
        'workspace.json',
        'workspace.json',
        async () => JSON.parse(await readFile('workspace.json', 'utf-8')),
      ],
    ], (name) => `Using workspace file: ${ name }`);

    const filteredApps: string[] = [];
    const positiveTags = tags.filter(t => !t.startsWith('-:'))
    const negativeTags = tags.filter(t => t.startsWith('-:'))
    for (const app of apps) {
      const appTags = await getProjectTags(app, workspaceContent);

      const missesAllNegativeTags = negativeTags.every(tag => !appTags.includes(tag));
      if (!missesAllNegativeTags) {
        continue
      }

      const hasAllPositiveTags = positiveTags.every(tag => appTags.includes(tag));
      if (!hasAllPositiveTags) {
        continue
      }

      filteredApps.push(app);
    }
    return filteredApps;

  } catch (e) {
    if (e.message === 'Could not locate') {
      throw new Error('Failed to find your workspace file (angular.json, workspace.json)');
    } else {
      throw e;
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getProjectTags(app: string, workspace: any): Promise<string[]> {
  if (workspace.version === 2) {
    const path = workspace.projects[app];
    if (!path) {
      return [];
    }
    const workspaceContent = await readFile(join(path, 'project.json'), 'utf-8');
    workspace = JSON.parse(workspaceContent);
  } else {
    throw new Error('Workspace version 2 required to filter by tags');
  }

  return workspace.tags ?? [];
}
