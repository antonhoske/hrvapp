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
  value: 'INBED' | 'ASLEEP' | 'AWAKE';
}

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
  const [responses, setResponses] = useState<string[]>(["", "", ""]);
  const [healthKitAvailable, setHealthKitAvailable] = useState(false);
  const [personalInfo, setPersonalInfo] = useState({
    name: "",
    age: "",
    gender: "",
    occupation: "",
    height: "",
    weight: "",
    fitnessLevel: "",
    stressLevel: "",
    sleepQuality: "",
    diet: "",
    medications: "",
    healthConditions: ""
  });
  const [garminData, setGarminData] = useState<GarminData>({
    stress: null,
    hrv: null,
    sleep: null,
    activity: null,
    heart_rate: null
  });
  const [dataSource, setDataSource] = useState<'garmin' | 'apple' | null>(null);
  const [sourceSelectionVisible, setSourceSelectionVisible] = useState(true);

  const questions = [
    "Wie gestresst fühlst du dich derzeit?",
    "Hast du in letzter Zeit Schlafprobleme?",
    "Fühlst du dich oft überfordert?"
  ];

  // Helper functions for processing health data
  const processSleepData = (sleepData: SleepSample[]) => {
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

      sleepData.forEach((sample: any) => {
        const duration = (new Date(sample.endDate).getTime() - new Date(sample.startDate).getTime()) / 1000;
        
        switch (sample.value) {
          case 'INBED':
            deepSleep += duration;
            break;
          case 'ASLEEP':
            lightSleep += duration;
            break;
          case 'AWAKE':
            awake += duration;
            break;
        }

        phases.push({
          start_time: sample.startDate,
          end_time: sample.endDate,
          phase_type: sample.value,
          duration_seconds: duration,
          hrv: 0 // Not available per phase in HealthKit
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

  const calculateAverageHRV = (hrvData: HealthValue[]) => {
    if (hrvData.length === 0) return 0;
    const sum = hrvData.reduce((acc, curr) => acc + curr.value, 0);
    return Math.round(sum / hrvData.length);
  };

  const findHighestHRV = (hrvData: HealthValue[]) => {
    if (hrvData.length === 0) return 0;
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
    if (!healthKitAvailable) {
      console.log("HealthKit is not available");
      return;
    }

    try {
      const now = new Date();
      const startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000); // Last 24 hours

      const options = {
        startDate: startDate.toISOString(),
        endDate: now.toISOString(),
        ascending: false,
        limit: 24,
      };

      // Fetch Activity Data first
      const [steps, calories, distance, workouts] = await Promise.all([
        new Promise<any>((resolve, reject) => {
          AppleHealthKit.getDailyStepCountSamples(
            {
              ...options,
              includeManuallyAdded: true,
            },
            (err: string | null, results: any) => {
              if (err) reject(new Error(err));
              else {
                // Sum up all steps for today
                const totalSteps = results.reduce((sum: number, item: any) => sum + item.value, 0);
                resolve({ value: totalSteps });
              }
            }
          );
        }),
        new Promise<any>((resolve, reject) => {
          AppleHealthKit.getActiveEnergyBurned(
            {
              ...options,
              includeManuallyAdded: true,
            },
            (err: string | null, results: any) => {
              if (err) reject(new Error(err));
              else {
                // Sum up all calories burned today
                const totalCalories = results.reduce((sum: number, item: any) => sum + item.value, 0);
                resolve({ value: totalCalories });
              }
            }
          );
        }),
        new Promise<any>((resolve, reject) => {
          AppleHealthKit.getDistanceWalkingRunning(
            {
              ...options,
              includeManuallyAdded: true,
            },
            (err: string | null, results: any) => {
              if (err) reject(new Error(err));
              else {
                // Sum up all distance covered today
                const totalDistance = results.reduce((sum: number, item: any) => sum + item.value, 0);
                resolve({ value: totalDistance });
              }
            }
          );
        }),
        new Promise<any>((resolve, reject) => {
          AppleHealthKit.getWorkouts(
            {
              ...options,
              ascending: true,
            },
            (err: string | null, results: any[]) => {
              if (err) reject(new Error(err));
              else {
                // Calculate total active minutes from workouts
                const workoutMinutes = results.reduce((total, workout) => {
                  return total + (workout.duration || 0) / 60; // Convert seconds to minutes
                }, 0);
                
                const activities = results.map(workout => ({
                  type: workout.activityName || 'Unknown Activity',
                  duration_minutes: Math.round((workout.duration || 0) / 60)
                }));

                resolve({
                  activeMinutes: Math.round(workoutMinutes),
                  activities: activities
                });
              }
            }
          );
        }),
      ]);

      // Fetch HRV Data
      const hrvData = await new Promise<HealthValue[]>((resolve, reject) => {
        AppleHealthKit.getHeartRateVariabilitySamples(
          {
            ...options,
            unit: 'ms', // Explicitly request milliseconds
          },
          (err: string | null, results: HealthValue[]) => {
            if (err) {
              reject(new Error(err));
              return;
            }
            // Convert values to milliseconds if they're not already
            const processedResults = results.map(result => ({
              ...result,
              value: result.value * 1000 // Convert to milliseconds if in seconds
            }));
            resolve(processedResults);
          }
        );
      });

      // Fetch Sleep Data
      const sleepData = await new Promise<any[]>((resolve, reject) => {
        AppleHealthKit.getSleepSamples(
          options,
          (err: string | null, results: any[]) => {
            if (err) {
              reject(new Error(err));
              return;
            }
            resolve(results);
          }
        );
      });

      // Process Sleep Data
      const sleepSummary = processSleepData(sleepData);

      // Calculate HRV Summary
      const hrvSummary = {
        lastNightAvg: calculateAverageHRV(hrvData),
        lastNight5MinHigh: findHighestHRV(hrvData),
        readings: hrvData.map(reading => ({
          time: reading.startDate,
          value: Math.round(reading.value) // Round to whole number
        }))
      };

      // Update state with all the data
      setGarminData({
        stress: null, // Apple Health doesn't provide stress data
        hrv: {
          summary: {
            lastNightAvg: hrvSummary.lastNightAvg,
            lastNight5MinHigh: hrvSummary.lastNight5MinHigh,
            status: 'Available',
            feedbackPhrase: ''
          },
          readings: hrvSummary.readings
        },
        sleep: {
          summary: {
            total_sleep_seconds: sleepSummary.totalSleep,
            deep_sleep_seconds: sleepSummary.deepSleep,
            light_sleep_seconds: sleepSummary.lightSleep,
            rem_sleep_seconds: sleepSummary.remSleep,
            awake_seconds: sleepSummary.awake,
            sleep_start: sleepSummary.startTime,
            sleep_end: sleepSummary.endTime,
            sleep_score: 'N/A', // Apple Health doesn't provide sleep score
            average_hrv: hrvSummary.lastNightAvg,
            lowest_hrv: Math.min(...hrvData.map(d => d.value)),
            highest_hrv: Math.max(...hrvData.map(d => d.value))
          },
          phases: sleepSummary.phases
        },
        activity: {
          steps: steps.value || 0,
          calories_burned: Math.round(calories.value) || 0,
          active_minutes: workouts.activeMinutes || 0,
          distance_km: (distance.value || 0) / 1000, // Convert meters to kilometers
          floors_climbed: 0, // Not available in HealthKit
          active_time_seconds: (workouts.activeMinutes || 0) * 60,
          date: now.toISOString().split('T')[0],
          vo2_max: 0, // We'll update this separately
          vo2_max_status: 'N/A',
          vo2_max_date: '',
          daily_activities: workouts.activities || []
        },
        heart_rate: {
          resting_heart_rate: calculateRestingHeartRate(hrvData),
          hrv_heart_rate: calculateAverageHeartRate(hrvData),
          date: now.toISOString().split('T')[0]
        }
      });

      // Fetch VO2 Max separately
      AppleHealthKit.getVO2MaxSamples(
        {
          ...options,
          ascending: false,
          limit: 1, // Get most recent VO2 max
        },
        (err: string | null, results: any) => {
          if (!err && results && results.length > 0) {
            const latestVO2Max = results[0];
            setGarminData(prevData => ({
              ...prevData,
              activity: {
                ...prevData.activity!,
                vo2_max: latestVO2Max.value || 0,
                vo2_max_status: latestVO2Max.value ? 'Available' : 'N/A',
                vo2_max_date: latestVO2Max.startDate || '',
              }
            }));
          }
        }
      );

    } catch (error) {
      console.error("Error fetching health data:", error);
    }
  };

  const fetchGarminData = async (storedEmail: string, storedPassword: string) => {
    setLoading(true);
    try {
      const targetDate = "2025-02-15";  // Use February 15th, 2025
      console.log('Fetching data for date:', targetDate);
      
      const requestBody = { 
        email: storedEmail, 
        password: storedPassword, 
        date: targetDate 
      };
      
      console.log('Sending request to:', `${API_URL}/all_data`);
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
      
      if (!data || !data.activity) {
        console.error('Invalid data received:', data);
        throw new Error('Invalid data received from server');
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

  const checkLogin = async () => {
    const storedEmail = await SecureStore.getItemAsync("garmin_email");
    const storedPassword = await SecureStore.getItemAsync("garmin_password");

    if (!storedEmail || !storedPassword) {
      setGarminModalVisible(true);
    } else {
      fetchGarminData(storedEmail, storedPassword);
    }
  };

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
    if (dataSource) {
      initializeApp();
    }
  }, [dataSource]);

  const initializeApp = async () => {
    try {
      if (!dataSource) {
        return;
      }

      if (dataSource === 'apple' && Platform.OS === 'ios') {
        const healthKitOptions = {
          permissions: {
            read: [
              'HeartRateVariability',
              'HeartRate',
              'Steps',
              'SleepAnalysis',
              'ActiveEnergyBurned',
              'DistanceWalkingRunning',
            ],
            write: [],
          },
        };

        AppleHealthKit.initHealthKit(healthKitOptions, (error: string) => {
          if (error) {
            console.error('Error initializing HealthKit:', error);
            setHealthKitAvailable(false);
          } else {
            console.log('HealthKit initialized successfully');
            setHealthKitAvailable(true);
            fetchHRVData();
          }
        });
      } else if (dataSource === 'garmin') {
        await checkLogin();
      }
      
      setIsInitialized(true);
    } catch (error) {
      console.error('Initialization error:', error);
      setInitError(error instanceof Error ? error.message : ERROR_MESSAGES.INIT);
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
                setDataSource('garmin');
                setSourceSelectionVisible(false);
              }}
            >
              <Text style={styles.buttonText}>Garmin</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  if (!dataSource) {
    return <DataSourceSelectionModal />;
  }

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

  const uploadGarminData = async (garminData: GarminData) => {
    if (!db) {
      console.error('Firebase not initialized');
      Alert.alert('Error', 'Database connection not available');
      return;
    }

    const firestore = db as Firestore;

    try {
      // Generate or get a persistent device ID using SecureStore
      let deviceId = await SecureStore.getItemAsync('device_id');
      if (!deviceId) {
        deviceId = `device_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        await SecureStore.setItemAsync('device_id', deviceId);
      }

      // Add timestamp and format data for upload
      const dataToUpload = {
        ...garminData,
        timestamp: new Date(),
        deviceId: deviceId,
        uploadDate: new Date().toISOString().split('T')[0]
      };

      // Upload to device-specific collection
      const deviceGarminRef = doc(firestore, `devices/${deviceId}/garminData`, new Date().toISOString().split('T')[0]);
      await setDoc(deviceGarminRef, dataToUpload);

      // Upload to main collection for aggregated data
      const mainGarminRef = doc(collection(firestore, 'garminData'), `${deviceId}_${new Date().toISOString().split('T')[0]}`);
      await setDoc(mainGarminRef, dataToUpload);

      console.log("Garmin data uploaded successfully to both collections");
    } catch (error) {
      console.error("Error uploading Garmin data:", error);
      Alert.alert('Error', 'Failed to upload data to database');
      throw error;
    }
  };

  const handleResponseChange = (text: string, index: number) => {
    const newResponses = [...responses];
    newResponses[index] = text;
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
      if (responses.some(response => !response.trim())) {
        alert("Bitte beantworten Sie alle Fragen");
        return;
      }

      const surveyData = {
        name,
        responses,
        timestamp: new Date(),
        stressData: stressData ? {
          hrv: stressData.hrv,
          timestamp: stressData.timestamp,
          source: healthKitAvailable ? "HealthKit" : "Garmin"
        } : null
      };

      const surveyCollection = collection(firestore, "pss_surveys");
      await addDoc(surveyCollection, surveyData);
      
      alert("Umfrage erfolgreich gesendet!");
      setName("");
      setResponses(["", "", ""]);
      setPssModalVisible(false);
    } catch (error) {
      console.error("Fehler beim Senden der Umfrage:", error);
      alert("Fehler beim Senden der Umfrage. Bitte versuchen Sie es später erneut.");
    }
  };

  const submitPersonalInfo = async () => {
    if (!db) {
      console.error('Firebase not initialized');
      Alert.alert('Error', 'Database connection not available');
      return;
    }

    const firestore = db as Firestore;

    try {
      if (!personalInfo.name || !personalInfo.age || !personalInfo.gender || !personalInfo.occupation) {
        alert("Bitte füllen Sie alle Felder aus");
        return;
      }

      const personalInfoCollection = collection(firestore, "personal_info");
      await addDoc(personalInfoCollection, {
        ...personalInfo,
        timestamp: new Date()
      });

      alert("Persönliche Informationen erfolgreich gespeichert!");
      setPersonalInfo({
        name: "",
        age: "",
        gender: "",
        occupation: "",
        height: "",
        weight: "",
        fitnessLevel: "",
        stressLevel: "",
        sleepQuality: "",
        diet: "",
        medications: "",
        healthConditions: ""
      });
      setPersonalInfoModalVisible(false);
    } catch (error) {
      console.error("Fehler beim Speichern der persönlichen Informationen:", error);
      alert("Fehler beim Speichern. Bitte versuchen Sie es später erneut.");
    }
  };

  const formatDuration = (seconds: number) => {
    if (!seconds) return 'N/A';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>HRV & Stress Tracking</Text>
        <TouchableOpacity
          style={styles.sourceButton}
          onPress={() => setSourceSelectionVisible(true)}
        >
          <Text style={styles.sourceButtonText}>
            {dataSource === 'apple' ? 'Apple Watch' : 'Garmin'}
          </Text>
        </TouchableOpacity>
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

          

          {/* Sleep Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Sleep Analysis</Text>
            
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

          {/* Activity Section */}
          {garminData.activity && (
            <View style={styles.dataContainer}>
              <Text style={styles.sectionTitle}>Aktivität</Text>
              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>Schritte:</Text>
                <Text style={styles.dataValue}>{garminData.activity.steps || 'N/A'}</Text>
              </View>
              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>Kalorien:</Text>
                <Text style={styles.dataValue}>{garminData.activity.calories_burned || 'N/A'}</Text>
              </View>
              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>Aktive Minuten:</Text>
                <Text style={styles.dataValue}>{garminData.activity.active_minutes || 'N/A'}</Text>
              </View>
              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>Distanz:</Text>
                <Text style={styles.dataValue}>{garminData.activity.distance_km?.toFixed(1) || 'N/A'} km</Text>
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
          )}

  
          
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Activities Today</Text>
            {garminData?.activity?.daily_activities ? (
              garminData.activity.daily_activities.length > 0 ? (
              garminData.activity.daily_activities.map((activity, index) => (
                <View key={index} style={styles.activityRow}>
                  <Text style={styles.activityType}>{activity.type}</Text>
                  <Text style={styles.activityDuration}>{activity.duration_minutes} min</Text>
                </View>
              ))
            ) : (
              <Text style={styles.noActivities}>No activities recorded today</Text>
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
              onPress={() => setPssModalVisible(true)}
            >
              <Text style={styles.buttonText}>PSS Umfrage</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.button}
              onPress={() => setPersonalInfoModalVisible(true)}
            >
              <Text style={styles.buttonText}>Persönliche Informationen</Text>
            </TouchableOpacity>

            {dataSource === 'garmin' && (
              <TouchableOpacity 
                style={[styles.button, styles.garminButton]}
                onPress={() => setGarminModalVisible(true)}
                activeOpacity={0.7}
              >
                <Text style={styles.buttonText}>Garmin Login</Text>
              </TouchableOpacity>
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
              <Text style={styles.modalTitle}>PSS Umfrage</Text>
              <TouchableOpacity onPress={() => setPssModalVisible(false)}>
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.input}
              placeholder="Name"
              value={name}
              onChangeText={setName}
            />
            <FlatList
              data={questions}
              keyExtractor={(item, index) => index.toString()}
              renderItem={({ item, index }) => (
                <View style={styles.questionContainer}>
                  <Text style={styles.questionText}>{item}</Text>
                  <TextInput
                    style={styles.input}
                    value={responses[index]}
                    onChangeText={(text) => handleResponseChange(text, index)}
                    placeholder="Ihre Antwort"
                  />
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
      <Modal
        animationType="slide"
        transparent={true}
        visible={personalInfoModalVisible}
        onRequestClose={() => {
          console.log('Closing personal info modal');
          setPersonalInfoModalVisible(false);
        }}
      >
        <View style={styles.modalContainer}>
          <View style={[styles.modalContent, { height: '80%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Persönliche Informationen</Text>
              <TouchableOpacity onPress={() => {
                console.log('Closing personal info modal via X button');
                setPersonalInfoModalVisible(false);
              }}>
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={true}>
              <View style={styles.formContainer}>
                <TextInput
                  style={styles.input}
                  placeholder="Name"
                  value={personalInfo.name}
                  onChangeText={(text) => {
                    console.log('Name changed:', text);
                    setPersonalInfo({...personalInfo, name: text});
                  }}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Alter"
                  value={personalInfo.age}
                  onChangeText={(text) => setPersonalInfo({...personalInfo, age: text})}
                  keyboardType="numeric"
                />
                <TextInput
                  style={styles.input}
                  placeholder="Geschlecht"
                  value={personalInfo.gender}
                  onChangeText={(text) => setPersonalInfo({...personalInfo, gender: text})}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Beruf"
                  value={personalInfo.occupation}
                  onChangeText={(text) => setPersonalInfo({...personalInfo, occupation: text})}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Größe (cm)"
                  value={personalInfo.height}
                  onChangeText={(text) => setPersonalInfo({...personalInfo, height: text})}
                  keyboardType="numeric"
                />
                <TextInput
                  style={styles.input}
                  placeholder="Gewicht (kg)"
                  value={personalInfo.weight}
                  onChangeText={(text) => setPersonalInfo({...personalInfo, weight: text})}
                  keyboardType="numeric"
                />
                <TextInput
                  style={styles.input}
                  placeholder="Fitness-Level (1-5)"
                  value={personalInfo.fitnessLevel}
                  onChangeText={(text) => setPersonalInfo({...personalInfo, fitnessLevel: text})}
                  keyboardType="numeric"
                />
                <TextInput
                  style={styles.input}
                  placeholder="Stress-Level (1-5)"
                  value={personalInfo.stressLevel}
                  onChangeText={(text) => setPersonalInfo({...personalInfo, stressLevel: text})}
                  keyboardType="numeric"
                />
                <TextInput
                  style={styles.input}
                  placeholder="Schlafqualität (1-5)"
                  value={personalInfo.sleepQuality}
                  onChangeText={(text) => setPersonalInfo({...personalInfo, sleepQuality: text})}
                  keyboardType="numeric"
                />
                <TextInput
                  style={styles.input}
                  placeholder="Ernährung"
                  value={personalInfo.diet}
                  onChangeText={(text) => setPersonalInfo({...personalInfo, diet: text})}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Medikamente"
                  value={personalInfo.medications}
                  onChangeText={(text) => setPersonalInfo({...personalInfo, medications: text})}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Gesundheitliche Beschwerden"
                  value={personalInfo.healthConditions}
                  onChangeText={(text) => setPersonalInfo({...personalInfo, healthConditions: text})}
                />
              </View>
            </ScrollView>
            <TouchableOpacity style={styles.button} onPress={submitPersonalInfo}>
              <Text style={styles.buttonText}>Speichern</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <DataSourceSelectionModal />
    </View>
  );
};

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
    marginTop: 10,
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
    color: '#666',
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
});

export default HomeScreen;
