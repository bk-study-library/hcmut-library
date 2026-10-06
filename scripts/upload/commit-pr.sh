#!/usr/bin/env bash
# Commit item và generated file của môn đó vào branch PR, push bằng token của GitHub App
# (workflow kiem-file). Chạy trong thư mục checkout của PR; script lấy từ bản main.
#
# Chỉ commit item và generated file của môn đó; commit và push qua app-git.sh.
#
# Biến môi trường: GH_TOKEN (đọc id của bot), APP_TOKEN, APP_SLUG, CODE, ITEMS, COURSE,
# BRANCH, REPO, GITHUB_SERVER_URL.
set -euo pipefail
. "$(dirname "$0")/app-git.sh"

# ITEMS: các item của bài, mỗi dòng một đường dẫn courses/<môn>/items/<id>.json (đã qua kiểm ở job gate).
while IFS= read -r item; do
  [ -n "$item" ] || continue
  case "$item" in
    courses/"$COURSE"/items/*.json) ;;
    *) echo "Đường dẫn mục lạ: $item" >&2; exit 1 ;;
  esac
  if [ -e "$item" ] || git ls-files --error-unmatch -- "$item" > /dev/null 2>&1; then
    git add -A -- "$item"
  fi
done <<< "$ITEMS"
for p in index.json index.min.json worker-catalog.json v1 "courses/$COURSE/README.md"; do
  if [ -e "$p" ] || git ls-files --error-unmatch -- "$p" > /dev/null 2>&1; then
    git add -A -- "$p"
  fi
done
if git diff --cached --quiet; then
  echo "Không có gì thay đổi."
  exit 0
fi
bot_identity
git commit -m "kiem-file: $CODE"
if [ -n "$(git status --porcelain)" ]; then
  echo "::warning::Có file khác thay đổi nhưng không được commit: $(git status --porcelain | tr '\n' ' ')"
fi
app_push "$BRANCH"
