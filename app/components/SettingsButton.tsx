import React from 'react';
import { TouchableOpacity, Text, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

/**
 * Settings button component that provides options to switch data sources
 */
const SettingsButton = () => {
  const router = useRouter();

  const handlePress = () => {
    Alert.alert(
      'Settings',
      'Do you want to switch your data source?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Switch Data Source',
          onPress: handleSwitchDataSource,
        },
      ]
    );
  };

  const handleSwitchDataSource = () => {
    Alert.alert(
      'Confirm',
      'This will take you back to the authentication screen. Do you want to continue?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Continue',
          onPress: async () => {
            try {
              // Clear data source selection from AsyncStorage but keep auth status
              await AsyncStorage.removeItem('useGarmin');
              
              // Use router.replace instead of router.push to prevent stacking screens
              router.replace({
                pathname: '/auth/AuthScreen',
                params: { switching: 'true' }
              });
            } catch (error) {
              console.error('Error switching data source:', error);
              Alert.alert('Error', 'Failed to switch data source. Please try again.');
            }
          },
        },
      ]
    );
  };

  return (
    <TouchableOpacity onPress={handlePress} style={styles.container}>
      <Ionicons name="settings-outline" size={24} color="#007AFF" />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 8,
    marginRight: 10,
  },
});

export default SettingsButton; 