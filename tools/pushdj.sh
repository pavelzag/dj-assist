#!/usr/bin/env zsh

set -euo pipefail

git pull
git add .

if ! git diff --cached --quiet; then
  git commit -m 'fixes'
fi

git push
gh workflow run release.yml --ref master

sleep 5

run_id=$(gh run list --workflow release.yml --limit 1 --json databaseId --jq '.[0].databaseId')
run_number=$(gh run view "$run_id" --json number --jq '.number')

dest="$HOME/Downloads/dj-assist/run-$run_number"
mkdir -p "$dest"

gh run watch "$run_id" --exit-status
gh run view "$run_id" --log
gh run download "$run_id" -D "$dest"

find "$dest" -type f -name '*.zip' | while IFS= read -r zip_file; do
  unzip_dir="${zip_file%.zip}"
  rm -rf "$unzip_dir"
  mkdir -p "$unzip_dir"
  unzip -o "$zip_file" -d "$unzip_dir"
  rm -f "$zip_file"
done

echo "Artifacts downloaded to: $dest"
