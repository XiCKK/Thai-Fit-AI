import { ingredientRecords } from '../data/nutritionRecords';
import type { IngredientPortion, Nutrition } from '../types';

// Recognition scores and image pixels are deliberately absent.
export function calculateNutrition(portions: IngredientPortion[], servings = 1): Nutrition {
  if (!Number.isFinite(servings) || servings < 0) throw new Error('Invalid servings');
  const total: Nutrition = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  for (const portion of portions) {
    const record = ingredientRecords.find((item) => item.id === portion.ingredientId);
    if (!record || !Number.isFinite(portion.amount) || portion.amount < 0) throw new Error('Invalid ingredient portion');
    for (const key of Object.keys(total) as (keyof Nutrition)[]) total[key] += record.nutritionPerUnit[key] * portion.amount * servings;
  }
  return Object.fromEntries(Object.entries(total).map(([key, value]) => [key, Math.round(value)])) as Nutrition;
}
