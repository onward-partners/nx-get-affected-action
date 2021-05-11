# Get affected Nx apps action

This action gets the apps affected by the changes since the last successful build and sets them as outputs.

## Inputs

### `github_token`

**Required** Your GitHub access token (see Usage below).

### `workflow_id`

**Required** The `id` of the workflow to check against (e.g. main.yml).

### `branch`

Branch to get last successful commit from. Default: `main`

## Outputs

### `affected`

An array of all affected apps.

### `affectedString`

A comma seperated string of all affected apps

## Example usage

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    name: Get affected apps
    steps:
      - uses: actions/checkout@v1
      - uses: i40MC/nx-get-affected-action@v1
        id: affected_apps
        with:
          branch: 'main'
          workflow_id: 'main.yml'
          github_token: ${{ secrets.GITHUB_TOKEN }}
```
