# Get affected Nx apps action

This action gets the apps affected by the changes since the last successful build and sets them as outputs.

## Inputs

### `github_token`

**Required if `all` is NOT `true`** Your GitHub access token (see Usage below).

### `workflow_id`

**Required if `all` is NOT `true`** The `id` of the workflow to check against (e.g. main.yml).

### `branch`

Branch to get last successful commit from. Default: `main`

### `all`

Ignores all changes and prints the names of all apps. Default: `false`

### `tags`

Project tags required for the app  to have in order to be listed. Tags an app should not have can be added with the `-:` prefix (ex. `-:test-app`).

## Outputs

### `affected`

An array of all affected apps.

### `affectedString`

A comma seperated string of all affected apps

## Example usage

```yaml
jobs:
  get-affected:
    runs-on: ubuntu-latest
    name: Get affected apps
    outputs:
      affected: ${{ steps.affected_apps.outputs.affected }}
      affectedString: ${{ steps.affected_apps.outputs.affectedString }}
    steps:
      - uses: actions/checkout@v1
        with:
          fetch-depth: 0

      - uses: i40MC/nx-get-affected-action@v1
        id: affected_apps
        with:
          branch: 'main'
          workflow_id: 'main.yml'
          github_token: ${{ secrets.GITHUB_TOKEN }}

  build-app-a:
    name: Build app A
    needs: get-affected
    if: contains( needs.get-affected.output.affected, 'app-a' )
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v2

      - uses: actions/setup-node@v2
        with:
          node-version: '14'

      - name: Build app A
        run: yarn run build
```
