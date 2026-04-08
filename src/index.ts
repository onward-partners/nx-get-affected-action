import * as core from '@actions/core';
import { getLastSuccessfulCommit } from './last-successful-commit.js';
import { getNxAffectedApps, locateNx } from './nx.js';

async function run(): Promise<void> {
  try {
    const all = core.getBooleanInput('all');

    let lastSuccessfulCommit: string | null = null;

    if (!all) {
      lastSuccessfulCommit = await core.group('🔍 Get commit with last sucessful build', async () =>
        getLastSuccessfulCommit(
          core.getInput('github_token', { required: true }),
          core.getInput('workflow_id', { required: true }),
          core.getInput('branch', { required: true }),
        ),
      );
    }

    const tags = core
      .getInput('tags', { trimWhitespace: true })
      ?.replace(/\s/g, '')
      .split(',')
      .map(tag => tag.trim())
      .filter(tag => tag !== '');

    const nx = await core.group('🔍 Ensuring Nx is available', locateNx);
    const affected = await core.group('🔍 Get affected Nx apps', async () =>
      getNxAffectedApps(lastSuccessfulCommit, tags ?? [], nx),
    );

    core.setOutput('affected', affected);
    core.info(`ℹ️ Setting affected output to [${affected}]`);
    core.setOutput('affectedString', affected.join(','));
    core.info(`ℹ️ Setting affectedString output to ${affected.join(',')}`);
  } catch (error: any) {
    core.setFailed(error);
  }
}

void run();
