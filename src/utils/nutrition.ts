import type { Nutrition, PortionSettings } from '../types';

const ricePerCup: Nutrition = { calories: 205, protein: 4, carbs: 45, fat: 0.4 };
const porkPer100g: Nutrition = { calories: 242, protein: 27, carbs: 0, fat: 14 };
const oilPerTeaspoon: Nutrition = { calories: 40, protein: 0, carbs: 0, fat: 4.5 };
const friedEgg: Nutrition = { calories: 130, protein: 6, carbs: 0, fat: 11 };

const add = (left: Nutrition, right: Nutrition): Nutrition => ({ calories: left.calories + right.calories, protein: left.protein + right.protein, carbs: left.carbs + right.carbs, fat: left.fat + right.fat });
const multiply = (value: Nutrition, amount: number): Nutrition => ({ calories: value.calories * amount, protein: value.protein * amount, carbs: value.carbs * amount, fat: value.fat * amount });
const rounded = (value: Nutrition): Nutrition => ({ calories: Math.round(value.calories), protein: Math.round(value.protein), carbs: Math.round(value.carbs), fat: Math.round(value.fat) });

export function calculateNutrition(base: Nutrition, portions: PortionSettings): Nutrition {
  let result = base;
  result = add(result, multiply(ricePerCup, portions.riceCups));
  result = add(result, multiply(porkPer100g, portions.meatGrams / 100));
  result = add(result, multiply(oilPerTeaspoon, portions.oilTeaspoons));
  if (portions.hasFriedEgg) result = add(result, friedEgg);
  return rounded(result);
}
