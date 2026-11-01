import { File } from 'expo-file-system';
import { fetch } from 'expo/fetch';
import type { FoodAnalysis, MealPhoto } from '../types';

export const BACKEND_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').trim().replace(/\/+$/, '');
export const ANALYSIS_TIMEOUT_MS = 30000;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

type PredictResponse = {
  model_version: string;
  candidates: { dish_id: string; label_th: string; label_en: string; score: number }[];
};

function isPrediction(value: unknown): value is PredictResponse {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<PredictResponse>;
  return typeof data.model_version === 'string' && data.model_version.length > 0 &&
    Array.isArray(data.candidates) && data.candidates.length >= 1 && data.candidates.length <= 3 &&
    new Set(data.candidates.map((row) => row?.dish_id)).size === data.candidates.length &&
    data.candidates.every((row) => row && typeof row.dish_id === 'string' && row.dish_id.length > 0 &&
      typeof row.label_th === 'string' && typeof row.label_en === 'string' &&
      typeof row.score === 'number' && Number.isFinite(row.score) && row.score >= 0 && row.score <= 1);
}

export async function recognizeFood(photo: MealPhoto): Promise<FoodAnalysis> {
  if (!/^https?:\/\//.test(BACKEND_URL)) {
    throw new Error('ตั้งค่า EXPO_PUBLIC_API_URL ใน Mobile/.env เป็น http://IP-คอมพิวเตอร์:8000 แล้วเริ่ม Expo ใหม่');
  }
  if (photo.fileSize && photo.fileSize > MAX_UPLOAD_BYTES) throw new Error('รูปมีขนาดเกิน 10 MB กรุณาเลือกรูปที่เล็กลง');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ANALYSIS_TIMEOUT_MS);
  try {
    const form = new FormData();
    const file = new File(photo.uri);
    if (!file.exists) throw new Error('ไม่พบรูปในเครื่อง กรุณาเลือกรูปอีกครั้ง');
    if (file.size > MAX_UPLOAD_BYTES) throw new Error('รูปมีขนาดเกิน 10 MB กรุณาเลือกรูปที่เล็กลง');
    // Expo File implements the upload interface directly, including its name,
    // MIME type and bytes(). Native React Native Blob cannot wrap byte arrays.
    // Leave Content-Type unset so expo/fetch supplies the multipart boundary.
    form.append('file', file);
    const response = await fetch(`${BACKEND_URL}/predict`, { method: 'POST', body: form, signal: controller.signal });
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      const detail = body && typeof body === 'object' && 'detail' in body && typeof body.detail === 'string'
        ? body.detail : `เซิร์ฟเวอร์ตอบกลับ ${response.status}`;
      throw new Error(detail);
    }
    const data: unknown = await response.json();
    if (!isPrediction(data)) throw new Error('รูปแบบผลลัพธ์จากเซิร์ฟเวอร์ไม่ถูกต้อง กรุณาตรวจสอบ API');
    return {
      imageUri: photo.uri, isMock: false, modelVersion: data.model_version,
      candidates: data.candidates.map((row) => ({ id: row.dish_id, nameTh: row.label_th, nameEn: row.label_en, score: row.score })),
    };
  } catch (error) {
    if (controller.signal.aborted) throw new Error('หมดเวลารอ 30 วินาที กรุณาลองใหม่ หรือตรวจสอบว่าเซิร์ฟเวอร์พร้อมใช้งาน');
    if (error instanceof TypeError) throw new Error(`เชื่อมต่อ ${BACKEND_URL} ไม่ได้ ตรวจสอบ Wi-Fi, IP, เซิร์ฟเวอร์ และ Windows Firewall`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
