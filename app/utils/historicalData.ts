import { FirebaseApp } from "firebase/app";
import { Firestore, doc, setDoc, collection } from "firebase/firestore";
import { Alert } from "react-native";
import { GarminData } from "../types/healthData";

// Function to upload historical data (last 3 months)
export const uploadHistoricalData = async (
  db: Firestore | undefined,
  getDeviceId: () => Promise<string>,
  setLoading: (loading: boolean) => void
) => {
  if (!db) {
    console.error('Firebase not initialized');
    Alert.alert('Error', 'Database connection not available');
    return;
  }
  
  setLoading(true);
  
  try {
    const now = new Date();
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    threeMonthsAgo.setHours(0, 0, 0, 0);
    
    Alert.alert(
      'Upload Historical Data',
      `This will upload health data from the last 3 months (${threeMonthsAgo.toLocaleDateString()} to today) to Firebase. Continue?`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => setLoading(false) },
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
                  
                  // Basic data structure with the current date
                  const dailyData: GarminData = {
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
                  
                  // Format data for upload - matches the structure of daily uploads
                  const dataToUpload = {
                    ...dailyData,
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
            } catch (e) {
              console.error('Error in historical data upload:', e);
              Alert.alert('Error', 'Failed to upload historical data');
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  } catch (error) {
    console.error('Error setting up historical data upload:', error);
    Alert.alert('Error', 'Could not setup historical data upload');
    setLoading(false);
  }
}; 