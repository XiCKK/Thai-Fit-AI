// Node's built-in test runner, with the already installed TypeScript compiler.
// No native camera is simulated here: these verify API handling and arithmetic.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

class TestPhotoFile {
  constructor(uri) { this.uri = uri; this.exists = true; this.size = 3; }
  get name() { return this.uri.split('/').pop(); }
  get type() { return 'image/jpeg'; }
  async bytes() { return new Uint8Array([65, 66, 67]); }
}

function loadTs(filename, overrides = {}) {
  const fullPath = path.resolve(__dirname, '..', filename);
  const source = ts.transpileModule(fs.readFileSync(fullPath, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  const context = {
    module, exports: module.exports, process: { env: { EXPO_PUBLIC_API_URL: 'http://192.168.1.100:8000/' } },
    AbortController, Blob, Error, TypeError, TextEncoder, setTimeout, clearTimeout,
    FormData: class { append() {} }, fetch: async () => { throw new Error('Unexpected request'); },
    require: (name) => {
      if (name === 'expo/fetch') return { fetch: context.fetch };
      if (name === 'expo-file-system') return { File: overrides.PhotoFile ?? TestPhotoFile };
      const target = path.resolve(path.dirname(fullPath), name);
      if (name.endsWith('.json')) return JSON.parse(fs.readFileSync(target, 'utf8'));
      return loadTs(path.relative(path.resolve(__dirname, '..'), `${target}.ts`), overrides);
    },
    ...overrides,
  };
  vm.runInNewContext(source, context, { filename: fullPath });
  return module.exports;
}

const photo = { uri: 'file:///meal.jpg', fileName: 'meal.jpg', mimeType: 'image/jpeg' };
// A response fixture exercises translation only; it is not an inference result.
const responseFixture = { model_version: 'test-fixture', candidates: [{ dish_id: '51', label_th: 'ผัดกะเพรา', label_en: 'Phat Kaprao', score: 0.7 }] };

test('multipart photo upload maps stable IDs, scores and version', async () => {
  const fields = [];
  const api = loadTs('src/services/recognitionApi.ts', {
    FormData: class { append(...args) { fields.push(args); } },
    fetch: async (url, options) => {
      assert.equal(url, 'http://192.168.1.100:8000/predict');
      assert.equal(options.method, 'POST');
      assert.equal(options.headers, undefined);
      return { ok: true, json: async () => responseFixture };
    },
  });
  const result = await api.recognizeFood(photo);
  assert.equal(result.isMock, false);
  assert.equal(result.candidates[0].id, '51');
  assert.equal(result.candidates[0].score, 0.7);
  assert.equal(result.modelVersion, 'test-fixture');
  assert.equal(fields[0][0], 'file');
  assert.ok(fields[0][1] instanceof TestPhotoFile);
  assert.equal(fields[0][1].type, photo.mimeType);
  assert.equal(fields[0][1].uri, photo.uri);
  assert.equal(fields[0][1].name, photo.fileName);
});

test('Expo File uploads through real Expo FormData without constructing a native Blob', async () => {
  // Reproduce the native limitation that Node's own Blob does not have. The
  // previous Blob([Uint8Array]) implementation must fail this regression test.
  class NativeBlob {
    constructor() { throw new Error('Creating blobs from ArrayBufferView is not supported'); }
  }
  const { convertFormDataAsync } = loadTs('node_modules/expo/src/winter/fetch/convertFormData.ts', { Blob: NativeBlob });
  const { installFormDataPatch } = loadTs('node_modules/expo/src/winter/FormData.ts', { Blob: NativeBlob });
  class BaseFormData { constructor() { this._parts = []; } }
  const ExpoFormData = installFormDataPatch(BaseFormData);
  const api = loadTs('src/services/recognitionApi.ts', {
    Blob: NativeBlob,
    FormData: ExpoFormData,
    fetch: async (_url, options) => {
      const { body } = await convertFormDataAsync(options.body, 'test-boundary');
      const multipart = new TextDecoder().decode(body);
      assert.match(multipart, /name="file"; filename="meal.jpg"/);
      assert.match(multipart, /content-type: image\/jpeg/);
      assert.match(multipart, /ABC/);
      return { ok: true, json: async () => responseFixture };
    },
  });
  await api.recognizeFood(photo);
  await assert.rejects(convertFormDataAsync({ entries: () => [['file', { uri: photo.uri }]].values() }), /Unsupported FormDataPart/);
});

test('missing local photo and actual oversized file are rejected before upload', async () => {
  class MissingFile extends TestPhotoFile { constructor(uri) { super(uri); this.exists = false; } }
  class LargeFile extends TestPhotoFile { constructor(uri) { super(uri); this.size = 11 * 1024 * 1024; } }
  await assert.rejects(loadTs('src/services/recognitionApi.ts', { PhotoFile: MissingFile }).recognizeFood(photo), /กรุณาเลือกรูป/);
  await assert.rejects(loadTs('src/services/recognitionApi.ts', { PhotoFile: LargeFile }).recognizeFood(photo), /10 MB/);
});

test('missing URL, connection failure and server errors reject explicitly', async () => {
  const missing = loadTs('src/services/recognitionApi.ts', { process: { env: {} } });
  await assert.rejects(missing.recognizeFood(photo), /EXPO_PUBLIC_API_URL/);
  const offline = loadTs('src/services/recognitionApi.ts', { fetch: async () => { throw new TypeError('Network error'); } });
  await assert.rejects(offline.recognizeFood(photo), /Wi-Fi/);
  const server = loadTs('src/services/recognitionApi.ts', { fetch: async () => ({ ok: false, status: 413, json: async () => ({ detail: 'Photo exceeds 10 MB' }) }) });
  await assert.rejects(server.recognizeFood(photo), /10 MB/);
  await assert.rejects(server.recognizeFood({ ...photo, fileSize: 11 * 1024 * 1024 }), /10 MB/);
});

test('timeout aborts the request and reports retryable error', async () => {
  const api = loadTs('src/services/recognitionApi.ts', {
    setTimeout: (callback) => setTimeout(callback, 5),
    fetch: async (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')))),
  });
  await assert.rejects(api.recognizeFood(photo), /30/);
});

test('malformed response and duplicate IDs never become predictions', async () => {
  for (const body of [null, {}, { ...responseFixture, candidates: [] },
    { ...responseFixture, candidates: [{ ...responseFixture.candidates[0], score: 2 }] },
    { ...responseFixture, candidates: [responseFixture.candidates[0], responseFixture.candidates[0]] }]) {
    const api = loadTs('src/services/recognitionApi.ts', { fetch: async () => ({ ok: true, json: async () => body }) });
    await assert.rejects(api.recognizeFood(photo), /API/);
  }
});

test('nutrition uses confirmed ingredient units and servings, not image scores', () => {
  const { calculateNutrition } = loadTs('src/utils/nutrition.ts');
  const { dishNutritionRecords } = loadTs('src/data/nutritionRecords.ts');
  const one = calculateNutrition([{ ingredientId: 'rice', amount: 1 }]);
  assert.equal(one.calories, 205);
  assert.equal(calculateNutrition([{ ingredientId: 'rice', amount: 1 }], 2).calories, 410);
  assert.equal(calculateNutrition([{ ingredientId: 'chicken', amount: 1 }]).protein, 31);
  assert.equal(calculateNutrition([{ ingredientId: 'pork', amount: 1 }]).protein, 27);
  assert.equal(dishNutritionRecords['00'], undefined);
  assert.throws(() => calculateNutrition([{ ingredientId: 'rice', amount: -1 }]));
  assert.throws(() => calculateNutrition([{ ingredientId: 'missing', amount: 1 }]));
  assert.equal(calculateNutrition([]).calories, 0);
});

test('manual-search catalog preserves all CSV IDs, names and ordering', () => {
  const dishes = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../src/data/dishes.json'), 'utf8'));
  const csv = fs.readFileSync(path.resolve(__dirname, '../../ThaiFoodModel/class_labels.csv'), 'utf8').replace(/^\uFEFF/, '').trim().split(/\r?\n/).slice(1);
  assert.equal(dishes.length, 100);
  assert.equal(new Set(dishes.map((dish) => dish.id)).size, 100);
  csv.forEach((line, index) => {
    const [id, english, thai] = line.split(',').map((value) => value.trim());
    assert.deepEqual(dishes[index], { id, nameTh: thai, nameEn: english });
  });
});
