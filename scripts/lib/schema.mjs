// Bộ kiểm JSON Schema tối giản, không cần thư viện ngoài.
// Chỉ hỗ trợ các từ khóa mà schema/ đang dùng: type, enum, const, pattern,
// minLength, maxLength, minimum, maximum, required, properties,
// additionalProperties (false hoặc một schema cho mọi trường còn lại), propertyNames
// (schema cho tên trường), items. Gặp từ khóa lạ thì báo lỗi để không âm thầm bỏ qua quy tắc.

const KNOWN = new Set([
  '$schema', '$id', 'title', 'description', 'type', 'enum', 'const', 'pattern',
  'minLength', 'maxLength', 'minimum', 'maximum', 'required', 'properties',
  'additionalProperties', 'propertyNames', 'items',
]);

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (Number.isInteger(v)) return 'integer';
  return typeof v;
}

function matchesType(v, t) {
  const actual = typeOf(v);
  if (t === 'number') return actual === 'number' || actual === 'integer';
  return actual === t;
}

export function validate(schema, value, path = '') {
  const errors = [];
  walk(schema, value, path || '(gốc)', errors);
  return errors;
}

function walk(s, v, path, errors) {
  for (const k of Object.keys(s)) {
    if (!KNOWN.has(k)) throw new Error(`schema dùng từ khóa chưa hỗ trợ: ${k}`);
  }
  if (s.type) {
    const types = Array.isArray(s.type) ? s.type : [s.type];
    if (!types.some((t) => matchesType(v, t))) {
      errors.push(`${path}: cần kiểu ${types.join('|')}, gặp ${typeOf(v)}`);
      return;
    }
  }
  if (s.enum && !s.enum.some((e) => e === v)) {
    errors.push(`${path}: giá trị ${JSON.stringify(v)} không thuộc ${JSON.stringify(s.enum)}`);
  }
  if ('const' in s && s.const !== v) errors.push(`${path}: phải là ${JSON.stringify(s.const)}`);
  if (typeof v === 'string') {
    if (s.pattern && !new RegExp(s.pattern, 'u').test(v)) {
      errors.push(`${path}: ${JSON.stringify(v)} không khớp mẫu ${s.pattern}`);
    }
    const len = [...v].length;
    if (s.minLength != null && len < s.minLength) errors.push(`${path}: ngắn hơn ${s.minLength} ký tự`);
    if (s.maxLength != null && len > s.maxLength) errors.push(`${path}: dài hơn ${s.maxLength} ký tự`);
  }
  if (typeof v === 'number') {
    if (s.minimum != null && v < s.minimum) errors.push(`${path}: nhỏ hơn ${s.minimum}`);
    if (s.maximum != null && v > s.maximum) errors.push(`${path}: lớn hơn ${s.maximum}`);
  }
  if (typeOf(v) === 'object') {
    for (const r of s.required || []) {
      if (!(r in v)) errors.push(`${path}: thiếu trường "${r}"`);
    }
    const props = s.properties || {};
    for (const [k, val] of Object.entries(v)) {
      if (s.propertyNames) walk(s.propertyNames, k, `${path} (tên trường "${k}")`, errors);
      if (props[k]) walk(props[k], val, `${path}.${k}`, errors);
      else if (s.additionalProperties === false) errors.push(`${path}: trường lạ "${k}"`);
      else if (s.additionalProperties && typeof s.additionalProperties === 'object') walk(s.additionalProperties, val, `${path}.${k}`, errors);
    }
  }
  if (Array.isArray(v) && s.items) {
    v.forEach((item, i) => walk(s.items, item, `${path}[${i}]`, errors));
  }
}
