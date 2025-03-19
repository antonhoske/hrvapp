import { Image, StyleSheet, Platform, View, Text } from 'react-native';
import { HelloWave } from '@/components/HelloWave';
import ParallaxScrollView from '@/components/ParallaxScrollView';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import React from "react";


const TrainingScreen = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Starte dein Trainnig</Text>
      <Text style={styles.instruction}>Folge den Anweisungen um dein Training zu beginnen!</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 24, fontWeight: "bold" },
  instruction: { fontSize: 18, marginTop: 10, marginHorizontal: 20, textAlign: "center" },
});

export default TrainingScreen;
