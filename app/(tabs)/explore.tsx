import { StyleSheet, View, Text, ActivityIndicator, TouchableOpacity } from "react-native";
import React, { useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { useRouter } from "expo-router";

const HomeScreen = () => {
  const router = useRouter();
  const [stressData, setStressData] = useState<{ max_stress: number; avg_stress: number } | null>(null);
  const [recommendedTraining, setRecommendedTraining] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStressData();
  }, []);

  const fetchStressData = async () => {
    setLoading(true);

    const email = await SecureStore.getItemAsync("garmin_email");
    const password = await SecureStore.getItemAsync("garmin_password");

    if (!email || !password) {
      setLoading(false);
      return;
    }

    try {
      const response = await fetch("http://172.18.31.35:5000/stress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();
      setStressData(data);
      setRecommendedTraining(suggestTraining(data.max_stress, data.avg_stress));
    } catch (error) {
      console.error("Fehler beim Abrufen der Stressdaten:", error);
    } finally {
      setLoading(false);
    }
  };

  const suggestTraining = (maxStress: number, avgStress: number): string => {
    if (maxStress > 80 || avgStress > 50) return "Meditation (10 min)";
    if (maxStress > 50 || avgStress > 30) return "Meditation (15 min)";
    if (maxStress > 30 || avgStress > 10) return "Meditation (20 min)";
    return "Meditation (30 min)";
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

      <Text style={styles.header}>Empfohlenes Training</Text>

      {recommendedTraining && (
        <TouchableOpacity style={styles.panel} onPress={() => router.push("/")}>
          <Text style={styles.recommendation}>{recommendedTraining}</Text>
          <Text style={styles.subText}>(Tippe, um das Training zu starten)</Text>
        </TouchableOpacity>
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
  panel: { backgroundColor: "#4CAF50", padding: 20, borderRadius: 10, marginTop: 20, alignItems: "center" },
  subText: { fontSize: 14, color: "white", marginTop: 5 },
  error: { fontSize: 16, color: "red" },
});

export default HomeScreen;
