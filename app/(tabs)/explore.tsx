import { uploadHistoricalData } from "../utils/historicalUpload";
import { StyleSheet, View, Text, ActivityIndicator, TouchableOpacity, Modal, TextInput, FlatList, Button, ScrollView, Alert, Platform } from "react-native";
import React, { useEffect, useState, useCallback } from "react";
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
import { getAuth, Auth } from "firebase/auth";
import Constants from 'expo-constants';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requestNotificationPermissions, scheduleDailySurveyReminder, getReminderTimePreference, refreshDailyReminder } from '../utils/notifications';
import NotificationTimePicker from '../components/NotificationTimePicker';
import { useDataSource } from '../components/DataSourceContext';

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
  auth = getAuth(app);
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
    backgroundColor: '#fff',
    padding: 20,
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    paddingBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginVertical: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  healthKitStatus: {
    color: 'green',
    marginVertical: 10,
    fontWeight: 'bold',
  },
  dataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 5,
  },
  dataLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  dataValue: {
    fontSize: 16,
    color: '#333',
  },
  chartContainer: {
    height: 200,
    marginVertical: 20,
  },
  section: {
    marginVertical: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#333'
  },
  hrvSummary: {
    backgroundColor: '#f5f8fa',
    padding: 15,
    borderRadius: 10,
    marginVertical: 10,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 5,
  },
  subRow: {
    marginLeft: 10,
    marginTop: 2,
  },
  subText: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
  },
  label: {
    fontSize: 16,
    color: '#333',
  },
  value: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  sleepSummary: {
    marginVertical: 10,
  },
  sleepTime: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  noData: {
    color: '#666',
    fontStyle: 'italic',
    textAlign: 'center',
    marginVertical: 10,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 10,
    width: '95%',
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  closeButton: {
    fontSize: 24,
    color: '#333',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 5,
    padding: 12,
    marginVertical: 6,
    fontSize: 16,
  },
  buttonPressed: {
    backgroundColor: '#ccc',
  },
  buttonContainer: {
    flexDirection: 'column',
    marginVertical: 15,
  },
  modalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
    paddingHorizontal: 10,
  },
  questionContainer: {
    marginVertical: 15,
  },
  questionText: {
    fontSize: 16,
    marginBottom: 10,
  },
  likertContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 10,
  },
  switchLabel: {
    fontSize: 16,
  },
  activityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 5,
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  activityType: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  activityDuration: {
    fontSize: 16,
    color: '#666',
  },
  tab: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginRight: 10,
    borderRadius: 20,
  },
  activeTab: {
    backgroundColor: '#007AFF',
  },
  tabText: {
    fontSize: 14,
  },
  activeTabText: {
    color: '#fff',
  },
  tabsContainer: {
    flexDirection: 'row',
    marginVertical: 15,
  },
  errorText: {
    color: 'red',
    marginVertical: 10,
  },
  appleButton: {
    backgroundColor: '#000',
  },
  garminButton: {
    backgroundColor: '#008ace',
  },
  sourceButtonContainer: {
    marginVertical: 20,
  },
  sourceButton: {
    backgroundColor: '#555',
    padding: 10,
    borderRadius: 5,
    marginVertical: 5,
  },
  sourceButtonText: {
    color: '#fff',
    fontSize: 14,
  },
  dropdownButton: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 5,
    padding: 12,
    marginVertical: 5,
  },
  dropdownButtonText: {
    color: '#333',
    fontSize: 16,
  },
  optionsList: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 5,
    marginTop: 5,
    maxHeight: 200,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  formGroup: {
    marginVertical: 12,
  },
  formLabel: {
    fontSize: 16,
    marginBottom: 5,
    color: '#333'
  },
  inputGroup: {
    marginVertical: 15,
  },
  halfInputContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  halfInput: {
    width: '48%',
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    marginTop: 10,
    fontStyle: 'italic',
  },
  optionItem: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    width: '100%'
  },
  optionText: {
    fontSize: 16,
    color: '#333'
  },
  selectedOption: {
    backgroundColor: '#f5f5f5',
  },
  selectedOptionText: {
    color: '#007AFF',
  },
  dailySurveyContainer: {
    marginTop: 20,
  },
  yesNoQuestion: {
    marginBottom: 10,
  },
  toggleButton: {
    padding: 10,
    borderWidth: 2,
    borderColor: '#ddd',
    borderRadius: 5,
    marginBottom: 5,
  },
  toggleButtonActive: {
    borderColor: '#007AFF',
  },
  toggleButtonText: {
    fontSize: 16,
    color: '#333',
  },
  toggleButtonTextActive: {
    color: '#007AFF',
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
  buttonWithCheckbox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: {
    marginLeft: 8,
    fontSize: 18,
    color: '#fff',
    fontWeight: 'bold',
  },
  optionWrapper: {
    alignItems: 'center',
  },
  circleOption: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerCircle: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#007AFF',
  },
  circleSelected: {
    borderColor: '#007AFF',
  },
  optionLabel: {
    fontSize: 10,
    color: '#333',
    textAlign: 'center',
    marginTop: 3,
  },
  labelSelected: {
    color: '#007AFF',
  },
  submitButton: {
    backgroundColor: '#007AFF',
    marginRight: 10,
  },
  cancelButton: {
    backgroundColor: '#ccc',
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  refreshButton: {
    backgroundColor: '#4285F4',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
  },
  refreshButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
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
  hrvValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  hrvTime: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  subsectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#444',
    marginTop: 16,
    marginBottom: 8,
  },
  noActivities: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: 12,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
    paddingHorizontal: 10,
  },
  autoFillButton: {
    backgroundColor: '#4A90E2',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 5,
    marginRight: 10,
    flex: 1,
  },
  autoFillButtonText: {
    color: 'white',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  modalSubmitButton: {
    backgroundColor: '#28a745',
    borderRadius: 5,
    paddingVertical: 12,
    paddingHorizontal: 16,
    minWidth: 120,
  },
  modalButtonText: {
    color: 'white',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  subQuestionContainer: {
    marginTop: 10,
    marginLeft: 20,
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 10,
  },
  subQuestionText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 5,
  },
  subOptionButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 5,
    marginVertical: 2,
    alignSelf: 'flex-start',
  },
  subOptionButtonActive: {
    borderColor: '#007AFF',
  },
  subOptionText: {
    fontSize: 14,
    color: '#333',
  },
  subOptionTextActive: {
    color: '#007AFF',
  },
  otherTextInput: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 5,
    padding: 10,
    marginVertical: 5,
  },
  emotionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    marginHorizontal: 10,
    marginBottom: 20,
  },
  emotionButton: {
    width: '45%',
    padding: 10,
    margin: 5,
    borderWidth: 2,
    borderColor: '#ddd',
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 10,
  },
  emotionEmoji: {
    fontSize: 24,
    marginBottom: 5,
  },
  emotionText: {
    fontSize: 16,
  },
  emotionButtonActive: {
    borderColor: '#007AFF',
  },
  emotionTextActive: {
    color: '#007AFF',
  },
  rowContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonTextDisabled: {
    color: '#999',
  },
  sectionHeader: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
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
  const { dataSource, setDataSource } = useDataSource();
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
  const [responses, setResponses] = useState([-1, 0, 0, 0]);
  const [otherText, setOtherText] = useState("");
  // New daily survey response states for yes/no questions
  const [dailySurveyResponses, setDailySurveyResponses] = useState({
    seasonal_allergies: false,
    sick: false,
    alcohol: false,
    smoking: false,
    caffeine: false,
    marijuana: false,
    bright_lights: false,
    phone_in_bed: false,
    processed_food: false,
    late_meal: false,
    water_3l: false,
    morning_sunlight: false,
    meditation: false,
    exercise: false,
    exercise_type: "",
    exercise_duration: "",
    met_friends: false,
    journaling: false,
    reading: false,
    relaxation: false,
    relaxation_duration: "",
    relaxation_meditation: false,
    relaxation_breathing: false,
    relaxation_journaling: false,
    relaxation_music: false,
    relaxation_other: false,
    relaxation_other_text: "",
    emotion_happiness: false,
    emotion_anxiety: false,
    emotion_sadness: false,
    emotion_anger: false,
    emotion_relaxation: false
  });
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
    firstname: "" as string,
    lastname: "" as string,
    marijuana_consumption: "" as string,
    diet_type: "" as string,
    cold_showers: "" as string,
    meditation: "" as string,
    sauna_use: "" as string,
    sleep_medication: "" as string,
    blue_light_glasses: "" as string,
    intermittent_fasting: "" as string,
    sleep_mask: "" as string,
    seasonal_allergies: "" as string,
    caffeine_consumption: "" as string,
  });
  const [garminData, setGarminData] = useState<GarminData>({
    stress: null,
    hrv: null,
    sleep: null,
    activity: null,
    heart_rate: null
  });

  const [sourceSelectionVisible, setSourceSelectionVisible] = useState(true);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [isModalTransitioning, setIsModalTransitioning] = useState(false);
  const [activeModal, setActiveModal] = useState<'garmin' | 'pss' | 'personal' | null>(null);
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  const [surveySubmitted, setSurveySubmitted] = useState(false);
  const [lastSurveyDate, setLastSurveyDate] = useState<string | null>(null);
  const [personalInfoSubmitted, setPersonalInfoSubmitted] = useState(false);
  const [historyDataUploaded, setHistoryDataUploaded] = useState(false);

  // PSS questions
  const questions = [
    "How stressed do you feel right now?",
    "How well did you sleep last night?",
    "How rested do you feel right now?",
    "What is the first thing on your mind this morning?"
  ];

  const getOptionsForQuestion = (questionIndex: number) => {
    switch (questionIndex) {
      case 0: // Stress scale 0-10
        return Array.from({ length: 11 }, (_, i) => ({ 
          value: i, 
          label: i.toString() 
        }));
      case 1: // Sleep quality
        return [
          { value: 1, label: "Very Poor" },
          { value: 2, label: "Poor" },
          { value: 3, label: "Average" },
          { value: 4, label: "Good" },
          { value: 5, label: "Excellent" }
        ];
      case 2: // Rest feeling
        return [
          { value: 1, label: "Not rested at all" },
          { value: 2, label: "Slightly rested" },
          { value: 3, label: "Moderately rested" },
          { value: 4, label: "Well rested" },
          { value: 5, label: "Very well rested" }
        ];
      case 3: // First thing on mind
        return [
          { value: 1, label: "Work/School" },
          { value: 2, label: "Personal concerns" },
          { value: 3, label: "Excitement/Positive anticipation" },
          { value: 4, label: "Health/Physical discomfort" },
          { value: 5, label: "Other" }
        ];
      default:
        return [];
    }
  };

  const likertOptions = [
    { value: 1, label: "1" },
    { value: 2, label: "2" },
    { value: 3, label: "3" },
    { value: 4, label: "4" },
    { value: 5, label: "5" }
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

  // Add this function to check if the survey was submitted today
  const checkSurveyDate = useCallback(async () => {
    try {
      // Get stored last survey date from AsyncStorage
      const storedDate = await AsyncStorage.getItem('lastSurveyDate');
      
      // Update state with stored date
      if (storedDate) {
        setLastSurveyDate(storedDate);
      }
      
      // Get today's date in YYYY-MM-DD format
      const today = new Date().toISOString().split('T')[0];
      
      // If stored date is not today, reset the survey submitted state
      if (storedDate !== today) {
        setSurveySubmitted(false);
      } else {
        setSurveySubmitted(true);
      }
    } catch (error) {
      console.error('Error checking survey date:', error);
    }
  }, []);

  // Add this to the existing useEffect for app initialization
  useEffect(() => {
    initializeApp();
    checkSurveyDate(); // Check survey date on app load
    
    // Set up notifications
    const setupNotifications = async () => {
      // Request permissions for notifications
      const hasPermission = await requestNotificationPermissions();
      
      if (hasPermission) {
        // Schedule daily reminder at 9 AM
        await scheduleDailySurveyReminder();
      }
    };
    
    setupNotifications().catch(error => {
      console.error('Failed to set up notifications:', error);
    });
    
    // Also check when app comes to foreground
    const subscription = AppState.addEventListener('change', async (nextAppState) => {
      if (nextAppState === 'active') {
        checkSurveyDate();
        
        // Limit refresh checks to prevent constant updates
        // Only refresh if it's been at least an hour since the last refresh
        const now = new Date();
        const lastRefreshStr = await AsyncStorage.getItem('lastNotificationRefresh');
        let shouldRefresh = true;
        
        if (lastRefreshStr) {
          const lastRefresh = new Date(lastRefreshStr);
          const hoursSinceLastRefresh = (now.getTime() - lastRefresh.getTime()) / (1000 * 60 * 60);
          shouldRefresh = hoursSinceLastRefresh >= 1; // Only refresh if it's been at least 1 hour
        }
        
        if (shouldRefresh) {
          // Store the refresh time
          await AsyncStorage.setItem('lastNotificationRefresh', now.toISOString());
          
          // Only perform the refresh if needed
          const isNeedRefresh = await isSurveyReminderScheduled();
          if (!isNeedRefresh) {
            refreshDailyReminder().catch(error => {
              console.error('Error refreshing notification settings:', error);
            });
          }
        }
      }
    });
    
    // Do an initial check for the notification status
    const checkInitialNotification = async () => {
      const isNeedRefresh = await isSurveyReminderScheduled();
      if (!isNeedRefresh) {
        refreshDailyReminder().catch(error => {
          console.error('Error refreshing notification settings:', error);
        });
      }
    };
    
    checkInitialNotification();
    
    return () => {
      subscription.remove();
    };
  }, [initializeApp, checkSurveyDate]);

  useEffect(() => {
    if (dataSource && !isInitialized) {
      
      initializeApp();
    }
  }, [dataSource]);

  // In the initializeApp function, ensure we properly fetch data based on the current data source
  const initializeApp = async () => {
    setLoading(true);
    setInitError('');

    try {
      // Always set the data source based on AsyncStorage first
      const useGarmin = await AsyncStorage.getItem('useGarmin');
      if (useGarmin === 'true') {
        setDataSource('garmin');
        // Check Garmin credentials
        const storedEmail = await SecureStore.getItemAsync('garmin_email');
        const storedPassword = await SecureStore.getItemAsync('garmin_password');
        
        if (storedEmail && storedPassword) {
          // Schedule Garmin data fetch
          setTimeout(() => {
            fetchGarminData(storedEmail, storedPassword);
          }, 500);
        }
      } else {
        setDataSource('apple');
        
        // Platform check
        if (Platform.OS !== 'ios') {
          setInitError('Apple HealthKit is only available on iOS devices.');
          setHealthKitAvailable(false);
          setLoading(false);
          return;
        }

        // Configure HealthKit
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

        // Check if HealthKit is available
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
          setInitError('HealthKit is not available on this device.');
          setHealthKitAvailable(false);
          setLoading(false);
          return;
        }

        // HealthKit is available, initialize and fetch data
        setHealthKitAvailable(true);

        try {
          // Request HealthKit authorization
          console.log('Requesting HealthKit authorization...');
          AppleHealthKit.initHealthKit(permissions, (error: string) => {
            if (error) {
              console.error('Error initializing HealthKit:', error);
              setInitError('Error initializing HealthKit: ' + error);
              setLoading(false);
              return;
            }
            
            console.log('HealthKit initialized, fetching data...');
            // Fetch Apple Health data
            fetchHRVData();
          });
        } catch (error) {
          console.error('Error initializing HealthKit:', error);
          setInitError('Error initializing HealthKit: ' + error);
        }
      }

      setIsInitialized(true);
    } catch (error) {
      console.error('Error initializing app:', error);
      setInitError('Error initializing app: ' + error);
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
      // Only allow the PSS survey to open if personal info has been submitted
      if (!personalInfoSubmitted) {
        Alert.alert(
          "Information Required",
          "Please fill out your personal information first before taking the daily survey."
        );
        return;
      }
      
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
      Alert.alert('Error', 'Database connection not available');
      return;
    }
    
    try {
      if (responses[0] === -1 || responses.slice(1).some(response => response === 0)) {
        Alert.alert("Error", "Please answer all questions");
        return;
      }

      // Get or create device ID
      const deviceId = await getOrCreateDeviceId();
      
      // Get today's date in YYYY-MM-DD format
      const today = new Date().toISOString().split('T')[0];
      
      // Prepare data
      const data = {
        responses,
        otherText: responses[3] === 5 ? otherText : "",
        dailySurveyResponses, // Include the daily survey responses
        timestamp: new Date(),
        deviceId,
        date: today // Store the date with the submission
      };
      
      
      // Submit to Firestore
      const pssCollection = collection(db, "pss_responses");
      await addDoc(pssCollection, data);
      
      // Reset and close
      setResponses([-1, 0, 0, 0]);
      setOtherText("");
      
      // Reset daily survey responses
      setDailySurveyResponses({
        seasonal_allergies: false,
        sick: false,
        alcohol: false,
        smoking: false,
        caffeine: false,
        marijuana: false,
        bright_lights: false,
        phone_in_bed: false,
        processed_food: false,
        late_meal: false,
        water_3l: false,
        morning_sunlight: false,
        meditation: false,
        exercise: false,
        exercise_type: "",
        exercise_duration: "",
        met_friends: false,
        journaling: false,
        reading: false,
        relaxation: false,
        relaxation_duration: "",
        relaxation_meditation: false,
        relaxation_breathing: false,
        relaxation_journaling: false,
        relaxation_music: false,
        relaxation_other: false,
        relaxation_other_text: "",
        emotion_happiness: false,
        emotion_anxiety: false,
        emotion_sadness: false,
        emotion_anger: false,
        emotion_relaxation: false
      });
      
      setPssModalVisible(false);
      setSurveySubmitted(true); // Mark survey as submitted
      setLastSurveyDate(today); // Store the submission date in state
      
      // Also persist to AsyncStorage
      await AsyncStorage.setItem('lastSurveyDate', today);

      Alert.alert("Success", "Survey submitted successfully!");
    } catch (error) {
      console.error("Error sending survey:", error);
      Alert.alert("Error", "Failed to send survey. Please try again later.");
    }
  };

  const submitPersonalInfo = async (dataToSubmit = personalInfo) => {
    
    
    

    const firestore = db as Firestore;

    try {
      // Enhanced validation with more debugging information
      if (!dataToSubmit.age || dataToSubmit.age === null || dataToSubmit.age === undefined) {
        console.error("Age validation failed. Age is:", dataToSubmit.age);
        Alert.alert("Error", "Please fill in at least age and gender");
        return false;
      }
      
      if (!dataToSubmit.gender || dataToSubmit.gender === "" || dataToSubmit.gender === null) {
        console.error("Gender validation failed. Gender is:", dataToSubmit.gender);
        Alert.alert("Error", "Please fill in at least age and gender");
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

      Alert.alert("Success", "Personal information saved successfully!");
      
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
          firstname: "" as string,
          lastname: "" as string,
          marijuana_consumption: "" as string,
          diet_type: "" as string,
          cold_showers: "" as string,
          meditation: "" as string,
          sauna_use: "" as string,
          sleep_medication: "" as string,
          blue_light_glasses: "" as string,
          intermittent_fasting: "" as string,
          sleep_mask: "" as string,
          seasonal_allergies: "" as string,
          caffeine_consumption: "" as string,
        });
      }
      
      setPersonalInfoSubmitted(true); // Mark as submitted
      
      // Return success - modal visibility handled by caller
      return true;
    } catch (error) {
      console.error("Error saving personal information:", error);
      Alert.alert("Error", "There was a problem saving the data.");
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
      { label: "Male", value: "male" },
      { label: "Female", value: "female" },
      { label: "Diverse", value: "diverse" }
    ];
    
    // Smoker selection
    const [showSmokerOptions, setShowSmokerOptions] = useState(false);
    const smokerOptions = [
      { label: "Yes", value: "yes" },
      { label: "No", value: "no" },
      { label: "Occasional", value: "occasional" }
    ];
    
    // Alcohol consumption selection
    const [showAlcoholOptions, setShowAlcoholOptions] = useState(false);
    const alcoholOptions = [
      { label: "Never", value: "never" },
      { label: "Rarely", value: "rarely" },
      { label: "Occasionally", value: "occasionally" },
      { label: "Regularly", value: "regularly" },
      { label: "Daily", value: "daily" }
    ];

    // Marijuana consumption selection
    const [showMarijuanaOptions, setShowMarijuanaOptions] = useState(false);
    const marijuanaOptions = [
      { label: "Yes", value: "yes" },
      { label: "No", value: "no" },
      { label: "Occasional", value: "occasional" }
    ];

    // Diet type selection
    const [showDietOptions, setShowDietOptions] = useState(false);
    const dietOptions = [
      { label: "Omnivore", value: "omnivore" },
      { label: "Vegetarian", value: "vegetarian" },
      { label: "Vegan", value: "vegan" },
      { label: "Pescatarian", value: "pescatarian" },
      { label: "Keto", value: "keto" },
      { label: "Paleo", value: "paleo" },
      { label: "Low-carb", value: "low-carb" },
      { label: "Mediterranean", value: "mediterranean" },
      { label: "Other", value: "other" }
    ];

    // Yes/No options for various selections
    const yesNoOptions = [
      { label: "Yes", value: "yes" },
      { label: "No", value: "no" }
    ];

    // Options visibility states for new fields
    const [showColdShowerOptions, setShowColdShowerOptions] = useState(false);
    const [showMeditationOptions, setShowMeditationOptions] = useState(false);
    const [showSaunaOptions, setShowSaunaOptions] = useState(false);
    const [showSleepMedicationOptions, setShowSleepMedicationOptions] = useState(false);
    const [showBlueLightGlassesOptions, setShowBlueLightGlassesOptions] = useState(false);
    const [showIntermittentFastingOptions, setShowIntermittentFastingOptions] = useState(false);
    const [showSleepMaskOptions, setShowSleepMaskOptions] = useState(false);
    const [showSeasonalAllergiesOptions, setShowSeasonalAllergiesOptions] = useState(false);
    const [showCaffeineConsumptionOptions, setShowCaffeineConsumptionOptions] = useState(false);
    
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
        
        Alert.alert('Error', 'Please enter at least age and gender.');
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
        Alert.alert('Error', 'There was a problem saving the data. Please try again.');
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
            
            // First fetch basic user profile information
            console.log("👤 Fetching user data from HealthKit...");
            
            // 1. Get biological sex
            try {
              const biologicalSex = await new Promise<any>((resolve, reject) => {
                if (typeof AppleHealthKit.getBiologicalSex !== 'function') {
                  console.error("❌ getBiologicalSex function not available");
                  resolve(null);
                  return;
                }
                
                AppleHealthKit.getBiologicalSex({}, (err, result) => {
                  if (err) {
                    console.error('❌ Error fetching biological sex:', err);
                    resolve(null);
                  } else {
                    console.log(`👤 Biological sex data:`, result);
                    resolve(result);
                  }
                });
              });
              
              if (biologicalSex && biologicalSex.value) {
                // Map HealthKit sex values to our format
                let genderValue = "";
                if (biologicalSex.value === 'male') {
                  genderValue = "male";
                } else if (biologicalSex.value === 'female') {
                  genderValue = "female";
                } else if (biologicalSex.value === 'other') {
                  genderValue = "diverse";
                }
                
                if (genderValue) {
                  console.log(`👤 Setting gender to: ${genderValue}`);
                  updatedInfo.gender = genderValue;
                  updatesMade = true;
                  
                  // Update the selected gender state to trigger UI update
                  setSelectedGender(genderValue);
                }
              }
            } catch (error) {
              console.error("❌ Error getting biological sex:", error);
            }
            
            // 2. Get date of birth for age calculation
            try {
              const dateOfBirth = await new Promise<any>((resolve, reject) => {
                if (typeof AppleHealthKit.getDateOfBirth !== 'function') {
                  console.error("❌ getDateOfBirth function not available");
                  resolve(null);
                  return;
                }
                
                AppleHealthKit.getDateOfBirth({}, (err, result) => {
                  if (err) {
                    console.error('❌ Error fetching date of birth:', err);
                    resolve(null);
                  } else {
                    console.log(`👤 Date of birth data:`, result);
                    resolve(result);
                  }
                });
              });
              
              if (dateOfBirth && dateOfBirth.value) {
                const dob = new Date(dateOfBirth.value);
                const today = new Date();
                let age = today.getFullYear() - dob.getFullYear();
                
                // Adjust age if birthday hasn't occurred yet this year
                const m = today.getMonth() - dob.getMonth();
                if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
                  age--;
                }
                
                console.log(`👤 Calculated age: ${age}`);
                updatedInfo.age = age;
                updatesMade = true;
              }
            } catch (error) {
              console.error("❌ Error getting date of birth:", error);
            }
            
            // 3. Get latest height
            try {
              const heightData = await new Promise<any>((resolve, reject) => {
                if (typeof AppleHealthKit.getHeightSamples !== 'function') {
                  console.error("❌ getHeightSamples function not available");
                  resolve(null);
                  return;
                }
                
                AppleHealthKit.getHeightSamples({
                  unit: 'cm',
                  ascending: false,
                  limit: 1,
                  startDate: options.startDate, // Add start date
                  endDate: options.endDate      // Add end date
                }, (err, results) => {
                  if (err) {
                    console.error('❌ Error fetching height data:', err);
                    resolve(null);
                  } else if (Array.isArray(results) && results.length > 0) {
                    console.log(`👤 Height data:`, results[0]);
                    resolve(results[0]);
                  } else {
                    console.log("❌ No height data available");
                    resolve(null);
                  }
                });
              });
              
              if (heightData && heightData.value) {
                const height = Math.round(heightData.value);
                console.log(`👤 Setting height to: ${height} cm`);
                updatedInfo.height = height;
                updatesMade = true;
              }
            } catch (error) {
              console.error("❌ Error getting height:", error);
            }
            
            // 4. Get latest weight
            try {
              const weightData = await new Promise<any>((resolve, reject) => {
                if (typeof AppleHealthKit.getWeightSamples !== 'function') {
                  console.error("❌ getWeightSamples function not available");
                  resolve(null);
                  return;
                }
                
                AppleHealthKit.getWeightSamples({
                  unit: 'kg',
                  ascending: false,
                  limit: 1,
                  startDate: options.startDate, // Add start date
                  endDate: options.endDate      // Add end date
                }, (err, results) => {
                  if (err) {
                    console.error('❌ Error fetching weight data:', err);
                    resolve(null);
                  } else if (Array.isArray(results) && results.length > 0) {
                    console.log(`👤 Weight data:`, results[0]);
                    resolve(results[0]);
                  } else {
                    console.log("❌ No weight data available");
                    resolve(null);
                  }
                });
              });
              
              if (weightData && weightData.value) {
                const weight = Math.round(weightData.value);
                console.log(`👤 Setting weight to: ${weight} kg`);
                updatedInfo.weight = weight;
                updatesMade = true;
              }
            } catch (error) {
              console.error("❌ Error getting weight:", error);
            }

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
              Alert.alert('Info', 'No data available for auto-fill');
            }
          } catch (error) {
            console.error("❌ Error in HealthKit auto-fill:", error);
            Alert.alert('Error', 'Problem querying HealthKit data: ' + (error instanceof Error ? error.message : String(error)));
          }
        } else {
          console.warn("⚠️ No valid data source selected or HealthKit not available");
          Alert.alert('Info', 'Please select a data source first (Apple Health or Garmin)');
        }
      } catch (error: any) {
        console.error("❌ Auto-fill error:", error);
        Alert.alert('Error', 'There was a problem with auto-filling: ' + error.message);
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

    // Handle marijuana selection
    const handleMarijuanaSelect = (value) => {
      setLocalPersonalInfo(prev => ({...prev, marijuana_consumption: value}));
      setShowMarijuanaOptions(false);
    };

    // Handle diet type selection
    const handleDietSelect = (value) => {
      setLocalPersonalInfo(prev => ({...prev, diet_type: value}));
      setShowDietOptions(false);
    };

    // Handle cold shower selection
    const handleColdShowerSelect = (value) => {
      setLocalPersonalInfo(prev => ({...prev, cold_showers: value}));
      setShowColdShowerOptions(false);
    };

    // Handle meditation selection
    const handleMeditationSelect = (value) => {
      setLocalPersonalInfo(prev => ({...prev, meditation: value}));
      setShowMeditationOptions(false);
    };

    // Handle sauna selection
    const handleSaunaSelect = (value) => {
      setLocalPersonalInfo(prev => ({...prev, sauna_use: value}));
      setShowSaunaOptions(false);
    };

    // Handle sleep medication selection
    const handleSleepMedicationSelect = (value) => {
      setLocalPersonalInfo(prev => ({...prev, sleep_medication: value}));
      setShowSleepMedicationOptions(false);
    };

    // Handle blue light glasses selection
    const handleBlueLightGlassesSelect = (value) => {
      setLocalPersonalInfo(prev => ({...prev, blue_light_glasses: value}));
      setShowBlueLightGlassesOptions(false);
    };

    // Handle intermittent fasting selection
    const handleIntermittentFastingSelect = (value) => {
      setLocalPersonalInfo(prev => ({...prev, intermittent_fasting: value}));
      setShowIntermittentFastingOptions(false);
    };

    // Handle sleep mask selection
    const handleSleepMaskSelect = (value) => {
      setLocalPersonalInfo(prev => ({...prev, sleep_mask: value}));
      setShowSleepMaskOptions(false);
    };

    // Handle seasonal allergies selection
    const handleSeasonalAllergiesSelect = (value) => {
      setLocalPersonalInfo(prev => ({...prev, seasonal_allergies: value}));
      setShowSeasonalAllergiesOptions(false);
    };

    // Handle caffeine consumption selection
    const handleCaffeineConsumptionSelect = (value) => {
      setLocalPersonalInfo(prev => ({...prev, caffeine_consumption: value}));
      setShowCaffeineConsumptionOptions(false);
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
          <View style={[styles.modalContent, { maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Provide Personal Information</Text>
              <TouchableOpacity onPress={handleCloseModal}>
                <Text style={styles.closeButton}>✕</Text>
                </TouchableOpacity>
              </View>
            
            <ScrollView 
              style={{ maxHeight: '90%' }}
              showsVerticalScrollIndicator={true}
              contentContainerStyle={{ paddingBottom: 30 }}
            >
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>First Name</Text>
                <TextInput
                  style={styles.input}
                  value={localPersonalInfo.firstname || ''}
                  onChangeText={(text) => setLocalPersonalInfo(prev => ({...prev, firstname: text}))}
                  placeholder="First Name"
                  returnKeyType="done"
                  blurOnSubmit={true}
                />
              </View>
              
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Last Name</Text>
                <TextInput
                  style={styles.input}
                  value={localPersonalInfo.lastname || ''}
                  onChangeText={(text) => setLocalPersonalInfo(prev => ({...prev, lastname: text}))}
                  placeholder="Last Name"
                  returnKeyType="done"
                  blurOnSubmit={true}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Age</Text>
                <TextInput
                  style={styles.input}
                  value={localPersonalInfo.age ? String(localPersonalInfo.age) : ''}
                  onChangeText={(text) => {
                    const age = text === '' ? null : parseInt(text);
                    setLocalPersonalInfo(prev => ({...prev, age}));
                  }}
                  placeholder="Age"
                  keyboardType="number-pad"
                  returnKeyType="done"
                  blurOnSubmit={true}
                />
              </View>
              
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Gender</Text>
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
                        genderOptions.find(option => option.value === selectedGender)?.label || 'Please select' : 
                        'Please select'}
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
                <Text style={styles.formLabel}>Height (cm)</Text>
                <TextInput
                  style={styles.input}
                  value={localPersonalInfo.height ? String(localPersonalInfo.height) : ''}
                  onChangeText={(text) => {
                    const height = text === '' ? null : parseInt(text);
                    setLocalPersonalInfo(prev => ({...prev, height}));
                  }}
                  placeholder="Height in cm"
                  keyboardType="number-pad"
                  returnKeyType="done"
                  blurOnSubmit={true}
                />
              </View>
              
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Weight (kg)</Text>
                <TextInput
                  style={styles.input}
                  value={localPersonalInfo.weight ? String(localPersonalInfo.weight) : ''}
                  onChangeText={(text) => {
                    const weight = text === '' ? null : parseFloat(text);
                    setLocalPersonalInfo(prev => ({...prev, weight}));
                  }}
                  placeholder="Weight in kg"
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  blurOnSubmit={true}
                />
              </View>
              
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Fitness Level (1-10)</Text>
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
                  placeholder="Fitness Level (1-10)"
                  keyboardType="number-pad"
                  returnKeyType="done"
                  blurOnSubmit={true}
                />
              </View>
              
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Stress Level (1-10)</Text>
                <TextInput
                  style={styles.input}
                  value={localPersonalInfo.stress_level ? String(localPersonalInfo.stress_level) : ''}
                  onChangeText={(text) => {
                    const stressLevel = text === '' ? null : parseInt(text);
                    setLocalPersonalInfo(prev => ({...prev, stress_level: stressLevel}));
                  }}
                  placeholder="Stress Level (1-10)"
                  keyboardType="number-pad"
                  returnKeyType="done"
                  blurOnSubmit={true}
                />
              </View>
              
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Sleep Quality (1-10)</Text>
                <TextInput
                  style={styles.input}
                  value={localPersonalInfo.sleep_quality ? String(localPersonalInfo.sleep_quality) : ''}
                  onChangeText={(text) => {
                    const sleepQuality = text === '' ? null : parseInt(text);
                    setLocalPersonalInfo(prev => ({...prev, sleep_quality: sleepQuality}));
                  }}
                  placeholder="Sleep Quality (1-10)"
                  keyboardType="number-pad"
                  returnKeyType="done"
                  blurOnSubmit={true}
                />
              </View>
              
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Pre-existing Conditions</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={localPersonalInfo.pre_existing_conditions}
                  onChangeText={(text) => setLocalPersonalInfo({...localPersonalInfo, pre_existing_conditions: text})}
                  placeholder="Pre-existing Conditions"
                  multiline={true}
                  numberOfLines={3}
                  blurOnSubmit={true}
                />
              </View>
              
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Allergies</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={localPersonalInfo.allergies}
                  onChangeText={(text) => setLocalPersonalInfo({...localPersonalInfo, allergies: text})}
                  placeholder="Allergies"
                  multiline={true}
                  numberOfLines={3}
                  blurOnSubmit={true}
                />
              </View>

                            {/* Seasonal Allergies */}
                            <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Got Seasonal Allergies</Text>
                <TouchableOpacity 
                  style={[
                    styles.dropdownButton,
                    localPersonalInfo.seasonal_allergies ? styles.dropdownButtonSelected : {}
                  ]}
                  onPress={() => setShowSeasonalAllergiesOptions(!showSeasonalAllergiesOptions)}
                >
                  <View style={styles.dropdownContent}>
                    <Text style={styles.dropdownArrow}>{showSeasonalAllergiesOptions ? '▲' : '▼'}</Text>
                    <Text style={[
                      styles.dropdownButtonText,
                      localPersonalInfo.seasonal_allergies ? styles.dropdownButtonTextSelected : {}
                    ]}>
                      {localPersonalInfo.seasonal_allergies ? 
                        yesNoOptions.find(option => option.value === localPersonalInfo.seasonal_allergies)?.label || 'Please select' : 
                        'Please select'}
                    </Text>
                  </View>
                </TouchableOpacity>
                
                {showSeasonalAllergiesOptions && (
                  <View style={styles.optionsList}>
                    {yesNoOptions.map((option) => (
                      <TouchableOpacity
                        key={option.value}
                        style={[
                          styles.optionItem,
                          localPersonalInfo.seasonal_allergies === option.value ? styles.selectedOption : {}
                        ]}
                        onPress={() => handleSeasonalAllergiesSelect(option.value)}
                      >
                        <Text style={[
                          styles.optionText,
                          localPersonalInfo.seasonal_allergies === option.value ? styles.selectedOptionText : {}
                        ]}>
                          {option.label}
                          {localPersonalInfo.seasonal_allergies === option.value && ' ✓'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>


              {/* Caffeine Consumption */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Caffeine Consumption</Text>
                <TouchableOpacity 
                  style={[
                    styles.dropdownButton,
                    localPersonalInfo.caffeine_consumption ? styles.dropdownButtonSelected : {}
                  ]}
                  onPress={() => setShowCaffeineConsumptionOptions(!showCaffeineConsumptionOptions)}
                >
                  <View style={styles.dropdownContent}>
                    <Text style={styles.dropdownArrow}>{showCaffeineConsumptionOptions ? '▲' : '▼'}</Text>
                    <Text style={[
                      styles.dropdownButtonText,
                      localPersonalInfo.caffeine_consumption ? styles.dropdownButtonTextSelected : {}
                    ]}>
                      {localPersonalInfo.caffeine_consumption ? 
                        yesNoOptions.find(option => option.value === localPersonalInfo.caffeine_consumption)?.label || 'Please select' : 
                        'Please select'}
                    </Text>
                  </View>
                </TouchableOpacity>
                
                {showCaffeineConsumptionOptions && (
                  <View style={styles.optionsList}>
                    {yesNoOptions.map((option) => (
                      <TouchableOpacity
                        key={option.value}
                        style={[
                          styles.optionItem,
                          localPersonalInfo.caffeine_consumption === option.value ? styles.selectedOption : {}
                        ]}
                        onPress={() => handleCaffeineConsumptionSelect(option.value)}
                      >
                        <Text style={[
                          styles.optionText,
                          localPersonalInfo.caffeine_consumption === option.value ? styles.selectedOptionText : {}
                        ]}>
                          {option.label}
                          {localPersonalInfo.caffeine_consumption === option.value && ' ✓'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
              
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Smoker</Text>
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
                        smokerOptions.find(option => option.value === selectedSmoker)?.label || 'Please select' : 
                        'Please select'}
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
                <Text style={styles.formLabel}>Alcohol Consumption</Text>
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
                        alcoholOptions.find(option => option.value === selectedAlcohol)?.label || 'Please select' : 
                        'Please select'}
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
              
              {/* Marijuana Consumption */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Marijuana Consumption</Text>
                <TouchableOpacity 
                  style={[
                    styles.dropdownButton,
                    localPersonalInfo.marijuana_consumption ? styles.dropdownButtonSelected : {}
                  ]}
                  onPress={() => setShowMarijuanaOptions(!showMarijuanaOptions)}
                >
                  <View style={styles.dropdownContent}>
                    <Text style={styles.dropdownArrow}>{showMarijuanaOptions ? '▲' : '▼'}</Text>
                    <Text style={[
                      styles.dropdownButtonText,
                      localPersonalInfo.marijuana_consumption ? styles.dropdownButtonTextSelected : {}
                    ]}>
                      {localPersonalInfo.marijuana_consumption ? 
                        marijuanaOptions.find(option => option.value === localPersonalInfo.marijuana_consumption)?.label || 'Please select' : 
                        'Please select'}
                    </Text>
                  </View>
                </TouchableOpacity>
                
                {showMarijuanaOptions && (
                  <View style={styles.optionsList}>
                    {marijuanaOptions.map((option) => (
                      <TouchableOpacity
                        key={option.value}
                        style={[
                          styles.optionItem,
                          localPersonalInfo.marijuana_consumption === option.value ? styles.selectedOption : {}
                        ]}
                        onPress={() => handleMarijuanaSelect(option.value)}
                      >
                        <Text style={[
                          styles.optionText,
                          localPersonalInfo.marijuana_consumption === option.value ? styles.selectedOptionText : {}
                        ]}>
                          {option.label}
                          {localPersonalInfo.marijuana_consumption === option.value && ' ✓'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              {/* Diet Type */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Diet Type</Text>
                <TouchableOpacity 
                  style={[
                    styles.dropdownButton,
                    localPersonalInfo.diet_type ? styles.dropdownButtonSelected : {}
                  ]}
                  onPress={() => setShowDietOptions(!showDietOptions)}
                >
                  <View style={styles.dropdownContent}>
                    <Text style={styles.dropdownArrow}>{showDietOptions ? '▲' : '▼'}</Text>
                    <Text style={[
                      styles.dropdownButtonText,
                      localPersonalInfo.diet_type ? styles.dropdownButtonTextSelected : {}
                    ]}>
                      {localPersonalInfo.diet_type ? 
                        dietOptions.find(option => option.value === localPersonalInfo.diet_type)?.label || 'Please select' : 
                        'Please select'}
                    </Text>
                  </View>
                </TouchableOpacity>
                
                {showDietOptions && (
                  <View style={styles.optionsList}>
                    {dietOptions.map((option) => (
                <TouchableOpacity 
                        key={option.value}
                        style={[
                          styles.optionItem,
                          localPersonalInfo.diet_type === option.value ? styles.selectedOption : {}
                        ]}
                        onPress={() => handleDietSelect(option.value)}
                      >
                        <Text style={[
                          styles.optionText,
                          localPersonalInfo.diet_type === option.value ? styles.selectedOptionText : {}
                        ]}>
                          {option.label}
                          {localPersonalInfo.diet_type === option.value && ' ✓'}
                        </Text>
                </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

                            {/* Intermittent Fasting */}
                            <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Intermittent Fasting</Text>
                <TouchableOpacity 
                  style={[
                    styles.dropdownButton,
                    localPersonalInfo.intermittent_fasting ? styles.dropdownButtonSelected : {}
                  ]}
                  onPress={() => setShowIntermittentFastingOptions(!showIntermittentFastingOptions)}
                >
                  <View style={styles.dropdownContent}>
                    <Text style={styles.dropdownArrow}>{showIntermittentFastingOptions ? '▲' : '▼'}</Text>
                    <Text style={[
                      styles.dropdownButtonText,
                      localPersonalInfo.intermittent_fasting ? styles.dropdownButtonTextSelected : {}
                    ]}>
                      {localPersonalInfo.intermittent_fasting ? 
                        yesNoOptions.find(option => option.value === localPersonalInfo.intermittent_fasting)?.label || 'Please select' : 
                        'Please select'}
                    </Text>
                  </View>
                </TouchableOpacity>
                
                {showIntermittentFastingOptions && (
                  <View style={styles.optionsList}>
                    {yesNoOptions.map((option) => (
                      <TouchableOpacity
                        key={option.value}
                        style={[
                          styles.optionItem,
                          localPersonalInfo.intermittent_fasting === option.value ? styles.selectedOption : {}
                        ]}
                        onPress={() => handleIntermittentFastingSelect(option.value)}
                      >
                        <Text style={[
                          styles.optionText,
                          localPersonalInfo.intermittent_fasting === option.value ? styles.selectedOptionText : {}
                        ]}>
                          {option.label}
                          {localPersonalInfo.intermittent_fasting === option.value && ' ✓'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              {/* Cold Showers */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Cold Showers / Ice Baths</Text>
                <TouchableOpacity 
                  style={[
                    styles.dropdownButton,
                    localPersonalInfo.cold_showers ? styles.dropdownButtonSelected : {}
                  ]}
                  onPress={() => setShowColdShowerOptions(!showColdShowerOptions)}
                >
                  <View style={styles.dropdownContent}>
                    <Text style={styles.dropdownArrow}>{showColdShowerOptions ? '▲' : '▼'}</Text>
                    <Text style={[
                      styles.dropdownButtonText,
                      localPersonalInfo.cold_showers ? styles.dropdownButtonTextSelected : {}
                    ]}>
                      {localPersonalInfo.cold_showers ? 
                        yesNoOptions.find(option => option.value === localPersonalInfo.cold_showers)?.label || 'Please select' : 
                        'Please select'}
                    </Text>
                  </View>
                </TouchableOpacity>
                
                {showColdShowerOptions && (
                  <View style={styles.optionsList}>
                    {yesNoOptions.map((option) => (
                      <TouchableOpacity
                        key={option.value}
                        style={[
                          styles.optionItem,
                          localPersonalInfo.cold_showers === option.value ? styles.selectedOption : {}
                        ]}
                        onPress={() => handleColdShowerSelect(option.value)}
                      >
                        <Text style={[
                          styles.optionText,
                          localPersonalInfo.cold_showers === option.value ? styles.selectedOptionText : {}
                        ]}>
                          {option.label}
                          {localPersonalInfo.cold_showers === option.value && ' ✓'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              {/* Meditation */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Meditation Practice</Text>
                <TouchableOpacity 
                  style={[
                    styles.dropdownButton,
                    localPersonalInfo.meditation ? styles.dropdownButtonSelected : {}
                  ]}
                  onPress={() => setShowMeditationOptions(!showMeditationOptions)}
                >
                  <View style={styles.dropdownContent}>
                    <Text style={styles.dropdownArrow}>{showMeditationOptions ? '▲' : '▼'}</Text>
                    <Text style={[
                      styles.dropdownButtonText,
                      localPersonalInfo.meditation ? styles.dropdownButtonTextSelected : {}
                    ]}>
                      {localPersonalInfo.meditation ? 
                        yesNoOptions.find(option => option.value === localPersonalInfo.meditation)?.label || 'Please select' : 
                        'Please select'}
                    </Text>
                  </View>
                </TouchableOpacity>
                
                {showMeditationOptions && (
                  <View style={styles.optionsList}>
                    {yesNoOptions.map((option) => (
                      <TouchableOpacity
                        key={option.value}
                        style={[
                          styles.optionItem,
                          localPersonalInfo.meditation === option.value ? styles.selectedOption : {}
                        ]}
                        onPress={() => handleMeditationSelect(option.value)}
                      >
                        <Text style={[
                          styles.optionText,
                          localPersonalInfo.meditation === option.value ? styles.selectedOptionText : {}
                        ]}>
                          {option.label}
                          {localPersonalInfo.meditation === option.value && ' ✓'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              {/* Sauna Use */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Regular Sauna Use</Text>
                <TouchableOpacity 
                  style={[
                    styles.dropdownButton,
                    localPersonalInfo.sauna_use ? styles.dropdownButtonSelected : {}
                  ]}
                  onPress={() => setShowSaunaOptions(!showSaunaOptions)}
                >
                  <View style={styles.dropdownContent}>
                    <Text style={styles.dropdownArrow}>{showSaunaOptions ? '▲' : '▼'}</Text>
                    <Text style={[
                      styles.dropdownButtonText,
                      localPersonalInfo.sauna_use ? styles.dropdownButtonTextSelected : {}
                    ]}>
                      {localPersonalInfo.sauna_use ? 
                        yesNoOptions.find(option => option.value === localPersonalInfo.sauna_use)?.label || 'Please select' : 
                        'Please select'}
                    </Text>
                  </View>
                </TouchableOpacity>
                
                {showSaunaOptions && (
                  <View style={styles.optionsList}>
                    {yesNoOptions.map((option) => (
                      <TouchableOpacity
                        key={option.value}
                        style={[
                          styles.optionItem,
                          localPersonalInfo.sauna_use === option.value ? styles.selectedOption : {}
                        ]}
                        onPress={() => handleSaunaSelect(option.value)}
                      >
                        <Text style={[
                          styles.optionText,
                          localPersonalInfo.sauna_use === option.value ? styles.selectedOptionText : {}
                        ]}>
                          {option.label}
                          {localPersonalInfo.sauna_use === option.value && ' ✓'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              {/* Sleep Medication */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Sleep Medication</Text>
                <TouchableOpacity 
                  style={[
                    styles.dropdownButton,
                    localPersonalInfo.sleep_medication ? styles.dropdownButtonSelected : {}
                  ]}
                  onPress={() => setShowSleepMedicationOptions(!showSleepMedicationOptions)}
                >
                  <View style={styles.dropdownContent}>
                    <Text style={styles.dropdownArrow}>{showSleepMedicationOptions ? '▲' : '▼'}</Text>
                    <Text style={[
                      styles.dropdownButtonText,
                      localPersonalInfo.sleep_medication ? styles.dropdownButtonTextSelected : {}
                    ]}>
                      {localPersonalInfo.sleep_medication ? 
                        yesNoOptions.find(option => option.value === localPersonalInfo.sleep_medication)?.label || 'Please select' : 
                        'Please select'}
                    </Text>
                  </View>
                </TouchableOpacity>
                
                {showSleepMedicationOptions && (
                  <View style={styles.optionsList}>
                    {yesNoOptions.map((option) => (
                      <TouchableOpacity
                        key={option.value}
                        style={[
                          styles.optionItem,
                          localPersonalInfo.sleep_medication === option.value ? styles.selectedOption : {}
                        ]}
                        onPress={() => handleSleepMedicationSelect(option.value)}
                      >
                        <Text style={[
                          styles.optionText,
                          localPersonalInfo.sleep_medication === option.value ? styles.selectedOptionText : {}
                        ]}>
                          {option.label}
                          {localPersonalInfo.sleep_medication === option.value && ' ✓'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              {/* Blue Light Glasses */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Blue Light Blocking Glasses</Text>
                <TouchableOpacity 
                  style={[
                    styles.dropdownButton,
                    localPersonalInfo.blue_light_glasses ? styles.dropdownButtonSelected : {}
                  ]}
                  onPress={() => setShowBlueLightGlassesOptions(!showBlueLightGlassesOptions)}
                >
                  <View style={styles.dropdownContent}>
                    <Text style={styles.dropdownArrow}>{showBlueLightGlassesOptions ? '▲' : '▼'}</Text>
                    <Text style={[
                      styles.dropdownButtonText,
                      localPersonalInfo.blue_light_glasses ? styles.dropdownButtonTextSelected : {}
                    ]}>
                      {localPersonalInfo.blue_light_glasses ? 
                        yesNoOptions.find(option => option.value === localPersonalInfo.blue_light_glasses)?.label || 'Please select' : 
                        'Please select'}
                    </Text>
                  </View>
                </TouchableOpacity>
                
                {showBlueLightGlassesOptions && (
                  <View style={styles.optionsList}>
                    {yesNoOptions.map((option) => (
                      <TouchableOpacity
                        key={option.value}
                        style={[
                          styles.optionItem,
                          localPersonalInfo.blue_light_glasses === option.value ? styles.selectedOption : {}
                        ]}
                        onPress={() => handleBlueLightGlassesSelect(option.value)}
                      >
                        <Text style={[
                          styles.optionText,
                          localPersonalInfo.blue_light_glasses === option.value ? styles.selectedOptionText : {}
                        ]}>
                          {option.label}
                          {localPersonalInfo.blue_light_glasses === option.value && ' ✓'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>



              
              
            </ScrollView>
            
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={styles.autoFillButton} 
                onPress={handleAutoFill}
                disabled={isAutoFilling}
              >
                <Text style={styles.modalButtonText}>
                  {isAutoFilling ? "Auto-filling..." : "Autofill Health Data"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.modalSubmitButton} 
                onPress={handleSubmit}
              >
                <Text style={styles.modalButtonText}>Submit</Text>
              </TouchableOpacity>
            </View>
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
      <Text style={styles.title}>Good morning {personalInfo.firstname}! </Text>
      </View>
      
      {loading ? (
        <ActivityIndicator size="large" color="#0000ff" />
      ) : (
        <ScrollView 
          style={styles.scrollView} 
          showsVerticalScrollIndicator={true}
          contentContainerStyle={styles.scrollViewContent}
        >
        

          

          {(!personalInfoSubmitted || !historyDataUploaded) && (
            <>
              <Text style={styles.sectionHeader}>Please provide your personal data once:</Text>
              <View style={styles.buttonContainer}>
                <TouchableOpacity 
                  style={[
                    styles.button,
                    personalInfoSubmitted ? styles.buttonPressed : {}
                  ]}
                  onPress={handlePersonalInfoButtonPress}
                >
                  <View style={styles.buttonWithCheckbox}>
                    <Text style={styles.buttonText}>Provide Personal Information</Text>
                    {personalInfoSubmitted && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={[
                    styles.button,
                    historyDataUploaded ? styles.buttonPressed : {}
                  ]}
                  onPress={async () => {
                    // Retrieve credentials before the function call
                    const storedEmail = email || await SecureStore.getItemAsync("garmin_email") || "";
                    const storedPassword = password || await SecureStore.getItemAsync("garmin_password") || "";
                    
                    const uploadSuccess = await uploadHistoricalData(
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
                    );
                    
                    // Only set the uploaded flag if the upload was successful
                    if (uploadSuccess) {
                      setHistoryDataUploaded(true);
                    }
                  }}
                >
                  <View style={styles.buttonWithCheckbox}>
                    <Text style={styles.buttonText}>Upload Historical Data</Text>
                    {historyDataUploaded && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                </TouchableOpacity>
              </View>
            </>
          )}

          <Text style={styles.sectionHeader}>Please provide today's data:</Text>
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={styles.button}
              onPress={() => {
                if (dataSource === 'apple') {
                  fetchHRVData();
                } else if (dataSource === 'garmin') {
                  checkLogin();
                }
              }}
            >
              <Text style={styles.buttonText}>Send HRV Data</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[
                styles.button, 
                surveySubmitted ? styles.buttonPressed : {},
                !personalInfoSubmitted ? styles.buttonDisabled : {}
              ]}
              onPress={personalInfoSubmitted ? handlePssButtonPress : () => {
                Alert.alert(
                  "Information Required",
                  "Please fill out your personal information first before taking the daily survey."
                );
              }}
            >
              <View style={styles.buttonWithCheckbox}>
                <Text style={[
                  styles.buttonText,
                  !personalInfoSubmitted ? styles.buttonTextDisabled : {}
                ]}>Open Daily Survey</Text>
                {surveySubmitted && <Text style={styles.checkmark}>✓</Text>}
              </View>
            </TouchableOpacity>
          </View>
          
          {/* Add notification time picker component */}
          <NotificationTimePicker 
            onTimeSet={(hour, minute) => {
              console.log(`Notification time set to ${hour}:${minute}`);
            }}
            onSubmit={() => {
              console.log('Notification time picker submitted');
              // Could add additional state management here if needed
            }}
          />

          {/* Sleep Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Sleep Analysis</Text>
            <View style={styles.hrvSummary}>
            {/* Sleep Summary */}
            {garminData?.sleep?.summary ? (
              <>
                <View style={styles.sleepSummary}>
                  <Text style={styles.sleepTime}>
                    {garminData.sleep.summary.sleep_start ? 
                      new Date(garminData.sleep.summary.sleep_start).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) :
                      'N/A'} 
                    {' - '}
                    {garminData.sleep.summary.sleep_end ? 
                      new Date(garminData.sleep.summary.sleep_end).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) :
                      'N/A'}
                  </Text>
                  
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
                    <Text style={styles.label}>Awake Time:</Text>
                    <Text style={styles.value}>
                      {formatDuration(garminData.sleep.summary.awake_seconds)}
                    </Text>
                  </View>

                  <View style={styles.row}>
                    <Text style={styles.label}>Sleep Score:</Text>
                    <Text style={styles.value}>
                      {garminData.sleep.summary.sleep_score || 'N/A'}
                    </Text>
                  </View>
                </View>
                
              </>
            ) : (
              <Text style={styles.noData}>No sleep data available</Text>
            )}
            </View>
          </View>

          {/* Activity Section */}
          
          {garminData.activity && (
            <View style={styles.sectionTitle}>
              <Text style={styles.sectionTitle}>Activity</Text>
              <View style={styles.hrvSummary}>
              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>Steps:</Text>
                <Text style={styles.dataValue}>{garminData.activity.steps || 'N/A'}</Text>
              </View>
              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>Calories:</Text>
                <Text style={styles.dataValue}>{garminData.activity.calories_burned || 'N/A'}</Text>
              </View>
              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>Active Minutes:</Text>
                <Text style={styles.dataValue}>{garminData.activity.active_minutes || 'N/A'}</Text>
              </View>
              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>Distance:</Text>
                <Text style={styles.dataValue}>{garminData.activity.distance_km?.toFixed(1) || 'N/A'} km</Text>
              </View>
              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>Mindful Minutes:</Text>
                <Text style={styles.dataValue}>{garminData.activity.mindful_minutes !== undefined && garminData.activity.mindful_minutes !== null ? garminData.activity.mindful_minutes : 'N/A'}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>VO2 Max:</Text>
                <Text style={styles.value}>
                  {garminData.activity.vo2_max > 0 ? 
                    `${garminData.activity.vo2_max.toFixed(1)} (${garminData.activity.vo2_max_status})` : 
                    'N/A'}
                </Text>
              </View>
              {garminData.activity.vo2_max > 0 && (
                <View style={styles.subRow}>
                  <Text style={styles.subText}>
                    Measured on: {garminData.activity.vo2_max_date}
                  </Text>
                </View>
              )}
              </View>
            </View>
          )}

  

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
              <Text style={styles.modalTitle}>Open Daily Survey</Text>
              <TouchableOpacity onPress={() => setPssModalVisible(false)}>
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView>
            <FlatList
              data={questions}
              keyExtractor={(item, index) => index.toString()}
              renderItem={({ item, index }) => (
                <View style={styles.questionContainer}>
                  <Text style={styles.questionText}>{item}</Text>
                  <View style={styles.likertContainer}>
                    {getOptionsForQuestion(index).map((option) => (
                      <TouchableOpacity
                        key={option.value}
                        style={[
                            styles.optionWrapper,
                            index === 0 ? { width: '9%' } : { width: '19%' }
                        ]}
                        onPress={() => handleResponseChange(option.value, index)}
                      >
                          <View
                            style={[
                              styles.circleOption,
                              index === 0 ? { 
                                width: 15, 
                                height: 15, 
                                borderRadius: 7.5 
                              } : {},
                              responses[index] === option.value && styles.circleSelected
                            ]}
                          >
                            {responses[index] === option.value && (
                              <View 
                                style={[
                                  styles.innerCircle,
                                  index === 0 ? { 
                                    width: 7, 
                                    height: 7, 
                                    borderRadius: 3.5 
                                  } : {}
                                ]} 
                              />
                            )}
                          </View>
                          <Text
                            style={[
                              styles.optionLabel,
                              index === 0 ? { fontSize: 8 } : {},
                              responses[index] === option.value && styles.labelSelected
                            ]}
                          >
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                    {index === 3 && responses[index] === 5 && (
                      <View style={{marginTop: 10}}>
                        <TextInput
                          style={styles.input}
                          placeholder="Please specify..."
                          value={otherText}
                          onChangeText={setOtherText}
                        />
                </View>
              )}
                  </View>
                )}
                scrollEnabled={false}
              />
              
              <View style={styles.dailySurveyContainer}>
                <Text style={styles.sectionTitle}>What happened yesterday?</Text>
                
                {/* Morning Sunlight */}
                <View style={styles.yesNoQuestion}>
                  <Text style={styles.questionText}>☀️ Got morning sunlight (within 15min of waking)?</Text>
                  <TouchableOpacity 
                    style={[
                      styles.toggleButton, 
                      dailySurveyResponses.morning_sunlight && styles.toggleButtonActive
                    ]}
                    onPress={() => setDailySurveyResponses(prev => ({...prev, morning_sunlight: !prev.morning_sunlight}))}
                  >
                    <Text style={[
                      styles.toggleButtonText, 
                      dailySurveyResponses.morning_sunlight && styles.toggleButtonTextActive
                    ]}>
                      {dailySurveyResponses.morning_sunlight ? 'Yes' : 'No'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Seasonal Allergies - only show if user has seasonal allergies */}
                {personalInfo.seasonal_allergies === 'yes' && (
                <View style={styles.yesNoQuestion}>
                  <Text style={styles.questionText}>🤧 Got seasonal allergies?</Text>
                  <TouchableOpacity 
                    style={[
                      styles.toggleButton, 
                      dailySurveyResponses.seasonal_allergies && styles.toggleButtonActive
                    ]}
                    onPress={() => setDailySurveyResponses(prev => ({...prev, seasonal_allergies: !prev.seasonal_allergies}))}
                  >
                    <Text style={[
                      styles.toggleButtonText, 
                      dailySurveyResponses.seasonal_allergies && styles.toggleButtonTextActive
                    ]}>
                      {dailySurveyResponses.seasonal_allergies ? 'Yes' : 'No'}
                    </Text>
                  </TouchableOpacity>
                </View>
                )}
                
                {/* Sick Today */}
                <View style={styles.yesNoQuestion}>
                  <Text style={styles.questionText}>🤒 Felt sick?</Text>
                  <TouchableOpacity 
                    style={[
                      styles.toggleButton, 
                      dailySurveyResponses.sick && styles.toggleButtonActive
                    ]}
                    onPress={() => setDailySurveyResponses(prev => ({...prev, sick: !prev.sick}))}
                  >
                    <Text style={[
                      styles.toggleButtonText, 
                      dailySurveyResponses.sick && styles.toggleButtonTextActive
                    ]}>
                      {dailySurveyResponses.sick ? 'Yes' : 'No'}
                    </Text>
                  </TouchableOpacity>
                </View>
                
                {/* Caffeine - only show if user consumes caffeine */}
                {personalInfo.caffeine_consumption === 'yes' && (
                <View style={styles.yesNoQuestion}>
                  <Text style={styles.questionText}>☕ Consumed caffeine after noon?</Text>
                  <TouchableOpacity 
                    style={[
                      styles.toggleButton, 
                      dailySurveyResponses.caffeine && styles.toggleButtonActive
                    ]}
                    onPress={() => setDailySurveyResponses(prev => ({...prev, caffeine: !prev.caffeine}))}
                  >
                    <Text style={[
                      styles.toggleButtonText, 
                      dailySurveyResponses.caffeine && styles.toggleButtonTextActive
                    ]}>
                      {dailySurveyResponses.caffeine ? 'Yes' : 'No'}
                    </Text>
                  </TouchableOpacity>
                </View>
                )}

                
                
                {/* 3L Water */}
                <View style={styles.yesNoQuestion}>
                  <Text style={styles.questionText}>💧 Drank more than 3L of water?</Text>
                  <TouchableOpacity 
                    style={[
                      styles.toggleButton, 
                      dailySurveyResponses.water_3l && styles.toggleButtonActive
                    ]}
                    onPress={() => setDailySurveyResponses(prev => ({...prev, water_3l: !prev.water_3l}))}
                  >
                    <Text style={[
                      styles.toggleButtonText, 
                      dailySurveyResponses.water_3l && styles.toggleButtonTextActive
                    ]}>
                      {dailySurveyResponses.water_3l ? 'Yes' : 'No'}
                    </Text>
                  </TouchableOpacity>
                </View>
                
                {/* Processed Food */}
                <View style={styles.yesNoQuestion}>
                  <Text style={styles.questionText}>🍔 Ate processed food?</Text>
                  <TouchableOpacity 
                    style={[
                      styles.toggleButton, 
                      dailySurveyResponses.processed_food && styles.toggleButtonActive
                    ]}
                    onPress={() => setDailySurveyResponses(prev => ({...prev, processed_food: !prev.processed_food}))}
                  >
                    <Text style={[
                      styles.toggleButtonText, 
                      dailySurveyResponses.processed_food && styles.toggleButtonTextActive
                    ]}>
                      {dailySurveyResponses.processed_food ? 'Yes' : 'No'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Only show meditation question if they practice meditation */}
                {personalInfo.meditation === 'yes' && (
                  <View style={styles.yesNoQuestion}>
                    <Text style={styles.questionText}>🧘 Meditate?</Text>
                    <TouchableOpacity 
                      style={[
                        styles.toggleButton, 
                        dailySurveyResponses.meditation && styles.toggleButtonActive
                      ]}
                      onPress={() => setDailySurveyResponses(prev => ({...prev, meditation: !prev.meditation}))}
                    >
                      <Text style={[
                        styles.toggleButtonText, 
                        dailySurveyResponses.meditation && styles.toggleButtonTextActive
                      ]}>
                        {dailySurveyResponses.meditation ? 'Yes' : 'No'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
                
                {/* Exercise */}
                <View style={styles.yesNoQuestion}>
                  <Text style={styles.questionText}>🏋️‍♀️ Exercised?</Text>
                  <TouchableOpacity 
                    style={[
                      styles.toggleButton, 
                      dailySurveyResponses.exercise && styles.toggleButtonActive
                    ]}
                    onPress={() => setDailySurveyResponses(prev => ({...prev, exercise: !prev.exercise}))}
                  >
                    <Text style={[
                      styles.toggleButtonText, 
                      dailySurveyResponses.exercise && styles.toggleButtonTextActive
                    ]}>
                      {dailySurveyResponses.exercise ? 'Yes' : 'No'}
                    </Text>
                  </TouchableOpacity>
                </View>
                
                {/* Exercise follow-up questions - only show when exercise is true */}
                {dailySurveyResponses.exercise && (
                  <View style={styles.subQuestionContainer}>
                    <View style={styles.formGroup}>
                      <Text style={styles.subQuestionText}>What did you do?</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="Type of exercise"
                        value={dailySurveyResponses.exercise_type}
                        onChangeText={(text) => setDailySurveyResponses(prev => ({...prev, exercise_type: text}))}
                      />
                    </View>
                    
                    <View style={styles.formGroup}>
                      <Text style={styles.subQuestionText}>How long? (minutes)</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="Duration in minutes"
                        keyboardType="number-pad"
                        value={dailySurveyResponses.exercise_duration}
                        onChangeText={(text) => setDailySurveyResponses(prev => ({...prev, exercise_duration: text}))}
                      />
                    </View>
                  </View>
                )}
                
                {/* Met Friends */}
                <View style={styles.yesNoQuestion}>
                  <Text style={styles.questionText}>👥 Met close friends?</Text>
                  <TouchableOpacity 
                    style={[
                      styles.toggleButton, 
                      dailySurveyResponses.met_friends && styles.toggleButtonActive
                    ]}
                    onPress={() => setDailySurveyResponses(prev => ({...prev, met_friends: !prev.met_friends}))}
                  >
                    <Text style={[
                      styles.toggleButtonText, 
                      dailySurveyResponses.met_friends && styles.toggleButtonTextActive
                    ]}>
                      {dailySurveyResponses.met_friends ? 'Yes' : 'No'}
                    </Text>
                  </TouchableOpacity>
                </View>
                
                {/* Relaxation Techniques */}
                <View style={styles.yesNoQuestion}>
                  <Text style={styles.questionText}>🧘‍♂️ Engaged in relaxation techniques?</Text>
                  <TouchableOpacity 
                    style={[
                      styles.toggleButton, 
                      dailySurveyResponses.relaxation && styles.toggleButtonActive
                    ]}
                    onPress={() => setDailySurveyResponses(prev => ({...prev, relaxation: !prev.relaxation}))}
                  >
                    <Text style={[
                      styles.toggleButtonText, 
                      dailySurveyResponses.relaxation && styles.toggleButtonTextActive
                    ]}>
                      {dailySurveyResponses.relaxation ? 'Yes' : 'No'}
                    </Text>
                  </TouchableOpacity>
                </View>
                
                {/* Relaxation type options - only show when relaxation is true */}
                {dailySurveyResponses.relaxation && (
                  <View style={styles.subQuestionContainer}>
                    <Text style={styles.subQuestionText}>What type?</Text>
                    
                    {/* Meditation option */}
                    <TouchableOpacity 
                      style={[
                        styles.subOptionButton, 
                        dailySurveyResponses.relaxation_meditation && styles.subOptionButtonActive
                      ]}
                      onPress={() => setDailySurveyResponses(prev => ({...prev, relaxation_meditation: !prev.relaxation_meditation}))}
                    >
                      <Text style={[
                        styles.subOptionText, 
                        dailySurveyResponses.relaxation_meditation && styles.subOptionTextActive
                      ]}>
                        Meditation
                      </Text>
                    </TouchableOpacity>
                    
                    {/* Deep breathing option */}
                    <TouchableOpacity 
                      style={[
                        styles.subOptionButton, 
                        dailySurveyResponses.relaxation_breathing && styles.subOptionButtonActive
                      ]}
                      onPress={() => setDailySurveyResponses(prev => ({...prev, relaxation_breathing: !prev.relaxation_breathing}))}
                    >
                      <Text style={[
                        styles.subOptionText, 
                        dailySurveyResponses.relaxation_breathing && styles.subOptionTextActive
                      ]}>
                        Deep breathing
                      </Text>
                    </TouchableOpacity>
                    
                    {/* Journaling option */}
                    <TouchableOpacity 
                      style={[
                        styles.subOptionButton, 
                        dailySurveyResponses.relaxation_journaling && styles.subOptionButtonActive
                      ]}
                      onPress={() => setDailySurveyResponses(prev => ({...prev, relaxation_journaling: !prev.relaxation_journaling}))}
                    >
                      <Text style={[
                        styles.subOptionText, 
                        dailySurveyResponses.relaxation_journaling && styles.subOptionTextActive
                      ]}>
                        Journaling
                      </Text>
                    </TouchableOpacity>
                    
                    {/* Music option */}
                    <TouchableOpacity 
                      style={[
                        styles.subOptionButton, 
                        dailySurveyResponses.relaxation_music && styles.subOptionButtonActive
                      ]}
                      onPress={() => setDailySurveyResponses(prev => ({...prev, relaxation_music: !prev.relaxation_music}))}
                    >
                      <Text style={[
                        styles.subOptionText, 
                        dailySurveyResponses.relaxation_music && styles.subOptionTextActive
                      ]}>
                        Listening to music
                      </Text>
                    </TouchableOpacity>
                    
                    {/* Other option with text input */}
                    <TouchableOpacity 
                      style={[
                        styles.subOptionButton, 
                        dailySurveyResponses.relaxation_other && styles.subOptionButtonActive
                      ]}
                      onPress={() => setDailySurveyResponses(prev => ({...prev, relaxation_other: !prev.relaxation_other}))}
                    >
                      <Text style={[
                        styles.subOptionText, 
                        dailySurveyResponses.relaxation_other && styles.subOptionTextActive
                      ]}>
                        Other
                      </Text>
                    </TouchableOpacity>
                    
                    {/* Text input for "Other" */}
                    {dailySurveyResponses.relaxation_other && (
                      <TextInput
                        style={styles.otherTextInput}
                        placeholder="Please specify..."
                        value={dailySurveyResponses.relaxation_other_text || ''}
                        onChangeText={(text) => setDailySurveyResponses(prev => ({...prev, relaxation_other_text: text}))}
                      />
                    )}
                    
                    {/* How long? input field */}
                    <View style={styles.formGroup}>
                      <Text style={styles.subQuestionText}>How long? (minutes)</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="Duration in minutes"
                        keyboardType="number-pad"
                        value={dailySurveyResponses.relaxation_duration}
                        onChangeText={(text) => setDailySurveyResponses(prev => ({...prev, relaxation_duration: text}))}
                      />
                    </View>
                  </View>
                )}

                {/* Late Meal */}
                <View style={styles.yesNoQuestion}>
                  <Text style={styles.questionText}>🍽️ Had a late meal (within 2h before sleep)?</Text>
                  <TouchableOpacity 
                    style={[
                      styles.toggleButton, 
                      dailySurveyResponses.late_meal && styles.toggleButtonActive
                    ]}
                    onPress={() => setDailySurveyResponses(prev => ({...prev, late_meal: !prev.late_meal}))}
                  >
                    <Text style={[
                      styles.toggleButtonText, 
                      dailySurveyResponses.late_meal && styles.toggleButtonTextActive
                    ]}>
                      {dailySurveyResponses.late_meal ? 'Yes' : 'No'}
                    </Text>
                  </TouchableOpacity>
                </View>

                                {/* Only show alcohol question if user drinks alcohol */}
                                {personalInfo.alcohol_consumption !== 'never' && (
                  <View style={styles.yesNoQuestion}>
                    <Text style={styles.questionText}>🍷 Consumed alcohol?</Text>
                    <TouchableOpacity 
                      style={[
                        styles.toggleButton, 
                        dailySurveyResponses.alcohol && styles.toggleButtonActive
                      ]}
                      onPress={() => setDailySurveyResponses(prev => ({...prev, alcohol: !prev.alcohol}))}
                    >
                      <Text style={[
                        styles.toggleButtonText, 
                        dailySurveyResponses.alcohol && styles.toggleButtonTextActive
                      ]}>
                        {dailySurveyResponses.alcohol ? 'Yes' : 'No'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Only show smoking question if user smokes */}
                {personalInfo.smoker !== 'no' && (
                  <View style={styles.yesNoQuestion}>
                    <Text style={styles.questionText}>🚬 Smoked?</Text>
                    <TouchableOpacity 
                      style={[
                        styles.toggleButton, 
                        dailySurveyResponses.smoking && styles.toggleButtonActive
                      ]}
                      onPress={() => setDailySurveyResponses(prev => ({...prev, smoking: !prev.smoking}))}
                    >
                      <Text style={[
                        styles.toggleButtonText, 
                        dailySurveyResponses.smoking && styles.toggleButtonTextActive
                      ]}>
                        {dailySurveyResponses.smoking ? 'Yes' : 'No'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Marijuana - only show if user consumes marijuana */}
                {personalInfo.marijuana_consumption !== 'no' && (
                <View style={styles.yesNoQuestion}>
                  <Text style={styles.questionText}>🍃 Smoked marijuana?</Text>
                  <TouchableOpacity 
                    style={[
                      styles.toggleButton, 
                      dailySurveyResponses.marijuana && styles.toggleButtonActive
                    ]}
                    onPress={() => setDailySurveyResponses(prev => ({...prev, marijuana: !prev.marijuana}))}
                  >
                    <Text style={[
                      styles.toggleButtonText, 
                      dailySurveyResponses.marijuana && styles.toggleButtonTextActive
                    ]}>
                      {dailySurveyResponses.marijuana ? 'Yes' : 'No'}
                    </Text>
                  </TouchableOpacity>
                </View>
                )}

                {/* Bright Lights */}
                <View style={styles.yesNoQuestion}>
                  <Text style={styles.questionText}>💡 Exposed to bright lights {'<'} 1h before bed?</Text>
                  <TouchableOpacity 
                    style={[
                      styles.toggleButton, 
                      dailySurveyResponses.bright_lights && styles.toggleButtonActive
                    ]}
                    onPress={() => setDailySurveyResponses(prev => ({...prev, bright_lights: !prev.bright_lights}))}
                  >
                    <Text style={[
                      styles.toggleButtonText, 
                      dailySurveyResponses.bright_lights && styles.toggleButtonTextActive
                    ]}>
                      {dailySurveyResponses.bright_lights ? 'Yes' : 'No'}
                    </Text>
                  </TouchableOpacity>
                </View>
                
                {/* Phone in Bed */}
                <View style={styles.yesNoQuestion}>
                  <Text style={styles.questionText}>📱 Used phone in bed?</Text>
                  <TouchableOpacity 
                    style={[
                      styles.toggleButton, 
                      dailySurveyResponses.phone_in_bed && styles.toggleButtonActive
                    ]}
                    onPress={() => setDailySurveyResponses(prev => ({...prev, phone_in_bed: !prev.phone_in_bed}))}
                  >
                    <Text style={[
                      styles.toggleButtonText, 
                      dailySurveyResponses.phone_in_bed && styles.toggleButtonTextActive
                    ]}>
                      {dailySurveyResponses.phone_in_bed ? 'Yes' : 'No'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
              </ScrollView>
              
              <View style={styles.modalButtons}>
                <TouchableOpacity 
                  style={styles.autoFillButton} 
                  onPress={() => {
                    // Arrays to store found activities by type
                    const exerciseActivities = [];
                    const relaxationActivities = [];
                    let exerciseDuration = 0;
                    let relaxationDuration = 0;
                    let hasMindfulMinutes = false;
                    
                    // Check if there are activities in the training section
                    if (garminData?.activity?.daily_activities && 
                        garminData.activity.daily_activities.length > 0) {
                          
                      // Categorize activities
                      garminData.activity.daily_activities.forEach(activity => {
                        const activityType = activity.type.toLowerCase();
                        
                        // Check if it's a relaxation activity (yoga or meditation)
                        if (activityType.includes('yoga') || 
                            activityType.includes('meditation') || 
                            activityType.includes('mindful')) {
                          relaxationActivities.push(activity.type);
                          relaxationDuration += activity.duration_minutes;
                        } 
                        // Otherwise, it's a regular exercise
                        else {
                          exerciseActivities.push(activity.type);
                          exerciseDuration += activity.duration_minutes;
                        }
                      });
                    }
                    
                    // Check for mindful minutes
                    if (garminData?.activity?.mindful_minutes && 
                        garminData.activity.mindful_minutes > 0) {
                      hasMindfulMinutes = true;
                      
                      // Only add mindful minutes to duration if no meditation activities found
                      if (!relaxationActivities.some(a => 
                          a.toLowerCase().includes('meditation') || 
                          a.toLowerCase().includes('mindful'))) {
                        relaxationDuration += garminData.activity.mindful_minutes;
                      }
                    }
                    
                    // Update exercise data if found
                    if (exerciseActivities.length > 0) {
                      setDailySurveyResponses(prev => ({
                        ...prev,
                        exercise: true,
                        exercise_type: exerciseActivities.join(", "),
                        exercise_duration: exerciseDuration.toString()
                      }));
                    }
                    
                    // Update relaxation data if found
                    if (relaxationActivities.length > 0 || hasMindfulMinutes) {
                      const hasYoga = relaxationActivities.some(a => a.toLowerCase().includes('yoga'));
                      const hasMeditation = relaxationActivities.some(a => 
                        a.toLowerCase().includes('meditation') || 
                        a.toLowerCase().includes('mindful')) || hasMindfulMinutes;
                      
                      setDailySurveyResponses(prev => ({
                        ...prev,
                        relaxation: true,
                        relaxation_duration: relaxationDuration.toString(),
                        relaxation_meditation: hasMeditation,
                        relaxation_other: hasYoga,
                        relaxation_other_text: hasYoga ? 'Yoga' : prev.relaxation_other_text
                      }));
                    }
                    
                    // Show message if no data found
                    if (exerciseActivities.length === 0 && 
                        relaxationActivities.length === 0 && 
                        !hasMindfulMinutes) {
                      Alert.alert(
                        "No Activity Data",
                        "No exercise or relaxation activities were found in your data."
                      );
                    }
                  }}
                >
                  <Text style={styles.autoFillButtonText}>Autofill Exercise Data</Text>
                </TouchableOpacity>
                
                <TouchableOpacity style={styles.modalSubmitButton} onPress={submitSurvey}>
                  <Text style={styles.modalButtonText}>Submit</Text>
                </TouchableOpacity>
              </View>
            
          </View>
        </View>
      </Modal>

      {/* Personal Info Modal */}
      <PersonalInfoModal />

    </View>
  );
};

export default HomeScreen;
