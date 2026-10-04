#!/usr/bin/env bash
# Commit item và generated file của môn đó vào branch PR, push bằng token của GitHub App
# (workflow kiem-file). Chạy trong thư mục checkout của PR; script lấy từ bản main.
#
# Commit bằng token của App để workflow validate chạy lại trên PR; commit bằng GITHUB_TOKEN
# thì GitHub không chạy workflow khác. Chỉ commit item và generated file của môn đó.
#
# Biến môi trường: GH_TOKEN (đọc id của bot), APP_TOKEN, APP_SLUG, CODE, ITEMS, COURSE,
# BRANCH, REPO, GITHUB_SERVER_URL.
set -euo pipefail

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
bot_id=$(gh api "users/${APP_SLUG}%5Bbot%5D" --jq .id)
git config user.name "${APP_SLUG}[bot]"
git config user.email "${bot_id}+${APP_SLUG}[bot]@users.noreply.github.com"
git commit -m "kiem-file: $CODE"
if [ -n "$(git status --porcelain)" ]; then
  echo "::warning::Có file khác thay đổi nhưng không được commit: $(git status --porcelain | tr '\n' ' ')"
fi
# Token đi qua header trong biến môi trường của git, không nằm trong URL.
# Push thường (không force), nên branch đã có commit mới hơn thì push bị từ chối.
auth=$(printf 'x-access-token:%s' "$APP_TOKEN" | base64 -w0)
echo "::add-mask::$auth"
GIT_CONFIG_COUNT=1 \
GIT_CONFIG_KEY_0="http.${GITHUB_SERVER_URL}/.extraheader" \
GIT_CONFIG_VALUE_0="AUTHORIZATION: basic $auth" \
  git push "${GITHUB_SERVER_URL}/${REPO}.git" "HEAD:refs/heads/${BRANCH}"
