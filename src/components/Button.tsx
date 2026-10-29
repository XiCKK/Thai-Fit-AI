import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { colors } from '../theme';

export function Button({ children, onPress, variant = 'primary' }: { children: ReactNode; onPress: () => void; variant?: 'primary' | 'secondary' | 'text' }) {
  return <Pressable onPress={onPress} style={[styles.base, variant === 'primary' && styles.primary, variant === 'secondary' && styles.secondary, variant === 'text' && styles.text]}><Text style={[styles.label, variant === 'primary' && styles.primaryLabel, variant === 'text' && styles.textLabel]}>{children}</Text></Pressable>;
}
const styles = StyleSheet.create({ base: { minHeight: 50, justifyContent: 'center', alignItems: 'center', borderRadius: 14, paddingHorizontal: 18 }, primary: { backgroundColor: colors.green }, secondary: { backgroundColor: colors.softGreen }, text: { minHeight: 38, paddingHorizontal: 4 }, label: { fontSize: 16, fontWeight: '700', color: colors.ink }, primaryLabel: { color: '#FFFFFF' }, textLabel: { color: colors.green } });
