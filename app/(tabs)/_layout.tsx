import { Tabs } from "expo-router";
import React, { useEffect, useState } from "react";
import { Platform, Button, View, SafeAreaView } from "react-native";
import * as SecureStore from "expo-secure-store";
import LoginModal from "@/components/LoginModal";

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
          headerShown: false,
          tabBarStyle: Platform.select({ ios: { position: "absolute" }, default: {} }),
        }}
      >
        <Tabs.Screen
          name="explore"
          options={{ title: "Explore" }}
          
        />
        <Tabs.Screen name="index" options={{ title: "Training" }} />
      </Tabs>

    </>
  );
}
