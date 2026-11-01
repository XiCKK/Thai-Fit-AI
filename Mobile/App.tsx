import { useRef, useState } from 'react';
import { SafeAreaView, StatusBar } from 'react-native';
import { HomeScreen } from './src/screens/HomeScreen';
import { PhotoScreen } from './src/screens/PhotoScreen';
import { ResultsScreen } from './src/screens/ResultsScreen';
import { FeedbackStateScreen } from './src/screens/FeedbackStateScreen';
import { mockRecognizeFood } from './src/services/mockRecognitionService';
import { recognizeFood } from './src/services/recognitionApi';
import type { AppState, MealPhoto, RecognitionScenario, Screen } from './src/types';
import { colors } from './src/theme';

const initialState: AppState = { photo: null, analysis: null, errorMessage: null, scenario: 'success', isMock: false };

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [appState, setAppState] = useState<AppState>(initialState);
  const requestId = useRef(0);
  const navigate = (next: Screen) => { requestId.current += 1; setScreen(next); };
  const beginPhotoFlow = (scenario: RecognitionScenario = 'success', isMock = false) => {
    setAppState({ ...initialState, scenario, isMock });
    navigate('photo');
  };
  const selectPhoto = (photo: MealPhoto) => setAppState((current) => ({ ...current, photo, analysis: null, errorMessage: null }));
  const manualSearch = () => {
    setAppState((current) => ({
      ...current, analysis: { imageUri: current.photo?.uri ?? '', isMock: current.isMock, modelVersion: 'manual-selection', candidates: [] },
    }));
    navigate('results');
  };
  const analyzePhoto = async () => {
    if (!appState.photo) return;
    const thisRequest = ++requestId.current;
    setScreen('loading');
    try {
      const analysis = appState.isMock
        ? await mockRecognizeFood(appState.photo.uri, appState.scenario)
        : await recognizeFood(appState.photo);
      if (thisRequest !== requestId.current) return;
      setAppState((current) => ({ ...current, analysis, errorMessage: null }));
      setScreen(analysis.candidates.length ? 'results' : 'unsupported');
    } catch (error) {
      if (thisRequest !== requestId.current) return;
      setAppState((current) => ({ ...current, errorMessage: error instanceof Error ? error.message : 'ไม่สามารถวิเคราะห์รูปภาพได้' }));
      setScreen('error');
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar barStyle="dark-content" />
      {screen === 'home' && <HomeScreen onAnalyze={() => beginPhotoFlow()} onManual={manualSearch} onDemoState={(scenario) => beginPhotoFlow(scenario, true)} />}
      {screen === 'photo' && <PhotoScreen imageUri={appState.photo?.uri ?? null} isMock={appState.isMock} onBack={() => navigate('home')} onPhotoSelected={selectPhoto} onAnalyze={analyzePhoto} />}
      {screen === 'loading' && <FeedbackStateScreen kind="loading" isMock={appState.isMock} onBack={() => navigate('photo')} />}
      {screen === 'results' && appState.analysis && <ResultsScreen analysis={appState.analysis} onRetake={() => navigate('photo')} onBack={() => navigate('home')} />}
      {screen === 'error' && <FeedbackStateScreen kind="error" isMock={appState.isMock} message={appState.errorMessage ?? undefined} onRetry={analyzePhoto} onManual={manualSearch} onBack={() => navigate('photo')} />}
      {screen === 'unsupported' && <FeedbackStateScreen kind="unsupported" isMock={appState.isMock} onManual={manualSearch} onBack={() => navigate('photo')} />}
    </SafeAreaView>
  );
}
