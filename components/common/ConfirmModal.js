import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';

const ConfirmModal = ({
  visible,
  title = 'Confirm',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}) => {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={onCancel} style={{ padding: 4 }}>
              <Text style={styles.close}>×</Text>
            </TouchableOpacity>
          </View>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <View style={styles.row}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, destructive && styles.confirmDestructive]}
              onPress={onConfirm}
            >
              <Text style={[styles.confirmText, destructive && styles.confirmTextDestructive]}>
                {confirmLabel}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#e5e7eb',
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  close: {
    fontSize: 24,
    color: '#64748b',
  },
  message: {
    marginTop: 12,
    color: '#374151',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#6b7280',
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#337DEB',
  },
  confirmDestructive: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#fca5a5',
  },
  confirmText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  confirmTextDestructive: {
    color: '#ef4444',
  },
});

export default ConfirmModal;
