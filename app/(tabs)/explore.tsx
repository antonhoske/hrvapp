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

  const [dataSource, setDataSource] = useState<'garmin' | 'apple' | null>('apple');
  const [sourceSelectionVisible, setSourceSelectionVisible] = useState(true);

  // PSS questions
  const questions = [
    "Wie gestresst fühlst du dich derzeit?",
    "Hast du in letzter Zeit Schlafprobleme?",
    "Fühlst du dich oft überfordert?"
  ];

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
    console.log('Starting fetchHRVData, healthKitAvailable:', healthKitAvailable);
    if (dataSource === 'garmin') {
      console.log("Garmin is not available");
      return;
    }

    try {
      const now = new Date();
      console.log('Current date/time:', now.toISOString());
      
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
      sleepStartDate.setDate(now.getDate() - 2);
      sleepStartDate.setHours(18, 0, 0, 0); // 6 PM
      
      const sleepEndDate = new Date();
      sleepEndDate.setDate(now.getDate() - 1);
      sleepEndDate.setHours(11, 0, 0, 0); // 11 AM
      
      console.log('Time ranges for data fetching:');
      console.log('Activity data window (yesterday):');
      console.log('- Start:', startDate.toLocaleString(), '(', startDate.toISOString(), ')');
      console.log('- End:', endDate.toLocaleString(), '(', endDate.toISOString(), ')');
      console.log('Sleep/HRV data window:');
      console.log('- Start (6 PM two days ago):', sleepStartDate.toLocaleString(), '(', sleepStartDate.toISOString(), ')');
      console.log('- End (11 AM yesterday):', sleepEndDate.toLocaleString(), '(', sleepEndDate.toISOString(), ')');

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

      console.log('Fetching data with options:', JSON.stringify(options, null, 2));
      console.log('Fetching sleep data with options:', JSON.stringify(sleepOptions, null, 2));

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
                console.log('Workouts fetched:', results.data.length);
                console.log('Raw workout data:', JSON.stringify(results.data, null, 2));
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
                console.log('Steps data fetched:', results.length, 'samples');
                console.log('Raw steps data:', JSON.stringify(results, null, 2));
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
          console.log('Attempting to fetch distance data...');
          if (typeof AppleHealthKit.getDistanceWalkingRunning !== 'function') {
            console.error('ERROR: getDistanceWalkingRunning is not a function!', 
              'Available methods:', Object.keys(AppleHealthKit).join(', '));
            resolve({ value: 0 });
            return;
          }
          console.log('getDistanceWalkingRunning is available, calling with options:', JSON.stringify(options, null, 2));
          AppleHealthKit.getDistanceWalkingRunning(
            {
              ...options,
              includeManuallyAdded: true,
            },
            (err: string | null, results: any) => {
              if (err) {
                console.error('Error fetching distance:', err);
                resolve({ value: 0 });
              } else if (Array.isArray(results)) {
                console.log('Distance data received (array):', JSON.stringify(results, null, 2));
                console.log('Number of distance samples:', results.length);
                const totalDistance = results.reduce((sum: number, item: any) => sum + (item.value || 0), 0);
                console.log('Calculated total distance:', totalDistance);
                resolve({ value: totalDistance });
              } else if (results && typeof results === 'object' && 'value' in results) {
                // Handle single object response
                console.log('Distance data received (single object):', JSON.stringify(results, null, 2));
                console.log('Single object distance value:', results.value);
                resolve({ value: results.value });
              } else {
                console.error('Distance results in unexpected format:', results);
                resolve({ value: 0 });
              }
            }
          );
        });
        distance = distanceResult;
        console.log('Final distance value set:', distance.value);
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
                console.log('HRV samples fetched:', results.length);
                if (results.length > 0) {
                  console.log('HRV time range:', results[0].startDate, 'to', results[results.length - 1].endDate);
                  console.log('HRV values range:', Math.min(...results.map(r => r.value)), 'to', Math.max(...results.map(r => r.value)));
                }
                console.log('Raw HRV data:', JSON.stringify(results, null, 2));
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
                console.log('Sleep samples fetched:', results.length);
                console.log('Sleep time range:', results[0]?.startDate, 'to', results[results.length - 1]?.endDate);
                console.log('Raw sleep data:', JSON.stringify(results, null, 2));
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
            console.log('getMindfulSession not available in AppleHealthKit');
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
                console.log('Mindfulness sessions fetched:', results.length);
                console.log('Raw mindfulness data:', JSON.stringify(results, null, 2));
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
          console.log('Total mindfulness minutes:', mindfulMinutes);
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

    } catch (error) {
      console.error("Error fetching health data:", error);
    }
    
    await uploadGarminData(garminData);
  };

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

  const fetchGarminData = async (storedEmail: string, storedPassword: string) => {
    setLoading(true);
    try {
      // Calculate yesterday's date
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const targetDate = yesterday.toISOString().split('T')[0];  // Format: YYYY-MM-DD
      
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
          console.log("Using Apple HealthKit steps data instead of Garmin zeros");
          data.activity.steps = currentData.activity.steps;
        }
        
        if (data.activity.calories_burned === 0 && currentData.activity.calories_burned > 0) {
          console.log("Using Apple HealthKit calories data instead of Garmin zeros");
          data.activity.calories_burned = currentData.activity.calories_burned;
        }
        
        if (data.activity.distance_km === 0 && currentData.activity.distance_km > 0) {
          console.log("Using Apple HealthKit distance data instead of Garmin zeros");
          data.activity.distance_km = currentData.activity.distance_km;
        }
        
        if (data.activity.mindful_minutes === 0 && currentData.activity.mindful_minutes > 0) {
          console.log("Using Apple HealthKit mindfulness data instead of Garmin zeros");
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
    console.log('storedEmail', storedEmail);
    console.log('storedPassword', storedPassword);
    //check if credentials already exist
    if (!storedEmail || !storedPassword) {
      console.log('no credentials found');
      setGarminModalVisible(true);
    } 
    else {
      console.log('credentials found');
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
      console.log(`Initializing app for: ${dataSource}`);
      initializeApp();
    }
  }, [dataSource]);

  const initializeApp = async () => {
    try {
      if (await SecureStore.getItemAsync('garmin_email') && await SecureStore.getItemAsync('garmin_password')) {
        setDataSource('garmin');
      }
      else {
        setDataSource('apple');
      }

      if (dataSource === 'apple' && Platform.OS === 'ios') {
        console.log('Starting HealthKit initialization process...');
        console.log('Platform:', Platform.OS);
        console.log('Device:', Platform.constants?.systemName, Platform.Version);
        
        // Check platform first
        if (Platform.OS !== 'ios') {
          console.log('Not iOS platform, HealthKit not available');
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
              'MindfulSession'
            ],
            write: [],
          },
        };

        try {
          // First check if HealthKit is available on the device
          console.log('Checking HealthKit availability...');
          const isAvailable = await new Promise((resolve) => {
            if (typeof AppleHealthKit.isAvailable !== 'function') {
              console.error('isAvailable method not found on AppleHealthKit');
              console.log('AppleHealthKit methods:', Object.keys(AppleHealthKit));
              resolve(false);
              return;
            }
            
            AppleHealthKit.isAvailable((error: string, result: boolean) => {
              if (error) {
                console.error('Error checking HealthKit availability:', error);
                resolve(false);
                return;
              }
              console.log('HealthKit availability check result:', result);
              resolve(result);
            });
          });

          if (!isAvailable) {
            console.log('HealthKit is not available on this device');
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

          console.log('HealthKit is available, initializing with permissions:', permissions);
          // Then initialize HealthKit
      await new Promise<void>((resolve, reject) => {
            if (typeof AppleHealthKit.initHealthKit !== 'function') {
              console.error('initHealthKit method not found on AppleHealthKit');
              console.log('Available methods:', Object.keys(AppleHealthKit));
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
            console.log('HealthKit initialized successfully');
            resolve();
          }
        });
      });

          // After successful initialization, check permissions
          console.log('Checking HealthKit permissions...');
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
                console.log('HealthKit permissions status:', JSON.stringify(result, null, 2));
                if (result.permissions.read) {
                  console.log('HealthKit read permissions granted');
                  // Use setTimeout to ensure state is updated before fetching
                  setTimeout(() => {
                    console.log('Fetching data after permissions check...');
                    fetchHRVData();
                  }, 100);
                } else {
                  console.log('HealthKit read permissions not granted');
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
      }
    };

    const handleSourceChange = async (newSource: 'apple' | 'garmin') => {
      console.log(`Switching data source to: ${newSource}`);
      
      // Capture existing data before clearing
      const previousData = {...garminData};
      
      // If switching from Apple to Garmin, preserve activity data
      if (dataSource === 'apple' && newSource === 'garmin' && previousData.activity) {
        console.log("Preserving Apple HealthKit data when switching to Garmin");
        
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
      
      if (newSource === 'garmin') {
        console.log("Setting Garmin modal to visible");
        setGarminModalVisible(true); 
    
        setTimeout(async () => {
          const storedEmail = await SecureStore.getItemAsync("garmin_email");
          const storedPassword = await SecureStore.getItemAsync("garmin_password");
          console.log(`Stored Email: ${storedEmail}, Stored Password: ${storedPassword ? "Exists" : "Not Found"}`);
          
          if (storedEmail && storedPassword) {
            console.log("Closing Garmin modal since credentials exist");
            setGarminModalVisible(false);
            await fetchGarminData(storedEmail, storedPassword);
          }
        }, 1000); 

        
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

      // Generate or get a persistent device ID using SecureStore
      let deviceId = await SecureStore.getItemAsync('device_id');
      if (!deviceId) {
        deviceId = `device_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        await SecureStore.setItemAsync('device_id', deviceId);
      }

      const surveyData = {
        name,
        responses,
        timestamp: new Date(),
        deviceId: deviceId,
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

      // Generate or get a persistent device ID using SecureStore
      let deviceId = await SecureStore.getItemAsync('device_id');
      if (!deviceId) {
        deviceId = `device_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        await SecureStore.setItemAsync('device_id', deviceId);
      }

      const personalInfoCollection = collection(firestore, "personal_info");
      await addDoc(personalInfoCollection, {
        ...personalInfo,
        timestamp: new Date(),
        deviceId: deviceId
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

          

          {/* Sleep Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Schlafanalyse</Text>
            
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
              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>Achtsamkeitsminuten:</Text>
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
          )}

  

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Gestrige Aktivitäten</Text>
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
            <Text style={styles.sectionTitle}>Herzfrequenzvariabilität</Text>
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
});

export default HomeScreen;
