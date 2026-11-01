export type Screen = 'home' | 'photo' | 'loading' | 'results' | 'error' | 'unsupported';
export type RecognitionScenario = 'success' | 'error' | 'unsupported';
export type Nutrition = { calories: number; protein: number; carbs: number; fat: number };
export type Dish = { id: string; nameTh: string; nameEn: string };
export type DishCandidate = Dish & { score: number };
export type MealPhoto = { uri: string; mimeType: string; fileName: string; fileSize?: number };
export type FoodAnalysis = { imageUri: string; isMock: boolean; modelVersion: string; candidates: DishCandidate[] };
export type AppState = {
  photo: MealPhoto | null; analysis: FoodAnalysis | null; errorMessage: string | null;
  scenario: RecognitionScenario; isMock: boolean;
};
export type IngredientRecord = { id: string; nameTh: string; unit: string; nutritionPerUnit: Nutrition };
export type IngredientPortion = { ingredientId: string; amount: number };
