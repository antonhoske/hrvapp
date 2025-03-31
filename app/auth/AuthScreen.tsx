import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  TextInput, 
  Alert, 
  Platform,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  ScrollView
} from 'react-native';
import { useDataSource } from '../components/DataSourceContext';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from '../../firebaseConfig';
import { signInAnonymously } from 'firebase/auth';

const AuthScreen = () => {
  const { setDataSource } = useDataSource();
  const router = useRouter();
  const { switching } = useLocalSearchParams();
  
  // State variables
  const [selectedSource, setSelectedSource] = useState<'apple' | 'garmin' | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Check if user has already selected a data source
  useEffect(() => {
    const checkExistingSource = async () => {
      try {
        // Check for existing Garmin credentials
        const storedEmail = await SecureStore.getItemAsync('garmin_email');
        const storedPassword = await SecureStore.getItemAsync('garmin_password');
        const useGarmin = await AsyncStorage.getItem('useGarmin');
        
        if (useGarmin === 'true' && storedEmail && storedPassword) {
          setSelectedSource('garmin');
          setEmail(storedEmail);
          setPassword(storedPassword);
        } else {
          // Default to Apple if no Garmin credentials or explicitly set to Apple
          setSelectedSource('apple');
        }
        
        // Check if authenticated before and NOT in switching mode
        const authStatus = await AsyncStorage.getItem('isAuthenticated');
        if (authStatus === 'true' && switching !== 'true') {
          setIsAuthenticated(true);
          // Auto-proceed to main app if already authenticated and not switching
          router.replace('/(tabs)');
        }
      } catch (error) {
        console.error('Error checking existing source:', error);
      }
    };
    
    checkExistingSource();
  }, [router, switching]);

  // Handle source selection
  const handleSourceSelect = (source: 'apple' | 'garmin') => {
    setSelectedSource(source);
    
    // Clear credentials if switching to Apple
    if (source === 'apple') {
      setEmail('');
      setPassword('');
    }
  };

  // Handle continue button press
  const handleContinue = async () => {
    if (!selectedSource) {
      Alert.alert('Selection Required', 'Please select a data source to continue.');
      return;
    }

    setLoading(true);

    try {
      // Skip Firebase authentication and just use local storage
      // Save selected data source
      if (selectedSource === 'garmin') {
        // Validate Garmin credentials
        if (!email || !password) {
          Alert.alert('Missing Information', 'Please enter your Garmin email and password.');
          setLoading(false);
          return;
        }
        
        // Save Garmin credentials
        await SecureStore.setItemAsync('garmin_email', email);
        await SecureStore.setItemAsync('garmin_password', password);
        await AsyncStorage.setItem('useGarmin', 'true');
      } else {
        // For Apple Health, ensure HealthKit permissions will be requested
        // Remove any stored Garmin credentials if switching to Apple
        await AsyncStorage.removeItem('useGarmin');
      }
      
      // Set data source in context
      setDataSource(selectedSource);
      
      // Store authentication status in AsyncStorage for persistence
      await AsyncStorage.setItem('isAuthenticated', 'true');
      await AsyncStorage.setItem('userId', 'local-user-' + Date.now());
      setIsAuthenticated(true);
      
      // Navigate to the main app using replace to avoid stacking screens
      // The app/(tabs)/explore.tsx will handle data fetching based on the selected source
      router.replace('/(tabs)');
    } catch (error) {
      console.error('Authentication error:', error);
      Alert.alert('Authentication Error', 'Failed to authenticate. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>Choose Your Data Source</Text>
          <Text style={styles.subtitle}>Select how you want to connect your health data</Text>
        </View>
        
        <View style={styles.optionsContainer}>
          <TouchableOpacity
            style={[
              styles.option,
              selectedSource === 'apple' && styles.selectedOption
            ]}
            onPress={() => handleSourceSelect('apple')}
          >
            <Image 
              source={require('../../assets/images/apple watch.png')} 
              style={styles.optionImage} 
              resizeMode="contain"
            />
            <View style={styles.optionTextContainer}>
              <Text style={styles.optionTitle}>Apple Watch</Text>
              <Text style={styles.optionDescription}>Connect via Apple HealthKit</Text>
            </View>
            {selectedSource === 'apple' && (
              <View style={styles.checkmark}>
                <Text style={styles.checkmarkText}>✓</Text>
              </View>
            )}
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[
              styles.option,
              selectedSource === 'garmin' && styles.selectedOption
            ]}
            onPress={() => handleSourceSelect('garmin')}
          >
            <Image 
              source={require('../../assets/images/garmin watch.png')} 
              style={styles.optionImage} 
              resizeMode="contain"
            />
            <View style={styles.optionTextContainer}>
              <Text style={styles.optionTitle}>Garmin</Text>
              <Text style={styles.optionDescription}>Connect your Garmin account</Text>
            </View>
            {selectedSource === 'garmin' && (
              <View style={styles.checkmark}>
                <Text style={styles.checkmarkText}>✓</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
        
        {selectedSource === 'garmin' && (
          <View style={styles.credentialsContainer}>
            <Text style={styles.credentialsTitle}>Garmin Account</Text>
            <TextInput
              style={styles.input}
              placeholder="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TextInput
              style={styles.input}
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>
        )}
        
        <TouchableOpacity
          style={[
            styles.continueButton,
            (!selectedSource || (selectedSource === 'garmin' && (!email || !password))) && styles.disabledButton
          ]}
          onPress={handleContinue}
          disabled={loading || !selectedSource || (selectedSource === 'garmin' && (!email || !password))}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.continueButtonText}>Continue</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
  },
  header: {
    marginTop: 60,
    marginBottom: 40,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  optionsContainer: {
    marginBottom: 30,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  selectedOption: {
    borderColor: '#007aff',
    borderWidth: 2,
    shadowOpacity: 0.2,
  },
  optionImage: {
    width: 50,
    height: 50,
    marginRight: 15,
  },
  optionTextContainer: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  optionDescription: {
    fontSize: 14,
    color: '#666',
  },
  checkmark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#007aff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmarkText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  credentialsContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  credentialsTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 15,
  },
  input: {
    height: 50,
    borderColor: '#e1e1e1',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 15,
    marginBottom: 15,
    fontSize: 16,
  },
  continueButton: {
    backgroundColor: '#007aff',
    borderRadius: 12,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 30,
  },
  disabledButton: {
    backgroundColor: '#a0c4ff',
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});

export default AuthScreen; 