import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Set notification handler (how notifications are displayed when the app is in the foreground)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Request permissions for notifications
export async function requestNotificationPermissions() {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  
  // If we don't have permission yet, ask for it
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  
  // If we still don't have permission, return false
  if (finalStatus !== 'granted') {
    console.log('Failed to get notification permissions');
    return false;
  }
  
  return true;
}

// Schedule a daily survey reminder notification
export async function scheduleDailySurveyReminder(hourPreference: number = 9, minutePreference: number = 0) {
  try {
    console.log(`===== STARTING NOTIFICATION SCHEDULING =====`);
    console.log(`Setting reminder for ${hourPreference}:${minutePreference}`);
    
    // Cancel existing notifications first
    try {
      // Get all scheduled notifications
      const allNotifications = await Notifications.getAllScheduledNotificationsAsync();
      console.log(`Found ${allNotifications.length} scheduled notifications`);
      
      // Cancel all daily survey notifications
      for (const notification of allNotifications) {
        if (notification.content?.title?.includes('Daily Health Survey') || 
            notification.content?.body?.includes('daily PSS survey')) {
          console.log(`Cancelling notification with ID: ${notification.identifier}`);
          await Notifications.cancelScheduledNotificationAsync(notification.identifier);
        }
      }
      
      // Also try the stored notification ID method
      await cancelDailySurveyReminder();
    } catch (error) {
      console.error('Error while cancelling existing notifications:', error);
    }
    
    // IMPORTANT: First set the reminder flag to true to ensure we read the right values later
    await AsyncStorage.setItem('isReminderSet', 'true');
    
    // Save the time preferences for future reference
    console.log(`SAVING TIME PREFERENCES TO ASYNCSTORAGE:`, {
      hour: hourPreference,
      minute: minutePreference,
      hourString: hourPreference.toString(),
      minuteString: minutePreference.toString()
    });
    
    await AsyncStorage.setItem('surveyReminderHour', hourPreference.toString());
    await AsyncStorage.setItem('surveyReminderMinute', minutePreference.toString());
    
    // Verify the saved value by reading it back immediately
    const savedHour = await AsyncStorage.getItem('surveyReminderHour');
    const savedMinute = await AsyncStorage.getItem('surveyReminderMinute');
    const reminderIsSet = await AsyncStorage.getItem('isReminderSet');
    
    console.log('IMMEDIATE VERIFICATION OF SAVED VALUES:', {
      savedHour,
      savedMinute,
      reminderIsSet,
      hourMatches: savedHour === hourPreference.toString(),
      minuteMatches: savedMinute === minutePreference.toString()
    });
    
    // Mark if this call is coming from user interaction (not app restart)
    const isUserInitiated = await AsyncStorage.getItem('isSettingTime') === 'true';
    console.log('Is user initiated?', isUserInitiated);
    
    // Create the notification channel for Android
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('hrvapp-reminders', {
        name: 'Daily Reminders',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }
    
    // Schedule the next occurrence with proper daily trigger
    console.log(`Scheduling notification for ${hourPreference}:${minutePreference} with daily trigger`);
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: "Daily Health Survey",
        body: "It's time to complete your survey for today 😊!",
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
        ...(Platform.OS === 'android' && { channelId: 'hrvapp-reminders' }),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: hourPreference,
        minute: minutePreference,
      },
    });
    
    console.log(`Successfully scheduled notification with ID: ${id}`);
    
    // Only send the confirmation notification if this was explicitly requested by the user
    if (isUserInitiated) {
      // Send a one-time confirmation notification
      console.log('Sending confirmation notification');
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Notification Set",
          body: `Daily surveys will be sent at ${hourPreference}:${minutePreference.toString().padStart(2, '0')}`,
          sound: true,
          priority: Notifications.AndroidNotificationPriority.DEFAULT,
          ...(Platform.OS === 'android' && { channelId: 'hrvapp-reminders' }),
        },
        trigger: null, // Immediate notification for confirmation
      });
      
      // Reset the flag
      await AsyncStorage.setItem('isSettingTime', 'false');
      console.log('Reset isSettingTime flag');
    }
    
    // Save the ID for future reference
    await AsyncStorage.setItem('surveyReminderNotificationId', id);
    
    console.log(`Completed scheduling daily reminder for ${hourPreference}:${minutePreference.toString().padStart(2, '0')} with ID: ${id}`);
    console.log(`===== COMPLETED NOTIFICATION SCHEDULING =====`);
    
    return id;
  } catch (error: any) {
    console.error('Failed to schedule survey reminder:', error);
    return null;
  }
}

