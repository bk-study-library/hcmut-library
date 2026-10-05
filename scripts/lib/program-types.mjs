// Loại chương trình: bảng duy nhất. Trang web, script nhập (import-research, import-ctdt, import-sdh) và test
// đều đọc từ đây; thêm, sửa loại chỉ sửa file này. Nguồn tên và mã: docs/ten-chuong-trinh.md, docs/nguon-du-lieu.md.
//
// Khóa của bảng là mã thư viện (trường type của chương trình, majors[].programTypes trong v1). Mã này nằm trong
// hợp đồng v1 và trong id của nhiều chương trình nên không đổi tên; tên hiển thị lấy từ abbr và official.
//
// Mỗi loại:
//   abbr        mã viết tắt trên Sổ tay HCMUT (giá trị program= trong link Sổ tay), hiện trên nhãn và chip.
//   official    tên chính thức trên bộ chọn chương trình của Sổ tay; thiếu tiếng Anh chính thức thì en là tên mô tả.
//   variant     giá trị trường variant ghi vào file chương trình (tên cũ, giữ nguyên để khớp dữ liệu đã nhập).
//               CQ không ghi variant.
//   orientation định hướng thạc sĩ (ung-dung, nghien-cuu) mà import-sdh ghi khi nguồn không ghi.
//   research    cách nhận loại trong bản thu thập (import-research): match là mẫu của trường type, idSuffix là
//               đuôi id chương trình đã dùng (không đổi, id có trong URL trang).
//   sdh         cách nhận loại trong bộ dữ liệu sau đại học (import-sdh): mỗi mục { level, variant, orientation }.
//               Mục có variant thì chỉ so variant; mục không có variant thì nguồn phải không có variant và
//               orientation phải khớp (thiếu là không có).

export const PROGRAM_TYPES = {
  // Đại học. Chính quy là hình thức đào tạo; chương trình không đặc biệt gọi là tiêu chuẩn (trước 2026: chính quy đại trà).
  CQ: {
    abbr: 'CQ',
    official: { vi: 'Chương trình Đại học tiêu chuẩn (hình thức chính quy; văn bản trước 2026 gọi là chính quy đại trà)', en: 'Vietnamese-taught Undergraduate Program' },
    variant: null,
    // "standard-or-unspecified" của file khoa không tính: chưa chắc là tiêu chuẩn.
    research: { match: /^standard$/ },
    sdh: [{ level: 'thac-si', variant: 'tieu-chuan' }, { level: 'thac-si' }, { level: 'tien-si' }],
  },
  CTTA: {
    abbr: 'CTTA',
    official: { vi: 'Chương trình Đại học Dạy và học bằng tiếng Anh', en: 'English-taught Undergraduate Program' },
    variant: 'Dạy và học bằng tiếng Anh',
    research: { match: /^day-va-hoc-bang-tieng-anh/, idSuffix: 'TA' },
  },
  CNTN: {
    abbr: 'CNTN',
    official: { vi: 'Chương trình Đại học tài năng', en: 'Honors Undergraduate Program' },
    variant: 'Chương trình tài năng',
  },
  PFIEV: {
    abbr: 'PFIEV',
    official: { vi: 'Chương trình Đại học Kỹ sư chất lượng cao tại Việt Nam', en: 'Vietnamese-French High-Quality Engineering Program (PFIEV)' },
    variant: 'PFIEV (kỹ sư Việt Pháp)',
    // import-research ghi nhãn ngắn "PFIEV" làm variant.
    variantAliases: ['PFIEV'],
    research: { match: /^pfiev/, idSuffix: 'PFIEV', label: 'PFIEV' },
  },
  SN: {
    abbr: 'SN',
    official: { vi: 'Chương trình Đại học Song ngành', en: 'Dual-degree Undergraduate Program' },
    variant: 'Song ngành',
  },
  CTTT: {
    abbr: 'CTTT',
    official: { vi: 'Chương trình Đại học Tiên tiến', en: 'Advanced Undergraduate Program' },
    variant: 'Chương trình tiên tiến',
    research: { match: /^tien-tien/, idSuffix: 'TT' },
  },
  DHNB: {
    abbr: 'DHNB',
    official: { vi: 'Chương trình Đại học Định hướng Nhật Bản', en: 'Japanese-oriented Undergraduate Program' },
    variant: 'Định hướng Nhật Bản',
    research: { match: /^dinh-huong-nhat-ban/, idSuffix: 'NB' },
  },
  // VLVH là hình thức đào tạo, học theo chương trình chính quy; chưa có tên tiếng Anh chính thức.
  VLVH: {
    abbr: 'VLVH',
    official: { vi: 'Hình thức đào tạo vừa làm vừa học (học theo chương trình chính quy)', en: 'Vừa làm vừa học (VLVH)' },
    variant: 'Vừa làm vừa học',
  },
  CTQT: {
    abbr: 'CTQT',
    official: { vi: 'Chương trình Chuyển tiếp quốc tế', en: 'Trans-national Education program' },
    variant: 'Chuyển tiếp quốc tế',
    research: { match: /^chuyen-tiep-quoc-te/, idSuffix: 'CTQT' },
  },
  // Sau đại học. CTĐT trước khóa 2025 chưa chia hướng ghi CQ (xem programTypeInfo).
  UD: {
    abbr: 'UD',
    official: { vi: 'Chương trình Thạc sĩ hướng Ứng dụng', en: 'Coursework Master Program' },
    variant: 'Thạc sĩ định hướng ứng dụng',
    orientation: 'ung-dung',
    sdh: [{ level: 'thac-si', orientation: 'ung-dung' }],
  },
  NC: {
    abbr: 'NC',
    official: { vi: 'Chương trình Thạc sĩ hướng Nghiên cứu', en: 'Research-oriented Master Program' },
    variant: 'Thạc sĩ định hướng nghiên cứu',
    orientation: 'nghien-cuu',
    sdh: [{ level: 'thac-si', orientation: 'nghien-cuu' }],
  },
  CSAU: {
    abbr: 'CS',
    official: { vi: 'Chương trình Thạc sĩ hướng Nghiên cứu chuyên sâu', en: 'Research-intensive Master Program' },
    variant: 'Thạc sĩ nghiên cứu chuyên sâu',
    orientation: 'nghien-cuu',
    sdh: [{ level: 'thac-si', variant: 'chuyen-sau' }],
  },
  TAUD: {
    abbr: 'CTTAUD',
    official: { vi: 'Chương trình Thạc sĩ Dạy và học bằng tiếng Anh hướng Ứng dụng', en: 'English-taught Coursework Master Program' },
    variant: 'Thạc sĩ ứng dụng dạy bằng tiếng Anh',
    orientation: 'ung-dung',
    sdh: [{ level: 'thac-si', variant: 'tieng-anh' }],
  },
  STEM: {
    abbr: 'THTN_STEM',
    official: { vi: 'Chương trình Thạc sĩ tài năng STEM', en: "STEM Honors Master's Program" },
    variant: 'Thạc sĩ tài năng STEM',
    sdh: [{ level: 'thac-si', variant: 'tai-nang-stem' }],
  },
  PT1: {
    abbr: 'PT1_1',
    official: { vi: 'Chương trình Tiến sĩ phương thức 1 (đã có bằng thạc sĩ)', en: "Doctoral Program, Mode 1 (with Master's entry)" },
    variant: 'Tiến sĩ phương thức 1',
    sdh: [{ level: 'tien-si', variant: 'phuong-thuc-1' }],
  },
  PT2: {
    abbr: 'PT2_1',
    official: { vi: 'Chương trình Tiến sĩ phương thức 2 (đã có bằng thạc sĩ)', en: "Doctoral Program, Mode 2 (with Master's entry)" },
    variant: 'Tiến sĩ phương thức 2',
    sdh: [{ level: 'tien-si', variant: 'phuong-thuc-2' }],
  },
  TAPT1: {
    abbr: 'CTTATS1_1',
    official: { vi: 'Chương trình Tiến sĩ Dạy và học bằng tiếng Anh phương thức 1 (đã có bằng thạc sĩ)', en: "English-taught Coursework Doctoral Program, Mode 1 (with Master's entry)" },
    variant: 'Tiến sĩ phương thức 1 dạy bằng tiếng Anh',
    sdh: [{ level: 'tien-si', variant: 'tieng-anh-phuong-thuc-1' }],
  },
};

