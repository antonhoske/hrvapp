import { uploadHistoricalData } from "../utils/historicalUpload";
import { StyleSheet, View, Text, ActivityIndicator, TouchableOpacity, Modal, TextInput, FlatList, Button, ScrollView, Alert, Platform } from "react-native";
import React, { useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { useRouter } from "expo-router";
import { getFirestore, collection, addDoc, Firestore } from "firebase/firestore";
import { initializeApp, FirebaseApp } from "firebase/app";
import AppleHealthKit, { 
  HealthValue,
  HealthInputOptions,
  HealthUnit,
  HealthObserver,
  HealthActivitySummary,
  HealthKitPermissions,
  HealthPermission
} from 'react-native-health';
import { doc, setDoc } from "firebase/firestore";  
import { getAuth, initializeAuth, Auth } from "firebase/auth";
import Constants from 'expo-constants';

// Add type declarations for Apple HealthKit
declare module 'react-native-health' {
  interface AppleHealthKit {
    getAnchoredWorkouts(options: any, callback: (error: string | null, results: any) => void): void;
    getDailyStepCountSamples(options: any, callback: (error: string | null, results: any) => void): void;
    getDistanceWalkingRunning(options: any, callback: (error: string | null, results: any) => void): void;
    getSleepSamples(options: any, callback: (error: string | null, results: any[]) => void): void;
    getVo2MaxSamples(options: any, callback: (error: string | null, results: any[]) => void): void;
    getHeartRateVariabilitySamples(options: any, callback: (error: string | null, results: any[]) => void): void;
    getMindfulSession(options: any, callback: (error: string | null, results: any[]) => void): void;
    isAvailable(callback: (error: string, result: boolean) => void): void;
    getAuthStatus(permissions: any, callback: (error: string, result: any) => void): void;
    getBiologicalSex(options: any, callback: (error: string, results: any) => void): void;
    getHeightSamples(options: any, callback: (error: string, results: any) => void): void;
    getWeightSamples(options: any, callback: (error: string, results: any) => void): void;
    getDateOfBirth(options: any, callback: (error: string, results: any) => void): void;
  }
}

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBWzYmkdQj7LbVk7dIZzjsan_Eca9EQPrA",
  authDomain: "lift-c8dbf.firebaseapp.com",
  projectId: "lift-c8dbf",
  storageBucket: "lift-c8dbf.firebasestorage.app",
  messagingSenderId: "16228935546",
  appId: "1:16228935546:web:9615f3300e942f861f58c3",
  measurementId: "G-2B6SVW0YSS"
};

// API configuration
const API_URL = Constants.expoConfig?.extra?.apiUrl || 'https://dodo-holy-primarily.ngrok-free.app';

// Error messages
const ERROR_MESSAGES = {
  NETWORK: "Network error. Please check your internet connection.",
  SERVER: "Server error. Please try again later.",
  AUTH: "Authentication failed. Please check your credentials.",
  INIT: "Failed to initialize the app. Please try again."
};

// Initialize Firebase only if we're in a native environment
let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;

try {
  app = initializeApp(firebaseConfig);
  auth = initializeAuth(app);
  db = getFirestore(app);
} catch (error) {
  console.error('Firebase initialization error:', error);
}

interface HealthData {
  hrv: number;
  timestamp: Date;
  source: string;
}

interface GarminData {
  stress: {
    max_stress: number;
    avg_stress: number;
    date: string;
  } | null;
  hrv: {
    summary: {
      lastNightAvg: number;
      lastNight5MinHigh: number;
      status: string;
      feedbackPhrase: string;
    };
    readings: {
      time: string;
      value: number;
    }[];
  } | null;
  sleep: {
    summary: {
    total_sleep_seconds: number;
    deep_sleep_seconds: number;
    light_sleep_seconds: number;
    rem_sleep_seconds: number;
    awake_seconds: number;
      sleep_start: string;
      sleep_end: string;
    sleep_score: string;
      average_hrv: number;
      lowest_hrv: number;
      highest_hrv: number;
    };
    phases: {
      start_time: string;
      end_time: string;
      phase_type: string;
      duration_seconds: number;
      hrv: number;
    }[];
  } | null;
  activity: {
    steps: number;
    calories_burned: number;
    active_minutes: number;
    distance_km: number;
    floors_climbed: number;
    active_time_seconds: number;
    date: string;
    vo2_max: number;
    vo2_max_status: string;
    vo2_max_date: string;
    daily_activities: { type: string; duration_minutes: number }[];
    mindful_minutes: number;
  } | null;
  heart_rate: {
    resting_heart_rate: number;
    hrv_heart_rate: number;
    date: string;
  } | null;
}

interface HealthKitResponse {
      value: number;
  startDate: string;
  endDate: string;
}

interface SleepSample {
  startDate: string;
  endDate: string;
  value: 'INBED' | 'ASLEEP' | 'AWAKE' | 'CORE' | 'DEEP' | 'REM';
  sourceId?: string;
  sourceName?: string;
}

// Add styles for the new UI elements
const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
    width: '100%',
  },
  scrollViewContent: {
    paddingBottom: 100,
  },
  buttonContainer: {
    marginTop: 20,
    gap: 10,
    width: '100%',
    paddingHorizontal: 10,
    marginBottom: 20,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    width: '100%',
    minHeight: 50,
    justifyContent: 'center',
  },
  garminButton: {
    backgroundColor: '#FF6B00', // Garmin's brand color
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    width: '90%',
    maxHeight: '90%',
    height: '80%',
  },
  modalHeader: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
    fontSize: 16,
  },
  questionContainer: {
    marginBottom: 20,
  },
  questionText: {
    fontSize: 16,
    marginBottom: 10,
  },
  healthKitStatus: {
    color: '#4CAF50',
    marginBottom: 10,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  dataContainer: {
    backgroundColor: '#f5f5f5',
    borderRadius: 15,
    padding: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#333',
  },
  dataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  dataLabel: {
    fontSize: 16,
    color: '#666',
  },
  dataValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  formContainer: {
    paddingBottom: 20,
    width: '100%',
  },
  debugText: {
    color: '#666',
    marginBottom: 10,
  },
  debug: {
    color: 'gray',
    fontSize: 12,
    marginVertical: 4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  label: {
    fontSize: 16,
    color: '#666',
  },
  value: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  subRow: {
    paddingLeft: 16,
    paddingTop: 4,
  },
  subText: {
    fontSize: 12,
    color: '#888',
    fontStyle: 'italic',
  },
  activityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  activityType: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  activityDuration: {
    fontSize: 16,
    color: '#666',
  },
  noActivities: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: 12,
  },
  section: {
    marginBottom: 20,
  },
  sleepSummary: {
    marginBottom: 20,
  },
  sleepTime: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  subsectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#444',
    marginTop: 16,
    marginBottom: 8,
  },
  phaseRow: {
    backgroundColor: '#f8f8f8',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  phaseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  phaseType: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  phaseTime: {
    fontSize: 14,
    color: '#666',
  },
  hrvValue: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  noData: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: 12,
  },
  hrvSummary: {
    backgroundColor: '#f8f8f8',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  hrvReadingsContainer: {
    flexDirection: 'row',
    marginTop: 8,
    marginBottom: 12,
  },
  hrvReading: {
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    padding: 12,
    marginRight: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  hrvTime: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  errorText: {
    color: 'red',
    textAlign: 'center',
    marginTop: 20,
    padding: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 10,
  },
  refreshButton: {
    backgroundColor: '#4CAF50',
    padding: 8,
    borderRadius: 8,
    width: 35,
    height: 35,
    justifyContent: 'center',
    alignItems: 'center',
  },
  refreshButtonText: {
    fontSize: 20,
    color: '#fff',
    fontWeight: 'bold',
  },
  sourceButton: {
    backgroundColor: '#f0f0f0',
    padding: 8,
    borderRadius: 8,
  },
  sourceButtonText: {
    fontSize: 14,
    color: '#333',
  },
  sourceButtonContainer: {
    width: '100%',
    gap: 16,
  },
  appleButton: {
    backgroundColor: '#000',
  },
  likertContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    flexWrap: 'wrap',
  },
  likertOption: {
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    marginVertical: 4,
    minWidth: '18%',
    alignItems: 'center',
  },
  likertOptionSelected: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  likertOptionText: {
    fontSize: 12,
    color: '#333',
    textAlign: 'center',
  },
  likertOptionTextSelected: {
    color: '#fff',
  },
  scrollContainer: {
    paddingBottom: 20,
  },
  inputLabel: {
    fontSize: 16,
    marginBottom: 10,
    fontWeight: 'bold',
  },
  autoFillButton: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    width: '100%',
    marginBottom: 20,
  },
  cancelButton: {
    backgroundColor: '#ccc',
  },
  disabledButton: {
    backgroundColor: '#cccccc',
    opacity: 0.7,
  },
  formGroup: {
    marginBottom: 20,
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
  },
  picker: {
    height: 50,
    width: '100%',
  },
  submitButton: {
    backgroundColor: '#007AFF',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  dropdownButton: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 15,
    marginBottom: 5,
    backgroundColor: '#f8f8f8',
  },
  dropdownButtonText: {
    fontSize: 16,
    color: '#333',
  },
  optionsList: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    marginBottom: 15,
    backgroundColor: '#fff',
  },
  optionItem: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  optionText: {
    fontSize: 16,
  },
  modalFormContainer: {
    flex: 1,
    padding: 10,
  },
  dropdownButtonSelected: {
    borderColor: '#007AFF',
  },
  dropdownButtonTextSelected: {
    color: '#007AFF',
  },
  dropdownContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dropdownArrow: {
    fontSize: 12,
    color: '#666',
    marginRight: 8,
  },
  selectedOption: {
    backgroundColor: '#e0e0e0',
  },
  selectedOptionText: {
    color: '#007AFF',
  },
});

