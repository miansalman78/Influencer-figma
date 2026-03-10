import React from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet, Dimensions } from "react-native";

const { width, height } = Dimensions.get("window");

const OnboardingScreen = ({ navigation }) => {
  return (
    <View style={styles.container}>
      {/* Skip Button */}
      <TouchableOpacity 
        style={styles.skipBtn} 
        onPress={() => navigation?.navigate('ChooseRole')}
      >
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>

      {/* Image Section */}
      <View style={styles.imageContainer}>
        <Image
          source={require("../assets/Splash.png")}
          style={styles.phoneImage}
          resizeMode="contain"
          onError={(error) => console.log('Image load error:', error)}
        />
      </View>

       {/* Text Section */}
       <Text style={styles.title}>Join a Thriving{'\n'}Community</Text>
      <Text style={styles.subtitle}>
        Become part of a community of brands and creators, building powerful partnerships.
      </Text>

      {/* Pagination Dots */}
      <View style={styles.pagination}>
        <View style={[styles.dot, styles.dotActive]} />
        <View style={styles.dot} />
        <View style={styles.dot} />
      </View>

      {/* Next Button */}
      <TouchableOpacity
        style={styles.nextButton}
        onPress={() => navigation?.navigate('ChooseRole')}
      >
        <Text style={styles.nextText}>Next</Text>
      </TouchableOpacity>
    </View>
  );
};

export default OnboardingScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  skipBtn: {
    position: "absolute",
    top: 60,
    right: 25,
  },
  skipText: {
    color: "#8A8A8A",
    fontSize: 15,
  },
  imageContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 15,
    marginBottom: 20,
  },
  phoneImage: {
    width: width * 0.95,
    height: height * 0.55,
    resizeMode: "contain",
    borderRadius: 20,
    alignSelf: "center",
  },
  title: {
    fontSize: 30,
    fontWeight: "700",
    textAlign: "center",
    color: "#1a1a1a",
    marginTop: 10,
  },
  subtitle: {
    fontSize: 15,
    textAlign: "center",
    color: "#8A8A8A",
    marginTop: 5,
    lineHeight: 20,
    paddingHorizontal: 25,
  },
  pagination: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 7,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#D8D8D8",
    marginHorizontal: 5,
  },
  dotActive: {
    backgroundColor: "#337DEB",
    width: 18,
  },
  nextButton: {
    backgroundColor: "#337DEB",
    width: width * 0.9,
    paddingVertical: 15,
    borderRadius: 30,
    position: "absolute",
    bottom: 40,
    alignItems: "center",
  },
  nextText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});
