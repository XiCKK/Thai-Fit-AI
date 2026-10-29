import * as ImagePicker from 'expo-image-picker';
import { Alert, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { colors } from '../theme';

type Props = { imageUri: string | null; onBack: () => void; onPhotoSelected: (uri: string) => void; onAnalyze: () => void };
export function PhotoScreen({ imageUri, onBack, onPhotoSelected, onAnalyze }: Props) {
  const pick = async (source: 'camera' | 'library') => {
    const permission = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { Alert.alert('ต้องอนุญาตก่อน', 'กรุณาอนุญาตให้แอปเข้าถึงกล้องหรือรูปภาพในการตั้งค่า'); return; }
    const result = source === 'camera' ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
    if (!result.canceled) onPhotoSelected(result.assets[0].uri);
  };
  return <ScrollView contentContainerStyle={styles.page}><Button variant="text" onPress={onBack}>‹ กลับ</Button><Text style={styles.title}>{imageUri ? 'ตรวจสอบรูปอาหาร' : 'เลือกรูปอาหาร'}</Text><Text style={styles.subtitle}>{imageUri ? 'ตรวจดูรูปก่อนเริ่มผลจำลอง หรือเปลี่ยนรูปได้ทันที' : 'ถ่ายจากด้านบนในที่สว่าง เพื่อให้ตรวจสอบส่วนประกอบได้ง่ายขึ้น'}</Text>{imageUri ? <Image source={{ uri: imageUri }} style={styles.image} /> : <View style={styles.placeholder}><Text style={styles.placeholderIcon}>▧</Text><Text style={styles.placeholderTitle}>ยังไม่ได้เลือกรูป</Text><Text style={styles.placeholderText}>รูปจะอยู่ในเครื่องของคุณจนกว่าจะเชื่อมต่อ AI ในภายหลัง</Text></View>}<View style={styles.buttons}>{imageUri && <Button onPress={onAnalyze}>เริ่มวิเคราะห์แบบจำลอง</Button>}<Button variant={imageUri ? 'secondary' : 'primary'} onPress={() => pick('camera')}>{imageUri ? 'ถ่ายใหม่' : 'ถ่ายรูปอาหาร'}</Button><Button variant="secondary" onPress={() => pick('library')}>{imageUri ? 'เปลี่ยนรูปจากคลัง' : 'เลือกจากคลังรูปภาพ'}</Button></View><Text style={styles.helper}>ใน milestone นี้ แอปจะใช้ผลการจดจำแบบ mock หลังจากเลือกรูป เพื่อทดสอบการใช้งานของหน้าจอเท่านั้น</Text></ScrollView>;
}
const styles = StyleSheet.create({ page: { padding: 24, gap: 16 }, title: { fontSize: 29, fontWeight: '800', color: colors.ink, marginTop: 5 }, subtitle: { color: colors.muted, fontSize: 15, lineHeight: 22 }, placeholder: { height: 300, borderRadius: 24, borderWidth: 2, borderStyle: 'dashed', borderColor: '#C7D0C6', alignItems: 'center', justifyContent: 'center', padding: 30, marginTop: 7 }, placeholderIcon: { fontSize: 48, color: colors.green }, placeholderTitle: { fontSize: 17, fontWeight: '800', marginTop: 8 }, placeholderText: { textAlign: 'center', color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 5 }, image: { width: '100%', height: 340, borderRadius: 24, marginTop: 7 }, buttons: { gap: 10, marginTop: 3 }, helper: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 3 } });
