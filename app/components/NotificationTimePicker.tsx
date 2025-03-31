import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Alert, TextInput } from 'react-native';
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
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualHour, setManualHour] = useState('9');
  const [manualMinute, setManualMinute] = useState('00');
  const [manualAmPm, setManualAmPm] = useState('AM');
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
        
        // Set manual input values
        setManualHour(String(hour % 12 || 12));
        setManualMinute(String(minute).padStart(2, '0'));
        setManualAmPm(hour >= 12 ? 'PM' : 'AM');
        
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
  }, [formatTime]); // Only run this on mount
  
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
      
      // Update manual input values too
      setManualHour(String(hours % 12 || 12));
      setManualMinute(String(minutes).padStart(2, '0'));
      setManualAmPm(hours >= 12 ? 'PM' : 'AM');
      
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
  
  // Toggle manual time input as a fallback
  const toggleManualInput = () => {
    console.log('Toggling manual input, current state:', showManualInput);
    // Always hide time picker when showing manual input
    if (!showManualInput) {
      setShowTimePicker(false);
    }
    setShowManualInput(!showManualInput);
  };
  
  // Handle manual time input submission
  const submitManualTime = () => {
    try {
      // Parse the hour (12-hour format)
      let hour = parseInt(manualHour);
      if (isNaN(hour) || hour < 1 || hour > 12) {
        Alert.alert('Invalid Hour', 'Please enter a valid hour (1-12)');
        return;
      }
      
      // Parse the minute
      const minute = parseInt(manualMinute);
      if (isNaN(minute) || minute < 0 || minute > 59) {
        Alert.alert('Invalid Minute', 'Please enter a valid minute (0-59)');
        return;
      }
      
      // Convert to 24-hour format if PM
      if (manualAmPm === 'PM' && hour !== 12) {
        hour += 12;
      } else if (manualAmPm === 'AM' && hour === 12) {
        hour = 0; // 12 AM = 0 hours in 24-hour format
      }
      
      // Update the date object
      const newDate = new Date();
      newDate.setHours(hour, minute, 0, 0);
      setDate(newDate);
      
      // Update the time string
      setTimeString(formatTime(hour, minute));
      
      // Hide manual input
      setShowManualInput(false);
    } catch (error) {
      console.error('Error in manual time input:', error);
      Alert.alert('Error', 'Failed to set time. Please try again.');
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
        
        // Set manual input values
        setManualHour(String(hour % 12 || 12));
        setManualMinute(String(minute).padStart(2, '0'));
        setManualAmPm(hour >= 12 ? 'PM' : 'AM');
        
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
    
    // Reset manual input when showing config view
    if (newConfigMode) {
      setShowManualInput(false);
    }
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
          
          {!showManualInput && (
            <TouchableOpacity 
              style={styles.timeButton}
              onPress={toggleTimePicker}
            >
              <Text style={styles.timeText}>{timeString}</Text>
            </TouchableOpacity>
          )}
          
          {Platform.OS === 'android' && showTimePicker && !showManualInput && (
            <DateTimePicker
              testID="dateTimePicker"
              value={date}
              mode="time"
              is24Hour={false}
              display="default"
              onChange={onChange}
            />
          )}
          
          {Platform.OS === 'ios' && showTimePicker && !showManualInput && (
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
            style={[styles.secondaryButton, showManualInput ? styles.activeSecondaryButton : {}]}
            onPress={toggleManualInput}
          >
            <Text style={[styles.secondaryButtonText, showManualInput ? styles.activeSecondaryButtonText : {}]}>
              {showManualInput ? 'Hide Manual Input' : 'Enter Time Manually'}
            </Text>
          </TouchableOpacity>
          
          {showManualInput && (
            <View style={styles.manualInputContainerOuter}>
              <Text style={styles.manualInputLabel}>Enter your preferred notification time:</Text>
              <View style={styles.manualInputContainer}>
                <TextInput
                  style={styles.timeInput}
                  value={manualHour}
                  onChangeText={setManualHour}
                  keyboardType="number-pad"
                  maxLength={2}
                  placeholder="HH"
                />
                <Text style={styles.timeSeparator}>:</Text>
                <TextInput
                  style={styles.timeInput}
                  value={manualMinute}
                  onChangeText={setManualMinute}
                  keyboardType="number-pad"
                  maxLength={2}
                  placeholder="MM"
                />
                <TouchableOpacity 
                  style={[styles.amPmButton, manualAmPm === 'AM' ? styles.activeAmPm : {}]}
                  onPress={() => setManualAmPm('AM')}
                >
                  <Text style={[styles.amPmText, manualAmPm === 'AM' ? styles.activeAmPmText : {}]}>AM</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.amPmButton, manualAmPm === 'PM' ? styles.activeAmPm : {}]}
                  onPress={() => setManualAmPm('PM')}
                >
                  <Text style={[styles.amPmText, manualAmPm === 'PM' ? styles.activeAmPmText : {}]}>PM</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity 
                style={styles.applyTimeButton}
                onPress={submitManualTime}
              >
                <Text style={styles.applyTimeText}>Apply Time</Text>
              </TouchableOpacity>
            </View>
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
  secondaryButton: {
    backgroundColor: '#f0f0f0',
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginVertical: 10,
  },
  secondaryButtonText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '600',
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
  debugMessage: {
    fontSize: 12,
    color: '#666',
    marginTop: 5,
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
  manualInputContainerOuter: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginVertical: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  manualInputLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  manualInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  timeInput: {
    backgroundColor: 'white',
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#ccc',
    width: 60,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '600',
  },
  timeSeparator: {
    marginHorizontal: 8,
    fontSize: 18,
    fontWeight: 'bold',
  },
  amPmButton: {
    marginLeft: 10,
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#ccc',
    backgroundColor: 'white',
    minWidth: 50,
    alignItems: 'center',
  },
  activeAmPm: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  amPmText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  activeAmPmText: {
    color: 'white',
  },
  applyTimeButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 5,
    alignSelf: 'center', 
    width: '100%',
  },
  applyTimeText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  activeSecondaryButton: {
    backgroundColor: '#007AFF',
  },
  activeSecondaryButtonText: {
    color: 'white',
  },
});

export default NotificationTimePicker; 