import * as core from '@actions/core';
import { readFile, stat } from 'fs/promises';
import { CommandBuilder, CommandWrapper } from './command-builder';
import { eq, gt, gte, lt, lte } from 'semver';


const semverRegex = /^([0-9]+)\.([0-9]+)\.([0-9]+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+)?$/g;

interface NxVersion {
  local: string | null;
  global: string | null;
}

interface PackageJsonLike {
  scripts?: Record<string, string>;
}

async function loadPackageJson(): Promise<PackageJsonLike> {
  return JSON.parse(
    await readFile('package.json', 'utf8'),
  ) as PackageJsonLike;
}

async function assertHasNxPackageScript(): Promise<void> {
  let packageJson: PackageJsonLike;
  try {
    packageJson = await loadPackageJson();
  } catch (err) {
    throw new Error('Failed to load the \'package.json\' file, did you setup your project correctly?');
  }

  core.info('Found package.json file');

  if (typeof packageJson.scripts?.nx !== 'string') {
    throw new Error(`Failed to locate the 'nx' script in package.json, did you setup your project with Nx's CLI?`);
  }

  core.info(`Found 'nx' script inside package.json file`);
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

          if (version && !/^[78]/gm.test(version) && lt(version, '8.0.0')) {
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

async function getNxVersions(nx: CommandWrapper): Promise<NxVersion> {
  const versions = {
    local: null,
    global: null,
  };

  const output = await nx(['--version']);

  const legacyRegex = /^(\d+.*)/gm;
  const localRegex = /-\sLocal:\sv(\d+.*)/gm;
  const globalRegex = /-\sGlobal:\sv(\d+.*)/gm;

  let match: RegExpExecArray;
  for (const line of output) {
    match = localRegex.exec(line);
    if (match?.[1] && match[1].toLowerCase() !== 'not found') {
      versions.local = match[1];
      continue;
    }
    match = globalRegex.exec(line);
    if (match?.[1] && match[1].toLowerCase() !== 'not found') {
      versions.global = match[1];
      continue;
    }
    match = legacyRegex.exec(line);
    if (match?.[1] && match[1].toLowerCase() !== 'not found') {
      versions.local = match[1];
      break;
    }
  }

  return versions;
}

function checkVersion(versions: NxVersion, version: string, operation: '>' | '>=' | '<' | '<=' | '=' = '='): boolean {
  const nxVersion = versions.local ?? versions.global;
  switch (operation) {
    case '>':
      return gt(nxVersion, version);
    case '<':
      return lt(nxVersion, version);
    case '<=':
      return lte(nxVersion, version);
    case '>=':
      return gte(nxVersion, version);
    default:
      return eq(nxVersion, version);
  }
}

export async function getNxAffectedApps(
  lastSuccesfulCommitSha: string,
  tags: string[],
  nx: CommandWrapper,
): Promise<string[]> {
  const versions = await getNxVersions(nx);
  if (!checkVersion(versions, '19.0.0', '>=')) {
    throw new Error('Nx version 19.0.0 or higher is required to use this action');
  }

  let args: string[] = [
    'show',
    'projects',
    '--type=app',
    '--json',
  ];

  if (lastSuccesfulCommitSha) {
    args.push(
      '--affected',
      `--base=${ lastSuccesfulCommitSha }`,
      '--head=HEAD',
    );
  }
  let output = await nx(args);
  let apps: string[] = JSON.parse(output.find(line => line.startsWith('[')));
  if (tags.length > 0) {
    apps = await filterAppsByTags(apps, tags, nx);
  }

  return apps;
}

async function filterAppsByTags(apps: string[], tags: string[], nx: CommandWrapper): Promise<string[]> {
  const filteredApps: string[] = [];
  const positiveTags = tags.filter(t => !t.startsWith('-:'));
  const negativeTags = tags.filter(t => t.startsWith('-:')).map(t => t.substring(2));

  for (const app of apps) {
    const appTags = await getProjectTags(app, nx);

    const missesAllNegativeTags = negativeTags.every(tag => !appTags.includes(tag));
    if (!missesAllNegativeTags) {
      continue;
    }

    const hasAllPositiveTags = positiveTags.every(tag => appTags.includes(tag));
    if (!hasAllPositiveTags) {
      continue;
    }

    filteredApps.push(app);
  }
  return filteredApps;
}

async function getProjectTags(app: string, nx: CommandWrapper): Promise<string[]> {
  const projectJson = await nx(['show', 'project', app, '--json']);
  const project = JSON.parse(projectJson.join('\n'));
  return project.tags ?? [];
}
