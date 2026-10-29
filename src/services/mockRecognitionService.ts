import type { DishCandidate, FoodAnalysis, RecognitionScenario } from '../types';

const candidates: DishCandidate[] = [
  {
    id: 'krapao', nameTh: 'ผัดกะเพราหมูสับราดข้าว', nameEn: 'Pad kra pao with rice', confidenceLabel: 'ตรงกับรูปมากที่สุด',
    ingredients: [
      { nameTh: 'หมูสับ', nameEn: 'Minced pork', certainty: 'confirmed' }, { nameTh: 'ใบกะเพรา', nameEn: 'Holy basil', certainty: 'confirmed' },
      { nameTh: 'ข้าวสวย', nameEn: 'Jasmine rice', certainty: 'confirmed' }, { nameTh: 'พริกและกระเทียม', nameEn: 'Chilli and garlic', certainty: 'confirmed' },
      { nameTh: 'น้ำตาล / ซอส', nameEn: 'Sugar / sauce', certainty: 'uncertain' }
    ], baseNutrition: { calories: 70, protein: 3, carbs: 7, fat: 3 }, defaultPortions: { riceCups: 1, meatGrams: 110, oilTeaspoons: 2, hasFriedEgg: true }
  },
  {
    id: 'gai', nameTh: 'ข้าวกะเพราไก่', nameEn: 'Chicken basil rice', confidenceLabel: 'อาจเป็นเมนูนี้',
    ingredients: [
      { nameTh: 'เนื้อไก่', nameEn: 'Chicken', certainty: 'confirmed' }, { nameTh: 'ใบกะเพรา', nameEn: 'Holy basil', certainty: 'confirmed' },
      { nameTh: 'ข้าวสวย', nameEn: 'Jasmine rice', certainty: 'confirmed' }, { nameTh: 'น้ำปลา / ซอส', nameEn: 'Fish sauce / sauce', certainty: 'uncertain' }
    ], baseNutrition: { calories: 60, protein: 2, carbs: 7, fat: 2 }, defaultPortions: { riceCups: 1, meatGrams: 120, oilTeaspoons: 2, hasFriedEgg: false }
  },
  {
    id: 'moo-sap', nameTh: 'ข้าวหมูสับผัดพริก', nameEn: 'Stir-fried minced pork with rice', confidenceLabel: 'ความเป็นไปได้รองลงมา',
    ingredients: [
      { nameTh: 'หมูสับ', nameEn: 'Minced pork', certainty: 'confirmed' }, { nameTh: 'ข้าวสวย', nameEn: 'Jasmine rice', certainty: 'confirmed' },
      { nameTh: 'ผัก / ซอส', nameEn: 'Vegetables / sauce', certainty: 'uncertain' }
    ], baseNutrition: { calories: 80, protein: 4, carbs: 9, fat: 3 }, defaultPortions: { riceCups: 1, meatGrams: 110, oilTeaspoons: 2, hasFriedEgg: false }
  }
];

const pause = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function mockRecognizeFood(imageUri: string, scenario: RecognitionScenario): Promise<FoodAnalysis> {
  await pause(1400);
  if (scenario === 'error') throw new Error('การเชื่อมต่อจำลองล้มเหลว โปรดลองใหม่อีกครั้ง');
  if (scenario === 'unsupported') return { imageUri, isMock: true, candidates: [] };
  return { imageUri, isMock: true, candidates };
}
