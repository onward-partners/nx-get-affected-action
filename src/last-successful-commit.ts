import * as github from '@actions/github';

export async function getLastSuccessfulCommit(
  token: string,
  workflowId: string,
  branch: string,
): Promise<string> {
  const octokit = github.getOctokit(token);
  const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
  const res = await octokit.actions.listWorkflowRuns({
    owner,
    repo,
    workflow_id: workflowId,
    status: 'success',
    branch,
    event: 'push',
  });
  return res.data.workflow_runs.length > 0 ? res.data.workflow_runs[0].head_commit.id : '';
}
