import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';

// Define the background task name
const SURVEY_REMINDER_TASK = 'SURVEY_REMINDER_TASK';

// Register the background task handler
TaskManager.defineTask(SURVEY_REMINDER_TASK, async () => {
  try {
    // Get the saved reminder time
    const { hour, minute } = await getReminderTimePreference();
    
    // Calculate if we should trigger the notification today
    const now = new Date();
    const targetTime = new Date();
    targetTime.setHours(hour, minute, 0, 0);
    
    // If it's past the target time for today, the notification will be scheduled for tomorrow
    if (now.getHours() === hour && now.getMinutes() === minute) {
      // It's time to trigger the notification!
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Daily Health Survey",
          body: "Don't forget to complete your daily PSS survey today!",
          sound: true,
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: null, // Send immediately
      });
    }
    
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (error) {
    console.error('Error in background task:', error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

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
    // Save the time preferences for future reference
    await AsyncStorage.setItem('surveyReminderHour', hourPreference.toString());
    await AsyncStorage.setItem('surveyReminderMinute', minutePreference.toString());
    
    // Register the background fetch task if it's not already registered
    await BackgroundFetch.registerTaskAsync(SURVEY_REMINDER_TASK, {
      minimumInterval: 15 * 60, // 15 minutes in seconds
      stopOnTerminate: false,
      startOnBoot: true,
    });
    
    // Also schedule the notification once so the user can see instant confirmation
    const now = new Date();
    const targetDate = new Date();
    targetDate.setHours(hourPreference, minutePreference, 0, 0);
    
    // If the target time is already past for today, schedule for tomorrow
    if (targetDate <= now) {
      targetDate.setDate(targetDate.getDate() + 1);
    }
    
    // Calculate seconds until the target time
    const secondsUntilTarget = Math.floor((targetDate.getTime() - now.getTime()) / 1000);
    
    // If the target time is within the next 24 hours, schedule it now
    if (secondsUntilTarget <= 24 * 60 * 60) {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: "Daily Health Survey",
          body: "Don't forget to complete your daily PSS survey today!",
          sound: true,
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: null, // Immediate notification to confirm setup
      });
      
      console.log(`Scheduled daily survey reminder at ${hourPreference}:${minutePreference.toString().padStart(2, '0')} with ID: ${id}`);
      return id;
    }
    
    return 'background-task-scheduled';
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