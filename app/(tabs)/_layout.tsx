import { Tabs } from "expo-router";
import React, { useEffect, useState } from "react";
import { Platform } from "react-native";
import SettingsButton from "../components/SettingsButton";

export default function TabLayout() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
  }, []);

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: true,
          tabBarStyle: Platform.select({ ios: { position: "absolute" }, default: {} }),
          headerRight: () => <SettingsButton />,
          headerTitle: "",
        }}
      >
        <Tabs.Screen
          name="explore"
          options={{ title: "Explore" }}
        />
        <Tabs.Screen 
          name="index" 
          options={{ title: "Training" }} 
        />
      </Tabs>
    </>
  );
}
