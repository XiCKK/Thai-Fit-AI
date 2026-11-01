import type { IngredientPortion, IngredientRecord } from '../types';

// Draft recipe inputs, NOT a verified nutrition database. Rice, pork, oil and
// egg preserve the original prototype. Other values are draft assumptions.
// Replace with your chosen food-composition records before dietary tracking.
export const ingredientRecords: IngredientRecord[] = [
  { id: 'rice', nameTh: 'ข้าวสวย', unit: 'ถ้วย', nutritionPerUnit: { calories: 205, protein: 4, carbs: 45, fat: 0.4 } },
  { id: 'pork', nameTh: 'หมูสุก (สูตรประมาณ)', unit: '100 กรัม', nutritionPerUnit: { calories: 242, protein: 27, carbs: 0, fat: 14 } },
  { id: 'chicken', nameTh: 'ไก่สุก (สูตรประมาณ)', unit: '100 กรัม', nutritionPerUnit: { calories: 165, protein: 31, carbs: 0, fat: 3.6 } },
  { id: 'noodles', nameTh: 'เส้นข้าวสุก (สูตรประมาณ)', unit: '100 กรัม', nutritionPerUnit: { calories: 109, protein: 1.8, carbs: 25, fat: 0.2 } },
  { id: 'oil', nameTh: 'น้ำมันที่รับประทาน', unit: 'ช้อนชา', nutritionPerUnit: { calories: 40, protein: 0, carbs: 0, fat: 4.5 } },
  { id: 'egg', nameTh: 'ไข่ดาว (สูตรต้นแบบ)', unit: 'ฟอง', nutritionPerUnit: { calories: 130, protein: 6, carbs: 0, fat: 11 } },
  { id: 'sauce', nameTh: 'ซอส / น้ำตาล (สูตรประมาณ)', unit: 'ส่วน', nutritionPerUnit: { calories: 40, protein: 0, carbs: 10, fat: 0 } },
  { id: 'vegetables', nameTh: 'ผัก (สูตรประมาณ)', unit: '100 กรัม', nutritionPerUnit: { calories: 30, protein: 2, carbs: 6, fat: 0.3 } },
];

// Original training folder IDs. Recipes do not come from the classifier.
export const dishNutritionRecords: Record<string, IngredientPortion[]> = {
  '51': [{ ingredientId: 'pork', amount: 1 }, { ingredientId: 'oil', amount: 2 }, { ingredientId: 'sauce', amount: 1 }, { ingredientId: 'vegetables', amount: 0.3 }],
  '55': [{ ingredientId: 'rice', amount: 1 }, { ingredientId: 'pork', amount: 1.2 }, { ingredientId: 'sauce', amount: 1 }, { ingredientId: 'vegetables', amount: 0.5 }],
  '83': [{ ingredientId: 'noodles', amount: 2 }, { ingredientId: 'oil', amount: 2 }, { ingredientId: 'egg', amount: 1 }, { ingredientId: 'sauce', amount: 1 }, { ingredientId: 'vegetables', amount: 0.5 }],
  '86': [{ ingredientId: 'rice', amount: 1 }, { ingredientId: 'chicken', amount: 1.2 }, { ingredientId: 'oil', amount: 2 }, { ingredientId: 'sauce', amount: 0.5 }],
};
