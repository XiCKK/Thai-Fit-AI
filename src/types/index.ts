export type Screen = 'home' | 'photo' | 'loading' | 'results' | 'error' | 'unsupported';
export type RecognitionScenario = 'success' | 'error' | 'unsupported';

export type Nutrition = { calories: number; protein: number; carbs: number; fat: number };
export type PortionSettings = { riceCups: number; meatGrams: number; oilTeaspoons: number; hasFriedEgg: boolean };
export type Ingredient = { nameTh: string; nameEn: string; certainty: 'confirmed' | 'uncertain' };
export type DishCandidate = {
  id: string;
  nameTh: string;
  nameEn: string;
  confidenceLabel: string;
  ingredients: Ingredient[];
  baseNutrition: Nutrition;
  defaultPortions: PortionSettings;
};
export type FoodAnalysis = { imageUri: string; isMock: true; candidates: DishCandidate[] };
export type AppState = { imageUri: string | null; analysis: FoodAnalysis | null; errorMessage: string | null; scenario: RecognitionScenario };
