#!/usr/bin/env bash
# Gộp main vào một branch upload/<mã> đã kiểm xong, hay phan-loai/<mã> của form phân loại (workflow cap-nhat-pr), rồi
# dựng lại generated file. Mọi bài đều sửa generated file (index.json,
# index.min.json, worker-catalog.json, v1/, README môn), nên bài merge trước làm bài sau xung đột, hay merge sạch mà
# generated file sai. Gộp main rồi dựng lại từ item của branch thì bài nào merge cũng đúng.
# Xung đột ở file khác (item trùng đường dẫn với main) thì bỏ qua bài đó, để người duyệt xử lý.
#
# Chạy trong bản checkout có đủ lịch sử, đang ở branch cần gộp, có origin/main. Script lấy từ bản main ($TRUSTED).
# Biến môi trường: TRUSTED, CODE, BRANCH và biến của app-git.sh.
set -euo pipefail
. "$(dirname "$0")/app-git.sh"

bot_identity
# Branch đã gồm main thì không gộp, vẫn dựng lại (branch phan-loai/ tách từ main mới nhất nhưng sửa item).
if git merge-base --is-ancestor origin/main HEAD; then
  :
elif ! git merge --no-commit --no-ff origin/main > /dev/null; then
  for f in $(git diff --name-only --diff-filter=U); do
    case "$f" in
      index.json|index.min.json|worker-catalog.json|v1/*|courses/*/README.md) git checkout --theirs -- "$f" && git add -- "$f" ;;
      *) echo "::warning::$BRANCH xung đột ở $f, cần người duyệt."; git merge --abort; exit 0 ;;
    esac
  done
fi
node "$TRUSTED/scripts/upload/check.mjs" rebuild --root .
git add -A -- index.json index.min.json worker-catalog.json v1 courses
if git diff --cached --quiet && ! git rev-parse -q --verify MERGE_HEAD > /dev/null; then
  echo "$BRANCH đã gồm main, generated file đã đúng."
  exit 0
fi
# Commit bắt đầu bằng kiem-file: để kiem-file không quét lại và cron của Worker nhận là commit đã kiểm.
git commit -q -m "kiem-file: $CODE (gộp main)"
app_push "$BRANCH"
