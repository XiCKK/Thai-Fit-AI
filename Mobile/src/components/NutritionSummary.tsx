import { StyleSheet, Text, View } from 'react-native';
import type { Nutrition } from '../types';
import { colors } from '../theme';

export function NutritionSummary({ nutrition }: { nutrition: Nutrition }) {
  const cells = [['แคลอรี', `${nutrition.calories}`, 'kcal'], ['โปรตีน', `${nutrition.protein}g`, 'protein'], ['คาร์บ', `${nutrition.carbs}g`, 'carbs'], ['ไขมัน', `${nutrition.fat}g`, 'fat']];
  return <View style={styles.row}>{cells.map(([label, value, unit]) => <View key={label} style={styles.cell}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text><Text style={styles.unit}>{unit}</Text></View>)}</View>;
}
const styles = StyleSheet.create({ row: { flexDirection: 'row', gap: 8 }, cell: { flex: 1, borderRadius: 13, backgroundColor: colors.softGreen, paddingVertical: 11, alignItems: 'center' }, label: { color: colors.muted, fontSize: 11 }, value: { color: colors.ink, fontSize: 17, fontWeight: '800', marginTop: 2 }, unit: { color: colors.muted, fontSize: 10 } });
