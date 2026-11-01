import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { colors } from '../theme';

type Props = { kind: 'loading' | 'error' | 'unsupported'; isMock: boolean; message?: string; onBack: () => void; onRetry?: () => void; onManual?: () => void };
export function FeedbackStateScreen({ kind, isMock, message, onBack, onRetry, onManual }: Props) {
  return <View style={styles.center}>
    {isMock && <Text style={styles.mock}>MOCK — โหมดสาธิต</Text>}
    {kind === 'loading' ? <>
      <ActivityIndicator size="large" color={colors.green} />
      <Text style={styles.title}>กำลังวิเคราะห์รูป…</Text>
      <Text style={styles.text}>{isMock ? 'กำลังเตรียมผลจำลอง' : 'รอเซิร์ฟเวอร์สูงสุด 30 วินาที'}</Text>
      <Button variant="secondary" onPress={onBack}>กลับไปดูรูป</Button>
    </> : <>
      <Text style={styles.title}>{kind === 'unsupported' ? 'ไม่มีรายการแนะนำ' : 'วิเคราะห์ไม่สำเร็จ'}</Text>
      <Text style={styles.text}>{message ?? 'คุณสามารถค้นหาเมนูเองหรือเลือกรูปอื่นได้'}</Text>
      {onRetry && <Button onPress={onRetry}>ลองวิเคราะห์รูปเดิมอีกครั้ง</Button>}
      {onManual && <Button variant="secondary" onPress={onManual}>ค้นหาเมนูด้วยตนเอง</Button>}
      <Button variant="text" onPress={onBack}>กลับไปดูรูป / เปลี่ยนรูป</Button>
    </>}
  </View>;
}
const styles = StyleSheet.create({
  center: { flex: 1, padding: 26, justifyContent: 'center', gap: 18 }, title: { color: colors.ink, fontSize: 24, fontWeight: '800', textAlign: 'center' },
  text: { color: colors.muted, fontSize: 15, lineHeight: 23, textAlign: 'center' }, mock: { color: colors.warning, textAlign: 'center', fontWeight: '800' },
});
