#!/usr/bin/env bash
# Gộp main vào một branch upload/<mã> đã kiểm xong (workflow cap-nhat-pr). Mọi bài đều sửa generated file (index.json,
# index.min.json, worker-catalog.json, v1/, README môn), nên bài merge trước làm bài sau xung đột, hay merge sạch mà
# generated file sai. Gộp main rồi dựng lại từ item của branch thì bài nào merge cũng đúng.
# Xung đột ở file khác (item trùng đường dẫn với main) thì bỏ qua bài đó, để người duyệt xử lý.
#
# Chạy trong bản checkout có đủ lịch sử, đang ở branch cần gộp, có origin/main. Script lấy từ bản main ($TRUSTED).
# Biến môi trường: TRUSTED, CODE, BRANCH và biến của app-git.sh.
set -euo pipefail
. "$(dirname "$0")/app-git.sh"

if git merge-base --is-ancestor origin/main HEAD; then
  echo "$BRANCH đã gồm main."
  exit 0
fi
bot_identity
if ! git merge --no-commit --no-ff origin/main > /dev/null; then
  for f in $(git diff --name-only --diff-filter=U); do
    case "$f" in
      index.json|index.min.json|worker-catalog.json|v1/*|courses/*/README.md) git checkout --theirs -- "$f" && git add -- "$f" ;;
      *) echo "::warning::$BRANCH xung đột ở $f, cần người duyệt."; git merge --abort; exit 0 ;;
    esac
  done
fi
node "$TRUSTED/scripts/upload/check.mjs" rebuild --root .
git add -A -- index.json index.min.json worker-catalog.json v1 courses
# Commit bắt đầu bằng kiem-file: để kiem-file không quét lại và cron của Worker nhận là commit đã kiểm.
git commit -q -m "kiem-file: $CODE (gộp main)"
app_push "$BRANCH"
