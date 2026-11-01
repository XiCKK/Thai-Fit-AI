import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '../components/Button';
import { NutritionSummary } from '../components/NutritionSummary';
import dishes from '../data/dishes.json';
import { dishNutritionRecords, ingredientRecords } from '../data/nutritionRecords';
import { calculateNutrition } from '../utils/nutrition';
import { colors } from '../theme';
import type { Dish, FoodAnalysis, IngredientPortion } from '../types';

export function ResultsScreen({ analysis, onRetake, onBack }: { analysis: FoodAnalysis; onRetake: () => void; onBack: () => void }) {
  const [selected, setSelected] = useState<Dish | null>(null);
  const [manual, setManual] = useState(analysis.candidates.length === 0);
  const [query, setQuery] = useState('');
  const [portions, setPortions] = useState<IngredientPortion[]>([]);
  const [servings, setServings] = useState(1);
  const [confirmed, setConfirmed] = useState(false);
  const filtered = dishes.filter((dish) => `${dish.nameTh} ${dish.nameEn} ${dish.id}`.toLowerCase().includes(query.trim().toLowerCase()));
  const selectDish = (dish: Dish) => {
    setSelected(dish);
    setPortions((dishNutritionRecords[dish.id] ?? []).map((portion) => ({ ...portion })));
    setServings(1);
    setConfirmed(false);
  };
  const updatePortion = (id: string, change: number) => {
    setPortions((current) => current.map((portion) => portion.ingredientId === id
      ? { ...portion, amount: Math.max(0, Math.round((portion.amount + change) * 100) / 100) } : portion));
    setConfirmed(false);
  };
  return <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <View style={styles.top}><Button variant="text" onPress={onBack}>‹ หน้าแรก</Button><Button variant="text" onPress={onRetake}>เปลี่ยนรูป</Button></View>
    {!!analysis.imageUri && <Image source={{ uri: analysis.imageUri }} style={styles.image} />}
    <View style={styles.notice}>
      <Text style={styles.noticeTitle}>{analysis.isMock ? 'MOCK — ผลจำลองสำหรับสาธิต' : analysis.modelVersion === 'manual-selection' ? 'เลือกเมนูด้วยตนเอง' : 'คำแนะนำจากโมเดลที่ฝึกไว้'}</Text>
      <Text style={styles.small}>{analysis.modelVersion}</Text>
      <Text style={styles.small}>คะแนนใช้จัดอันดับเมนู ไม่ใช่การรับประกันความถูกต้อง อาหารที่โมเดลไม่รู้จักก็อาจได้คะแนนสูง</Text>
    </View>
    {!manual && <>
      <Text style={styles.heading}>เมนูที่เป็นไปได้ — กรุณาเลือกเอง</Text>
      {analysis.candidates.map((candidate) => <Pressable accessibilityRole="button" key={candidate.id} onPress={() => selectDish(candidate)} style={[styles.card, selected?.id === candidate.id && styles.active]}>
        <Text style={styles.dishName}>{candidate.nameTh}</Text><Text style={styles.small}>{candidate.nameEn} · ID {candidate.id}</Text>
        <Text style={styles.score}>คะแนนโมเดล {(candidate.score * 100).toFixed(1)}%</Text>
      </Pressable>)}
      <Button variant="secondary" onPress={() => { setManual(true); setSelected(null); setPortions([]); setConfirmed(false); }}>ไม่ใช่ทุกเมนูนี้ — ค้นหาเอง</Button>
    </>}
    {manual && <>
      <Text style={styles.heading}>ค้นหาเมนูด้วยตนเอง</Text>
      <TextInput accessibilityLabel="ค้นหาเมนู" placeholder="ชื่อไทย / English / ID" value={query} onChangeText={setQuery} style={styles.search} />
      <Text style={styles.small}>ค้นหาจาก 100 เมนูในไฟล์ labels โมเดลปัจจุบันรู้จักเพียง 4 เมนู</Text>
      {filtered.slice(0, 20).map((dish) => <Pressable accessibilityRole="button" key={dish.id} onPress={() => selectDish(dish)} style={[styles.card, selected?.id === dish.id && styles.active]}>
        <Text style={styles.dishName}>{dish.nameTh}</Text><Text style={styles.small}>{dish.nameEn} · ID {dish.id}</Text>
      </Pressable>)}
      {filtered.length > 20 && <Text style={styles.small}>แสดง 20 รายการแรก กรุณาพิมพ์เพิ่มเพื่อค้นหา</Text>}
      {filtered.length === 0 && <Text style={styles.small}>ไม่พบเมนูในรายการ ลองชื่ออื่น หรือกลับไปเปลี่ยนรูปได้</Text>}
    </>}
    {selected && <>
      <Text style={styles.heading}>ตรวจสอบ: {selected.nameTh}</Text>
      <Text style={styles.small}>สูตรตั้งต้นยังไม่ยืนยันส่วนประกอบ กรุณาแก้ให้ตรงกับจานจริง หมู/ไก่/ไข่/น้ำมันอาจต่างกันได้</Text>
      {!dishNutritionRecords[selected.id] && <Text style={styles.warning}>ยังไม่มีสูตรสำหรับ ID {selected.id} กรุณาเพิ่มส่วนประกอบเอง ไม่มีการแทนด้วยสูตรของเมนูอื่น</Text>}
      <Text style={styles.warning}>ข้อมูลโภชนาการตั้งต้นเป็นค่าประมาณสำหรับต้นแบบ ยังไม่ใช่ฐานข้อมูลที่ผ่านการตรวจสอบ</Text>
      <View style={styles.card}>
        <Stepper label="จำนวนส่วนที่รับประทาน" value={servings.toFixed(2)} onMinus={() => { setServings(Math.max(0.25, servings - 0.25)); setConfirmed(false); }} onPlus={() => { setServings(servings + 0.25); setConfirmed(false); }} />
        {portions.map((portion) => {
          const ingredient = ingredientRecords.find((record) => record.id === portion.ingredientId)!;
          return <View key={ingredient.id}>
            <Stepper label={ingredient.nameTh} value={`${portion.amount.toFixed(2)} × ${ingredient.unit} ต่อ 1 ส่วน`} onMinus={() => updatePortion(ingredient.id, -0.25)} onPlus={() => updatePortion(ingredient.id, 0.25)} />
            <Button variant="text" onPress={() => { setPortions((current) => current.filter((item) => item.ingredientId !== ingredient.id)); setConfirmed(false); }}>นำ {ingredient.nameTh} ออก</Button>
          </View>;
        })}
      </View>
      <Text style={styles.heading}>เพิ่มส่วนประกอบ</Text>
      <View style={styles.addRow}>{ingredientRecords.filter((record) => !portions.some((portion) => portion.ingredientId === record.id)).map((record) =>
        <Pressable accessibilityRole="button" key={record.id} style={styles.add} onPress={() => { setPortions((current) => [...current, { ingredientId: record.id, amount: 1 }]); setConfirmed(false); }}><Text style={styles.small}>+ {record.nameTh}</Text></Pressable>)}</View>
      <Text style={styles.small}>ปริมาณทั้งหมดมาจากคุณ โมเดลไม่วัดน้ำหนัก น้ำมันที่ซ่อนอยู่ หรือแคลอรีจากรูป</Text>
      {portions.some((portion) => portion.amount > 0) && <Button onPress={() => setConfirmed(true)}>ยืนยันเมนูและปริมาณ — ดูโภชนาการ</Button>}
      {confirmed && <>
        <Text style={styles.heading}>โภชนาการโดยประมาณ ({servings.toFixed(2)} ส่วน)</Text>
        <NutritionSummary nutrition={calculateNutrition(portions, servings)} />
        <Text style={styles.small}>คำนวณจากสูตรและปริมาณที่ยืนยัน สูตรร้านอาหารอาจต่างกันมาก ยังไม่มีการบันทึกประวัติมื้ออาหาร</Text>
      </>}
    </>}
  </ScrollView>;
}
function Stepper({ label, value, onMinus, onPlus }: { label: string; value: string; onMinus: () => void; onPlus: () => void }) {
  return <View style={styles.stepRow}><View style={{ flex: 1 }}><Text style={styles.dishName}>{label}</Text><Text style={styles.small}>{value}</Text></View><View style={styles.controls}>
    <Pressable accessibilityRole="button" accessibilityLabel={`ลด ${label}`} style={styles.stepButton} onPress={onMinus}><Text style={styles.stepText}>−</Text></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={`เพิ่ม ${label}`} style={styles.stepButton} onPress={onPlus}><Text style={styles.stepText}>+</Text></Pressable>
  </View></View>;
}
const styles = StyleSheet.create({
  page: { padding: 20, paddingBottom: 42, gap: 12 }, top: { flexDirection: 'row', justifyContent: 'space-between' },
  image: { width: '100%', height: 210, borderRadius: 21 }, notice: { backgroundColor: colors.softGreen, padding: 14, borderRadius: 14, gap: 5 },
  noticeTitle: { color: colors.green, fontWeight: '800', fontSize: 14 }, small: { color: colors.muted, fontSize: 12, lineHeight: 19 },
  heading: { color: colors.ink, fontSize: 17, fontWeight: '800', marginTop: 12 },
  card: { borderRadius: 15, borderWidth: 1, borderColor: colors.line, padding: 14, gap: 6, backgroundColor: colors.card },
  active: { borderColor: colors.green, backgroundColor: colors.softGreen }, dishName: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  score: { color: colors.green, fontSize: 12 }, search: { borderColor: colors.line, borderWidth: 1, borderRadius: 12, padding: 14, backgroundColor: colors.card, color: colors.ink },
  warning: { color: colors.warning, fontSize: 12, lineHeight: 19 }, stepRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 66 },
  controls: { flexDirection: 'row', gap: 8 }, stepButton: { height: 36, width: 36, borderRadius: 18, backgroundColor: colors.softGreen, alignItems: 'center', justifyContent: 'center' },
  stepText: { color: colors.green, fontSize: 22 }, addRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, add: { padding: 10, borderRadius: 12, backgroundColor: colors.softGreen },
});
