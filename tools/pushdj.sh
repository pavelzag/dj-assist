#!/usr/bin/env zsh

set -euo pipefail

TOTAL_STEPS=8
CURRENT_STEP=0
SCRIPT_STARTED_AT=$SECONDS

format_elapsed() {
  local total_seconds=$1
  local minutes=$(( total_seconds / 60 ))
  local seconds=$(( total_seconds % 60 ))
  printf '%02d:%02d' "$minutes" "$seconds"
}

format_bytes() {
  local bytes=${1:-0}
  awk -v bytes="$bytes" '
    function human(value) {
      split("B KiB MiB GiB TiB", units, " ")
      unit = 1
      while (value >= 1024 && unit < length(units)) {
        value /= 1024
        unit += 1
      }
      return sprintf(unit == 1 ? "%.0f %s" : "%.1f %s", value, units[unit])
    }
    BEGIN { print human(bytes + 0) }
  '
}

render_progress() {
  local step=$1
  local total=$2
  local width=28
  local filled=$(( step * width / total ))
  local empty=$(( width - filled ))
  local bar
  bar=$(printf '%*s' "$filled" '' | tr ' ' '#')
  bar+=$(printf '%*s' "$empty" '' | tr ' ' '-')
  printf '[%s] %d/%d' "$bar" "$step" "$total"
}

start_step() {
  local label=$1
  CURRENT_STEP=$(( CURRENT_STEP + 1 ))
  STEP_STARTED_AT=$SECONDS
  printf '\n%s  %s\n' "$(render_progress "$CURRENT_STEP" "$TOTAL_STEPS")" "$label"
}

finish_step() {
  printf 'Completed in %s\n' "$(format_elapsed $(( SECONDS - STEP_STARTED_AT )))"
}

start_step "Staging local changes"
git add .
finish_step

start_step "Creating commit if needed"
if ! git diff --cached --quiet; then
  git commit -m 'fixes'
fi
finish_step

start_step "Pulling latest changes"
git pull --rebase
finish_step

start_step "Pushing to GitHub"
git push
finish_step

start_step "Dispatching release workflow"
head_sha=$(git rev-parse HEAD)
gh workflow run release.yml --ref master
finish_step

start_step "Waiting for workflow run to appear"
run_id=''
for _ in {1..30}; do
  run_id=$(gh run list --workflow release.yml --branch master --event workflow_dispatch --limit 20 --json databaseId,headSha | jq -r --arg head_sha "$head_sha" '.[] | select(.headSha == $head_sha) | .databaseId' | head -n 1)
  if [[ -n "$run_id" ]]; then
    break
  fi
  sleep 2
done

if [[ -z "$run_id" ]]; then
  echo "Could not find the workflow run for commit $head_sha" >&2
  exit 1
fi
finish_step

run_number=$(gh run view "$run_id" --json number --jq '.number')
start_step "Downloading DMG assets from release #$run_number"

dest="$HOME/Downloads/dj-assist/run-$run_number"
mkdir -p "$dest"
github_token=$(gh auth token)

release_tag=''
downloaded_bytes=0
total_expected_bytes=0

resolve_release_tag() {
  local tag
  tag=$(gh api "repos/:owner/:repo/releases" --paginate \
    | jq -r --arg head_sha "$head_sha" '.[] | select(.target_commitish == $head_sha) | .tag_name' \
    | head -n 1)
  printf '%s' "$tag"
}

download_release_asset() {
  local asset_name=$1
  local browser_download_url=$2
  local asset_size=${3:-0}
  local asset_dir="${dest}/${asset_name}"
  local asset_path="${asset_dir}/${asset_name}"

  rm -rf "$asset_dir"
  mkdir -p "$asset_dir"

  printf 'Progress: %s / %s downloaded before this artifact\n' \
    "$(format_bytes "$downloaded_bytes")" \
    "$(format_bytes "$total_expected_bytes")"
  curl --fail --location \
    -H "Authorization: Bearer ${github_token}" \
    -H "Accept: application/octet-stream" \
    -o "$asset_path" \
    "$browser_download_url"

  downloaded_bytes=$(( downloaded_bytes + asset_size ))
  printf 'Completed %s (%s). Overall: %s / %s\n' \
    "$asset_name" \
    "$(format_bytes "$asset_size")" \
    "$(format_bytes "$downloaded_bytes")" \
    "$(format_bytes "$total_expected_bytes")"
}

run_finished=false
run_conclusion=""

for _ in {1..360}; do
  run_status=$(gh run view "$run_id" --json status --jq '.status')
  if [[ "$run_status" == "completed" ]]; then
    run_finished=true
    run_conclusion=$(gh run view "$run_id" --json conclusion --jq '.conclusion')
    release_tag=$(resolve_release_tag)
    if [[ -n "$release_tag" ]]; then
      break
    fi
  fi

  sleep 10
done

if [[ "$run_finished" != true ]]; then
  run_status=$(gh run view "$run_id" --json status --jq '.status')
  if [[ "$run_status" == "completed" ]]; then
    run_finished=true
    run_conclusion=$(gh run view "$run_id" --json conclusion --jq '.conclusion')
  fi
fi

if [[ "$run_finished" != true ]]; then
  echo "Timed out waiting for workflow #$run_number to complete." >&2
  exit 1
fi

if [[ "$run_conclusion" != "success" ]]; then
  GH_PAGER=cat gh run view "$run_id" --log
  echo "Workflow #$run_number completed with conclusion '${run_conclusion}'." >&2
  exit 1
fi

if [[ -z "$release_tag" ]]; then
  release_tag=$(resolve_release_tag)
fi

if [[ -z "$release_tag" ]]; then
  echo "Could not resolve the release tag for workflow #$run_number." >&2
  exit 1
fi

asset_json=$(gh release view "$release_tag" --json assets --jq '.assets[] | select(.name | endswith(".dmg")) | [.name, .browser_download_url, (.size // 0)] | @tsv' || true)
if [[ -z "$asset_json" ]]; then
  echo "No DMG release assets were found for tag $release_tag." >&2
  exit 1
fi

while IFS=$'\t' read -r asset_name browser_download_url asset_size; do
  [[ -n "$asset_name" ]] || continue
  total_expected_bytes=$(( total_expected_bytes + asset_size ))
done <<< "$asset_json"

while IFS=$'\t' read -r asset_name browser_download_url asset_size; do
  [[ -n "$asset_name" ]] || continue
  printf 'Downloading %s\n' "$asset_name"
  download_release_asset "$asset_name" "$browser_download_url" "$asset_size"
done <<< "$asset_json"

echo "Artifacts downloaded to: $dest"
finish_step
printf '\nRelease helper finished in %s\n' "$(format_elapsed $(( SECONDS - SCRIPT_STARTED_AT )))"
