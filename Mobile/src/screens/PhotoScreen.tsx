import * as ImagePicker from 'expo-image-picker';
import { Alert, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { colors } from '../theme';
import type { MealPhoto } from '../types';

type Props = { imageUri: string | null; isMock: boolean; onBack: () => void; onPhotoSelected: (photo: MealPhoto) => void; onAnalyze: () => void };
export function PhotoScreen({ imageUri, isMock, onBack, onPhotoSelected, onAnalyze }: Props) {
  const pick = async (source: 'camera' | 'library') => {
    try {
      const permission = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) { Alert.alert('ต้องอนุญาตก่อน', 'กรุณาอนุญาตให้แอปเข้าถึงกล้องหรือรูปภาพในการตั้งค่า'); return; }
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'], quality: 1, allowsEditing: false,
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      };
      const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const extension = asset.uri.split('.').pop()?.toLowerCase();
        const mimeType = asset.mimeType ?? ({ png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif', bmp: 'image/bmp' }[extension ?? ''] ?? 'image/jpeg');
        onPhotoSelected({ uri: asset.uri, mimeType, fileName: asset.fileName ?? `meal.${extension ?? 'jpg'}`, fileSize: asset.fileSize });
      }
    } catch {
      Alert.alert('เปิดรูปไม่ได้', 'กรุณาลองเปิดกล้องหรือเลือกรูปอีกครั้ง');
    }
  };
  return <ScrollView contentContainerStyle={styles.page}>
    <Button variant="text" onPress={onBack}>‹ กลับ</Button>
    <Text style={styles.title}>{imageUri ? 'ตรวจสอบรูปอาหาร' : 'เลือกรูปอาหาร'}</Text>
    <Text style={styles.subtitle}>{isMock ? 'MOCK — โหมดสาธิต ไม่ส่งรูปไปยังโมเดล' : 'รูปจะถูกส่งไปยังเซิร์ฟเวอร์ของคุณเมื่อกดวิเคราะห์'}</Text>
    {imageUri ? <Image source={{ uri: imageUri }} style={styles.image} /> : <View style={styles.placeholder}><Text style={styles.title}>▧</Text><Text>ยังไม่ได้เลือกรูป</Text></View>}
    {imageUri && <Button onPress={onAnalyze}>{isMock ? 'เริ่มสาธิต (MOCK)' : 'วิเคราะห์ด้วยโมเดลของฉัน'}</Button>}
    <Button variant="secondary" onPress={() => pick('camera')}>{imageUri ? 'ถ่ายใหม่' : 'ถ่ายรูปอาหาร'}</Button>
    <Button variant="secondary" onPress={() => pick('library')}>{imageUri ? 'เปลี่ยนรูปจากคลัง' : 'เลือกจากคลังรูปภาพ'}</Button>
    <Text style={styles.subtitle}>ใช้รูปอาหารหนึ่งจานในที่สว่าง โมเดลแนะนำชื่อเมนู แต่ไม่วัดน้ำหนัก น้ำมันที่ซ่อนอยู่ หรือแคลอรีจากรูป</Text>
  </ScrollView>;
}
const styles = StyleSheet.create({
  page: { padding: 24, gap: 16 }, title: { fontSize: 29, fontWeight: '800', color: colors.ink },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 22 },
  placeholder: { height: 300, borderRadius: 24, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.line, alignItems: 'center', justifyContent: 'center', gap: 15 },
  image: { width: '100%', height: 340, borderRadius: 24 },
});