export const TYPE_CODES = Object.keys(PROGRAM_TYPES);

// CQ ở sau đại học: thạc sĩ là THCQ "Chương trình Thạc sĩ tiêu chuẩn" trên Sổ tay; tiến sĩ chưa có tên
// chính thức nên chỉ hiện mã CQ.
const POSTGRAD_CQ = {
  'thac-si': { abbr: 'THCQ', official: { vi: 'Chương trình Thạc sĩ tiêu chuẩn' } },
  'tien-si': { abbr: 'CQ', official: {} },
};

// Mã viết tắt và tên chính thức để hiện, theo bậc của ngành hay chương trình. Loại lạ thì null.
export function programTypeInfo(type, level) {
  const base = PROGRAM_TYPES[type];
  if (!base) return null;
  if (type === 'CQ' && POSTGRAD_CQ[level]) return POSTGRAD_CQ[level];
  return { abbr: base.abbr, official: base.official };
}

// Loại của chương trình cũ từ trường variant (import-ctdt khớp chương trình chưa gắn ngành). Không khớp thì null.
export function typeFromVariant(variant) {
  if (!variant) return null;
  for (const [code, t] of Object.entries(PROGRAM_TYPES)) {
    if (t.variant === variant || (t.variantAliases || []).includes(variant)) return code;
  }
  return null;
}

// Loại có trong bản thu thập nhưng không có trên Sổ tay: nhãn và đuôi id, không có mã loại.
const RESEARCH_ONLY = [{ match: /^lien-ket/, label: 'Liên kết quốc tế', idSuffix: 'LK' }];

// Loại trong bản thu thập (trường type, ví dụ "day-va-hoc-bang-tieng-anh (English; formerly CLC)").
// Trả { type, label, idSuffix }: type là mã thư viện (null khi không có trên Sổ tay), label là variant ghi vào
// chương trình, idSuffix là đuôi id. Chương trình tiêu chuẩn: type CQ, không có label và idSuffix. Không nhận ra thì null.
export function researchType(raw) {
  const s = String(raw || '');
  for (const [code, t] of Object.entries(PROGRAM_TYPES)) {
    if (t.research && t.research.match.test(s)) return { type: code, label: t.research.label ?? t.variant, idSuffix: t.research.idSuffix ?? null };
  }
  const extra = RESEARCH_ONLY.find((x) => x.match.test(s));
  return extra ? { type: null, label: extra.label, idSuffix: extra.idSuffix } : null;
}

// Loại của một chương trình trong bộ dữ liệu sau đại học ({ level, variant, orientation }). Không nhận ra thì null.
export function sdhType(p) {
  const v = p.variant || null;
  const o = p.orientation || null;
  for (const [code, t] of Object.entries(PROGRAM_TYPES)) {
    for (const m of t.sdh || []) {
      if (m.level !== p.level) continue;
      if (m.variant ? m.variant === v : !v && (m.orientation || null) === o) return code;
    }
  }
  return null;
}
