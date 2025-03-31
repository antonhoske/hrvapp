import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { scheduleDailySurveyReminder, getReminderTimePreference } from '../utils/notifications';

interface NotificationTimePickerProps {
  onTimeSet?: (hour: number, minute: number) => void;
  onSubmit?: () => void;
}

const NotificationTimePicker: React.FC<NotificationTimePickerProps> = ({ onTimeSet, onSubmit }) => {
  const [date, setDate] = useState(new Date());
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [timeString, setTimeString] = useState('9:00 AM');
  const [isConfigMode, setIsConfigMode] = useState(true);
  
  // Load the saved preference when component mounts
  useEffect(() => {
    const loadPreference = async () => {
      try {
        const { hour, minute } = await getReminderTimePreference();
        const newDate = new Date();
        newDate.setHours(hour, minute, 0, 0);
        setDate(newDate);
        setTimeString(formatTime(hour, minute));
        
        // Check if a reminder has already been set
        // If a time was saved previously, enter compact mode
        if (hour !== 9 || minute !== 0) {
          setIsConfigMode(false);
        }
      } catch (error) {
        console.error('Failed to load reminder time preference:', error);
      }
    };
    
    loadPreference();
  }, []);
  
  // Format the time into a readable string (12-hour format with AM/PM)
  const formatTime = (hours: number, minutes: number): string => {
    const period = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 || 12; // Convert 0 to 12 for 12 AM
    return `${hour12}:${minutes.toString().padStart(2, '0')} ${period}`;
  };
  
  // Handle time change
  const onChange = (event: any, selectedDate?: Date) => {
    setShowTimePicker(Platform.OS === 'ios');
    
    if (selectedDate) {
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
  
  // Handle submit button press
  const handleSubmit = () => {
    // Make sure the reminder is scheduled with current time
    const hours = date.getHours();
    const minutes = date.getMinutes();
    
    scheduleDailySurveyReminder(hours, minutes).then(() => {
      // Switch to compact mode
      setIsConfigMode(false);
      
      // Call the onSubmit callback if provided
      if (onSubmit) {
        onSubmit();
      }
    });
  };
  
  // Toggle between config and compact modes
  const toggleConfigMode = () => {
    setIsConfigMode(!isConfigMode);
  };
  
  return (
    <View style={styles.container}>
      {isConfigMode ? (
        <>
          <Text style={styles.label}>Set Daily Survey Notification:</Text>
          
          <TouchableOpacity 
            style={styles.timeButton}
            onPress={() => setShowTimePicker(true)}
          >
            <Text style={styles.timeText}>{timeString}</Text>
          </TouchableOpacity>
          
          {showTimePicker && (
            <DateTimePicker
              value={date}
              mode="time"
              is24Hour={false}
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
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
          <Text style={styles.compactText}>
            Daily reminder set for <Text style={styles.timeHighlight}>{timeString}</Text>
          </Text>
          <TouchableOpacity 
            style={styles.editButton}
            onPress={toggleConfigMode}
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
    marginTop: 10,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  compactContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  compactText: {
    fontSize: 16,
  },
  timeHighlight: {
    fontWeight: 'bold',
    color: '#007AFF',
  },
  editButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  editButtonText: {
    color: 'white',
    fontWeight: '600',
  },
});

export default NotificationTimePicker; 