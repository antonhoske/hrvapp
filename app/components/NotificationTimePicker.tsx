import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Alert } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { 
  scheduleDailySurveyReminder, 
  getReminderTimePreference, 
  isSurveyReminderScheduled,
  isReminderSet,
  refreshDailyReminder
} from '../utils/notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface NotificationTimePickerProps {
  onTimeSet?: (hour: number, minute: number) => void;
  onSubmit?: () => void;
}

const NotificationTimePicker: React.FC<NotificationTimePickerProps> = ({ onTimeSet, onSubmit }) => {
  const [date, setDate] = useState(new Date());
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [timeString, setTimeString] = useState('9:00 AM');
  const [isConfigMode, setIsConfigMode] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasInitializedRef = useRef(false);
  
  // Format the time into a readable string (12-hour format with AM/PM)
  const formatTime = useCallback((hours: number, minutes: number): string => {
    const period = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 || 12; // Convert 0 to 12 for 12 AM
    return `${hour12}:${minutes.toString().padStart(2, '0')} ${period}`;
  }, []);
  
  // Initial load of preferences
  useEffect(() => {
    const initialLoad = async () => {
      try {
        setIsLoading(true);
        
        // Get current settings
        const reminderSet = await isReminderSet();
        const { hour, minute } = await getReminderTimePreference();
        
        console.log('Initial load of reminder time:', { hour, minute, reminderSet });
        
        // Update UI state with the saved time
        const newDate = new Date();
        newDate.setHours(hour, minute, 0, 0);
        setDate(newDate);
        
        // Format and set the time string correctly
        const formattedTime = formatTime(hour, minute);
        console.log('Setting formatted time string:', formattedTime);
        setTimeString(formattedTime);
        
        // If reminder is set, show the compact view
        setIsConfigMode(!reminderSet);
        
        // Only do the initial refresh if this is the first load
        if (!hasInitializedRef.current) {
          await refreshDailyReminder();
          hasInitializedRef.current = true;
        }
      } catch (error) {
        console.error('Failed to load reminder state:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    initialLoad();
  }, [formatTime]);
  
  // Set up the notification refresh interval
  useEffect(() => {
    // Set up a LESS FREQUENT interval to check notification state
    // Once every 5 minutes is plenty
    if (!refreshIntervalRef.current) {
      refreshIntervalRef.current = setInterval(() => {
        isSurveyReminderScheduled()
          .then(isScheduled => {
            if (!isScheduled) {
              refreshDailyReminder().catch(err => 
                console.error('Error refreshing daily reminder:', err)
              );
            }
          })
          .catch(err => console.error('Error checking notification status:', err));
      }, 300000); // Check every 5 minutes (300000ms)
    }
    
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    };
  }, []);
  
  // Handle time change from DateTimePicker
  const onChange = (event: any, selectedDate?: Date) => {
    // On Android, we need to explicitly hide the picker
    if (Platform.OS === 'android') {
      setShowTimePicker(false);
    } else {
      // On iOS, we keep the picker open unless cancelled
      setShowTimePicker(Platform.OS === 'ios');
    }
    
    if (selectedDate) {
      console.log('Time selected:', selectedDate);
      setDate(selectedDate);
      
      const hours = selectedDate.getHours();
      const minutes = selectedDate.getMinutes();
      
      setTimeString(formatTime(hours, minutes));
      
      // Notify parent component if callback provided
      if (onTimeSet) {
        onTimeSet(hours, minutes);
      }
    }
  };
  
  // Toggle time picker visibility
  const toggleTimePicker = () => {
    if (Platform.OS === 'android') {
      // On Android, showing the picker is immediate
      console.log('Showing time picker on Android');
      setShowTimePicker(true);
    } else {
      // On iOS, we toggle
      console.log('Toggling time picker on iOS, current state:', showTimePicker);
      setShowTimePicker(!showTimePicker);
    }
  };
  
  // Toggle between config and compact modes
  const toggleConfigMode = async () => {
    console.log('Toggling config mode, current state:', isConfigMode);
    
    // If we're going from compact to config mode, refresh the time values first
    if (!isConfigMode) {
      try {
        setIsLoading(true);
        
        // Force reload the time values from storage
        const { hour, minute } = await getReminderTimePreference();
        console.log('Reloaded time before showing config:', hour, minute);
        
        // Update UI with correct time
        const newDate = new Date();
        newDate.setHours(hour, minute, 0, 0);
        setDate(newDate);
        
        // Format the time string
        const formattedTime = formatTime(hour, minute);
        setTimeString(formattedTime);
        console.log('Updated time display to:', formattedTime);
      } catch (error) {
        console.error('Error refreshing time values:', error);
      } finally {
        setIsLoading(false);
      }
    }
    
    // Force immediate change with more debugging
    const newConfigMode = !isConfigMode;
    console.log('Setting config mode to:', newConfigMode);
    setIsConfigMode(newConfigMode);
  };
  
  // Handle submit button press
  const handleSubmit = async () => {
    try {
      setIsLoading(true);
      
      // Make sure the reminder is scheduled with current time
      const hours = date.getHours();
      const minutes = date.getMinutes();
      
      console.log('HANDLE SUBMIT - Current time values:', {
        hours,
        minutes,
        date: date.toISOString()
      });
      
      // Mark this as a user-initiated settings change
      await AsyncStorage.setItem('isSettingTime', 'true');
      
      // Force clear any existing notification
      await AsyncStorage.setItem('isReminderSet', 'false');
      
      // Schedule the notification with the new time
      const notificationId = await scheduleDailySurveyReminder(hours, minutes);
      
      console.log('NOTIFICATION SCHEDULED:', {
        notificationId,
        hours,
        minutes
      });
      
      // Update the time string to ensure it reflects the saved time
      const formattedTime = formatTime(hours, minutes);
      console.log('Setting time string to:', formattedTime);
      setTimeString(formattedTime);
      
      // Switch to compact mode
      setIsConfigMode(false);
      
      // Call the onSubmit callback if provided
      if (onSubmit) {
        onSubmit();
      }
    } catch (error) {
      console.error('Failed to set notification:', error);
      Alert.alert('Error', 'Failed to set notification time. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };
  
  if (isLoading) {
    // You could show a loading spinner here if needed
    return (
      <View style={styles.container}>
        <Text>Loading notification settings...</Text>
      </View>
    );
  }
  
  return (
    <View style={styles.container}>
      {isConfigMode ? (
        <>
          <Text style={styles.label}>Set Daily Survey Notification:</Text>
          
          <TouchableOpacity 
            style={styles.timeButton}
            onPress={toggleTimePicker}
          >
            <Text style={styles.timeText}>{timeString}</Text>
          </TouchableOpacity>
          
          {Platform.OS === 'android' && showTimePicker && (
            <DateTimePicker
              testID="dateTimePicker"
              value={date}
              mode="time"
              is24Hour={false}
              display="default"
              onChange={onChange}
            />
          )}
          
          {Platform.OS === 'ios' && showTimePicker && (
            <DateTimePicker
              testID="dateTimePicker"
              value={date}
              mode="time"
              is24Hour={false}
              display="spinner"
              onChange={onChange}
            />
          )}
          
          <TouchableOpacity 
            style={styles.submitButton}
            onPress={handleSubmit}
          >
            <Text style={styles.buttonText}>Save Notification Time</Text>
          </TouchableOpacity>
        </>
      ) : (
        <View style={styles.compactContainer}>
          <View style={styles.compactTextContainer}>
            <Text style={styles.compactText}>
              Daily reminder set for <Text style={styles.timeHighlight}>{timeString}</Text>
            </Text>
          </View>
          <TouchableOpacity 
            style={styles.editButton}
            onPress={toggleConfigMode}
            testID="changeTimeButton"
          >
            <Text style={styles.editButtonText}>Change</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 15,
    backgroundColor: '#f8f8f8',
    borderRadius: 10,
    marginVertical: 10,
    minHeight: 70, // Ensure consistent height even during loading
  },
  label: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  timeButton: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 15,
  },
  timeText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  submitButton: {
    backgroundColor: '#4CAF50',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 15,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  compactContainer: {
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 10,
  },
  compactTextContainer: {
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
    width: '100%',
  },
  compactText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 5,
  },
  timeHighlight: {
    fontWeight: 'bold',
    color: '#007AFF',
  },
  editButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  editButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
});

export default NotificationTimePicker; 