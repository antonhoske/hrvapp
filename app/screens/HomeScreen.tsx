import React, { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";

const HomeScreen = () => {
  const [stressData, setStressData] = useState<{ max_stress: number; avg_stress: number } | null>(null);
  const [recommendedTraining, setRecommendedTraining] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Hardcoding the stress data
    const testStressData = {
      max_stress: 85,  // Hardcoded max stress
      avg_stress: 60,  // Hardcoded average stress
    };

    // Simulate a fetch delay
    setTimeout(() => {
      setStressData(testStressData);
      setRecommendedTraining(suggestTraining(testStressData.max_stress, testStressData.avg_stress));
      setLoading(false);
    }, 1000); // Simulate loading time
  }, []);

  const suggestTraining = (maxStress: number, avgStress: number): string => {
    if (maxStress > 80 || avgStress > 50) {
      return "Meditation (10 min)";
    } else if (maxStress > 50 || avgStress > 30) {
      return "Yoga (15 min)";
    } else if (maxStress > 30 || avgStress > 10) {
      return "Spaziergang (20 min)";
    } else {
      return "Intensives Training (30 min)";
    }
  };

  const getPanelColor = (training: string): string => {
    switch (training) {
      case "Meditation (10 min)":
        return "#4CAF50"; // Green for Meditation
      case "Yoga (15 min)":
        return "#2196F3"; // Blue for Yoga
      case "Spaziergang (20 min)":
        return "#FF9800"; // Orange for Walk
      case "Intensives Training (30 min)":
        return "#F44336"; // Red for Intense Training
      default:
        return "#f2f2f2"; // Default background color
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Dein aktuelles Stresslevel</Text>
      {loading ? (
        <ActivityIndicator size="large" color="#0000ff" />
      ) : stressData ? (
        <View>
          <Text style={styles.data}>📉 Max: {stressData.max_stress}</Text>
          <Text style={styles.data}>📊 Durchschnitt: {stressData.avg_stress}</Text>
        </View>
      ) : (
        <Text style={styles.error}>Keine Stressdaten verfügbar.</Text>
      )}

      {/* Empfohlenes Training Header */}
      <Text style={styles.header}>Empfohlenes Training</Text>

      {/* Training Panel */}
      {recommendedTraining && (
        <View style={[styles.panel, { backgroundColor: getPanelColor(recommendedTraining) }]}>
          <Text style={styles.recommendation}>{recommendedTraining}</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", padding: 20 },
  title: { fontSize: 22, fontWeight: "bold", marginBottom: 10 },
  header: { fontSize: 20, fontWeight: "bold", marginTop: 30 },
  data: { fontSize: 18, marginBottom: 5 },
  recommendation: { fontSize: 20, fontWeight: "bold", color: "white", textAlign: "center" },
  panel: {
    width: "100%",
    padding: 20,
    borderRadius: 10,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 5,
    marginTop: 20,
  },
  error: { fontSize: 16, color: "red" },
});

export default HomeScreen;
