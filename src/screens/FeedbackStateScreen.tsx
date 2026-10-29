import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { colors } from '../theme';

export function FeedbackStateScreen({ kind, message, onBack }: { kind: 'loading' | 'error' | 'unsupported'; message?: string; onBack: () => void }) {
  if (kind === 'loading') return <View style={styles.center}><ActivityIndicator size="large" color={colors.green} /><Text style={styles.title}>กำลังเตรียมผลลัพธ์…</Text><Text style={styles.text}>กำลังแสดงผลจำลองสำหรับ UI prototype</Text></View>;
  const unsupported = kind === 'unsupported';
  return <View style={styles.center}><Text style={styles.icon}>{unsupported ? '🍽️' : '⚠️'}</Text><Text style={styles.title}>{unsupported ? 'ยังไม่รู้จักอาหารจานนี้' : 'มีบางอย่างผิดพลาด'}</Text><Text style={styles.text}>{unsupported ? 'ในอนาคต คุณจะค้นหาและบันทึกอาหารด้วยตนเองได้จากหน้านี้' : message ?? 'โปรดลองอีกครั้ง'}</Text>{unsupported && <View style={styles.manual}><Text style={styles.manualTitle}>ค้นหาด้วยตนเอง (ตัวอย่าง)</Text><Text style={styles.manualText}>ลองพิมพ์ “ข้าวผัด”, “ส้มตำ”, หรือชื่อเมนูภาษาไทย</Text></View>}<Button onPress={onBack}>{unsupported ? 'เลือกรูปอื่น' : 'กลับไปลองใหม่'}</Button></View>;
}
const styles = StyleSheet.create({ center: { flex: 1, padding: 30, justifyContent: 'center', alignItems: 'center', gap: 14 }, icon: { fontSize: 42 }, title: { color: colors.ink, fontSize: 24, fontWeight: '800', textAlign: 'center' }, text: { color: colors.muted, fontSize: 15, lineHeight: 22, textAlign: 'center', marginBottom: 4 }, manual: { width: '100%', backgroundColor: colors.softGreen, padding: 16, borderRadius: 15, marginBottom: 4 }, manualTitle: { color: colors.ink, fontWeight: '800', fontSize: 14 }, manualText: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 4 } });
