import React from 'react';
import { Stack } from 'expo-router';
import { DataSourceProvider } from './components/DataSourceContext';

export default function RootLayout() {
  return (
    <DataSourceProvider>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen 
          name="auth/AuthScreen" 
          options={{ 
            headerShown: false,
            presentation: 'modal',
            animation: 'fade'
          }} 
        />
      </Stack>
    </DataSourceProvider>
  );
}
