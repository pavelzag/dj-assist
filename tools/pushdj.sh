#!/usr/bin/env zsh

set -euo pipefail

git pull
git add .

if ! git diff --cached --quiet; then
  git commit -m 'fixes'
fi

git push
head_sha=$(git rev-parse HEAD)
gh workflow run release.yml --ref master

run_id=''
for _ in {1..30}; do
  run_id=$(gh run list --workflow release.yml --branch master --event workflow_dispatch --limit 20 --json databaseId,headSha --jq ".[] | select(.headSha == \"$head_sha\") | .databaseId" | head -n 1)
  if [[ -n "$run_id" ]]; then
    break
  fi
  sleep 2
done

if [[ -z "$run_id" ]]; then
  echo "Could not find the workflow run for commit $head_sha" >&2
  exit 1
fi

run_number=$(gh run view "$run_id" --json number --jq '.number')

dest="$HOME/Downloads/dj-assist/run-$run_number"
mkdir -p "$dest"

gh run watch "$run_id" --compact --exit-status
GH_PAGER=cat gh run view "$run_id" --log

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