// Get the saved reminder time preferences
export async function getReminderTimePreference() {
  try {
    // First try to get the saved time values directly
    const hour = await AsyncStorage.getItem('surveyReminderHour');
    const minute = await AsyncStorage.getItem('surveyReminderMinute');
    
    console.log('LOADING SAVED TIME VALUES:', {
      rawHour: hour,
      rawMinute: minute
    });
    
    // If we have valid time values, use them regardless of isReminderSet
    if (hour !== null && minute !== null) {
      const parsedHour = parseInt(hour);
      const parsedMinute = parseInt(minute);
      
      console.log('PARSED TIME VALUES:', {
        parsedHour,
        parsedMinute,
        originalHour: hour,
        originalMinute: minute
      });
      
      // Double-check that we have valid parsed numbers
      if (!isNaN(parsedHour) && !isNaN(parsedMinute)) {
        console.log('USING SAVED TIME:', parsedHour, parsedMinute);
        return {
          hour: parsedHour,
          minute: parsedMinute
        };
      }
    }
    
    // If we get here, either we don't have saved values or they're invalid
    // Check if there's a scheduled notification
    const isScheduled = await isSurveyReminderScheduled();
    console.log('No valid saved time, checking scheduled notification:', isScheduled);
    
    if (isScheduled) {
      // If there's a scheduled notification but no saved time, default to 9 AM
      console.log('Found scheduled notification but no saved time, using default');
      return { hour: 9, minute: 0 };
    }
    
    // If no scheduled notification, return default time
    console.log('No scheduled notification found, using default time');
    return { hour: 9, minute: 0 };
  } catch (error) {
    console.error('Failed to get reminder time preference:', error);
    return { hour: 9, minute: 0 }; // Default to 9 AM
  }
}

// Check if a reminder is set
export async function isReminderSet() {
  try {
    const reminderSet = await AsyncStorage.getItem('isReminderSet');
    return reminderSet === 'true';
  } catch (error) {
    console.error('Failed to check if reminder is set:', error);
    return false;
  }
}

// Cancel the daily survey reminder
export async function cancelDailySurveyReminder() {
  try {
    const notificationId = await AsyncStorage.getItem('surveyReminderNotificationId');
    
    if (notificationId) {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
      await AsyncStorage.removeItem('surveyReminderNotificationId');
      await AsyncStorage.setItem('isReminderSet', 'false');
      console.log('Cancelled daily survey reminder');
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Failed to cancel survey reminder:', error);
    return false;
  }
}

// Check if survey reminder is already scheduled
export async function isSurveyReminderScheduled() {
  try {
    const notificationId = await AsyncStorage.getItem('surveyReminderNotificationId');
    
    if (!notificationId) {
      return false;
    }
    
    // Check if the notification still exists in the scheduled notifications
    const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
    return scheduledNotifications.some(notification => notification.identifier === notificationId);
  } catch (error) {
    console.error('Failed to check if survey reminder is scheduled:', error);
    return false;
  }
}

// Helper function to ensure notification is rescheduled for the next day
export async function refreshDailyReminder() {
  try {
    console.log('===== REFRESHING DAILY REMINDER =====');
    
    // First check if there's already a scheduled notification
    const isScheduled = await isSurveyReminderScheduled();
    console.log('Is notification already scheduled?', isScheduled);
    
    // Get the saved time preference
    const { hour, minute } = await getReminderTimePreference();
    console.log('Retrieved saved time preference:', { hour, minute });
    
    // If there's no scheduled notification, schedule one
    if (!isScheduled) {
      console.log('No scheduled notification found, scheduling new one');
      await scheduleDailySurveyReminder(hour, minute);
      console.log(`Refreshed daily reminder for ${hour}:${minute.toString().padStart(2, '0')}`);
      return true;
    } else {
      console.log('Notification already scheduled, skipping refresh');
      return false;
    }
  } catch (error) {
    console.error('Failed to refresh daily reminder:', error);
    return false;
  }
} 