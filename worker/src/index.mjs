// Tạm thời: Task 7 thay bằng bộ xử lý nhận bài gửi.
export default {
  async fetch() {
    return new Response('Not found', { status: 404 });
  },
};
