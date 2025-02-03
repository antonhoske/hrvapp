import React from "react";
import { View, Text, StyleSheet } from "react-native";

const TrainingScreen = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Start Your Training</Text>
      <Text style={styles.instruction}>Follow the instructions to begin your training!</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 24, fontWeight: "bold" },
  instruction: { fontSize: 18, marginTop: 10 },
});

export default TrainingScreen;
