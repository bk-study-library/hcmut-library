# Hàm git dùng chung cho các script đẩy commit của bot lên branch upload/<mã> (commit-pr.sh, sync-main.sh).
# Commit bằng token của GitHub App để workflow validate chạy lại trên PR; commit bằng GITHUB_TOKEN thì GitHub
# không chạy workflow khác. Biến môi trường: GH_TOKEN (đọc id của bot), APP_TOKEN, APP_SLUG, REPO, GITHUB_SERVER_URL.

# Tên và email commit là của bot.
bot_identity() {
  local bot_id
  bot_id=$(gh api "users/${APP_SLUG}%5Bbot%5D" --jq .id)
  git config user.name "${APP_SLUG}[bot]"
  git config user.email "${bot_id}+${APP_SLUG}[bot]@users.noreply.github.com"
}

# Push HEAD lên branch $1. Token đi qua header trong biến môi trường của git, không nằm trong URL.
# Push thường (không force), nên branch đã có commit mới hơn thì push bị từ chối.
app_push() {
  local auth
  auth=$(printf 'x-access-token:%s' "$APP_TOKEN" | base64 -w0)
  echo "::add-mask::$auth"
  GIT_CONFIG_COUNT=1 \
  GIT_CONFIG_KEY_0="http.${GITHUB_SERVER_URL}/.extraheader" \
  GIT_CONFIG_VALUE_0="AUTHORIZATION: basic $auth" \
    git push "${GITHUB_SERVER_URL}/${REPO}.git" "HEAD:refs/heads/$1"
}
