import * as core from '@actions/core';
import * as github from '@actions/github';
import { exec } from '@actions/exec';

export async function getLastSuccessfulCommit(
  token: string,
  workflowId: string,
  branch: string,
): Promise<string> {
  const octokit = github.getOctokit(token);
  const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
  const res = await octokit.rest.actions.listWorkflowRuns({
    owner,
    repo,
    workflow_id: workflowId,
    status: 'success',
    branch,
  });
  let result = res.data.workflow_runs.length > 0 ? res.data.workflow_runs[0].head_commit.id : null;
  if (result) {
    const valid = await checkCommitHash(result);
    if (!valid) {
      result = null;
    }
  }

  core.info(`ℹ️ Last successful build: ${ result ?? 'None' }`);
  return result;
}

async function checkCommitHash(hash: string): Promise<boolean> {
  const result = await exec('git', ['cat-file', '-e', hash]);
  return result === 0;
}
