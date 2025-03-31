import { Image, StyleSheet, Platform, View, Text } from 'react-native';
import { HelloWave } from '@/components/HelloWave';
import ParallaxScrollView from '@/components/ParallaxScrollView';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import React from "react";
import { useDataSource } from '../components/DataSourceContext';


const TrainingScreen = () => {
  const { dataSource } = useDataSource();
  const isAppleSource = dataSource === 'apple';

  return (
    <View style={styles.container}>
      <View style={styles.imagesContainer}>
        {isAppleSource ? (
          // Show teal flower image for Apple Watch users
          <View style={styles.tealFlowerContainer}>
            <Image 
              source={require('@/assets/images/Mindfulness App.png')} 
              style={styles.tealFlowerImage}
              resizeMode="contain"
            />
          </View>
        ) : (
          // Show health snapshot image for Garmin users
          <View style={styles.healthSnapshotContainer}>
            <Image 
              source={require('@/assets/images/Health Snapshot App.png')} 
              style={styles.healthSnapshotImage}
              resizeMode="contain"
            />
          </View>
        )}
      </View>
      <Text style={styles.title}>Do your Training first!</Text>
      <Text style={styles.instruction}>Open the app and follow the instructions</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    justifyContent: "center", 
    alignItems: "center" 
  },
  imagesContainer: {
    alignItems: 'center',
    marginBottom: 30,
  },
  healthSnapshotContainer: {
    backgroundColor: '#212121',
    borderRadius: 8,
    padding: 10,
    marginBottom: 20,
    width: '70%',
  },
  healthSnapshotImage: {
    width: '100%',
    height: undefined,
    aspectRatio: 5.5,
  },
  tealFlowerContainer: {
    backgroundColor: '#212121',
    borderRadius: 8,
    padding: 10,
    marginBottom: 20,
    width: '70%',
  },
  tealFlowerImage: {
    width: '100%',
    height: undefined,
    aspectRatio: 2.5,
  },
  title: { 
    fontSize: 24, 
    fontWeight: "bold" 
  },
  instruction: { 
    fontSize: 18, 
    marginTop: 10, 
    marginHorizontal: 20, 
    textAlign: "center" 
  },
});

export default TrainingScreen;
