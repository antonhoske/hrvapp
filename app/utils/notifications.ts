import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Use named imports for the enum
import { SchedulableTriggerInputTypes } from 'expo-notifications';

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
export async function scheduleDailySurveyReminder(hourPreference = 9, minutePreference = 0) {
  try {
    // Check if we've already scheduled this notification
    const notificationId = await AsyncStorage.getItem('surveyReminderNotificationId');
    
    // If we have a previous notification ID, cancel it before creating a new one
    if (notificationId) {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
    }
    
    // Get the reminder time preference
    const reminderHour = hourPreference;
    const reminderMinute = minutePreference;
    
    // Calculate seconds until target time (today or tomorrow)
    const now = new Date();
    const targetDate = new Date();
    targetDate.setHours(reminderHour, reminderMinute, 0, 0);
    
    // If the target time is already past for today, schedule for tomorrow
    if (targetDate <= now) {
      targetDate.setDate(targetDate.getDate() + 1);
    }
    
    // Calculate seconds from now until the target time
    const secondsUntilTarget = Math.floor((targetDate.getTime() - now.getTime()) / 1000);
    
    // Schedule the notification
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: "Daily Health Survey",
        body: "Don't forget to complete your daily PSS survey today!",
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: {
        seconds: secondsUntilTarget,
        repeats: false,
        type: SchedulableTriggerInputTypes.TIME_INTERVAL
      },
    });
    
    // Save the ID and preferences for future reference
    await AsyncStorage.setItem('surveyReminderNotificationId', id);
    await AsyncStorage.setItem('surveyReminderHour', reminderHour.toString());
    await AsyncStorage.setItem('surveyReminderMinute', reminderMinute.toString());
    
    console.log(`Scheduled daily survey reminder at ${reminderHour}:${reminderMinute.toString().padStart(2, '0')} with ID: ${id}`);
    
    return id;
  } catch (error) {
    console.error('Failed to schedule survey reminder:', error);
    return null;
  }
}

// Get the saved reminder time preferences
export async function getReminderTimePreference() {
  try {
    const hour = await AsyncStorage.getItem('surveyReminderHour');
    const minute = await AsyncStorage.getItem('surveyReminderMinute');
    
    return {
      hour: hour ? parseInt(hour) : 9,
      minute: minute ? parseInt(minute) : 0
    };
  } catch (error) {
    console.error('Failed to get reminder time preference:', error);
    return { hour: 9, minute: 0 }; // Default to 9 AM
  }
}

// Cancel the daily survey reminder
export async function cancelDailySurveyReminder() {
  try {
    const notificationId = await AsyncStorage.getItem('surveyReminderNotificationId');
    
    if (notificationId) {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
      await AsyncStorage.removeItem('surveyReminderNotificationId');
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