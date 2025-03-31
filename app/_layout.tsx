import { Stack } from 'expo-router/stack';
import { DataSourceProvider } from './components/DataSourceContext';

export default function Layout() {
  return (
    <DataSourceProvider>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: true, headerTitle: "" }} />
      </Stack>
    </DataSourceProvider>
  );
}
