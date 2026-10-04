// Đuôi file nhận cho từng loại tài liệu, theo catalog/policy.json. Chỉ dùng JS chuẩn để Worker,
// trang web và script CI dùng chung.
//
// extensions[<đuôi>].types (không bắt buộc): đuôi chỉ nhận cho các loại này (ví dụ .zip chỉ cho
// quiz-pack). Gói quiz còn bị giới hạn thêm bởi quizExtensions.

export function extensionsFor(policy, type) {
  const typeOk = (ext) => {
    const rule = policy.extensions[ext];
    return Boolean(rule) && (!Array.isArray(rule.types) || rule.types.includes(type));
  };
  // Gói quiz: theo thứ tự của quizExtensions.
  if (type === 'quiz-pack' && Array.isArray(policy.quizExtensions)) return policy.quizExtensions.filter(typeOk);
  return Object.keys(policy.extensions).filter(typeOk);
}

// Đuôi có giới hạn loại: { '.zip': ['quiz-pack'] }. Form dùng để ghi chú và lọc ô chọn file.
export function restrictedExtensions(policy) {
  const out = {};
  for (const [ext, rule] of Object.entries(policy.extensions)) {
    if (Array.isArray(rule.types)) out[ext] = [...rule.types];
  }
  return out;
}
