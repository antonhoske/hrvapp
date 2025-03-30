import { Alert, Platform } from "react-native";
import { Firestore, doc, setDoc, collection } from "firebase/firestore";
import { GarminData } from "../types/healthData";
import AppleHealthKit, { HealthValue } from 'react-native-health';

export const uploadHistoricalData = async (
  db: Firestore | undefined,
  getDeviceId: () => Promise<string>,
  setLoading: (loading: boolean) => void,
  dataSource: 'apple' | 'garmin',
  fetchGarminDataForDate?: (email: string, password: string, date: string) => Promise<any>,
  healthKitAvailable?: boolean,
  garminCredentials?: { email: string, password: string }
): Promise<boolean> => {
  if (!db) {
    console.error('Firebase not initialized');
    Alert.alert('Error', 'Database connection not available');
    return false;
  }
  
  setLoading(true);
  
  return new Promise<boolean>((resolve) => {
    try {
      const now = new Date();
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      threeMonthsAgo.setHours(0, 0, 0, 0);
      
      if (dataSource === 'garmin' && (!garminCredentials || !garminCredentials.email || !garminCredentials.password)) {
        Alert.alert('Error', 'Garmin credentials are required for Garmin data source');
        setLoading(false);
        resolve(false);
        return;
      }
      
      if (dataSource === 'apple' && !healthKitAvailable) {
        Alert.alert('Error', 'Apple HealthKit is not available');
        setLoading(false);
        resolve(false);
        return;
      }
      
      Alert.alert(
        'Upload Historical Data',
        `This will retrieve and upload health data from the last 3 months (${threeMonthsAgo.toLocaleDateString()} to today) to Firebase. Continue?`,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => {
            setLoading(false);
            resolve(false);
          }},
          { 
            text: 'Continue', 
            onPress: async () => {
              try {
                let successCount = 0;
                let errorCount = 0;
                const totalDays = Math.floor((now.getTime() - threeMonthsAgo.getTime()) / (1000 * 60 * 60 * 24));
                
                for (let i = 0; i < totalDays; i++) {
                  const currentDate = new Date(threeMonthsAgo);
                  currentDate.setDate(threeMonthsAgo.getDate() + i);
                  
                  try {
                    // Format date as YYYY-MM-DD
                    const dateString = currentDate.toISOString().split('T')[0];
                    
                    // Skip if it's today's date
                    if (dateString === now.toISOString().split('T')[0]) continue;
                    
                    // Get device ID
                    const deviceId = await getDeviceId();
                    
                    // Retrieve actual health data for this date
                    let healthData;
                    
                    if (dataSource === 'garmin' && fetchGarminDataForDate && garminCredentials) {
                      // For Garmin, call the API for this specific date
                      try {
                        console.log(`Fetching Garmin data for ${dateString}...`);
                        healthData = await fetchGarminDataForDate(
                          garminCredentials.email,
                          garminCredentials.password,
                          dateString
                        );
                      } catch (error) {
                        console.error(`Error fetching Garmin data for ${dateString}:`, error);
                        // Use placeholder data if there's an error
                        healthData = createPlaceholderData(dateString);
                      }
                    } else if (dataSource === 'apple' && healthKitAvailable) {
                      // For Apple HealthKit, query data for this specific date
                      try {
                        healthData = await fetchHealthKitDataForDate(currentDate);
                      } catch (error) {
                        console.error(`Error fetching HealthKit data for ${dateString}:`, error);
                        // Use placeholder data if there's an error
                        healthData = createPlaceholderData(dateString);
                      }
                    } else {
                      // Fallback to placeholder data
                      healthData = createPlaceholderData(dateString);
                    }
                    
                    // Format data for upload - matches the structure of daily uploads
                    const dataToUpload = {
                      ...healthData,
                      timestamp: new Date(),
                      deviceId: deviceId,
                      uploadDate: dateString
                    };
                    
                    // Upload to device-specific collection with the date as document ID
                    const deviceGarminRef = doc(db, `devices/${deviceId}/garminData`, dateString);
                    await setDoc(deviceGarminRef, dataToUpload);
                    
                    // Upload to main collection
                    const mainGarminRef = doc(collection(db, 'garminData'), `${deviceId}_${dateString}`);
                    await setDoc(mainGarminRef, dataToUpload);
                    
                    successCount++;
                  } catch (dayError) {
                    console.error(`Error processing data for ${currentDate.toLocaleDateString()}:`, dayError);
                    errorCount++;
                  }
                }
                
                Alert.alert(
                  'Upload Complete',
                  `Successfully uploaded data for ${successCount} days.\n${errorCount > 0 ? `Failed for ${errorCount} days.` : ''}`,
                  [{ text: 'OK' }]
                );
                setLoading(false);
                resolve(successCount > 0); // Return true if at least one day was successful
              } catch (e) {
                console.error('Error in historical data upload:', e);
                Alert.alert('Error', 'Failed to upload historical data');
                setLoading(false);
                resolve(false);
              }
            }
          }
        ]
      );
    } catch (error) {
      console.error('Error setting up historical data upload:', error);
      Alert.alert('Error', 'Could not setup historical data upload');
      setLoading(false);
      resolve(false);
    }
  });
};

