# About:
#
# This is a helper script to tag and push a new release. GitHub Actions use
# release tags to allow users to select a specific version of the action to use.
#
# See: https://github.com/actions/typescript-action#publishing-a-new-release
# See: https://github.com/actions/toolkit/blob/master/docs/action-versioning.md#recommendations
#
# This script will do the following:
#
# 1. Retrieve the latest release tag
# 2. Display the latest release tag
# 3. Prompt the user for a new release tag
# 4. Validate the new release tag
# 5. Remind user to update the version field in package.json
# 6. Tag a new release
# 7. Set 'is_major_release' variable
# 8. Point separate major release tag (e.g. v1, v2) to the new release
# 9. Push the new tags (with commits, if any) to remote
# 10. If this is a major release, create a 'releases/v#' branch and push
#
# Usage:
#
# .\script\release.ps1

$ErrorActionPreference = 'Stop'

# Variables
$semver_tag_regex = '^v\d+\.\d+\.\d+$'
$semver_tag_glob = 'v[0-9].[0-9].[0-9]*'
$git_remote = 'origin'

# 1. Retrieve the latest release tag
try {
    $latest_tag = git describe --abbrev=0 --match="$semver_tag_glob" 2>$null
    if ($LASTEXITCODE -ne 0) { throw }
} catch {
    # There are no existing release tags
    Write-Host 'No tags found (yet) - Continue to create and push your first tag'
    $latest_tag = '[unknown]'
}

# 2. Display the latest release tag
Write-Host "The latest release tag is: " -NoNewline
Write-Host $latest_tag -ForegroundColor Blue

# 3. Prompt the user for a new release tag
$new_tag = Read-Host 'Enter a new release tag (vX.X.X format)'

# 4. Validate the new release tag
if ($new_tag -match $semver_tag_regex) {
    # Release tag is valid
    Write-Host "Tag: " -NoNewline
    Write-Host $new_tag -ForegroundColor Blue -NoNewline
    Write-Host " is valid syntax"
} else {
    # Release tag is not in `vX.X.X` format
    Write-Host "Tag: " -NoNewline
    Write-Host $new_tag -ForegroundColor Blue -NoNewline
    Write-Host " is " -NoNewline
    Write-Host "not valid" -ForegroundColor Red -NoNewline
    Write-Host " (must be in vX.X.X format)"
    exit 1
}

# 5. Remind user to update the version field in package.json
Write-Host "Make sure the version field in package.json is " -NoNewline
Write-Host $new_tag -ForegroundColor Blue -NoNewline
$YN = Read-Host ". Yes? [Y/n]"

if ($YN -ne 'y' -and $YN -ne 'Y') {
    # Package.json version field is not up to date
    Write-Host "Please update the package.json version to " -NoNewline
    Write-Host $new_tag -ForegroundColor Magenta -NoNewline
    Write-Host " and commit your changes"
    exit 1
}

# 6. Tag a new release
git tag $new_tag --annotate --message "$new_tag Release"
Write-Host "Tagged: " -NoNewline
Write-Host $new_tag -ForegroundColor Green

# 7. Set 'is_major_release' variable
if ($new_tag -match '^(v\d+)') {
    $new_major_release_tag = $Matches[1]
}

if ($latest_tag -eq '[unknown]') {
    # This is the first major release
    $is_major_release = $true
} else {
    # Compare the major version of the latest tag with the new tag
    if ($latest_tag -match '^(v\d+)') {
        $latest_major_release_tag = $Matches[1]
    }

    if ($new_major_release_tag -ne $latest_major_release_tag) {
        $is_major_release = $true
    } else {
        $is_major_release = $false
    }
}

# 8. Point separate major release tag (e.g. v1, v2) to the new release
if ($is_major_release) {
    # Create a new major version tag and point it to this release
    git tag $new_major_release_tag --annotate --message "$new_major_release_tag Release"
    Write-Host "New major version tag: " -NoNewline
    Write-Host $new_major_release_tag -ForegroundColor Green
} else {
    # Update the major version tag to point it to this release
    git tag $latest_major_release_tag --force --annotate --message "Sync $latest_major_release_tag tag with $new_tag"
    Write-Host "Synced " -NoNewline
    Write-Host $latest_major_release_tag -ForegroundColor Green -NoNewline
    Write-Host " with " -NoNewline
    Write-Host $new_tag -ForegroundColor Green
}

# 9. Push the new tags (with commits, if any) to remote
git push --follow-tags

if ($is_major_release) {
    # New major version tag is pushed with the '--follow-tags' flags
    Write-Host "Tags: " -NoNewline
    Write-Host $new_major_release_tag -ForegroundColor Green -NoNewline
    Write-Host " and " -NoNewline
    Write-Host $new_tag -ForegroundColor Green -NoNewline
    Write-Host " pushed to remote"
} else {
    # Force push the updated major version tag
    git push $git_remote $latest_major_release_tag --force
    Write-Host "Tags: " -NoNewline
    Write-Host $latest_major_release_tag -ForegroundColor Green -NoNewline
    Write-Host " and " -NoNewline
    Write-Host $new_tag -ForegroundColor Green -NoNewline
    Write-Host " pushed to remote"
}

# 10. If this is a major release, create a 'releases/v#' branch and push
if ($is_major_release) {
    git branch "releases/$new_major_release_tag" $new_major_release_tag
    Write-Host "Branch: " -NoNewline
    Write-Host "releases/$new_major_release_tag" -ForegroundColor Blue -NoNewline
    Write-Host " created from " -NoNewline
    Write-Host $new_major_release_tag -ForegroundColor Blue -NoNewline
    Write-Host " tag"
    git push --set-upstream $git_remote "releases/$new_major_release_tag"
    Write-Host "Branch: " -NoNewline
    Write-Host "releases/$new_major_release_tag" -ForegroundColor Green -NoNewline
    Write-Host " pushed to remote"
}

# Completed
Write-Host "Done!" -ForegroundColor Green

