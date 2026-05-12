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
start_step "Streaming artifacts from workflow #$run_number"

dest="$HOME/Downloads/dj-assist/run-$run_number"
mkdir -p "$dest"
github_token=$(gh auth token)

typeset -a expected_artifact_prefixes=(
  "macos-debug-"
  "macos-free-prod-"
  "macos-pro-prod-"
)
typeset -A downloaded_artifacts=()
typeset -A artifact_sizes=()
total_expected_bytes=0
downloaded_bytes=0

download_artifact() {
  local artifact_name=$1
  local archive_url=$2
  local artifact_size=${3:-0}
  local artifact_dir="${dest}/${artifact_name}"
  local archive_path="${artifact_dir}/${artifact_name}.zip"
  local zip_file unzip_dir

  rm -rf "$artifact_dir"
  mkdir -p "$artifact_dir"

  printf 'Progress: %s / %s downloaded before this artifact\n' \
    "$(format_bytes "$downloaded_bytes")" \
    "$(format_bytes "$total_expected_bytes")"
  curl --fail --location \
    -H "Authorization: Bearer ${github_token}" \
    -H "Accept: application/vnd.github+json" \
    -o "$archive_path" \
    "$archive_url"

  while IFS= read -r zip_file; do
    unzip_dir="${zip_file%.zip}"
    rm -rf "$unzip_dir"
    mkdir -p "$unzip_dir"
    unzip -o "$zip_file" -d "$unzip_dir" >/dev/null
    rm -f "$zip_file"
  done < <(find "$artifact_dir" -type f -name '*.zip' -print)

  downloaded_bytes=$(( downloaded_bytes + artifact_size ))
  printf 'Completed %s (%s). Overall: %s / %s\n' \
    "$artifact_name" \
    "$(format_bytes "$artifact_size")" \
    "$(format_bytes "$downloaded_bytes")" \
    "$(format_bytes "$total_expected_bytes")"
}

all_expected_artifacts_downloaded() {
  local prefix
  for prefix in "${expected_artifact_prefixes[@]}"; do
    [[ -n "${downloaded_artifacts[$prefix]:-}" ]] || return 1
  done
  return 0
}

run_finished=false
run_conclusion=""
post_completion_polls=0
max_post_completion_polls=18

for _ in {1..360}; do
  artifact_json=$(gh api "repos/:owner/:repo/actions/runs/${run_id}/artifacts" --paginate || true)
  if [[ -n "$artifact_json" ]]; then
    while IFS=$'\t' read -r artifact_name archive_url artifact_size; do
      [[ -n "$artifact_name" ]] || continue
      for prefix in "${expected_artifact_prefixes[@]}"; do
        if [[ "$artifact_name" == ${prefix}* && -z "${artifact_sizes[$prefix]:-}" ]]; then
          artifact_sizes[$prefix]="$artifact_size"
          total_expected_bytes=$(( total_expected_bytes + artifact_size ))
        fi
        if [[ "$artifact_name" == ${prefix}* && -z "${downloaded_artifacts[$prefix]:-}" ]]; then
          printf 'Downloading %s\n' "$artifact_name"
          download_artifact "$artifact_name" "$archive_url" "$artifact_size"
          downloaded_artifacts[$prefix]="$artifact_name"
          break
        fi
      done
    done <<< "$(printf '%s' "$artifact_json" | jq -r '.artifacts[] | [.name, .archive_download_url, (.size_in_bytes // 0)] | @tsv')"
  fi

  if all_expected_artifacts_downloaded; then
    break
  fi

  run_status=$(gh run view "$run_id" --json status --jq '.status')
  if [[ "$run_status" == "completed" ]]; then
    run_finished=true
    run_conclusion=$(gh run view "$run_id" --json conclusion --jq '.conclusion')
    post_completion_polls=$(( post_completion_polls + 1 ))
    if [[ "$post_completion_polls" -ge "$max_post_completion_polls" ]]; then
      break
    fi
  fi

  sleep 10
done

if ! all_expected_artifacts_downloaded; then
  if [[ "$run_finished" == true ]]; then
    GH_PAGER=cat gh run view "$run_id" --log
    echo "Workflow #$run_number finished with conclusion '${run_conclusion}', but not all macOS artifacts were downloaded." >&2
  else
    echo "Timed out waiting for all macOS artifacts from workflow #$run_number." >&2
  fi
  exit 1
fi

if [[ "$run_finished" != true ]]; then
  run_status=$(gh run view "$run_id" --json status --jq '.status')
  if [[ "$run_status" == "completed" ]]; then
    run_finished=true
    run_conclusion=$(gh run view "$run_id" --json conclusion --jq '.conclusion')
  fi
fi

if [[ "$run_finished" == true && "$run_conclusion" != "success" ]]; then
  GH_PAGER=cat gh run view "$run_id" --log
  echo "Workflow #$run_number completed with conclusion '${run_conclusion}' after artifacts were downloaded." >&2
  exit 1
fi

echo "Artifacts downloaded to: $dest"
finish_step
printf '\nRelease helper finished in %s\n' "$(format_elapsed $(( SECONDS - SCRIPT_STARTED_AT )))"
