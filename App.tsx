import { useState } from 'react';
import { SafeAreaView, StatusBar } from 'react-native';
import { HomeScreen } from './src/screens/HomeScreen';
import { PhotoScreen } from './src/screens/PhotoScreen';
import { ResultsScreen } from './src/screens/ResultsScreen';
import { FeedbackStateScreen } from './src/screens/FeedbackStateScreen';
import { mockRecognizeFood } from './src/services/mockRecognitionService';
import type { AppState, FoodAnalysis, RecognitionScenario, Screen } from './src/types';
import { colors } from './src/theme';

const initialState: AppState = { imageUri: null, analysis: null, errorMessage: null, scenario: 'success' };

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [appState, setAppState] = useState<AppState>(initialState);

  const beginPhotoFlow = (scenario: RecognitionScenario = 'success') => {
    setAppState({ ...initialState, scenario });
    setScreen('photo');
  };

  const selectPhoto = (imageUri: string) => {
    setAppState((current) => ({ ...current, imageUri, errorMessage: null }));
  };

  const analyzePhoto = async () => {
    if (!appState.imageUri) return;
    setScreen('loading');
    try {
      const analysis: FoodAnalysis = await mockRecognizeFood(appState.imageUri, appState.scenario);
      setAppState((current) => ({ ...current, analysis }));
      setScreen(analysis.candidates.length ? 'results' : 'unsupported');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'ไม่สามารถวิเคราะห์รูปภาพได้';
      setAppState((current) => ({ ...current, errorMessage: message }));
      setScreen('error');
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar barStyle="dark-content" />
      {screen === 'home' && <HomeScreen onAnalyze={() => beginPhotoFlow()} onDemoState={beginPhotoFlow} />}
      {screen === 'photo' && <PhotoScreen imageUri={appState.imageUri} onBack={() => setScreen('home')} onPhotoSelected={selectPhoto} onAnalyze={analyzePhoto} />}
      {screen === 'loading' && <FeedbackStateScreen kind="loading" onBack={() => setScreen('photo')} />}
      {screen === 'results' && appState.analysis && <ResultsScreen analysis={appState.analysis} imageUri={appState.imageUri!} onRetake={() => setScreen('photo')} onBack={() => setScreen('home')} />}
      {screen === 'error' && <FeedbackStateScreen kind="error" message={appState.errorMessage ?? undefined} onBack={() => setScreen('photo')} />}
      {screen === 'unsupported' && <FeedbackStateScreen kind="unsupported" onBack={() => setScreen('photo')} />}
    </SafeAreaView>
  );
}
