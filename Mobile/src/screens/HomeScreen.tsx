import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { colors } from '../theme';
import type { RecognitionScenario } from '../types';

export function HomeScreen({ onAnalyze, onManual, onDemoState }: { onAnalyze: () => void; onManual: () => void; onDemoState: (scenario: RecognitionScenario) => void }) {
  return <ScrollView contentContainerStyle={styles.page}>
    <Text style={styles.kicker}>JUNGNUB MACRO · THAI FOOD</Text>
    <Text style={styles.title}>ถ่ายรูปอาหาร{'\n'}แล้วเช็กโภชนาการ</Text>
    <Text style={styles.subtitle}>เลือกรูป รับคำแนะนำจากโมเดล แล้วตรวจสอบเมนูและปริมาณด้วยตนเอง</Text>
    <View style={styles.hero}><Text style={{ fontSize: 56 }}>🍛</Text><Text style={styles.heroTitle}>วันนี้กินอะไรดี?</Text><Text style={styles.heroText}>โมเดลปัจจุบันแยกผัดกะเพรา ข้าวขาหมู ผัดไทย และข้าวมันไก่</Text></View>
    <Button onPress={onAnalyze}>วิเคราะห์รูปอาหาร</Button>
    <Button variant="secondary" onPress={onManual}>ค้นหาเมนูด้วยตนเอง</Button>
    <Text style={styles.subtitle}>อาหารอื่นอาจได้รับคะแนนสูงได้เช่นกัน กรุณายืนยันทุกครั้ง ค่าโภชนาการเป็นสูตรตั้งต้นสำหรับประมาณการที่ยังไม่ผ่านการตรวจสอบ</Text>
    <Text style={styles.kicker}>สาธิตหน้าจอเท่านั้น (MOCK)</Text>
    <Button variant="secondary" onPress={() => onDemoState('success')}>สาธิตผลจำลอง</Button>
    <Button variant="secondary" onPress={() => onDemoState('error')}>สาธิตการเชื่อมต่อผิดพลาด</Button>
    <Button variant="secondary" onPress={() => onDemoState('unsupported')}>สาธิตไม่มีรายการแนะนำ</Button>
  </ScrollView>;
}
const styles = StyleSheet.create({
  page: { padding: 24, paddingTop: 38, gap: 18 }, kicker: { fontSize: 11, letterSpacing: 1, color: colors.green, fontWeight: '800' },
  title: { fontSize: 33, lineHeight: 42, fontWeight: '800', color: colors.ink }, subtitle: { fontSize: 15, lineHeight: 23, color: colors.muted },
  hero: { backgroundColor: colors.green, borderRadius: 26, padding: 25, gap: 12 }, heroTitle: { color: '#FFF', fontWeight: '800', fontSize: 21 },
  heroText: { color: '#E7F2E9', fontSize: 14, lineHeight: 22 },
});
