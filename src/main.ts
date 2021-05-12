import * as core from '@actions/core'
import {getLastSuccessfulCommit} from './last-successful-commit'
import {getNxAffectedApps, locateNx} from './nx'

async function run(): Promise<void> {
  try {
    const lastSuccessfulCommit = await core.group(
      '🔍 Get commit with last sucessful build',
      async () =>
        getLastSuccessfulCommit(
          core.getInput('github_token'),
          core.getInput('workflow_id'),
          core.getInput('branch')
        )
    )

    const nx = await core.group('🔍 Ensuring Nx is available', locateNx)
    const affected = await getNxAffectedApps(lastSuccessfulCommit, nx)

    core.setOutput('affected', affected)
    core.info(`ℹ️ Setting affected output to ${affected}`)
    core.setOutput('affectedString', affected.join(','))
    core.info(`ℹ️ Setting affectedString output to ${affected.join(',')}`)
  } catch (error) {
    core.setFailed(error.message)
  }
}

void run()
