import { useState, useMemo } from 'react';
import {
  View, Text, SectionList, TouchableOpacity, Modal,
  TextInput, StyleSheet, ScrollView, Alert,
} from 'react-native';
import { colors, spacing, mono, radius } from '../../constants/theme';
import { ChecklistItem } from '../../types';
import { MOCK_CHECKLIST } from '../../lib/mock/mockData';
import { useT } from '../../lib/i18n';
import { useAuthStore } from '../../stores/authStore';

// [P2] useChecklist() zastąpi MOCK_CHECKLIST

const CATEGORY_KEYS = ['WATER', 'FOOD', 'MEDICAL', 'POWER', 'DOCUMENTS'];

function daysUntil(dateStr: string) {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

export default function ChecklistScreen() {
  const t = useT();
  const { profile } = useAuthStore();
  const isAdmin = profile?.tier === 1;

  const [items, setItems]       = useState<ChecklistItem[]>(MOCK_CHECKLIST);
  const [modalVisible, setModal] = useState(false);
  const [newText, setNewText]    = useState('');
  const [newCat, setNewCat]      = useState(CATEGORY_KEYS[0]);
  const [newDate, setNewDate]    = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const catLabel = (key: string) => (t as any)[`cat_${key}`] ?? key;

  const toggleCollapse = (cat: string) =>
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });

  const sections = useMemo(() =>
    CATEGORY_KEYS.map(cat => {
      const catItems = items.filter(i => i.category === cat);
      return {
        title: cat,
        count: catItems.length,
        checked: catItems.filter(i => i.checked).length,
        data: collapsed.has(cat) ? ([] as ChecklistItem[]) : catItems,
      };
    }).filter(s => s.count > 0),
  [items, collapsed]);

  const readiness = items.length > 0
    ? Math.round((items.filter(i => i.checked).length / items.length) * 100) : 0;

  const toggleItem = (id: string) => {
    // [P2] supabase update
    setItems(p => p.map(i => i.id === id ? { ...i, checked: !i.checked } : i));
  };

  const addItem = () => {
    if (!newText.trim()) return;
    const item: ChecklistItem = {
      id: `c-${Date.now()}`, user_id: 'user-local-001',
      category: newCat, item: newText.trim(), checked: false,
      expiry_date: newDate || null, quantity_current: null, quantity_target: null,
    };
    // [P2] supabase insert
    setItems(p => [...p, item]);
    setNewText(''); setNewDate(''); setModal(false);
  };

  const deleteItem = (id: string) => {
    if (!isAdmin) {
      Alert.alert('', 'Only Tier 1 (Government) can delete items.', [{ text: 'OK' }]);
      return;
    }
    Alert.alert('', items.find(i => i.id === id)?.item ?? '', [
      { text: t.btn_cancel, style: 'cancel' },
      { text: '✕', style: 'destructive', onPress: () => setItems(p => p.filter(i => i.id !== id)) },
    ]);
  };

  const expiryDisplay = (dateStr: string) => {
    const d = daysUntil(dateStr);
    if (d < 0)   return { label: t.expiry_expired, urgent: true };
    if (d === 0) return { label: t.expiry_today,   urgent: true };
    if (d <= 7)  return { label: t.expiry_soon(d), urgent: true };
    return               { label: t.expiry_ok(d),  urgent: false };
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>{t.checklist_title}</Text>
          <Text style={styles.headerSub}>{readiness}% complete</Text>
        </View>
        {isAdmin && (
          <TouchableOpacity style={styles.addBtn} onPress={() => setModal(true)}>
            <Text style={styles.addBtnText}>{t.checklist_add}</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${readiness}%` as any }]} />
      </View>

      <SectionList
        sections={sections}
        keyExtractor={item => item.id}
        stickySectionHeadersEnabled
        renderSectionHeader={({ section }) => (
          <TouchableOpacity
            style={styles.sectionHeader}
            onPress={() => toggleCollapse(section.title)}
            activeOpacity={0.7}
          >
            <View style={styles.sectionLeft}>
              <Text style={styles.sectionChevron}>{collapsed.has(section.title) ? '▸' : '▾'}</Text>
              <Text style={styles.sectionTitle}>{catLabel(section.title)}</Text>
            </View>
            <View style={styles.sectionProgress}>
              <Text style={styles.sectionCount}>{section.checked}/{section.count}</Text>
            </View>
          </TouchableOpacity>
        )}
        renderItem={({ item }) => {
          const expiry = item.expiry_date ? expiryDisplay(item.expiry_date) : null;
          return (
            <TouchableOpacity
              style={[styles.row, item.checked && styles.rowChecked]}
              onPress={() => toggleItem(item.id)}
              onLongPress={() => deleteItem(item.id)}
              activeOpacity={0.7}
            >
              <View style={[styles.checkbox, item.checked && styles.checkboxChecked]}>
                {item.checked && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={[styles.itemText, item.checked && styles.itemTextChecked]}>
                {item.item}
              </Text>
              {expiry && (
                <View style={[styles.expiryBadge, expiry.urgent && styles.expiryBadgeUrgent]}>
                  <Text style={[styles.expiryText, expiry.urgent && styles.expiryTextUrgent]}>
                    {expiry.label}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        }}
        contentContainerStyle={{ paddingBottom: spacing.xxl }}
      />

      {/* Add item modal — only for admins */}
      {isAdmin && (
        <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModal(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>{t.modal_title}</Text>

              <Text style={styles.fieldLabel}>{t.field_category}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catRow}>
                {CATEGORY_KEYS.map(cat => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.catChip, newCat === cat && styles.catChipActive]}
                    onPress={() => setNewCat(cat)}
                  >
                    <Text style={[styles.catChipText, newCat === cat && styles.catChipTextActive]}>
                      {catLabel(cat)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.fieldLabel}>{t.field_desc}</Text>
              <TextInput
                style={styles.textField}
                value={newText}
                onChangeText={setNewText}
                placeholder="..."
                placeholderTextColor={colors.textMuted}
                autoFocus
              />

              <Text style={styles.fieldLabel}>{t.field_expiry}</Text>
              <TextInput
                style={styles.textField}
                value={newDate}
                onChangeText={setNewDate}
                placeholder={t.field_expiry_fmt}
                placeholderTextColor={colors.textMuted}
                keyboardType="numbers-and-punctuation"
              />

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.modalCancel} onPress={() => setModal(false)}>
                  <Text style={styles.modalCancelText}>{t.btn_cancel}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalConfirm} onPress={addItem}>
                  <Text style={styles.modalConfirmText}>{t.btn_add}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  headerSub:   { fontFamily: mono, fontSize: 10, color: colors.textMuted, marginTop: 2 },
  addBtn: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md, paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
  },
  addBtnText: { fontFamily: mono, fontSize: 10, color: colors.textSub, letterSpacing: 0.5 },

  progressTrack: { height: 3, backgroundColor: colors.surface, marginHorizontal: spacing.md, borderRadius: 2 },
  progressFill:  { height: 3, backgroundColor: colors.green, borderRadius: 2 },

  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: 10,
    backgroundColor: colors.surface,
  },
  sectionLeft:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionChevron: { fontFamily: mono, fontSize: 10, color: colors.textMuted, width: 10 },
  sectionTitle:   { fontFamily: mono, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, color: colors.textSub },
  sectionProgress:{ backgroundColor: colors.surface, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm },
  sectionCount:   { fontFamily: mono, fontSize: 9, color: colors.textMuted },

  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: 12,
    gap: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  rowChecked: { opacity: 0.45 },

  checkbox:        { width: 20, height: 20, borderRadius: radius.sm, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: colors.green, borderColor: colors.green },
  checkmark:       { fontSize: 11, color: '#fff', fontWeight: '700' },

  itemText:        { flex: 1, fontSize: 14, color: colors.text, lineHeight: 20 },
  itemTextChecked: { textDecorationLine: 'line-through', color: colors.textMuted },

  expiryBadge:      { backgroundColor: colors.surface, paddingHorizontal: 7, paddingVertical: 3, borderRadius: radius.sm },
  expiryBadgeUrgent:{ backgroundColor: 'rgba(249,115,22,0.15)' },
  expiryText:       { fontFamily: mono, fontSize: 9, color: colors.textMuted },
  expiryTextUrgent: { color: colors.orange },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    padding: spacing.lg, paddingTop: spacing.md, gap: spacing.sm,
  },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, alignSelf: 'center', marginBottom: spacing.sm },
  modalTitle:       { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
  fieldLabel:       { fontFamily: mono, fontSize: 9, color: colors.textMuted, letterSpacing: 1.2, marginTop: spacing.sm },
  catRow:           { flexGrow: 0, marginVertical: 6 },
  catChip:          { paddingHorizontal: spacing.md, paddingVertical: 7, marginRight: 6, backgroundColor: colors.surfaceHigh, borderRadius: radius.md },
  catChipActive:    { backgroundColor: colors.blue },
  catChipText:      { fontFamily: mono, fontSize: 10, color: colors.textMuted },
  catChipTextActive:{ color: '#fff', fontWeight: '600' },
  textField: { backgroundColor: colors.surfaceHigh, borderRadius: radius.md, padding: spacing.md, fontSize: 14, color: colors.text },
  modalActions:     { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  modalCancel:      { flex: 1, backgroundColor: colors.surfaceHigh, padding: 13, alignItems: 'center', borderRadius: radius.md },
  modalCancelText:  { fontSize: 14, color: colors.textSub, fontWeight: '600' },
  modalConfirm:     { flex: 1, backgroundColor: colors.blue, padding: 13, alignItems: 'center', borderRadius: radius.md },
  modalConfirmText: { fontSize: 14, color: '#fff', fontWeight: '700' },
});