// Function to create placeholder data for a specific date
const createPlaceholderData = (dateString: string): GarminData => {
  return {
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
      date: dateString,
      vo2_max: 0,
      vo2_max_status: 'N/A',
      vo2_max_date: '',
      daily_activities: [],
      mindful_minutes: 0
    },
    heart_rate: null
  };
};

// Function to fetch HealthKit data for a specific date
const fetchHealthKitDataForDate = async (targetDate: Date): Promise<GarminData> => {
  if (Platform.OS !== 'ios') {
    return createPlaceholderData(targetDate.toISOString().split('T')[0]);
  }
  
  try {
    // Set start date to beginning of the target day (00:00:00)
    const startDate = new Date(targetDate);
    startDate.setHours(0, 0, 0, 0);
    
    // Set end date to end of the target day (23:59:59)
    const endDate = new Date(targetDate);
    endDate.setHours(23, 59, 59, 999);
    
    // For sleep data, we want to look at a wider window to catch the full sleep period
    // From 6 PM day before to 11 AM target day
    const sleepStartDate = new Date(targetDate);
    sleepStartDate.setDate(targetDate.getDate() - 1);
    sleepStartDate.setHours(18, 0, 0, 0); // 6 PM
    
    const sleepEndDate = new Date(targetDate);
    sleepEndDate.setHours(11, 0, 0, 0); // 11 AM
    
    const options = {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      ascending: false,
      limit: 288, // Increased limit to ensure we get all data points for the day
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
    let mindfulMinutes = 0;
    let hrvData: HealthValue[] = [];
    let sleepData: any[] = [];
    
    // Fetch workouts
    try {
      const workoutResults = await new Promise<any>((resolve, reject) => {
        if (typeof AppleHealthKit.getAnchoredWorkouts !== 'function') {
          resolve({ activeMinutes: 0, activities: [] });
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
              resolve({ activeMinutes: 0, activities: [] });
            } else if (results && Array.isArray(results.data)) {
              const activities = results.data.map((workout: any) => ({
                type: workout.activityName || 'Unknown Activity',
                duration_minutes: Math.round((workout.duration || 0) / 60)
              }));
              
              const totalActiveMinutes = activities.reduce((total: number, activity: any) => 
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
      console.error(`Error fetching workouts for ${targetDate.toLocaleDateString()}:`, error);
    }
    
    // Fetch steps
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
      console.error(`Error fetching steps for ${targetDate.toLocaleDateString()}:`, error);
    }
    
    // Fetch calories
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
      console.error(`Error fetching calories for ${targetDate.toLocaleDateString()}:`, error);
    }
    
    // Fetch distance
    try {
      const distanceResult = await new Promise<any>((resolve, reject) => {
        if (typeof AppleHealthKit.getDailyDistanceWalkingRunningSamples !== 'function') {
          console.error("getDailyDistanceWalkingRunningSamples function not available");
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
          (err: any, results: any) => {
            if (err) {
              console.error('Error fetching distance samples:', err);
              resolve({ value: 0 });
            } else if (Array.isArray(results) && results.length > 0) {
              const totalDistance = results.reduce((sum: number, item: any) => 
                sum + (item.value || 0), 0) / 1000; // Convert from meters to kilometers
              resolve({ value: totalDistance });
            } else {
              resolve({ value: 0 });
            }
          }
        );
      });
      distance = distanceResult;
    } catch (error) {
      console.error(`Error fetching distance for ${targetDate.toLocaleDateString()}:`, error);
    }
    
    // Fetch HRV Data
    try {
      hrvData = await new Promise<HealthValue[]>((resolve, reject) => {
        if (typeof AppleHealthKit.getHeartRateVariabilitySamples !== 'function') {
          resolve([]);
          return;
        }
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
      console.error(`Error fetching HRV for ${targetDate.toLocaleDateString()}:`, error);
    }
    
    // Fetch Sleep Data
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
      console.error(`Error fetching sleep for ${targetDate.toLocaleDateString()}:`, error);
    }
    
    // Process sleep data to extract summary and phases
    const processedSleepData = processSleepData(sleepData);
    
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
      console.error(`Error fetching VO2 Max for ${targetDate.toLocaleDateString()}:`, error);
    }
    
    // Fetch mindfulness sessions
    try {
      mindfulMinutes = 0;
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
      console.error(`Error fetching mindfulness data for ${targetDate.toLocaleDateString()}:`, error);
    }
    
    // Calculate derived metrics
    const calculateAverageHRV = (hrvData: HealthValue[], sleepStart?: string, sleepEnd?: string) => {
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
    
    const findHighestHRV = (hrvData: HealthValue[], sleepStart?: string, sleepEnd?: string) => {
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
    
    const calculateRestingHeartRate = (heartRateData: any[]) => {
      if (heartRateData.length === 0) return 0;
      // Use the lowest 10% of heart rate values to estimate resting heart rate
      const sortedHR = heartRateData.map((hr: any) => hr.value).sort((a, b) => a - b);
      const tenPercentile = Math.floor(sortedHR.length * 0.1);
      const restingHRs = sortedHR.slice(0, tenPercentile > 0 ? tenPercentile : 1);
      return Math.round(restingHRs.reduce((a, b) => a + b, 0) / restingHRs.length);
    };
    
    const calculateAverageHeartRate = (heartRateData: any[]) => {
      if (heartRateData.length === 0) return 0;
      const sum = heartRateData.reduce((acc: number, curr: any) => acc + curr.value, 0);
      return Math.round(sum / heartRateData.length);
    };
    
    // Build the GarminData structure
    return {
      stress: null,
      hrv: hrvData.length > 0 ? {
        summary: {
          lastNightAvg: processedSleepData && processedSleepData.startTime && processedSleepData.endTime ? 
            calculateAverageHRV(hrvData, processedSleepData.startTime, processedSleepData.endTime) : 
            (hrvData.length ? Math.round(hrvData.reduce((sum, item) => sum + item.value, 0) / hrvData.length) : 0),
          lastNight5MinHigh: processedSleepData && processedSleepData.startTime && processedSleepData.endTime ? 
            findHighestHRV(hrvData, processedSleepData.startTime, processedSleepData.endTime) : 
            (hrvData.length ? Math.max(...hrvData.map(d => d.value)) : 0),
          status: 'Available',
          feedbackPhrase: ''
        },
        readings: processedSleepData && processedSleepData.startTime && processedSleepData.endTime ? 
          hrvData
            .filter(reading => {
              const readingTime = new Date(reading.startDate).getTime();
              const sleepStartTime = new Date(processedSleepData.startTime).getTime();
              const sleepEndTime = new Date(processedSleepData.endTime).getTime();
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
      } : null,
      sleep: processedSleepData && (processedSleepData.totalSleep > 0 || processedSleepData.phases.length > 0) ? {
        summary: {
          total_sleep_seconds: processedSleepData.totalSleep || 0,
          deep_sleep_seconds: processedSleepData.deepSleep || 0,
          light_sleep_seconds: processedSleepData.lightSleep || 0,
          rem_sleep_seconds: processedSleepData.remSleep || 0,
          awake_seconds: processedSleepData.awake || 0,
          sleep_start: processedSleepData.startTime || '',
          sleep_end: processedSleepData.endTime || '',
          sleep_score: 'N/A',
          average_hrv: processedSleepData && processedSleepData.startTime && processedSleepData.endTime ? 
            calculateAverageHRV(hrvData, processedSleepData.startTime, processedSleepData.endTime) : 
            (hrvData.length ? Math.round(hrvData.reduce((sum, item) => sum + item.value, 0) / hrvData.length) : 0),
          lowest_hrv: hrvData.length ? Math.min(...hrvData.map(d => d.value)) : 0,
          highest_hrv: hrvData.length ? Math.max(...hrvData.map(d => d.value)) : 0
        },
        phases: processedSleepData.phases || []
      } : null,
      activity: {
        steps: steps.value || 0,
        calories_burned: Math.round(calories.value) || 0,
        active_minutes: workouts.activeMinutes || 0,
        distance_km: (distance.value || 0),
        floors_climbed: 0,
        active_time_seconds: (workouts.activeMinutes || 0) * 60,
        date: targetDate.toISOString().split('T')[0],
        vo2_max: vo2Max.value || 0,
        vo2_max_status: vo2Max.status,
        vo2_max_date: vo2Max.date,
        daily_activities: workouts.activities || [],
        mindful_minutes: mindfulMinutes || 0
      },
      heart_rate: {
        resting_heart_rate: calculateRestingHeartRate(hrvData),
        hrv_heart_rate: calculateAverageHeartRate(hrvData),
        date: targetDate.toISOString().split('T')[0]
      }
    };
  } catch (error) {
    console.error(`Error fetching health data for ${targetDate.toLocaleDateString()}:`, error);
    return createPlaceholderData(targetDate.toISOString().split('T')[0]);
  }
};

// Helper function to process sleep data
const processSleepData = (sleepData: any[]): { 
  totalSleep: number; 
  deepSleep: number; 
  lightSleep: number; 
  remSleep: number; 
  awake: number; 
  startTime: string; 
  endTime: string; 
  phases: any[];
} => {
  if (!sleepData || sleepData.length === 0) {
    return { 
      totalSleep: 0, 
      deepSleep: 0, 
      lightSleep: 0, 
      remSleep: 0, 
      awake: 0, 
      startTime: '', 
      endTime: '', 
      phases: [] 
    };
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

    sleepData.forEach((sample: any) => {
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
        hrv: 0 // We'll need to compute this separately using HRV data
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