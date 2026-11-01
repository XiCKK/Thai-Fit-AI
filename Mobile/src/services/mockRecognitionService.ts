// Explicit UI demo only. The real API service never calls this module.
import dishes from '../data/dishes.json';
import type { FoodAnalysis, RecognitionScenario } from '../types';

export async function mockRecognizeFood(imageUri: string, scenario: RecognitionScenario): Promise<FoodAnalysis> {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  if (scenario === 'error') throw new Error('การเชื่อมต่อจำลองล้มเหลว (MOCK)');
  return {
    imageUri, isMock: true, modelVersion: 'MOCK-UI-DEMO',
    candidates: scenario === 'unsupported' ? [] : ['51', '55', '86'].map((id, index) => ({
      ...dishes.find((dish) => dish.id === id)!, score: [0.6, 0.25, 0.15][index],
    })),
  };
}