// Add this new function to handle device ID generation and storage
const getOrCreateDeviceId = async (): Promise<string> => {
  try {
    // Try to get existing device ID
    let existingDeviceId = await SecureStore.getItemAsync('device_id');
    
    if (existingDeviceId) {
      return existingDeviceId;
    }
    
    // If no device ID exists, create a new one
    const newDeviceId = `device_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    await SecureStore.setItemAsync('device_id', newDeviceId);
    return newDeviceId;
  } catch (error) {
    console.error('Error handling device ID:', error);
    throw error;
  }
};

const HomeScreen = () => {
  const router = useRouter();
  const [isInitialized, setIsInitialized] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [stressData, setStressData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(false);
  const [garminModalVisible, setGarminModalVisible] = useState(false);
  const [pssModalVisible, setPssModalVisible] = useState(false);
  const [personalInfoModalVisible, setPersonalInfoModalVisible] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [responses, setResponses] = useState<number[]>([0, 0, 0]);
  const [healthKitAvailable, setHealthKitAvailable] = useState(false);
  const [personalInfo, setPersonalInfo] = useState({
    age: null as number | null,
    gender: "" as string,
    height: null as number | null,
    weight: null as number | null,
    fitness_level: null as number | null,
    stress_level: null as number | null,
    sleep_quality: null as number | null,
    pre_existing_conditions: "" as string,
    allergies: "" as string,
    smoker: "" as string,
    alcohol_consumption: "" as string,
  });
  const [garminData, setGarminData] = useState<GarminData>({
    stress: null,
    hrv: null,
    sleep: null,
    activity: null,
    heart_rate: null
  });

  const [dataSource, setDataSource] = useState<'garmin' | 'apple' | null>('apple');
  const [sourceSelectionVisible, setSourceSelectionVisible] = useState(true);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [isModalTransitioning, setIsModalTransitioning] = useState(false);
  const [activeModal, setActiveModal] = useState<'garmin' | 'pss' | 'personal' | null>(null);
  const [isAutoFilling, setIsAutoFilling] = useState(false);

  // PSS questions
  const questions = [
    "Wie gestresst fühlst du dich derzeit?",
    "Hast du in letzter Zeit Schlafprobleme?",
    "Fühlst du dich oft überfordert?"
  ];

  const likertOptions = [
    { value: 1, label: "Überhaupt nicht" },
    { value: 2, label: "Etwas" },
    { value: 3, label: "Mäßig" },
    { value: 4, label: "Stark" },
    { value: 5, label: "Sehr stark" }
  ];

  // Add a more sophisticated modal manager
  const [modalManager, setModalManager] = useState({
    activeModal: null as 'garmin' | 'pss' | 'personal' | null,
    isTransitioning: false,
    previousModal: null as 'garmin' | 'pss' | 'personal' | null,
    queuedModal: null as 'garmin' | 'pss' | 'personal' | null
  });

  // Create safe modal control functions
  const openModal = (modalType: 'garmin' | 'pss' | 'personal') => {
    
    
    // If already in transition, queue this request
    if (modalManager.isTransitioning) {
      
      setModalManager(prev => ({...prev, queuedModal: modalType}));
      return;
    }
    
    // If the requested modal is already active, do nothing
    if (modalManager.activeModal === modalType) {
      
      return;
    }
    
    // Start transition
    setModalManager(prev => ({
      ...prev, 
      isTransitioning: true,
      previousModal: prev.activeModal
    }));
    
    // Close any active modal first
    if (modalManager.activeModal) {
      
      
      // Close the appropriate modal
      switch (modalManager.activeModal) {
        case 'garmin':
          setGarminModalVisible(false);
          break;
        case 'pss':
          setPssModalVisible(false);
          break;
        case 'personal':
          setPersonalInfoModalVisible(false);
          break;
      }
      
      // Wait for animation to complete before opening new modal
      setTimeout(() => {
        
        switch (modalType) {
          case 'garmin':
            setGarminModalVisible(true);
            if (dataSource === 'garmin') {
              setTimeout(checkGarminCredentials, 500);
            }
            break;
          case 'pss':
            setPssModalVisible(true);
            break;
          case 'personal':
            setPersonalInfoModalVisible(true);
            break;
        }
        
        setModalManager(prev => ({
          ...prev,
          activeModal: modalType,
          isTransitioning: false
        }));
        
        // Process any queued modal after a short delay
        setTimeout(() => {
          setModalManager(prev => {
            if (prev.queuedModal) {
              
              openModal(prev.queuedModal);
              return {...prev, queuedModal: null};
            }
            return prev;
          });
        }, 100);
      }, 400); // Wait 400ms for animation
    } else {
      // No active modal, open directly
      
      switch (modalType) {
        case 'garmin':
          setGarminModalVisible(true);
          if (dataSource === 'garmin') {
            setTimeout(checkGarminCredentials, 500);
          }
          break;
        case 'pss':
          setPssModalVisible(true);
          break;
        case 'personal':
          setPersonalInfoModalVisible(true);
          break;
      }
      
      setModalManager(prev => ({
        ...prev,
        activeModal: modalType,
        isTransitioning: false
      }));
    }
  };

  const closeModal = (modalType: 'garmin' | 'pss' | 'personal') => {
    
    
    // Only close if this modal is active
    if (modalManager.activeModal !== modalType) {
      
      return;
    }
    
    // If already in transition, ignore
    if (modalManager.isTransitioning) {
      
      return;
    }
    
    setModalManager(prev => ({...prev, isTransitioning: true}));
    
    // Close the appropriate modal
    switch (modalType) {
      case 'garmin':
        setGarminModalVisible(false);
        break;
      case 'pss':
        setPssModalVisible(false);
        break;
      case 'personal':
        setPersonalInfoModalVisible(false);
        break;
    }
    
    // Reset modal state after animation
    setTimeout(() => {
      setModalManager(prev => ({
        ...prev,
        activeModal: null,
        isTransitioning: false,
        previousModal: modalType
      }));
      
      // Process any queued modal
      setTimeout(() => {
        setModalManager(prev => {
          if (prev.queuedModal) {
            
            openModal(prev.queuedModal);
            return {...prev, queuedModal: null};
          }
          return prev;
        });
      }, 100);
    }, 400);
  };

  // Helper functions for processing health data
  const processSleepData = (sleepData: SleepSample[] | null) => {
    if (!sleepData || sleepData.length === 0) {
      console.error("No sleep data available");
      return { startTime: null, endTime: null, totalSleep: 0 };
    }

    let totalSleep = 0;
    let deepSleep = 0;
    let lightSleep = 0;
    let remSleep = 0;
    let awake = 0;
    let startTime = '';
    let endTime = '';
    let phases: any[] = [];

    if (sleepData.length > 0) {
      // Sort sleep samples by start time
      const sortedSamples = sleepData.sort((a: any, b: any) => 
        new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
      );

      startTime = sortedSamples[0].startDate;
      endTime = sortedSamples[sortedSamples.length - 1].endDate;

      sleepData.forEach((sample: SleepSample) => {
        const duration = (new Date(sample.endDate).getTime() - new Date(sample.startDate).getTime()) / 1000;
        
        // Map Apple Health sleep stages to our categories
        switch (sample.value) {
          case 'DEEP':
            deepSleep += duration;
            break;
          case 'CORE':
            lightSleep += duration;
            break;
          case 'REM':
            remSleep += duration;
            break;
          case 'AWAKE':
            awake += duration;
            break;
          case 'ASLEEP': // For older iOS versions that don't provide detailed stages
            // In this case, we'll still need to estimate the distribution
            deepSleep += Math.round(duration * 0.2);
            lightSleep += Math.round(duration * 0.6);
            remSleep += Math.round(duration * 0.2);
            break;
          case 'INBED':
            // Only count "in bed" time if it's not overlapping with other sleep stages
            if (!sleepData.some(other => 
              other !== sample &&
              new Date(other.startDate) <= new Date(sample.endDate) &&
              new Date(other.endDate) >= new Date(sample.startDate)
            )) {
              awake += duration;
            }
            break;
        }

        phases.push({
          start_time: sample.startDate,
          end_time: sample.endDate,
          phase_type: sample.value,
          duration_seconds: duration,
          source: sample.sourceName || 'Unknown'
        });
      });

      totalSleep = deepSleep + lightSleep + remSleep;
    }

    return {
      totalSleep,
      deepSleep,
      lightSleep,
      remSleep,
      awake,
      startTime,
      endTime,
      phases
    };
  };

  const calculateAverageHRV = (hrvData: HealthValue[], sleepStart: string, sleepEnd: string) => {
    if (hrvData.length === 0) return 0;
    
    // If we have sleep times, filter for sleep period
    if (sleepStart && sleepEnd) {
      const sleepStartTime = new Date(sleepStart).getTime();
      const sleepEndTime = new Date(sleepEnd).getTime();
      
      // Filter HRV readings that occurred during sleep
      const sleepHrvData = hrvData.filter(reading => {
        const readingTime = new Date(reading.startDate).getTime();
        return readingTime >= sleepStartTime && readingTime <= sleepEndTime;
      });

      if (sleepHrvData.length > 0) {
        const sum = sleepHrvData.reduce((acc, curr) => acc + curr.value, 0);
        return Math.round(sum / sleepHrvData.length);
      }
    }
    
    // If no sleep data or no readings during sleep, use all readings
    const sum = hrvData.reduce((acc, curr) => acc + curr.value, 0);
    return Math.round(sum / hrvData.length);
  };

  const findHighestHRV = (hrvData: HealthValue[], sleepStart: string, sleepEnd: string) => {
    if (hrvData.length === 0) return 0;
    
    // If we have sleep times, filter for sleep period
    if (sleepStart && sleepEnd) {
      const sleepStartTime = new Date(sleepStart).getTime();
      const sleepEndTime = new Date(sleepEnd).getTime();
      
      // Filter HRV readings that occurred during sleep
      const sleepHrvData = hrvData.filter(reading => {
        const readingTime = new Date(reading.startDate).getTime();
        return readingTime >= sleepStartTime && readingTime <= sleepEndTime;
      });

      if (sleepHrvData.length > 0) {
        return Math.max(...sleepHrvData.map(d => d.value));
      }
    }
    
    // If no sleep data or no readings during sleep, use all readings
    return Math.max(...hrvData.map(d => d.value));
  };

  const calculateActiveMinutes = (heartRateData: any[]) => {
    // Calculate active minutes based on heart rate and workouts
    let activeMinutes = 0;

    // 1. Calculate minutes where heart rate is in active zone (above 100 BPM)
    if (heartRateData && heartRateData.length > 0) {
      const activeHeartRateReadings = heartRateData.filter(hr => hr.value > 100);
      // Assuming readings are roughly 1 minute apart
      activeMinutes += activeHeartRateReadings.length;
    }

    return activeMinutes;
  };

  const calculateRestingHeartRate = (heartRateData: any[]) => {
    if (heartRateData.length === 0) return 0;
    // Use the lowest 10% of heart rate values to estimate resting heart rate
    const sortedHR = heartRateData.map((hr: any) => hr.value).sort((a, b) => a - b);
    const tenPercentile = Math.floor(sortedHR.length * 0.1);
    const restingHRs = sortedHR.slice(0, tenPercentile);
    return Math.round(restingHRs.reduce((a, b) => a + b, 0) / restingHRs.length);
  };

  const calculateAverageHeartRate = (heartRateData: any[]) => {
    if (heartRateData.length === 0) return 0;
    const sum = heartRateData.reduce((acc: number, curr: any) => acc + curr.value, 0);
    return Math.round(sum / heartRateData.length);
  };

  const fetchHRVData = async () => {
    setLoading(true);
    if (dataSource === 'garmin') {
      setLoading(false);
      return;
    }

    try {
      const now = new Date();
            // Set start date to beginning of yesterday (00:00:00)
      const startDate = new Date();
      startDate.setDate(now.getDate() - 1);
      startDate.setHours(0, 0, 0, 0);
      
      // Set end date to end of yesterday (23:59:59)
      const endDate = new Date();
      endDate.setDate(now.getDate() - 1);
      endDate.setHours(23, 59, 59, 999);

      // For sleep data, we want to look at a wider window to catch the full sleep period
      // From 6 PM two days ago to 11 AM yesterday
      const sleepStartDate = new Date();
      sleepStartDate.setDate(now.getDate() - 1);
      sleepStartDate.setHours(18, 0, 0, 0); // 6 PM
      
      const sleepEndDate = new Date();
      sleepEndDate.setDate(now.getDate());
      sleepEndDate.setHours(11, 0, 0, 0); // 11 AM
      
      
                                    const options = {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        ascending: false,
        limit: 288, // Increased limit to ensure we get all data points for the day (one reading every 5 minutes)
      };

      const sleepOptions = {
        startDate: sleepStartDate.toISOString(),
        endDate: sleepEndDate.toISOString(),
        ascending: true,
        limit: 288,
      };

                  // Initialize default values
      let steps = { value: 0 };
      let calories = { value: 0 };
      let distance = { value: 0 };
      let workouts = { activeMinutes: 0, activities: [] };
      let vo2Max = { value: 0, date: '', status: 'N/A' };
      let mindfulMinutes = 0; // Initialize mindful minutes

      // Fetch workouts first to calculate active minutes
      try {
        const workoutResults = await new Promise<any[]>((resolve, reject) => {
          if (typeof AppleHealthKit.getAnchoredWorkouts !== 'function') {
            resolve([]);
            return;
          }
          AppleHealthKit.getAnchoredWorkouts(
            {
              ...options,
              type: 'Workout'
            },
            (err: string | null, results: any) => {
              if (err) {
                console.error('Error fetching workouts:', err);
                resolve([]);
              } else if (results && Array.isArray(results.data)) {
                
                                const activities = results.data.map(workout => ({
                  type: workout.activityName || 'Unknown Activity',
                  duration_minutes: Math.round((workout.duration || 0) / 60)
                }));

                const totalActiveMinutes = activities.reduce((total, activity) => 
                  total + activity.duration_minutes, 0);

                resolve({
                  activeMinutes: totalActiveMinutes,
                  activities: activities,
                  anchor: results.anchor
                });
              } else {
                resolve({ activeMinutes: 0, activities: [], anchor: null });
              }
            }
          );
        });
        workouts = workoutResults;
      } catch (error) {
        console.error('Error fetching workouts:', error);
      }

      // Safely fetch each metric with error handling
      try {
        const stepsResult = await new Promise<any>((resolve, reject) => {
          if (typeof AppleHealthKit.getDailyStepCountSamples !== 'function') {
            resolve({ value: 0 });
            return;
          }
          AppleHealthKit.getDailyStepCountSamples(
            {
              ...options,
              includeManuallyAdded: true,
            },
            (err: string | null, results: any[]) => {
              if (err) {
                console.error('Error fetching steps:', err);
                resolve({ value: 0 });
              } else if (Array.isArray(results)) {
                
                                const totalSteps = results.reduce((sum: number, item: any) => sum + (item.value || 0), 0);
                resolve({ value: totalSteps });
              } else {
                resolve({ value: 0 });
              }
            }
          );
        });
        steps = stepsResult;
      } catch (error) {
        console.error('Error fetching steps:', error);
      }

      try {
        const caloriesResult = await new Promise<any>((resolve, reject) => {
          if (typeof AppleHealthKit.getActiveEnergyBurned !== 'function') {
            resolve({ value: 0 });
            return;
          }
          AppleHealthKit.getActiveEnergyBurned(
            {
              ...options,
              includeManuallyAdded: true,
            },
            (err: string | null, results: any[]) => {
              if (err) {
                console.error('Error fetching calories:', err);
                resolve({ value: 0 });
              } else if (Array.isArray(results)) {
                const totalCalories = results.reduce((sum: number, item: any) => sum + (item.value || 0), 0);
                resolve({ value: totalCalories });
              } else {
                resolve({ value: 0 });
              }
            }
          );
        });
        calories = caloriesResult;
      } catch (error) {
        console.error('Error fetching calories:', error);
      }

      try {
        const distanceResult = await new Promise<any>((resolve, reject) => {
          
          if (typeof AppleHealthKit.getDailyDistanceWalkingRunningSamples !== 'function') {
            console.error("❌ getDailyDistanceWalkingRunningSamples function not available");
            resolve({ value: 0 });
            return;
          }
          
          AppleHealthKit.getDailyDistanceWalkingRunningSamples(
            {
              startDate: options.startDate,
              endDate: options.endDate,
              unit: 'km',
              ascending: false
            },
            (err, results) => {
              if (err) {
                console.error('❌ Error fetching distance samples:', err);
                resolve({ value: 0 });
              } else if (Array.isArray(results) && results.length > 0) {
                // Sum up all distance values in the array
                const totalDistance = results.reduce((sum, item) => 
                  sum + (item.value || 0), 0) / 1000; // Convert from meters to kilometers
                console.log(`🏃‍♂️ Total distance from ${results.length} daily samples: ${totalDistance} km`);
                resolve({ value: totalDistance });
              } else {
                console.log("❌ No distance data available in the specified period");
                resolve({ value: 0 });
              }
            }
          );
        });
        distance = distanceResult;
        
      } catch (error) {
        console.error('Error fetching distance:', error);
      }

      // Fetch HRV Data with proper error handling
      let hrvData: HealthValue[] = [];
      try {
        hrvData = await new Promise<HealthValue[]>((resolve, reject) => {
          AppleHealthKit.getHeartRateVariabilitySamples(
            {
              ...sleepOptions,
              unit: 'ms',
            },
            (err: string | null, results: HealthValue[]) => {
              if (err) {
                console.error('Error fetching HRV:', err);
                resolve([]);
              } else if (Array.isArray(results)) {
                
                if (results.length > 0) {
                  
                                  }
                                resolve(results.map(result => ({
                  ...result,
                  value: result.value * 1000
                })));
              } else {
                resolve([]);
              }
            }
          );
        });
      } catch (error) {
        console.error('Error fetching HRV:', error);
      }

      // Fetch Sleep Data with proper error handling
      let sleepData: any[] = [];
      try {
        sleepData = await new Promise<any[]>((resolve, reject) => {
          if (typeof AppleHealthKit.getSleepSamples !== 'function') {
            resolve([]);
            return;
          }
          AppleHealthKit.getSleepSamples(
            {
              ...sleepOptions,
              type: 'SleepAnalysis',
              includeStages: true
            },
            (err: string | null, results: any[]) => {
              if (err) {
                console.error('Error fetching sleep:', err);
                resolve([]);
              } else if (Array.isArray(results)) {
                
                
                                resolve(results);
              } else {
                resolve([]);
              }
            }
          );
        });
      } catch (error) {
        console.error('Error fetching sleep:', error);
      }

      // Process Sleep Data
      const sleepSummary = processSleepData(sleepData);

      // Fetch VO2 Max
      try {
        const vo2MaxResults = await new Promise<any>((resolve, reject) => {
          if (typeof AppleHealthKit.getVo2MaxSamples !== 'function') {
            resolve({ value: 0, date: '', status: 'N/A' });
            return;
          }
          AppleHealthKit.getVo2MaxSamples(
            {
              unit: 'mL/(kg*min)',
              ascending: false,
              limit: 1
            },
            (err: string | null, results: any[]) => {
              if (err) {
                console.error('Error fetching VO2 Max:', err);
                resolve({ value: 0, date: '', status: 'N/A' });
              } else if (Array.isArray(results) && results.length > 0) {
                const latest = results[0];
                resolve({
                  value: parseFloat(latest.value),
                  date: latest.startDate,
                  status: latest.value > 0 ? 'Available' : 'N/A'
                });
              } else {
                resolve({ value: 0, date: '', status: 'N/A' });
              }
            }
          );
        });
        vo2Max = vo2MaxResults;
      } catch (error) {
        console.error('Error fetching VO2 Max:', error);
      }

      // Fetch mindfulness sessions
      try {
        // Initialize mindfulMinutes to 0
        mindfulMinutes = 0;
        
        // Fetch mindfulness sessions from HealthKit
        const mindfulnessData = await new Promise<any[]>((resolve, reject) => {
          if (typeof AppleHealthKit.getMindfulSession !== 'function') {
            
            resolve([]);
            return;
          }
          
          AppleHealthKit.getMindfulSession(
            {
              ...options,
              type: 'MindfulSession'
            },
            (err: string | null, results: any[]) => {
              if (err) {
                console.error('Error fetching mindfulness sessions:', err);
                resolve([]);
              } else if (Array.isArray(results)) {
                
                                resolve(results);
              } else {
                resolve([]);
              }
            }
          );
        });
        
        // Calculate total mindfulness minutes
        if (mindfulnessData && mindfulnessData.length > 0) {
          mindfulnessData.forEach(session => {
            if (session.startDate && session.endDate) {
              const start = new Date(session.startDate);
              const end = new Date(session.endDate);
              const durationMinutes = (end.getTime() - start.getTime()) / (1000 * 60);
              mindfulMinutes += durationMinutes;
            }
          });
          
          // Round to nearest integer
          mindfulMinutes = Math.round(mindfulMinutes);
          
        }
      } catch (error) {
        console.error('Error fetching mindfulness data:', error);
      }

      // Update state with all the data
      setGarminData({
        stress: null,
        hrv: {
          summary: {
            lastNightAvg: sleepSummary && sleepSummary.startTime && sleepSummary.endTime ? 
              calculateAverageHRV(hrvData, sleepSummary.startTime, sleepSummary.endTime) : 
              (hrvData.length ? Math.round(hrvData.reduce((sum, item) => sum + item.value, 0) / hrvData.length) : 0),
            lastNight5MinHigh: sleepSummary && sleepSummary.startTime && sleepSummary.endTime ? 
              findHighestHRV(hrvData, sleepSummary.startTime, sleepSummary.endTime) : 
              (hrvData.length ? Math.max(...hrvData.map(d => d.value)) : 0),
            status: 'Available',
            feedbackPhrase: ''
          },
          readings: sleepSummary && sleepSummary.startTime && sleepSummary.endTime ? 
            hrvData
              .filter(reading => {
                const readingTime = new Date(reading.startDate).getTime();
                const sleepStartTime = new Date(sleepSummary.startTime).getTime();
                const sleepEndTime = new Date(sleepSummary.endTime).getTime();
                return readingTime >= sleepStartTime && readingTime <= sleepEndTime;
              })
              .map(reading => ({
                time: reading.startDate,
                value: Math.round(reading.value)
              })) : 
            hrvData.map(reading => ({
              time: reading.startDate,
              value: Math.round(reading.value)
            }))
        },
        sleep: {
          summary: {
            total_sleep_seconds: sleepSummary?.totalSleep || 0,
            deep_sleep_seconds: sleepSummary?.deepSleep || 0,
            light_sleep_seconds: sleepSummary?.lightSleep || 0,
            rem_sleep_seconds: sleepSummary?.remSleep || 0,
            awake_seconds: sleepSummary?.awake || 0,
            sleep_start: sleepSummary?.startTime || '',
            sleep_end: sleepSummary?.endTime || '',
            sleep_score: 'N/A',
            average_hrv: sleepSummary && sleepSummary.startTime && sleepSummary.endTime ? 
              calculateAverageHRV(hrvData, sleepSummary.startTime, sleepSummary.endTime) : 
              (hrvData.length ? Math.round(hrvData.reduce((sum, item) => sum + item.value, 0) / hrvData.length) : 0),
            lowest_hrv: hrvData.length ? Math.min(...hrvData.map(d => d.value)) : 0,
            highest_hrv: hrvData.length ? Math.max(...hrvData.map(d => d.value)) : 0
          },
          phases: sleepSummary?.phases || []
        },
        activity: {
          steps: steps.value || 0,
          calories_burned: Math.round(calories.value) || 0,
          active_minutes: workouts.activeMinutes || 0,
          distance_km: (distance.value || 0) / 1000,
          floors_climbed: 0,
          active_time_seconds: (workouts.activeMinutes || 0) * 60,
          date: now.toISOString().split('T')[0],
          vo2_max: vo2Max.value || 0,
          vo2_max_status: vo2Max.status,
          vo2_max_date: vo2Max.date,
          daily_activities: workouts.activities || [],
          mindful_minutes: mindfulMinutes || 0
        },
        heart_rate: {
          resting_heart_rate: calculateRestingHeartRate(hrvData),
          hrv_heart_rate: calculateAverageHeartRate(hrvData),
          date: now.toISOString().split('T')[0]
        }
      });

      // Upload data inside the try block
      await uploadGarminData(garminData);
    } catch (error) {
      console.error("Error fetching health data:", error);
    } finally {
      setLoading(false);
    }
  };

  const uploadGarminData = async (garminData: GarminData) => {
    if (!db) {
      console.error('Firebase not initialized');
      Alert.alert('Error', 'Database connection not available');
      return;
    }

    const firestore = db as Firestore;

    try {
      // Get or create device ID
      const currentDeviceId = await getOrCreateDeviceId();

      // Add timestamp and format data for upload
      const dataToUpload = {
        ...garminData,
        timestamp: new Date(),
        deviceId: currentDeviceId,
        uploadDate: new Date().toISOString().split('T')[0]
      };

      // Upload to device-specific collection
      const deviceGarminRef = doc(firestore, `devices/${currentDeviceId}/garminData`, new Date().toISOString().split('T')[0]);
      await setDoc(deviceGarminRef, dataToUpload);

      // Upload to main collection for aggregated data
      const mainGarminRef = doc(collection(firestore, 'garminData'), `${currentDeviceId}_${new Date().toISOString().split('T')[0]}`);
      await setDoc(mainGarminRef, dataToUpload);

      
    } catch (error) {
      console.error("Error uploading Garmin data:", error);
      Alert.alert('Error', 'Failed to upload data to database');
      throw error;
    }
  };

  const fetchGarminData = async (storedEmail: string, storedPassword: string) => {
    setLoading(true);
    try {
      // Calculate yesterday's date
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const targetDate = yesterday.toISOString().split('T')[0];  // Format: YYYY-MM-DD
      
      
      
      const requestBody = { 
        email: storedEmail, 
        password: storedPassword, 
        date: targetDate 
      };
      
      
      const response = await fetch(`${API_URL}/all_data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Server response:', response.status, errorText);
        if (response.status === 401) {
          throw new Error(ERROR_MESSAGES.AUTH);
        } else if (response.status === 502) {
          throw new Error("Server is not responding. Please check if the backend server is running.");
        }
        throw new Error(`Server error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      
      // Save current data to preserve Apple HealthKit values if needed
      const currentData = {...garminData};
      
      // Make sure activity structure exists
      if (!data.activity) {
        data.activity = {
          steps: 0,
          calories_burned: 0,
          active_minutes: 0,
          distance_km: 0,
          floors_climbed: 0,
          active_time_seconds: 0,
          date: targetDate,
          vo2_max: 0,
          vo2_max_status: 'N/A',
          vo2_max_date: '',
          daily_activities: [],
          mindful_minutes: 0
        };
      }
      
      // If there are no real values from Garmin but we have Apple HealthKit data, preserve it
      if (currentData.activity) {
        // Check if Garmin data is zero/null but we have values from Apple
        if (data.activity.steps === 0 && currentData.activity.steps > 0) {
          
          data.activity.steps = currentData.activity.steps;
        }
        
        if (data.activity.calories_burned === 0 && currentData.activity.calories_burned > 0) {
          
          data.activity.calories_burned = currentData.activity.calories_burned;
        }
        
        if (data.activity.distance_km === 0 && currentData.activity.distance_km > 0) {
          
          data.activity.distance_km = currentData.activity.distance_km;
        }
        
        if (data.activity.mindful_minutes === 0 && currentData.activity.mindful_minutes > 0) {
          
          data.activity.mindful_minutes = currentData.activity.mindful_minutes;
        }
      } else if (!data.activity.mindful_minutes) {
        // Ensure mindful_minutes is at least initialized
        data.activity.mindful_minutes = 0;
      }
      
      setGarminData(data);
      await uploadGarminData(data);
    } catch (error) {
      console.error("Error fetching Garmin data:", error);
      if (error instanceof Error) {
        if (error.message.includes('Network request failed')) {
          Alert.alert(
            'Connection Error',
            'Unable to connect to the server. Please check your internet connection and try again.',
            [{ text: 'OK' }]
          );
        } else {
          Alert.alert('Error', error.message, [{ text: 'OK' }]);
        }
      } else {
        Alert.alert('Error', ERROR_MESSAGES.SERVER, [{ text: 'OK' }]);
      }
    } finally {
      setLoading(false);
    }
  };

  //check if credentials already exist
  const checkLogin = async () => {
    const storedEmail = await SecureStore.getItemAsync("garmin_email");
    const storedPassword = await SecureStore.getItemAsync("garmin_password");
    
    
    //check if credentials already exist
    if (!storedEmail || !storedPassword) {
      
      setGarminModalVisible(true);
    } 
    else {
      
      fetchGarminData(storedEmail, storedPassword);
    }
  };

  //login with new credentials
  const handleLogin = async () => {
    await SecureStore.setItemAsync("garmin_email", email);
    await SecureStore.setItemAsync("garmin_password", password);
    setGarminModalVisible(false);
    fetchGarminData(email, password);
  };

  useEffect(() => {
    initializeApp();
  }, []);

  useEffect(() => {
    if (dataSource && !isInitialized) {
      
      initializeApp();
    }
  }, [dataSource]);

  const initializeApp = async () => {
    setLoading(true);
    try {
      if (await SecureStore.getItemAsync('garmin_email') && await SecureStore.getItemAsync('garmin_password')) {
        setDataSource('garmin');
      }
      else {
        setDataSource('apple');
      }

      if (dataSource === 'apple' && Platform.OS === 'ios') {
        
        
        
        
        // Check platform first
        if (Platform.OS !== 'ios') {
          
        setHealthKitAvailable(false);
        return;
      }

      const permissions = {
        permissions: {
          read: [
              'HeartRateVariability',
              'HeartRate',
              'Steps',
              'SleepAnalysis',
              'ActiveEnergyBurned',
              'DistanceWalkingRunning',
              'Workout',
              'Vo2Max',
              'MindfulSession',
              'DateOfBirth',
              'BiologicalSex',
              'Height',
              'Weight'
            ],
            write: [],
          },
        };

        try {
          // First check if HealthKit is available on the device
          
          const isAvailable = await new Promise((resolve) => {
            if (typeof AppleHealthKit.isAvailable !== 'function') {
              console.error('isAvailable method not found on AppleHealthKit');
                            resolve(false);
              return;
            }
            
            AppleHealthKit.isAvailable((error: string, result: boolean) => {
              if (error) {
                console.error('Error checking HealthKit availability:', error);
                resolve(false);
                return;
              }
              
              resolve(result);
            });
          });

          if (!isAvailable) {
            
            setHealthKitAvailable(false);
            Alert.alert(
              'HealthKit Not Available',
              'Please check:\n\n1. You are using an iOS device\n2. Health app is installed\n3. Your device supports HealthKit\n4. You have granted permissions in Settings',
              [{ text: 'OK' }]
            );
            return;
          }

          // Set HealthKit as available since we confirmed it is
          await new Promise<void>((resolve) => {
            setHealthKitAvailable(true);
            // Use a short timeout to ensure state is updated
            setTimeout(resolve, 0);
          });

          
          // Then initialize HealthKit
      await new Promise<void>((resolve, reject) => {
            if (typeof AppleHealthKit.initHealthKit !== 'function') {
              console.error('initHealthKit method not found on AppleHealthKit');
                            setHealthKitAvailable(false);
              reject(new Error('HealthKit initialization method not available'));
              return;
            }

        AppleHealthKit.initHealthKit(permissions, (error: string) => {
          if (error) {
            console.error('Error initializing HealthKit:', error);
            setHealthKitAvailable(false);
            reject(new Error(error));
          } else {
            
            resolve();
          }
        });
      });

          // After successful initialization, check permissions
          
          await new Promise<void>((resolve, reject) => {
            if (typeof AppleHealthKit.getAuthStatus !== 'function') {
              console.error('getAuthStatus method not found on AppleHealthKit');
              setHealthKitAvailable(false);
              reject(new Error('HealthKit auth status method not available'));
      return;
    }

            AppleHealthKit.getAuthStatus(permissions, (error: string, result: any) => {
              if (error) {
                console.error('Error checking HealthKit permissions:', error);
                setHealthKitAvailable(false);
                reject(error);
              } else {
                                if (result.permissions.read) {
                  
                  // Use setTimeout to ensure state is updated before fetching
                  setTimeout(() => {
                    
                    fetchHRVData();
                  }, 100);
                } else {
                  
                  setHealthKitAvailable(false);
                  Alert.alert(
                    'Permissions Required',
                    'Please open your device Settings > Privacy > Health and grant all permissions for this app.',
                    [{ text: 'OK' }]
                  );
                }
                resolve();
              }
        });
      });

    } catch (error) {
          console.error('HealthKit setup error:', error);
          setHealthKitAvailable(false);
          Alert.alert(
            'HealthKit Error',
            'Error setting up HealthKit. Please ensure:\n\n1. Health app is installed\n2. Permissions are granted in Settings\n3. Your device supports HealthKit',
            [{ text: 'OK' }]
          );
        }
      } else if (dataSource === 'garmin') {
        await checkLogin();
        }
        
        setIsInitialized(true);
      } catch (error) {
        console.error('Initialization error:', error);
      setHealthKitAvailable(false);
        setInitError(error instanceof Error ? error.message : ERROR_MESSAGES.INIT);
      } finally {
        setLoading(false);
      }
    };

    // Update the handler functions to use the new modal system
    const handleSourceChange = async (newSource: 'apple' | 'garmin') => {
      
      
      setDataSource(newSource);
      
      if (newSource === 'garmin') {
        openModal('garmin');
      } else if (modalManager.activeModal === 'garmin') {
        // If we're switching away from garmin, close the modal
        closeModal('garmin');
      }
    };

    // Use the openModal functions we created earlier
   

    // Helper function to check Garmin credentials
    const checkGarminCredentials = async () => {
      const storedEmail = await SecureStore.getItemAsync("garmin_email");
      const storedPassword = await SecureStore.getItemAsync("garmin_password");
      
      
      if (storedEmail && storedPassword) {
        
        setGarminModalVisible(false);
        await fetchGarminData(storedEmail, storedPassword);
      }
    };
    
    // Helper function to update data source state
    const updateDataSourceState = (newSource: 'apple' | 'garmin') => {
      // Capture existing data before clearing
      const previousData = {...garminData};
      
      // If switching from Apple to Garmin, preserve activity data
      if (dataSource === 'apple' && newSource === 'garmin' && previousData.activity) {
        
        
        // Clear existing data but preserve activity metrics
        setGarminData({
          stress: null,
          hrv: null,
          sleep: null,
          activity: {
            // Keep existing activity values if available, otherwise use defaults
            steps: previousData.activity.steps || 0,
            calories_burned: previousData.activity.calories_burned || 0,
            active_minutes: previousData.activity.active_minutes || 0,
            distance_km: previousData.activity.distance_km || 0,
            floors_climbed: previousData.activity.floors_climbed || 0,
            active_time_seconds: previousData.activity.active_time_seconds || 0,
            date: new Date().toISOString().split('T')[0],
            vo2_max: previousData.activity.vo2_max || 0,
            vo2_max_status: previousData.activity.vo2_max_status || 'N/A',
            vo2_max_date: previousData.activity.vo2_max_date || '',
            daily_activities: previousData.activity.daily_activities || [],
            mindful_minutes: previousData.activity.mindful_minutes || 0
          },
          heart_rate: null
        });
      } else {
        // Normal reset for other switches
        setGarminData({
          stress: null,
          hrv: null,
          sleep: null,
          activity: {
            steps: 0,
            calories_burned: 0,
            active_minutes: 0,
            distance_km: 0,
            floors_climbed: 0,
            active_time_seconds: 0,
            date: new Date().toISOString().split('T')[0],
            vo2_max: 0,
            vo2_max_status: 'N/A',
            vo2_max_date: '',
            daily_activities: [],
            mindful_minutes: 0
          },
          heart_rate: null
        });
      }
    
      // Update data source
      setDataSource(newSource);
    };
    
    // Modify the handlePssButtonPress function to check if any modal is already open
    const handlePssButtonPress = () => {
      if (isModalTransitioning) {
        
        return;
      }

      setIsModalTransitioning(true);
      
      try {
        // Only proceed if no other modal is currently visible
        if (garminModalVisible) {
          setGarminModalVisible(false);
          // Wait for the current modal to close completely before opening a new one
          setTimeout(() => {
            setPssModalVisible(true);
          }, 300);
        } else if (personalInfoModalVisible) {
          setPersonalInfoModalVisible(false);
          setTimeout(() => {
            setPssModalVisible(true);
          }, 300);
        } else {
          // No other modal is open, can show directly
          setPssModalVisible(true);
        }
      } finally {
        // Reset the transitioning flag after a delay
        setTimeout(() => {
          setIsModalTransitioning(false);
        }, 500);
      }
    };

    // Modify the handlePersonalInfoButtonPress function similarly
    const handlePersonalInfoButtonPress = () => {
      if (isModalTransitioning) {
        
        return;
      }

      try {
        // Only proceed if no other modal is currently visible
        if (garminModalVisible) {
          setGarminModalVisible(false);
          // Wait for the current modal to close completely before opening a new one
          setTimeout(() => {
            setPersonalInfoModalVisible(true);
          }, 300);
        } else if (pssModalVisible) {
          setPssModalVisible(false);
          setTimeout(() => {
            setPersonalInfoModalVisible(true);
          }, 300);
        } else {
          // No other modal is open, can show directly
          setPersonalInfoModalVisible(true);
        }
      } finally {
        // Reset the transitioning flag after a delay
        setTimeout(() => {
          setIsModalTransitioning(false);
        }, 500);
      }
    };

  // Data Source Selection Modal
  const DataSourceSelectionModal = () => (
    <Modal
      animationType="slide"
      transparent={true}
      visible={sourceSelectionVisible}
      onRequestClose={() => {}}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Wählen Sie Ihre Datenquelle</Text>
          <View style={styles.sourceButtonContainer}>
            {Platform.OS === 'ios' && (
              <TouchableOpacity
                style={[styles.button, styles.appleButton]}
                onPress={() => {
                  setDataSource('apple');
                  setSourceSelectionVisible(false);
                }}
              >
                <Text style={styles.buttonText}>Apple Watch</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.button, styles.garminButton]}
              onPress={() => {
                setSourceSelectionVisible(false);
                handleSourceChange('garmin');
              }}
            >
              <Text style={styles.buttonText}>Garmin</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  if (!isInitialized) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#0000ff" />
        {initError && (
          <Text style={styles.errorText}>{initError}</Text>
        )}
      </View>
    );
  }

 

  const handleResponseChange = (value: number, index: number) => {
    const newResponses = [...responses];
    newResponses[index] = value;
    setResponses(newResponses);
  };

  const submitSurvey = async () => {
    if (!db) {
      console.error('Firebase not initialized');
      Alert.alert('Error', 'Database connection not available');
      return;
    }

    const firestore = db as Firestore;

    try {
      if (responses.some(response => response === 0)) {
        alert("Bitte beantworten Sie alle Fragen");
        return;
      }

      // Get or create device ID
      const currentDeviceId = await getOrCreateDeviceId();

      const surveyData = {
        responses,
        timestamp: new Date(),
        deviceId: currentDeviceId,
        stressData: stressData ? {
          hrv: stressData.hrv,
          timestamp: stressData.timestamp,
          source: healthKitAvailable ? "HealthKit" : "Garmin"
        } : null
      };

      const surveyCollection = collection(firestore, "pss_surveys");
      await addDoc(surveyCollection, surveyData);
      
      alert("Umfrage erfolgreich gesendet!");
      setResponses([0, 0, 0]);
      setPssModalVisible(false);
    } catch (error) {
      console.error("Fehler beim Senden der Umfrage:", error);
      alert("Fehler beim Senden der Umfrage. Bitte versuchen Sie es später erneut.");
    }
  };

  const submitPersonalInfo = async (dataToSubmit = personalInfo) => {
    
    
    

    const firestore = db as Firestore;

    try {
      // Enhanced validation with more debugging information
      if (!dataToSubmit.age || dataToSubmit.age === null || dataToSubmit.age === undefined) {
        console.error("Age validation failed. Age is:", dataToSubmit.age);
        Alert.alert("Fehler", "Bitte füllen Sie mindestens Alter und Geschlecht aus");
        return false;
      }
      
      if (!dataToSubmit.gender || dataToSubmit.gender === "" || dataToSubmit.gender === null) {
        console.error("Gender validation failed. Gender is:", dataToSubmit.gender);
        Alert.alert("Fehler", "Bitte füllen Sie mindestens Alter und Geschlecht aus");
        return false;
      }

      // Get or create device ID
      const currentDeviceId = await getOrCreateDeviceId();

      // Prepare data object with explicit type conversions where needed
      const finalData = {
        ...dataToSubmit,
        age: typeof dataToSubmit.age === 'string' ? parseInt(dataToSubmit.age, 10) : dataToSubmit.age,
        gender: String(dataToSubmit.gender),
        timestamp: new Date(),
        deviceId: currentDeviceId
      };
      
      

      const personalInfoCollection = collection(firestore, "personal_info");
      await addDoc(personalInfoCollection, finalData);

      Alert.alert("Erfolg", "Persönliche Informationen erfolgreich gespeichert!");
      
      // Only reset the form data if we're submitting the main state
      if (dataToSubmit === personalInfo) {
        setPersonalInfo({
          age: null as number | null,
          gender: "" as string,
          height: null as number | null,
          weight: null as number | null,
          fitness_level: null as number | null,
          stress_level: null as number | null,
          sleep_quality: null as number | null,
          pre_existing_conditions: "" as string,
          allergies: "" as string,
          smoker: "" as string,
          alcohol_consumption: "" as string,
        });
      }
      
      // Return success - modal visibility handled by caller
      return true;
    } catch (error) {
      console.error("Fehler beim Speichern der persönlichen Informationen:", error);
      Alert.alert("Fehler", "Es gab ein Problem beim Speichern der Daten.");
      return false;
    }
  };

  const formatDuration = (seconds: number) => {
    if (!seconds) return 'N/A';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  // Update the autoFillPersonalInfo function to return data instead of updating state directly
  const autoFillPersonalInfo = async () => {
    
    
    try {
      // Create a copy of the current personalInfo to update
      const updatedInfo = { ...personalInfo };
      let updatesMade = false;
      
      if (dataSource === 'garmin') {
        
        
        // Check if we have Garmin data
        if (garminData && Object.keys(garminData).length > 0) {
          // ... existing Garmin data filling logic ...
        }
      } else if (dataSource === 'apple') {
        // ... existing Apple Health data filling logic ...
      }
      
      // Return the updated info rather than setting state
      return updatedInfo;
    } catch (error) {
      console.error("Error in autoFillPersonalInfo:", error);
      throw error;
    }
  };

  // Helper function to format numeric values safely
  const formatNumber = (value: any): string => {
    const num = parseFloat(value);
    return !isNaN(num) ? num.toString() : "";
  };

  // Update the PersonalInfoModal to handle NaN values
  const PersonalInfoModal = () => {
    const [localModalVisible, setLocalModalVisible] = useState(true);
    const [isAutoFilling, setIsAutoFilling] = useState(false);
    
    // Gender selection - moved to top level for better visibility
    const [showGenderOptions, setShowGenderOptions] = useState(false);
    const genderOptions = [
      { label: "Männlich", value: "male" },
      { label: "Weiblich", value: "female" },
      { label: "Divers", value: "diverse" }
    ];
    
    // Smoker selection
    const [showSmokerOptions, setShowSmokerOptions] = useState(false);
    const smokerOptions = [
      { label: "Ja", value: "yes" },
      { label: "Nein", value: "no" },
      { label: "Gelegentlich", value: "occasional" }
    ];
    
    // Alcohol consumption selection
    const [showAlcoholOptions, setShowAlcoholOptions] = useState(false);
    const alcoholOptions = [
      { label: "Nie", value: "never" },
      { label: "Selten", value: "rarely" },
      { label: "Gelegentlich", value: "occasionally" },
      { label: "Regelmäßig", value: "regularly" },
      { label: "Täglich", value: "daily" }
    ];
    
    // Store local copies of relevant fields with direct initialization
    const [localPersonalInfo, setLocalPersonalInfo] = useState(() => {
      console.log("🔄 Initializing localPersonalInfo:", {
        fitness_level: personalInfo.fitness_level,
        stress_level: personalInfo.stress_level,
        sleep_quality: personalInfo.sleep_quality
      });
      return personalInfo;
    });
    
    // Update local copy when personalInfo changes from outside
    useEffect(() => {
      console.log("🔄 personalInfo changed, updating localPersonalInfo:", {
        fitness_level: personalInfo.fitness_level,
        stress_level: personalInfo.stress_level,
        sleep_quality: personalInfo.sleep_quality
      });
      setLocalPersonalInfo({...personalInfo});
    }, [personalInfo]);
    
    // Separate effect specifically for gender changes
    useEffect(() => {
      
    }, [localPersonalInfo.gender]);
    
    // Separate state just for gender to avoid re-render issues
    const [selectedGender, setSelectedGender] = useState(localPersonalInfo.gender || null);
    const [selectedSmoker, setSelectedSmoker] = useState(localPersonalInfo.smoker || null);
    const [selectedAlcohol, setSelectedAlcohol] = useState(localPersonalInfo.alcohol_consumption || null);
    
    // Keep selectedGender in sync with localPersonalInfo
    useEffect(() => {
      if (localPersonalInfo.gender !== selectedGender) {
        
        setSelectedGender(localPersonalInfo.gender || null);
      }
      
      if (localPersonalInfo.smoker !== selectedSmoker) {
        
        setSelectedSmoker(localPersonalInfo.smoker || null);
      }
      
      if (localPersonalInfo.alcohol_consumption !== selectedAlcohol) {
        
        setSelectedAlcohol(localPersonalInfo.alcohol_consumption || null);
      }
    }, [localPersonalInfo, selectedGender, selectedSmoker, selectedAlcohol]);
    
    // Handle gender selection
    const handleGenderSelect = (value) => {
      
      setSelectedGender(value);
      setLocalPersonalInfo(prev => ({...prev, gender: value}));
      setShowGenderOptions(false);
    };
    
    // Handle smoker selection
    const handleSmokerSelect = (value) => {
      
      setSelectedSmoker(value);
      setLocalPersonalInfo(prev => ({...prev, smoker: value}));
      setShowSmokerOptions(false);
    };
    
    // Handle alcohol selection
    const handleAlcoholSelect = (value) => {
      
      setSelectedAlcohol(value);
      setLocalPersonalInfo(prev => ({...prev, alcohol_consumption: value}));
      setShowAlcoholOptions(false);
    };

    const handleCloseModal = () => {
      
      
      // Directly close the modal by updating both local and parent state
      setLocalModalVisible(false);
      setPersonalInfoModalVisible(false);
      
      // Ensure the modal manager is updated
      if (modalManager && typeof closeModal === 'function') {
        closeModal('personal');
      } else {
        
        setActiveModal(null);
      }
      
      
    };

    const handleSubmit = async () => {
      
      
      
      // Basic validation
      if (!localPersonalInfo.age || !localPersonalInfo.gender) {
        
        Alert.alert('Fehler', 'Bitte geben Sie mindestens Alter und Geschlecht an.');
        return; // Return early without closing the modal
      }

      // Log all values for debugging
      
      
      
      
      try {
        // Submit the data directly with local state, don't update global state first
        const success = await submitPersonalInfo(localPersonalInfo);
        
        // Only update global state and close modal if submission was successful
        if (success) {
          
          setPersonalInfo({...localPersonalInfo});
          
          // Close the modal with proper animation
          handleCloseModal();
        } else {
          
        }
      } catch (error) {
        console.error("Error during submission:", error);
        Alert.alert('Fehler', 'Es gab ein Problem beim Speichern. Bitte versuchen Sie es erneut.');
      }
    };

    // Fix the auto-fill function to correctly access Garmin data structure
    const handleAutoFill = async () => {
      // Prevent multiple auto-fill attempts
      if (isAutoFilling) return;
      
      // Set loading state
      setIsAutoFilling(true);
      console.log("🔄 Starting auto-fill process with source:", dataSource);
      
      try {
        if (dataSource === 'garmin') {
          // Existing Garmin code...
          // ... existing code ...
        } else if (dataSource === 'apple' && healthKitAvailable) {
          console.log("🍎 Using Apple HealthKit for auto-fill");
          
          // Create a copy of the local state to work with
          const updatedInfo = { ...localPersonalInfo };
          let updatesMade = false;
          
          try {
            // Get 3 months of health data for calculating metrics
            const threeMonthsAgo = new Date();
            threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
            
            const options = {
              startDate: threeMonthsAgo.toISOString(),
              endDate: new Date().toISOString(),
            };
            
            console.log("📆 Date range:", threeMonthsAgo.toISOString(), "to", new Date().toISOString());
            
            // Fetch sleep data for last 3 months
            const sleepSamples = await new Promise<any[]>((resolve, reject) => {
              if (typeof AppleHealthKit.getSleepSamples !== 'function') {
                console.error("❌ getSleepSamples function not available");
                resolve([]);
                return;
              }
              
              console.log("💤 Fetching sleep samples...");
              
              AppleHealthKit.getSleepSamples(
                {
                  ...options,
                  type: 'SleepAnalysis',
                  includeStages: true
                },
                (err: string | null, results: any[]) => {
                  if (err) {
                    console.error('❌ Error fetching sleep:', err);
                    resolve([]);
                  } else if (Array.isArray(results)) {
                    console.log(`💤 Got ${results.length} sleep samples`);
                    if (results.length > 0) {
                      // Log first and last day
                      const firstDay = new Date(results[0].startDate).toISOString().split('T')[0];
                      const lastDay = new Date(results[results.length-1].endDate).toISOString().split('T')[0];
                      console.log(`💤 Sleep data from ${firstDay} to ${lastDay}`);
                      
                      // Count unique days with sleep data
                      const uniqueDays = new Set(
                        results.map(item => new Date(item.startDate).toISOString().split('T')[0])
                      );
                      console.log(`💤 Data from ${uniqueDays.size} unique days`);
                    }
                    resolve(results);
                  } else {
                    console.error("❌ Sleep samples not an array:", results);
                    resolve([]);
                  }
                }
              );
            });
            
            // Rest of the data fetching code...
            // ... existing code ...
            
            // Initialize with proper structures
            let vo2MaxResults = { value: 0 };
            let workoutResults = { activeMinutes: 0, activities: [] };
            let distanceResult = { value: 0 };
            let hrvData = [];
            let totalMindfulMinutes = 0;
            
            // Fetch all required health data
            try {
              // 1. Fetch VO2 max data for fitness level calculation
              console.log("🫁 Fetching VO2 max data...");
              vo2MaxResults = await new Promise<any>((resolve, reject) => {
                if (typeof AppleHealthKit.getVo2MaxSamples !== 'function') {
                  console.error("❌ getVo2MaxSamples function not available");
                  resolve({ value: 0 });
                  return;
                }
                
                AppleHealthKit.getVo2MaxSamples(
                  {
                    unit: 'mL/(kg*min)',
                    ascending: false,
                    limit: 10,
                    startDate: options.startDate,
                    endDate: options.endDate
                  },
                  (err, results) => {
                    if (err) {
                      console.error('❌ Error fetching VO2 max:', err);
                      resolve({ value: 0 });
                    } else if (Array.isArray(results) && results.length > 0) {
                      console.log(`🫁 Got ${results.length} VO2 max samples`);
                      // Get the most recent result
                      const latestResult = results[0];
                      console.log(`🫁 Latest VO2 max: ${latestResult.value}`);
                      resolve(latestResult);
                    } else {
                      console.log("❌ No VO2 max data available");
                      resolve({ value: 0 });
                    }
                  }
                );
              });
              
              // 2. Fetch workout data
              console.log("🏃‍♂️ Fetching workout data...");
              const workoutData = await new Promise<any>((resolve, reject) => {
                if (typeof AppleHealthKit.getAnchoredWorkouts !== 'function') {
                  console.error("❌ getAnchoredWorkouts function not available");
                  resolve({ activeMinutes: 0, activities: [] });
                  return;
                }
                
                AppleHealthKit.getAnchoredWorkouts(
                  {
                    startDate: options.startDate,
                    endDate: options.endDate,
                    type: 'Workout'
                  },
                  (err, results) => {
                    if (err) {
                      console.error('❌ Error fetching workouts:', err);
                      resolve({ activeMinutes: 0, activities: [] });
                    } else if (results && Array.isArray(results.data) && results.data.length > 0) {
                      console.log(`🏃‍♂️ Got ${results.data.length} workouts`);
                      
                      // Convert workout data to activities format
                      const activities = results.data.map((workout: any) => ({
                        type: workout.activityName || 'Unknown Activity',
                        duration_minutes: Math.round((workout.duration || 0) / 60)
                      }));
                      
                      // Calculate total active minutes
                      const totalActiveMinutes = activities.reduce((total: number, activity: any) => 
                        total + activity.duration_minutes, 0);
                      
                      console.log(`🏃‍♂️ Total active minutes: ${totalActiveMinutes}`);
                      
                      resolve({
                        activeMinutes: totalActiveMinutes,
                        activities: activities
                      });
                    } else {
                      console.log("❌ No workout data available");
                      resolve({ activeMinutes: 0, activities: [] });
                    }
                  }
                );
              });
              workoutResults = workoutData;
              
              // 3. Fetch distance data
              console.log("🏃‍♂️ Fetching distance data...");
              distanceResult = await new Promise<any>((resolve, reject) => {
                if (typeof AppleHealthKit.getDailyDistanceWalkingRunningSamples !== 'function') {
                  console.error("❌ getDailyDistanceWalkingRunningSamples function not available");
                  resolve({ value: 0 });
                  return;
                }
                
                AppleHealthKit.getDailyDistanceWalkingRunningSamples(
                  {
                    startDate: options.startDate,
                    endDate: options.endDate,
                    unit: 'km',
                    ascending: false
                  },
                  (err, results) => {
                    if (err) {
                      console.error('❌ Error fetching distance samples:', err);
                      resolve({ value: 0 });
                    } else if (Array.isArray(results) && results.length > 0) {
                      // Sum up all distance values in the array
                      const totalDistance = results.reduce((sum, item) => 
                        sum + (item.value || 0), 0) / 1000; // Convert from meters to kilometers
                      console.log(`🏃‍♂️ Total distance from ${results.length} daily samples: ${totalDistance} km`);
                      resolve({ value: totalDistance });
                    } else {
                      console.log("❌ No distance data available in the specified period");
                      resolve({ value: 0 });
                    }
                  }
                );
              });
              
              // 4. Fetch HRV data
              console.log("❤️ Fetching HRV data...");
              hrvData = await new Promise<any[]>((resolve, reject) => {
                if (typeof AppleHealthKit.getHeartRateVariabilitySamples !== 'function') {
                  console.error("❌ getHeartRateVariabilitySamples function not available");
                  resolve([]);
                  return;
                }
                
                AppleHealthKit.getHeartRateVariabilitySamples(
                  {
                    startDate: options.startDate,
                    endDate: options.endDate
                  },
                  (err, results) => {
                    if (err) {
                      console.error('❌ Error fetching HRV data:', err);
                      resolve([]);
                    } else if (Array.isArray(results) && results.length > 0) {
                      console.log(`❤️ Got ${results.length} HRV samples`);
                      resolve(results);
                    } else {
                      console.log("❌ No HRV data available");
                      resolve([]);
                    }
                  }
                );
              });
              
              // 5. Fetch mindfulness data
              console.log("🧘‍♂️ Fetching mindfulness data...");
              const mindfulnessData = await new Promise<any[]>((resolve, reject) => {
                if (typeof AppleHealthKit.getMindfulSession !== 'function') {
                  console.error("❌ getMindfulSession function not available");
                  resolve([]);
                  return;
                }
                
                AppleHealthKit.getMindfulSession(
                  {
                    startDate: options.startDate,
                    endDate: options.endDate,
                    type: 'MindfulSession'
                  },
                  (err, results) => {
                    if (err) {
                      console.error('❌ Error fetching mindfulness data:', err);
                      resolve([]);
                    } else if (Array.isArray(results) && results.length > 0) {
                      console.log(`🧘‍♂️ Got ${results.length} mindfulness sessions`);
                      resolve(results);
                    } else {
                      console.log("❌ No mindfulness data available");
                      resolve([]);
                    }
                  }
                );
              });
              
              // Calculate total mindful minutes
              if (Array.isArray(mindfulnessData) && mindfulnessData.length > 0) {
                totalMindfulMinutes = mindfulnessData.reduce((total, session) => {
                  if (session.startDate && session.endDate) {
                    const startTime = new Date(session.startDate).getTime();
                    const endTime = new Date(session.endDate).getTime();
                    const durationMinutes = (endTime - startTime) / (1000 * 60);
                    return total + durationMinutes;
                  }
                  return total;
                }, 0);
                console.log(`🧘‍♂️ Total mindful minutes: ${totalMindfulMinutes}`);
              }
              
              // 6. Fetch steps data
              console.log("👣 Fetching steps data...");
              const stepsResult = await new Promise<any>((resolve, reject) => {
                if (typeof AppleHealthKit.getDailyStepCountSamples !== 'function') {
                  console.error("❌ getDailyStepCountSamples function not available");
                  resolve({ value: 0 });
                  return;
                }
                
                AppleHealthKit.getDailyStepCountSamples(
                  {
                    startDate: options.startDate,
                    endDate: options.endDate,
                    includeManuallyAdded: true,
                  },
                  (err, results) => {
                    if (err) {
                      console.error('❌ Error fetching steps:', err);
                      resolve({ value: 0 });
                    } else if (Array.isArray(results) && results.length > 0) {
                      const totalSteps = results.reduce((sum, item) => 
                        sum + (item.value || 0), 0);
                      console.log(`👣 Total steps from ${results.length} daily samples: ${totalSteps}`);
                      resolve({ value: totalSteps });
                    } else {
                      console.log("❌ No steps data available in the specified period");
                      resolve({ value: 0 });
                    }
                  }
                );
              });
              
              // 7. Fetch calories data
              console.log("🔥 Fetching calories data...");
              const caloriesResult = await new Promise<any>((resolve, reject) => {
                if (typeof AppleHealthKit.getActiveEnergyBurned !== 'function') {
                  console.error("❌ getActiveEnergyBurned function not available");
                  resolve({ value: 0 });
                  return;
                }
                
                AppleHealthKit.getActiveEnergyBurned(
                  {
                    startDate: options.startDate,
                    endDate: options.endDate,
                    includeManuallyAdded: true,
                  },
                  (err, results) => {
                    if (err) {
                      console.error('❌ Error fetching calories:', err);
                      resolve({ value: 0 });
                    } else if (Array.isArray(results) && results.length > 0) {
                      const totalCalories = results.reduce((sum, item) => 
                        sum + (item.value || 0), 0);
                      console.log(`🔥 Total calories from ${results.length} daily samples: ${totalCalories}`);
                      resolve({ value: totalCalories });
                    } else {
                      console.log("❌ No calories data available in the specified period");
                      resolve({ value: 0 });
                    }
                  }
                );
              });
              
              // Log data status before calculations
              console.log("📊 Pre-calculation data check:", {
                "vo2Max": vo2MaxResults?.value || 0,
                "workouts.activeMinutes": workoutResults?.activeMinutes || 0,
                "distance.value": distanceResult?.value || 0,
                "hrvData.length": hrvData?.length || 0,
                "totalMindfulMinutes": totalMindfulMinutes || 0,
                "steps": stepsResult?.value || 0,
                "calories": caloriesResult?.value || 0
              });
            } catch (error) {
              console.error("❌ Error fetching health data:", error);
            }
            
            // Calculate fitness level (1-10 scale)
            const vo2MaxValue = vo2MaxResults?.value || 0;
            const fitnessLevel = calculateFitnessLevel(vo2MaxValue, workoutResults, distanceResult);
            console.log(`📊 Final fitness_level calculated: ${fitnessLevel}`);
            updatedInfo.fitness_level = fitnessLevel;
            
            // Calculate stress level (1-10 scale)
            const stressLevel = calculateStressLevel(hrvData, totalMindfulMinutes, sleepSamples);
            console.log(`📊 Final stress_level calculated: ${stressLevel}`);
            updatedInfo.stress_level = stressLevel;
            
            // Calculate sleep quality (1-10 scale)
            const sleepQuality = calculateSleepQuality(sleepSamples);
            console.log(`📊 Final sleep_quality calculated: ${sleepQuality}`);
            updatedInfo.sleep_quality = sleepQuality;
            
            // Make sure the values are not null by using the ensureHealthMetrics function
            const healthMetrics = ensureHealthMetrics({
              fitness_level: updatedInfo.fitness_level,
              stress_level: updatedInfo.stress_level,
              sleep_quality: updatedInfo.sleep_quality
            });
            
            // Apply the ensured values
            updatedInfo.fitness_level = healthMetrics.fitness_level;
            updatedInfo.stress_level = healthMetrics.stress_level;
            updatedInfo.sleep_quality = healthMetrics.sleep_quality;
            
            console.log("🔄 Final values to be set:", {
              fitness_level: updatedInfo.fitness_level,
              stress_level: updatedInfo.stress_level,
              sleep_quality: updatedInfo.sleep_quality
            });
            
            // Update if we calculated any metrics
            if (fitnessLevel || stressLevel || sleepQuality) {
              console.log(`✅ At least one metric was calculated successfully`);
              updatesMade = true;
            } else {
              console.log(`⚠️ No metrics could be calculated`);
            }
            
            if (updatesMade) {
              // Update LOCAL state in the modal (not global state)
              console.log("🔄 Updating localPersonalInfo with calculated metrics");
              setLocalPersonalInfo(updatedInfo);
              
              // Force UI refresh
              console.log("🔄 Forcing UI refresh");
              setTimeout(() => {
                // This is a trick to force re-render of inputs
                setLocalPersonalInfo(prev => ({...prev}));
              }, 100);
            } else {
              Alert.alert('Info', 'Keine Daten für die automatische Befüllung verfügbar');
            }
          } catch (error) {
            console.error("❌ Error in HealthKit auto-fill:", error);
            Alert.alert('Fehler', 'Problem beim Abfragen der HealthKit-Daten: ' + (error instanceof Error ? error.message : String(error)));
          }
        } else {
          console.warn("⚠️ No valid data source selected or HealthKit not available");
          Alert.alert('Info', 'Bitte wählen Sie zuerst eine Datenquelle aus (Apple Health oder Garmin)');
        }
      } catch (error: any) {
        console.error("❌ Auto-fill error:", error);
        Alert.alert('Fehler', 'Es gab ein Problem beim automatischen Ausfüllen: ' + error.message);
      } finally {
        // Reset loading state
        setIsAutoFilling(false);
      }
    };

    // Add a direct close handler for the Cancel button
    const handleCancel = () => {
      
      
      // Use direct approach to ensure modal closes
      setLocalModalVisible(false);
      setPersonalInfoModalVisible(false);
      
      if (typeof setActiveModal === 'function') {
        setActiveModal(null);
      }
      
      
    };

    return (
      <Modal
        animationType="slide"
        transparent={true}
        visible={personalInfoModalVisible && localModalVisible}
        onRequestClose={() => {
          
          setLocalModalVisible(false);
          setPersonalInfoModalVisible(false);
          if (typeof setActiveModal === 'function') {
            setActiveModal(null);
          }
        }}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Persönliche Informationen</Text>
              <TouchableOpacity onPress={handleCloseModal}>
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>
              <View style={styles.buttonContainer}>
                <TouchableOpacity
                  style={[styles.button, styles.submitButton]}
                  onPress={handleAutoFill}
                  disabled={isAutoFilling}
                >
                  <Text style={styles.buttonText}>
                    {isAutoFilling ? 'Lade Daten...' : 'Automatisch ausfüllen'}
                  </Text>
                </TouchableOpacity>
              </View>
            
            <ScrollView style={styles.modalFormContainer}>
              <View style={styles.formGroup}>
                <Text style={styles.label}>Alter</Text>
                <TextInput
                  style={styles.input}
                  value={localPersonalInfo.age ? String(localPersonalInfo.age) : ''}
                  onChangeText={(text) => {
                    const age = text === '' ? null : parseInt(text);
                    setLocalPersonalInfo(prev => ({...prev, age}));
                  }}
                  placeholder="Alter"
                  keyboardType="number-pad"
                  returnKeyType="done"
                  blurOnSubmit={true}
                />
              </View>
              
              <View style={styles.formGroup}>
                <Text style={styles.label}>Geschlecht</Text>
                <TouchableOpacity 
                  key={`gender-dropdown-${selectedGender || 'unselected'}`}
                  style={[
                    styles.dropdownButton,
                    localPersonalInfo.gender ? styles.dropdownButtonSelected : {}
                  ]}
                  onPress={() => setShowGenderOptions(!showGenderOptions)}
                >
                  <View style={styles.dropdownContent}>
                    <Text style={styles.dropdownArrow}>{showGenderOptions ? '▲' : '▼'}</Text>
                    <Text style={[
                      styles.dropdownButtonText,
                      selectedGender ? styles.dropdownButtonTextSelected : {}
                    ]}>
                      {selectedGender ? 
                        genderOptions.find(option => option.value === selectedGender)?.label || 'Bitte wählen' : 
                        'Bitte wählen'}
                    </Text>
                  </View>
                </TouchableOpacity>
                
                {showGenderOptions && (
                  <View style={styles.optionsList}>
                    {genderOptions.map((option) => (
                      <TouchableOpacity
                        key={option.value}
                        style={[
                          styles.optionItem,
                          selectedGender === option.value ? styles.selectedOption : {}
                        ]}
                        onPress={() => handleGenderSelect(option.value)}
                      >
                        <Text style={[
                          styles.optionText,
                          selectedGender === option.value ? styles.selectedOptionText : {}
                        ]}>
                          {option.label}
                          {selectedGender === option.value && ' ✓'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
              
              <View style={styles.formGroup}>
                <Text style={styles.label}>Größe (cm)</Text>
                <TextInput
                  style={styles.input}
                  value={localPersonalInfo.height ? String(localPersonalInfo.height) : ''}
                  onChangeText={(text) => {
                    const height = text === '' ? null : parseInt(text);
                    setLocalPersonalInfo(prev => ({...prev, height}));
                  }}
                  placeholder="Größe in cm"
                  keyboardType="number-pad"
                  returnKeyType="done"
                  blurOnSubmit={true}
                />
              </View>
              
              <View style={styles.formGroup}>
                <Text style={styles.label}>Gewicht (kg)</Text>
                <TextInput
                  style={styles.input}
                  value={localPersonalInfo.weight ? String(localPersonalInfo.weight) : ''}
                  onChangeText={(text) => {
                    const weight = text === '' ? null : parseFloat(text);
                    setLocalPersonalInfo(prev => ({...prev, weight}));
                  }}
                  placeholder="Gewicht in kg"
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  blurOnSubmit={true}
                />
              </View>
              
              <View style={styles.formGroup}>
                <Text style={styles.label}>Fitness-Level (1-10)</Text>
                <TextInput
                  style={styles.input}
                  value={(() => {
                    const val = localPersonalInfo.fitness_level ? String(localPersonalInfo.fitness_level) : '';
                    console.log(`📊 Rendering fitness_level TextInput with value: '${val}' (type: ${typeof localPersonalInfo.fitness_level}, raw: ${localPersonalInfo.fitness_level})`);
                    return val;
                  })()}
                  onChangeText={(text) => {
                    const fitnessLevel = text === '' ? null : parseInt(text);
                    console.log(`✏️ User entered fitness_level: ${text} (parsed to: ${fitnessLevel})`);
                    setLocalPersonalInfo(prev => ({...prev, fitness_level: fitnessLevel}));
                  }}
                  placeholder="Fitness-Level (1-10)"
                  keyboardType="number-pad"
                  returnKeyType="done"
                  blurOnSubmit={true}
                />
              </View>
              
              <View style={styles.formGroup}>
                <Text style={styles.label}>Stress-Level (1-10)</Text>
                <TextInput
                  style={styles.input}
                  value={localPersonalInfo.stress_level ? String(localPersonalInfo.stress_level) : ''}
                  onChangeText={(text) => {
                    const stressLevel = text === '' ? null : parseInt(text);
                    setLocalPersonalInfo(prev => ({...prev, stress_level: stressLevel}));
                  }}
                  placeholder="Stress-Level (1-10)"
                  keyboardType="number-pad"
                  returnKeyType="done"
                  blurOnSubmit={true}
                />
              </View>
              
              <View style={styles.formGroup}>
                <Text style={styles.label}>Schlafqualität (1-10)</Text>
                <TextInput
                  style={styles.input}
                  value={localPersonalInfo.sleep_quality ? String(localPersonalInfo.sleep_quality) : ''}
                  onChangeText={(text) => {
                    const sleepQuality = text === '' ? null : parseInt(text);
                    setLocalPersonalInfo(prev => ({...prev, sleep_quality: sleepQuality}));
                  }}
                  placeholder="Schlafqualität (1-10)"
                  keyboardType="number-pad"
                  returnKeyType="done"
                  blurOnSubmit={true}
                />
              </View>
              
              <View style={styles.formGroup}>
                <Text style={styles.label}>Vorerkrankungen</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={localPersonalInfo.pre_existing_conditions}
                  onChangeText={(text) => setLocalPersonalInfo({...localPersonalInfo, pre_existing_conditions: text})}
                  placeholder="Vorerkrankungen"
                  multiline={true}
                  numberOfLines={3}
                  blurOnSubmit={true}
                />
              </View>
              
              <View style={styles.formGroup}>
                <Text style={styles.label}>Allergien</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={localPersonalInfo.allergies}
                  onChangeText={(text) => setLocalPersonalInfo({...localPersonalInfo, allergies: text})}
                  placeholder="Allergien"
                  multiline={true}
                  numberOfLines={3}
                  blurOnSubmit={true}
                />
              </View>
              
              <View style={styles.formGroup}>
                <Text style={styles.label}>Raucher</Text>
                <TouchableOpacity 
                  style={[
                    styles.dropdownButton,
                    selectedSmoker ? styles.dropdownButtonSelected : {}
                  ]}
                  onPress={() => setShowSmokerOptions(!showSmokerOptions)}
                >
                  <View style={styles.dropdownContent}>
                    <Text style={styles.dropdownArrow}>{showSmokerOptions ? '▲' : '▼'}</Text>
                    <Text style={[
                      styles.dropdownButtonText,
                      selectedSmoker ? styles.dropdownButtonTextSelected : {}
                    ]}>
                      {selectedSmoker ? 
                        smokerOptions.find(option => option.value === selectedSmoker)?.label || 'Bitte wählen' : 
                        'Bitte wählen'}
                    </Text>
                  </View>
                </TouchableOpacity>
                
                {showSmokerOptions && (
                  <View style={styles.optionsList}>
                    {smokerOptions.map((option) => (
                      <TouchableOpacity
                        key={option.value}
                        style={[
                          styles.optionItem,
                          selectedSmoker === option.value ? styles.selectedOption : {}
                        ]}
                        onPress={() => handleSmokerSelect(option.value)}
                      >
                        <Text style={[
                          styles.optionText,
                          selectedSmoker === option.value ? styles.selectedOptionText : {}
                        ]}>
                          {option.label}
                          {selectedSmoker === option.value && ' ✓'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
              
              <View style={styles.formGroup}>
                <Text style={styles.label}>Alkoholkonsum</Text>
                <TouchableOpacity 
                  style={[
                    styles.dropdownButton,
                    selectedAlcohol ? styles.dropdownButtonSelected : {}
                  ]}
                  onPress={() => setShowAlcoholOptions(!showAlcoholOptions)}
                >
                  <View style={styles.dropdownContent}>
                    <Text style={styles.dropdownArrow}>{showAlcoholOptions ? '▲' : '▼'}</Text>
                    <Text style={[
                      styles.dropdownButtonText,
                      selectedAlcohol ? styles.dropdownButtonTextSelected : {}
                    ]}>
                      {selectedAlcohol ? 
                        alcoholOptions.find(option => option.value === selectedAlcohol)?.label || 'Bitte wählen' : 
                        'Bitte wählen'}
                    </Text>
                  </View>
                </TouchableOpacity>
                
                {showAlcoholOptions && (
                  <View style={styles.optionsList}>
                    {alcoholOptions.map((option) => (
                      <TouchableOpacity
                        key={option.value}
                        style={[
                          styles.optionItem,
                          selectedAlcohol === option.value ? styles.selectedOption : {}
                        ]}
                        onPress={() => handleAlcoholSelect(option.value)}
                      >
                        <Text style={[
                          styles.optionText,
                          selectedAlcohol === option.value ? styles.selectedOptionText : {}
                        ]}>
                          {option.label}
                          {selectedAlcohol === option.value && ' ✓'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
              
            
              
              <View style={styles.buttonContainer}>
                <TouchableOpacity 
                  style={[styles.button, styles.submitButton]} 
                  onPress={handleSubmit}
                >
                  <Text style={styles.buttonText}>Submit</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.button, styles.cancelButton]} 
                  onPress={handleCancel}
                >
                  <Text style={styles.buttonText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

  // Function to calculate fitness level from VO2 max, workouts, and activity data
  const calculateFitnessLevel = (vo2MaxValue: number, workouts: any, distance: any) => {
    console.log("🏋️‍♂️ Starting fitness level calculation with inputs:", {
      vo2MaxValue,
      workoutActiveMinutes: workouts?.activeMinutes,
      distance: distance?.value
    });

    let fitnessScore = 5; // Start at average (5 on a 1-10 scale)
    
    // Factor 1: VO2 Max (weighted 50%)
    let vo2Component = 5;
    if (vo2MaxValue > 0) {
      // Convert VO2 max to a 1-10 scale
      if (vo2MaxValue < 25) vo2Component = 1;       // Very poor
      else if (vo2MaxValue < 30) vo2Component = 2;  // Poor
      else if (vo2MaxValue < 35) vo2Component = 3;  // Below average
      else if (vo2MaxValue < 40) vo2Component = 4;  // Fair
      else if (vo2MaxValue < 45) vo2Component = 5;  // Average
      else if (vo2MaxValue < 50) vo2Component = 6;  // Above average
      else if (vo2MaxValue < 55) vo2Component = 7;  // Good
      else if (vo2MaxValue < 60) vo2Component = 8;  // Very good
      else if (vo2MaxValue < 65) vo2Component = 9;  // Excellent
      else vo2Component = 10;                       // Superior
      
      fitnessScore += (vo2Component - 5) * 0.5;
      console.log(`📊 VO2 Max (${vo2MaxValue}): Contributes ${(vo2Component - 5) * 0.5} to score`);
    } else {
      console.log(`⚠️ No valid VO2 Max available`);
    }

    // Factor 2: Activity level from workouts (weighted 20%)
    let workoutComponent = 5;
    if (workouts && typeof workouts.activeMinutes === 'number') {
      // Daily active minutes over 3 months
      const avgDailyActive = workouts.activeMinutes / 90;
      
      // WHO recommends 150 min/week = ~21.4 min/day of moderate activity
      if (avgDailyActive < 5) workoutComponent = 1;       // Very inactive
      else if (avgDailyActive < 10) workoutComponent = 2; // Inactive
      else if (avgDailyActive < 15) workoutComponent = 3; // Somewhat inactive
      else if (avgDailyActive < 20) workoutComponent = 4; // Below recommendations
      else if (avgDailyActive < 30) workoutComponent = 5; // Around recommendations
      else if (avgDailyActive < 40) workoutComponent = 6; // Above recommendations
      else if (avgDailyActive < 50) workoutComponent = 7; // Active
      else if (avgDailyActive < 60) workoutComponent = 8; // Very active
      else if (avgDailyActive < 70) workoutComponent = 9; // Highly active
      else workoutComponent = 10;                         // Extremely active
      
      fitnessScore += (workoutComponent - 5) * 0.2;
      console.log(`📊 Avg daily active minutes (${avgDailyActive.toFixed(1)}): Contributes ${(workoutComponent - 5) * 0.2} to score`);
    } else {
      console.log(`⚠️ No valid workout data available`);
    }

    // Factor 3: Daily steps and distance (weighted 30%)
    let distanceComponent = 5;
    if (distance && typeof distance.value === 'number') {
      // Average daily distance in km over 3 months
      const avgDailyDistance = distance.value / 90; 
      // 5+ km daily is excellent (score 10), 0 km is poor (score 1)
      distanceComponent = Math.min(10, Math.max(1, Math.round(avgDailyDistance / 0.5 * 10)));
      fitnessScore += (distanceComponent - 5) * 0.3;
      console.log(`📊 Avg daily distance (${avgDailyDistance.toFixed(2)} km): Contributes ${(distanceComponent - 5) * 0.3} to score`);
    } else {
      console.log(`⚠️ No valid distance data available`);
    }

    // Ensure score is between 1-10
    const finalScore = Math.min(10, Math.max(1, Math.round(fitnessScore)));
    console.log(`📊 Final fitness score: ${fitnessScore.toFixed(2)} (rounded to ${finalScore})`);
    return finalScore;
  };

  // Function to calculate stress level from HRV and mindfulness data
  const calculateStressLevel = (hrvData: any[], mindfulMinutes: number, sleepSamples: any[] = []) => {
    console.log(`🧮 Calculating stress level from ${hrvData?.length || 0} HRV samples and ${mindfulMinutes} mindful minutes`);
    
    // Get detailed HRV analysis
    const hrvAnalysis = analyzeHrvData(hrvData, sleepSamples);
    
    // Use the enhanced HRV data for stress calculation, weighing sleep HRV more heavily
    let hrvStressScore = 0;
    
    if (hrvAnalysis.sleep.avg > 0 || hrvAnalysis.awake.avg > 0) {
      // Weighted average: 70% sleep HRV, 30% awake HRV
      const weightedHrvAvg = hrvAnalysis.sleep.avg > 0 && hrvAnalysis.awake.avg > 0 ?
        (hrvAnalysis.sleep.avg * 0.7) + (hrvAnalysis.awake.avg * 0.3) :
        hrvAnalysis.sleep.avg > 0 ? hrvAnalysis.sleep.avg : hrvAnalysis.awake.avg;
      
      // Consider sleep phase HRV if available (particularly REM and DEEP which are important for recovery)
      let phaseBonus = 0;
      if (hrvAnalysis.sleep.phases.REM > 0 && hrvAnalysis.sleep.phases.DEEP > 0) {
        const phaseAvg = (hrvAnalysis.sleep.phases.REM + hrvAnalysis.sleep.phases.DEEP) / 2;
        phaseBonus = phaseAvg > weightedHrvAvg ? 1 : 0; // Bonus if deep sleep HRV is good
      }
      
      // Higher HRV is better (lower stress)
      // Map HRV to stress scale (10-80ms → 10-1 stress)
      hrvStressScore = weightedHrvAvg < 10 ? 10 : 
                      weightedHrvAvg > 80 ? 1 : 
                      11 - Math.round((weightedHrvAvg - 10) / 7);
      
      // Apply phase bonus if applicable (can reduce stress by 1 point)
      hrvStressScore = Math.max(1, hrvStressScore - phaseBonus);
    } else {
      // No HRV data, default to moderate stress
      hrvStressScore = 5;
    }
    
    // Mindfulness component (more minutes = less stress)
    const mindfulnessScore = mindfulMinutes >= 60 ? 1 : 
                            mindfulMinutes >= 30 ? 2 :
                            mindfulMinutes >= 15 ? 3 :
                            mindfulMinutes >= 5 ? 4 : 5;
    
    // Final stress score combines HRV (75%) and mindfulness (25%)
    const finalStressScore = Math.round((hrvStressScore * 0.75) + (mindfulnessScore * 0.25));
    
    // Ensure result is in 1-10 range
    return Math.max(1, Math.min(10, finalStressScore));
  };

  // Function to calculate sleep quality from sleep data
  const calculateSleepQuality = (sleepSamples: any[]) => {
    console.log("😴 Starting sleep quality calculation with inputs:", {
      sleepSamplesLength: sleepSamples?.length
    });
    
    let sleepScore = 5; // Start at average
    
    if (!sleepSamples || sleepSamples.length === 0) {
      console.log(`⚠️ No sleep samples available`);
      return sleepScore; // Return average if no data
    }

    // Group sleep samples by day
    const sleepByDay: Record<string, any[]> = {};
    
    sleepSamples.forEach(sample => {
      const date = new Date(sample.startDate).toISOString().split('T')[0];
      if (!sleepByDay[date]) {
        sleepByDay[date] = [];
      }
      sleepByDay[date].push(sample);
    });
    
    const numDays = Object.keys(sleepByDay).length;
    console.log(`📊 Found sleep data for ${numDays} unique days`);

    if (numDays === 0) {
      console.log(`⚠️ No days with sleep data`);
      return sleepScore;
    }

    // For simplicity, we'll analyze the average sleep duration and quality
    let totalSleepMinutes = 0;
    let totalDeepSleepMinutes = 0;
    let totalRemSleepMinutes = 0;
    let daysWithData = 0;

    for (const date in sleepByDay) {
      const dayData = sleepByDay[date];
      let daySleepMinutes = 0;
      let dayDeepSleepMinutes = 0;
      let dayRemSleepMinutes = 0;
      
      dayData.forEach(sample => {
        if (!sample.startDate || !sample.endDate) return;
        
        const start = new Date(sample.startDate);
        const end = new Date(sample.endDate);
        const durationMin = (end.getTime() - start.getTime()) / (1000 * 60);
        
        // Count only actual sleep stages, not just in bed
        if (sample.value === 'ASLEEP' || sample.value === 'CORE' || sample.value === 'DEEP' || sample.value === 'REM') {
          daySleepMinutes += durationMin;
          
          // Categorize sleep types
          if (sample.value === 'DEEP') {
            dayDeepSleepMinutes += durationMin;
          } else if (sample.value === 'REM') {
            dayRemSleepMinutes += durationMin;
          } 
        }
      });
      
      // Only count days with significant sleep data
      if (daySleepMinutes > 120) { // At least 2 hours
        totalSleepMinutes += daySleepMinutes;
        totalDeepSleepMinutes += dayDeepSleepMinutes;
        totalRemSleepMinutes += dayRemSleepMinutes;
        daysWithData++;
      }
    }
    
    if (daysWithData === 0) {
      console.log(`⚠️ No days with sufficient sleep data`);
      return sleepScore;
    }
    
    // Calculate averages
    const avgSleepHours = (totalSleepMinutes / daysWithData) / 60;
    const deepSleepPercentage = (totalDeepSleepMinutes / totalSleepMinutes) * 100;
    const remSleepPercentage = (totalRemSleepMinutes / totalSleepMinutes) * 100;
    
    console.log(`📊 Average sleep: ${avgSleepHours.toFixed(2)} hours`);
    console.log(`📊 Deep sleep: ${deepSleepPercentage.toFixed(2)}%`);
    console.log(`📊 REM sleep: ${remSleepPercentage.toFixed(2)}%`);
    
    // Factor 1: Sleep duration (weight 40%)
    let durationComponent = 5;
    if (avgSleepHours < 5) durationComponent = 1;        // Very poor
    else if (avgSleepHours < 6) durationComponent = 3;   // Below average
    else if (avgSleepHours < 7) durationComponent = 5;   // Average
    else if (avgSleepHours < 8) durationComponent = 8;   // Good
    else if (avgSleepHours < 9) durationComponent = 10;  // Excellent
    else if (avgSleepHours < 10) durationComponent = 7;  // Good but too much
    else durationComponent = 5;                          // Too much sleep
    
    console.log(`📊 Sleep duration component (${durationComponent}): Contributes ${(durationComponent - 5) * 0.4} to score`);
    sleepScore += (durationComponent - 5) * 0.4;
    
    // Factor 2: Deep sleep percentage (weight 35%)
    let deepSleepComponent = 5;
    if (deepSleepPercentage < 10) deepSleepComponent = 1;        // Very poor
    else if (deepSleepPercentage < 15) deepSleepComponent = 3;   // Below average
    else if (deepSleepPercentage < 20) deepSleepComponent = 6;   // Good
    else if (deepSleepPercentage < 25) deepSleepComponent = 9;   // Very good
    else if (deepSleepPercentage < 30) deepSleepComponent = 10;  // Excellent
    else deepSleepComponent = 7;                                 // Too much
    
    console.log(`📊 Deep sleep component (${deepSleepComponent}): Contributes ${(deepSleepComponent - 5) * 0.35} to score`);
    sleepScore += (deepSleepComponent - 5) * 0.35;
    
    // Factor 3: REM sleep percentage (weight 25%)
    let remSleepComponent = 5;
    if (remSleepPercentage < 10) remSleepComponent = 1;        // Very poor
    else if (remSleepPercentage < 15) remSleepComponent = 3;   // Below average
    else if (remSleepPercentage < 20) remSleepComponent = 6;   // Good
    else if (remSleepPercentage < 25) remSleepComponent = 9;   // Very good
    else if (remSleepPercentage < 30) remSleepComponent = 10;  // Excellent
    else remSleepComponent = 7;                               // Too much
    
    console.log(`📊 REM sleep component (${remSleepComponent}): Contributes ${(remSleepComponent - 5) * 0.25} to score`);
    sleepScore += (remSleepComponent - 5) * 0.25;
    
    // Ensure sleep score is between 1 and 10
    const finalScore = Math.min(10, Math.max(1, Math.round(sleepScore)));
    console.log(`📊 Final sleep quality score: ${sleepScore.toFixed(2)} (rounded to ${finalScore})`);
    
    return finalScore;
  };

  // Add this function after calculateSleepQuality
  const ensureHealthMetrics = (data: {
    fitness_level?: number | null; 
    stress_level?: number | null; 
    sleep_quality?: number | null;
  }) => {
    // Ensure we have non-null values for all health metrics
    return {
      fitness_level: data.fitness_level !== null && data.fitness_level !== undefined ? data.fitness_level : 5,
      stress_level: data.stress_level !== null && data.stress_level !== undefined ? data.stress_level : 5,
      sleep_quality: data.sleep_quality !== null && data.sleep_quality !== undefined ? data.sleep_quality : 5
    };
  };

  // Add new function to analyze HRV data in detail
  const analyzeHrvData = (hrvData: any[], sleepSamples: any[]) => {
    if (!hrvData || hrvData.length === 0) {
      console.log("❌ No HRV data available for analysis");
      return {
        sleep: { min: 0, max: 0, avg: 0, phases: { REM: 0, DEEP: 0, CORE: 0 } },
        awake: { min: 0, max: 0, avg: 0 }
      };
    }

    console.log(`💓 Analyzing ${hrvData.length} HRV samples with ${sleepSamples?.length || 0} sleep samples`);
    
    // Create map of sleep periods
    const sleepPeriods: Map<string, { 
      start: Date, 
      end: Date, 
      phase: string 
    }> = new Map();
    
    if (sleepSamples && sleepSamples.length > 0) {
      sleepSamples.forEach(sample => {
        if (sample.startDate && sample.endDate) {
          const key = `${sample.startDate}_${sample.endDate}`;
          sleepPeriods.set(key, {
            start: new Date(sample.startDate),
            end: new Date(sample.endDate),
            phase: sample.value // INBED, ASLEEP, AWAKE, CORE, DEEP, REM
          });
        }
      });
      console.log(`💤 Created map of ${sleepPeriods.size} sleep periods`);
    }
    
    // Separate HRV samples by sleep state
    const sleepHrv: any[] = [];
    const awakeHrv: any[] = [];
    
    // Track HRV by sleep phase
    const phaseHrv: { [key: string]: number[] } = {
      'REM': [],
      'DEEP': [],
      'CORE': []
    };
    
    hrvData.forEach(sample => {
      const sampleTime = new Date(sample.startDate);
      let isSleeping = false;
      let sleepPhase = '';
      
      // Check if this HRV sample falls within any sleep period
      sleepPeriods.forEach(period => {
        if (sampleTime >= period.start && sampleTime <= period.end) {
          isSleeping = true;
          sleepPhase = period.phase;
        }
      });
      
      if (isSleeping) {
        sleepHrv.push(sample);
        
        // Add to phase-specific array if it's one of our tracked phases
        if (sleepPhase in phaseHrv) {
          phaseHrv[sleepPhase].push(sample.value);
        }
      } else {
        awakeHrv.push(sample);
      }
    });
    
    console.log(`💓 Separated HRV data: ${sleepHrv.length} sleep samples, ${awakeHrv.length} awake samples`);
    
    // Calculate statistics for sleep HRV
    const sleepHrvValues = sleepHrv.map(s => s.value);
    const sleepStats = {
      min: sleepHrvValues.length > 0 ? Math.min(...sleepHrvValues) : 0,
      max: sleepHrvValues.length > 0 ? Math.max(...sleepHrvValues) : 0,
      avg: sleepHrvValues.length > 0 ? 
        sleepHrvValues.reduce((sum, val) => sum + val, 0) / sleepHrvValues.length : 0
    };
    
    // Calculate statistics for awake HRV
    const awakeHrvValues = awakeHrv.map(s => s.value);
    const awakeStats = {
      min: awakeHrvValues.length > 0 ? Math.min(...awakeHrvValues) : 0,
      max: awakeHrvValues.length > 0 ? Math.max(...awakeHrvValues) : 0,
      avg: awakeHrvValues.length > 0 ? 
        awakeHrvValues.reduce((sum, val) => sum + val, 0) / awakeHrvValues.length : 0
    };
    
    // Calculate average HRV by sleep phase
    const phaseStats: { [key: string]: number } = {};
    Object.keys(phaseHrv).forEach(phase => {
      const values = phaseHrv[phase];
      phaseStats[phase] = values.length > 0 ? 
        values.reduce((sum, val) => sum + val, 0) / values.length : 0;
    });
    
    // Log the detailed HRV analysis
    console.log("💓 HRV Analysis Results:", {
      sleep: { ...sleepStats, phases: phaseStats },
      awake: awakeStats
    });
    
    return {
      sleep: { ...sleepStats, phases: phaseStats },
      awake: awakeStats
    };
  };

  return (
    <View style={styles.container}>
      <View style={styles.sectionTitle}>
      <Text style={styles.sectionTitle}>Willkommen! </Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={() => {
              if (dataSource === 'apple') {
                fetchHRVData();
              } else if (dataSource === 'garmin') {
                checkLogin();
              }
            }}
          >
            <Text style={styles.refreshButtonText}>↻</Text>
          </TouchableOpacity>

          {dataSource === 'garmin' && (
            <TouchableOpacity
              style={[styles.garminButton, styles.sourceButton]}
                onPress={() => setGarminModalVisible(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.sourceButtonText}>Login ändern</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.sourceButton}
            onPress={() => {
              const newSource = dataSource === 'apple' ? 'garmin' : 'apple';
              handleSourceChange(newSource);
            }}
          >
            <Text style={styles.sourceButtonText}>
              {dataSource === 'apple' ? 'Garmin verknüpfen' : 'Apple Watch verknüpfen'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      
      {loading ? (
        <ActivityIndicator size="large" color="#0000ff" />
      ) : (
        <ScrollView 
          style={styles.scrollView} 
          showsVerticalScrollIndicator={true}
          contentContainerStyle={styles.scrollViewContent}
        >
          {healthKitAvailable && dataSource === 'apple' && (
            <Text style={styles.healthKitStatus}>Apple HealthKit verbunden</Text>
          )}

          {/* Stress Section */}
          {garminData.stress && (
            <View style={styles.dataContainer}>
              <Text style={styles.sectionTitle}>Stress Level</Text>
              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>Durchschnitt:</Text>
                <Text style={styles.dataValue}>{garminData.stress.avg_stress}</Text>
              </View>
              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>Maximum:</Text>
                <Text style={styles.dataValue}>{garminData.stress.max_stress}</Text>
              </View>
            </View>
          )}

          

          {/* Sleep Analysis Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Sleep Analysis</Text>
            {garminData?.sleep ? (
              <>
                <View style={styles.sleepSummary}>
                  <View style={styles.row}>
                    <Text style={styles.label}>Total Sleep:</Text>
                    <Text style={styles.value}>
                      {formatDuration(garminData.sleep.summary.total_sleep_seconds)}
                    </Text>
                  </View>
                  <View style={styles.row}>
                    <Text style={styles.label}>Deep Sleep:</Text>
                    <Text style={styles.value}>
                      {formatDuration(garminData.sleep.summary.deep_sleep_seconds)}
                    </Text>
                  </View>
                  <View style={styles.row}>
                    <Text style={styles.label}>Light Sleep:</Text>
                    <Text style={styles.value}>
                      {formatDuration(garminData.sleep.summary.light_sleep_seconds)}
                    </Text>
                  </View>
                  <View style={styles.row}>
                    <Text style={styles.label}>REM Sleep:</Text>
                    <Text style={styles.value}>
                      {formatDuration(garminData.sleep.summary.rem_sleep_seconds)}
                    </Text>
                  </View>
                  <View style={styles.row}>
                    <Text style={styles.label}>Awake:</Text>
                    <Text style={styles.value}>
                      {formatDuration(garminData.sleep.summary.awake_seconds)}
                    </Text>
                  </View>
                  <View style={styles.row}>
                    <Text style={styles.label}>Sleep Score:</Text>
                    <Text style={styles.value}>
                      {garminData.sleep.summary.sleep_score}
                    </Text>
                  </View>
                </View>
              </>
            ) : (
              <Text style={styles.noData}>No sleep data available</Text>
            )}
          </View>

          {/* Activity Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Activity</Text>
            {garminData?.activity ? (
              <>
                <View style={styles.sleepSummary}>
                  <View style={styles.row}>
                    <Text style={styles.label}>Steps:</Text>
                    <Text style={styles.value}>{formatNumber(garminData.activity.steps)}</Text>
                  </View>
                  <View style={styles.row}>
                    <Text style={styles.label}>Calories:</Text>
                    <Text style={styles.value}>{formatNumber(garminData.activity.calories_burned)} kcal</Text>
                  </View>
                  <View style={styles.row}>
                    <Text style={styles.label}>Active Minutes:</Text>
                    <Text style={styles.value}>{formatNumber(garminData.activity.active_minutes)}</Text>
                  </View>
                  <View style={styles.row}>
                    <Text style={styles.label}>Distance:</Text>
                    <Text style={styles.value}>{garminData.activity.distance_km.toFixed(2)} km</Text>
                  </View>
                  <View style={styles.row}>
                    <Text style={styles.label}>Floors Climbed:</Text>
                    <Text style={styles.value}>{formatNumber(garminData.activity.floors_climbed)}</Text>
                  </View>
                  {garminData.activity.vo2_max > 0 && (
                    <View style={styles.row}>
                      <Text style={styles.label}>VO2 Max:</Text>
                      <Text style={styles.value}>
                        {garminData.activity.vo2_max} ({garminData.activity.vo2_max_status})
                      </Text>
                    </View>
                  )}
                </View>
              </>
            ) : (
              <Text style={styles.noData}>No activity data available</Text>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Training</Text>
            {garminData?.activity?.daily_activities ? (
              garminData.activity.daily_activities.length > 0 ? (
              garminData.activity.daily_activities.map((activity, index) => (
                <View key={index} style={styles.activityRow}>
                  <Text style={styles.activityType}>{activity.type}</Text>
                  <Text style={styles.activityDuration}>{activity.duration_minutes} min</Text>
                </View>
              ))
            ) : (
              <Text style={styles.noActivities}>No activities recorded yesterday</Text>
              )
            ) : (
              <Text style={styles.noActivities}>No activities data available</Text>
            )}
          </View>

          {/* New HRV Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Heart Rate Variability</Text>
            {garminData?.hrv ? (
              <>
                <View style={styles.hrvSummary}>
                  <View style={styles.row}>
                    <Text style={styles.label}>Night Average:</Text>
                    <Text style={styles.value}>
                      {garminData.hrv.summary.lastNightAvg ? 
                        `${garminData.hrv.summary.lastNightAvg} ms` : 
                        'N/A'}
                    </Text>
                  </View>
                  <View style={styles.row}>
                    <Text style={styles.label}>Highest 5-min:</Text>
                    <Text style={styles.value}>
                      {garminData.hrv.summary.lastNight5MinHigh ? 
                        `${garminData.hrv.summary.lastNight5MinHigh} ms` : 
                        'N/A'}
                    </Text>
                  </View>
                </View>

                {garminData.hrv.readings.length > 0 && (
                  <>
                    <Text style={styles.subsectionTitle}>HRV Timeline</Text>
                    <ScrollView 
                      horizontal={true} 
                      style={styles.hrvReadingsContainer}
                      showsHorizontalScrollIndicator={false}
                    >
                      {garminData.hrv.readings.map((reading, index) => (
                        <View key={index} style={styles.hrvReading}>
                          <Text style={styles.hrvValue}>
                            {reading.value} ms
                          </Text>
                          <Text style={styles.hrvTime}>
                            {new Date(reading.time).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </Text>
                        </View>
                      ))}
                    </ScrollView>
                  </>
                )}
              </>
            ) : (
              <Text style={styles.noData}>No HRV data available</Text>
            )}
          </View>

          <View style={styles.buttonContainer}>
            <TouchableOpacity 
              style={styles.button}
              onPress={handlePssButtonPress}
            >
              <Text style={styles.buttonText}>PSS Survey</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.button}
              onPress={handlePersonalInfoButtonPress}
            >
              <Text style={styles.buttonText}>Personal Information</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.button, { backgroundColor: '#4CAF50' }]}
              onPress={async () => {
                // Retrieve credentials before the function call
                const storedEmail = email || await SecureStore.getItemAsync("garmin_email") || "";
                const storedPassword = password || await SecureStore.getItemAsync("garmin_password") || "";
                
                uploadHistoricalData(
                  db, 
                  getOrCreateDeviceId, 
                  setLoading,
                  dataSource,
                  async (email, password, date) => {
                    // Create a function to fetch Garmin data for a specific date
                    try {
                      console.log(`Fetching historical data for date: ${date}`);
                      const requestBody = { 
                        email: email, 
                        password: password, 
                        date: date 
                      };
                      
                      const API_URL = Constants.expoConfig?.extra?.apiUrl || 'https://dodo-holy-primarily.ngrok-free.app';
                      const response = await fetch(`${API_URL}/all_data`, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                        },
                        body: JSON.stringify(requestBody),
                      });
                      
                      if (!response.ok) {
                        throw new Error(`Server error: ${response.status}`);
                      }
                      
                      const data = await response.json();
                      console.log(`Successfully received data for ${date}`);
                      return data;
                    } catch (error) {
                      console.error(`Error fetching Garmin data for ${date}:`, error);
                      throw error;
                    }
                  },
                  healthKitAvailable,
                  {
                    email: storedEmail,
                    password: storedPassword
                  }
                )
              }}
            >
              <Text style={styles.buttonText}>Upload 3 Months Data</Text>
            </TouchableOpacity>
          </View>

          {isLoading && (
            <ActivityIndicator size="large" color="#007AFF" style={{marginVertical: 20}} />
          )}
        </ScrollView>
      )}

      {/* Garmin Login Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={garminModalVisible}
        onRequestClose={() => setGarminModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Garmin Login</Text>
              <TouchableOpacity onPress={() => setGarminModalVisible(false)}>
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.input}
              placeholder="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
            />
            <TextInput
              style={styles.input}
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
            <TouchableOpacity style={styles.button} onPress={handleLogin}>
              <Text style={styles.buttonText}>Login</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* PSS Survey Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={pssModalVisible}
        onRequestClose={() => setPssModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>PSS Survey</Text>
              <TouchableOpacity onPress={() => setPssModalVisible(false)}>
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={questions}
              keyExtractor={(item, index) => index.toString()}
              renderItem={({ item, index }) => (
                <View style={styles.questionContainer}>
                  <Text style={styles.questionText}>{item}</Text>
                  <View style={styles.likertContainer}>
                    {likertOptions.map((option) => (
                      <TouchableOpacity
                        key={option.value}
                        style={[
                          styles.likertOption,
                          responses[index] === option.value && styles.likertOptionSelected
                        ]}
                        onPress={() => handleResponseChange(option.value, index)}
                      >
                        <Text style={[
                          styles.likertOptionText,
                          responses[index] === option.value && styles.likertOptionTextSelected
                        ]}>
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
            />
            <TouchableOpacity style={styles.button} onPress={submitSurvey}>
              <Text style={styles.buttonText}>Absenden</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Personal Info Modal */}
      <PersonalInfoModal />

    </View>
  );
};

export default HomeScreen;
