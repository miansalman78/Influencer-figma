import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import Toast from "./Toast";

// Import Ionicons - handle both ES6 and CommonJS
let Ionicons;
try {
  const IoniconsModule = require('react-native-vector-icons/Ionicons');
  Ionicons = IoniconsModule.default || IoniconsModule;
  // Verify it's a valid component
  if (typeof Ionicons !== 'function') {
    console.warn('Ionicons is not a function, creating fallback');
    Ionicons = ({ name, size, color, style }) => (
      <Text style={[{ fontSize: size || 20, color: color || '#000' }, style]}>?</Text>
    );
  }
} catch (error) {
  console.error('Error importing Ionicons:', error);
  // Fallback component
  Ionicons = ({ name, size, color, style }) => (
    <Text style={[{ fontSize: size || 20, color: color || '#000' }, style]}>?</Text>
  );
}

const ChooseRoleScreen = ({ navigation }) => {
  const [selectedRole, setSelectedRole] = useState(null); // "brand" or "creator"
  const [toast, setToast] = useState({ visible: false, message: "", type: "error" });

  const showToast = (message, type = "error") => {
    setToast({ visible: true, message, type });
  };

  const handleRoleSelect = (role) => {
    setSelectedRole(role);
    // Store role in navigation params for later use
    if (navigation?.setParams) {
      navigation.setParams({ selectedRole: role });
    }
  };

  const handleCreateAccount = () => {
    if (!selectedRole) {
      showToast("Please select your role (Brand or Creator)", "warning");
      return;
    }
    navigation?.navigate('CreateAccount', { role: selectedRole });
  };

  const handleLogin = () => {
    if (!selectedRole) {
      showToast("Please select your role (Brand or Creator)", "warning");
      return;
    }
    navigation?.navigate('Login', { role: selectedRole });
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#1a1a1a" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation?.navigate('Login')}>
          <Text style={styles.skipText}>Already have an account?</Text>
        </TouchableOpacity>
      </View>

      {/* Title Section */}
      <Text style={styles.title}>Join as a Brand or Creator</Text>
      <Text style={styles.subtitle}>
        Select your primary role to get started. You can switch roles later.
      </Text>

      {/* Role Buttons */}
      <View style={styles.roleContainer}>
        <TouchableOpacity
          style={[
            styles.roleBox,
            selectedRole === "brand" && styles.roleBoxSelected
          ]}
          onPress={() => handleRoleSelect("brand")}
        >
          <View style={[
            styles.iconBox,
            selectedRole === "brand" && styles.iconBoxSelected
          ]}>
            <Ionicons
              name="storefront-outline"
              size={26}
              color={selectedRole === "brand" ? "#fff" : "#337DEB"}
            />
          </View>
          <View>
            <Text style={[
              styles.roleTitle,
              selectedRole === "brand" && styles.roleTitleSelected
            ]}>
              I'm a Brand
            </Text>
            <Text style={[
              styles.roleDesc,
              selectedRole === "brand" && styles.roleDescSelected
            ]}>
              Find & hire creators for your campaigns.
            </Text>
          </View>
          {selectedRole === "brand" && (
            <View style={styles.checkIcon}>
              <Ionicons name="checkmark-circle" size={24} color="#337DEB" />
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.roleBox,
            selectedRole === "creator" && styles.roleBoxSelected
          ]}
          onPress={() => handleRoleSelect("creator")}
        >
          <View style={[
            styles.iconBox,
            selectedRole === "creator" && styles.iconBoxSelected
          ]}>
            <Ionicons
              name="camera-outline"
              size={26}
              color={selectedRole === "creator" ? "#fff" : "#337DEB"}
            />
          </View>
          <View>
            <Text style={[
              styles.roleTitle,
              selectedRole === "creator" && styles.roleTitleSelected
            ]}>
              I'm a Creator
            </Text>
            <Text style={[
              styles.roleDesc,
              selectedRole === "creator" && styles.roleDescSelected
            ]}>
              Create offers & collaborate with brands.
            </Text>
          </View>
          {selectedRole === "creator" && (
            <View style={styles.checkIcon}>
              <Ionicons name="checkmark-circle" size={24} color="#337DEB" />
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Create Account Button */}
      <TouchableOpacity
        style={[
          styles.createButton,
          !selectedRole && styles.createButtonDisabled
        ]}
        onPress={handleCreateAccount}
        disabled={!selectedRole}
      >
        <Text style={styles.createText}>Create Account</Text>
      </TouchableOpacity>

      {/* Login Button */}
      <TouchableOpacity
        style={[
          styles.loginButton,
          !selectedRole && styles.loginButtonDisabled
        ]}
        onPress={handleLogin}
        disabled={!selectedRole}
      >
        <Text style={[
          styles.loginText,
          !selectedRole && styles.loginTextDisabled
        ]}>
          Login
        </Text>
      </TouchableOpacity>
      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={() => setToast({ ...toast, visible: false })}
      />
    </View>
  );
};

export default ChooseRoleScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    paddingHorizontal: 20,
    paddingTop: 50,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  skipText: {
    color: "#8A8A8A",
    fontSize: 15,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1a1a1a",
    textAlign: "center",
    marginTop: 60,
  },
  subtitle: {
    fontSize: 14,
    color: "#8A8A8A",
    textAlign: "center",
    marginTop: 10,
    lineHeight: 20,
    paddingHorizontal: 10,
  },
  roleContainer: {
    marginTop: 50,
  },
  roleBox: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: 15,
    padding: 18,
    marginBottom: 20,
    backgroundColor: "#fff",
    position: "relative",
  },
  roleBoxSelected: {
    borderColor: "#337DEB",
    borderWidth: 2,
    backgroundColor: "#F0F7FF",
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#EEF4FF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 15,
  },
  iconBoxSelected: {
    backgroundColor: "#337DEB",
  },
  checkIcon: {
    position: "absolute",
    right: 15,
    top: 18,
  },
  roleTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1a1a1a",
  },
  roleTitleSelected: {
    color: "#337DEB",
  },
  roleDesc: {
    fontSize: 13,
    color: "#8A8A8A",
    marginTop: 4,
  },
  roleDescSelected: {
    color: "#2563EB",
  },
  createButton: {
    backgroundColor: "#337DEB",
    paddingVertical: 15,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    position: "absolute",
    bottom: 100,
    left: 20,
    right: 20,
  },
  createButtonDisabled: {
    backgroundColor: "#D1D5DB",
    opacity: 0.6,
  },
  createText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  loginButton: {
    backgroundColor: "#fff",
    paddingVertical: 15,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    position: "absolute",
    bottom: 40,
    left: 20,
    right: 20,
    borderWidth: 1,
    borderColor: "#337DEB",
  },
  loginButtonDisabled: {
    borderColor: "#D1D5DB",
    opacity: 0.6,
  },
  loginText: {
    color: "#337DEB",
    fontSize: 16,
    fontWeight: "700",
  },
  loginTextDisabled: {
    color: "#D1D5DB",
  },
});
