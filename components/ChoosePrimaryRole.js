import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Import MaterialIcons - handle both ES6 and CommonJS
let MaterialIcons;
try {
    const MaterialIconModule = require('react-native-vector-icons/MaterialIcons');
    MaterialIcons = MaterialIconModule.default || MaterialIconModule;
    if (typeof MaterialIcons !== 'function') {
        MaterialIcons = ({ name, size, color, style }) => (
            <Text style={[{ fontSize: size || 20, color: color || '#000' }, style]}>?</Text>
        );
    }
} catch (error) {
    console.error('Error importing MaterialIcons:', error);
    MaterialIcons = ({ name, size, color, style }) => (
        <Text style={[{ fontSize: size || 20, color: color || '#000' }, style]}>?</Text>
    );
}

const ChoosePrimaryRole = ({ navigation, route }) => {
    const [selectedRole, setSelectedRole] = useState(null);
    const [customRole, setCustomRole] = useState('');
    const [showCustomInput, setShowCustomInput] = useState(false);

    const roles = [
        { id: 'influencer', name: 'Influencer', icon: 'stars' },
        { id: 'content_creator', name: 'Content Creator', icon: 'create' },
        { id: 'graphics_designer', name: 'Graphics Designer', icon: 'palette' },
        { id: 'video_editor', name: 'Video Editor', icon: 'movie' },
        { id: 'photographer', name: 'Photographer', icon: 'camera-alt' },
        { id: 'videographer', name: 'Videographer', icon: 'videocam' },
        { id: 'animator', name: 'Animator/Text', icon: 'animation' },
        { id: 'voice_artist', name: 'Voice Over Artist', icon: 'mic' },
        { id: 'actor', name: 'Actor/Actress/Artist', icon: 'theater-comedy' },
        { id: 'beautician', name: 'Beautician/Makeup Artist', icon: 'face' },
        { id: 'other', name: 'Other', icon: 'more-horiz' },
    ];

    const handleRoleSelect = (role) => {
        setSelectedRole(role.id);
        if (role.id === 'other') {
            setShowCustomInput(true);
        } else {
            setShowCustomInput(false);
            setCustomRole('');
        }
    };

    const handleContinue = () => {
        const finalRole = selectedRole === 'other' ? customRole : roles.find(r => r.id === selectedRole)?.name;

        if (!finalRole || (selectedRole === 'other' && !customRole.trim())) {
            return; // Don't proceed if no role selected or custom role is empty
        }

        // Navigate to CreatorDetailsSetup with the selected role
        navigation?.navigate('CreatorDetailsSetup', {
            primaryRole: finalRole,
            roleId: selectedRole,
        });
    };

    const canContinue = selectedRole && (selectedRole !== 'other' || customRole.trim());

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.title}>Choose Your Primary Role</Text>
                    <Text style={styles.subtitle}>Select the role that best describes what you do</Text>
                </View>

                {/* Progress Indicator */}
                <View style={styles.progressContainer}>
                    <View style={styles.progressBar}>
                        <View style={[styles.progressFill, { width: '14%' }]} />
                    </View>
                    <Text style={styles.progressText}>Step 1 of 7</Text>
                </View>

                {/* Roles Grid */}
                <View style={styles.rolesGrid}>
                    {roles.map((role) => (
                        <TouchableOpacity
                            key={role.id}
                            style={[
                                styles.roleCard,
                                selectedRole === role.id && styles.roleCardSelected
                            ]}
                            onPress={() => handleRoleSelect(role)}
                        >
                            <View style={[
                                styles.iconContainer,
                                selectedRole === role.id && styles.iconContainerSelected
                            ]}>
                                <MaterialIcons
                                    name={role.icon}
                                    size={28}
                                    color={selectedRole === role.id ? '#337DEB' : '#6b7280'}
                                />
                            </View>
                            <Text style={[
                                styles.roleName,
                                selectedRole === role.id && styles.roleNameSelected
                            ]}>
                                {role.name}
                            </Text>
                            {selectedRole === role.id && (
                                <View style={styles.checkmark}>
                                    <MaterialIcons name="check-circle" size={20} color="#337DEB" />
                                </View>
                            )}
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Custom Role Input */}
                {showCustomInput && (
                    <View style={styles.customInputContainer}>
                        <Text style={styles.customInputLabel}>Please specify your role</Text>
                        <TextInput
                            style={styles.customInput}
                            placeholder="Enter your primary role"
                            placeholderTextColor="#9ca3af"
                            value={customRole}
                            onChangeText={setCustomRole}
                            autoFocus
                        />
                    </View>
                )}

                {/* Continue Button */}
                <View style={styles.buttonContainer}>
                    <TouchableOpacity
                        style={[styles.continueButton, !canContinue && styles.continueButtonDisabled]}
                        onPress={handleContinue}
                        disabled={!canContinue}
                    >
                        <Text style={styles.continueButtonText}>Continue</Text>
                        <MaterialIcons name="arrow-forward" size={20} color="#ffffff" />
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f9fafb',
    },
    scrollView: {
        flex: 1,
    },
    header: {
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 16,
        backgroundColor: '#ffffff',
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#2d3748',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
        color: '#6b7280',
        lineHeight: 22,
    },
    progressContainer: {
        paddingHorizontal: 20,
        paddingVertical: 16,
        backgroundColor: '#ffffff',
        marginBottom: 16,
    },
    progressBar: {
        height: 6,
        backgroundColor: '#e5e7eb',
        borderRadius: 3,
        overflow: 'hidden',
        marginBottom: 8,
    },
    progressFill: {
        height: '100%',
        backgroundColor: '#337DEB',
        borderRadius: 3,
    },
    progressText: {
        fontSize: 12,
        color: '#6b7280',
        textAlign: 'center',
    },
    rolesGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        paddingHorizontal: 12,
        gap: 12,
    },
    roleCard: {
        width: '47%',
        backgroundColor: '#ffffff',
        borderRadius: 12,
        padding: 16,
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#e5e7eb',
        position: 'relative',
    },
    roleCardSelected: {
        borderColor: '#337DEB',
        backgroundColor: '#f0f4ff',
    },
    iconContainer: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: '#f3f4f6',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
    },
    iconContainerSelected: {
        backgroundColor: '#e6ecff',
    },
    roleName: {
        fontSize: 14,
        fontWeight: '600',
        color: '#2d3748',
        textAlign: 'center',
        lineHeight: 18,
    },
    roleNameSelected: {
        color: '#337DEB',
    },
    checkmark: {
        position: 'absolute',
        top: 8,
        right: 8,
    },
    customInputContainer: {
        paddingHorizontal: 20,
        paddingTop: 20,
    },
    customInputLabel: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#2d3748',
        marginBottom: 8,
    },
    customInput: {
        backgroundColor: '#ffffff',
        borderWidth: 1,
        borderColor: '#337DEB',
        borderRadius: 8,
        paddingHorizontal: 16,
        paddingVertical: 12,
        fontSize: 16,
        color: '#374151',
    },
    buttonContainer: {
        paddingHorizontal: 20,
        paddingVertical: 24,
        marginBottom: 40,
    },
    continueButton: {
        backgroundColor: '#337DEB',
        borderRadius: 12,
        paddingVertical: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    continueButtonDisabled: {
        backgroundColor: '#cbd5e1',
    },
    continueButtonText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#ffffff',
    },
});

export default ChoosePrimaryRole;
