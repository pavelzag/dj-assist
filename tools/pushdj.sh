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
start_step "Watching workflow #$run_number"

dest="$HOME/Downloads/dj-assist/run-$run_number"
mkdir -p "$dest"

gh run watch "$run_id" --compact --exit-status
GH_PAGER=cat gh run view "$run_id" --log
finish_step

start_step "Downloading and extracting artifacts"
downloaded=false
for _ in {1..24}; do
  rm -rf "$dest"
  mkdir -p "$dest"
  if GH_PAGER=cat gh run download "$run_id" -D "$dest"; then
    if find "$dest" -mindepth 1 -print -quit | grep -q .; then
      downloaded=true
      break
    fi
  fi
  sleep 5
done

if [[ "$downloaded" != true ]]; then
  echo "Artifacts were not available for download for run $run_id, or the run produced no downloadable files." >&2
  exit 1
fi

find "$dest" -type f -name '*.zip' | while IFS= read -r zip_file; do
  unzip_dir="${zip_file%.zip}"
  rm -rf "$unzip_dir"
  mkdir -p "$unzip_dir"
  unzip -o "$zip_file" -d "$unzip_dir"
  rm -f "$zip_file"
done

echo "Artifacts downloaded to: $dest"
finish_step
printf '\nRelease helper finished in %s\n' "$(format_elapsed $(( SECONDS - SCRIPT_STARTED_AT )))"
