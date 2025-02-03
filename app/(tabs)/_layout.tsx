import { Tabs } from "expo-router";
import React, { useEffect, useState } from "react";
import { Platform, Alert, Button, View } from "react-native";
import * as SecureStore from "expo-secure-store";
import LoginModal from "@/components/LoginModal";

export default function TabLayout() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    checkLogin();
  }, []);

  useEffect(() => {
    if (isLoggedIn) {
      fetchStressData();
    }
  }, [isLoggedIn]);

  // Checks if login data is stored
  const checkLogin = async () => {
    const email = await SecureStore.getItemAsync("garmin_email");
    const password = await SecureStore.getItemAsync("garmin_password");

    if (email && password) {
      setIsLoggedIn(true);
    } else {
      setShowLogin(true);
    }
  };

  // Fetches stress data from the API
  const fetchStressData = async () => {
    const email = await SecureStore.getItemAsync("garmin_email");
    const password = await SecureStore.getItemAsync("garmin_password");
  
    if (!email || !password) {
      Alert.alert("Fehler", "Bitte melden Sie sich an.");
      return;
    }
  
    try {
      const response = await fetch("http://172.18.31.35:5000/stress", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });
  
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Unbekannter Fehler");
      }
  
      const data = await response.json();
      console.log("Stress-Daten:", data);
      // Handle successful data retrieval
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Daten konnten nicht abgerufen werden.";
      Alert.alert("Fehler", errorMessage);
      
      // Optional: If login fails, trigger logout
      if (error instanceof Error && error.message.includes("Login failed")) {
        resetLogin();
      }
    }
  };

  // Deletes saved login credentials and opens the login pop-up
  const resetLogin = async () => {
    await SecureStore.deleteItemAsync("garmin_email");
    await SecureStore.deleteItemAsync("garmin_password");
    setIsLoggedIn(false);
    setShowLogin(true);
  };

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: Platform.select({ ios: { position: "absolute" }, default: {} }),
        }}
      >
        <Tabs.Screen name="explore" options={{ title: "Explore" }} />
        <Tabs.Screen name="index" options={{ title: "Training" }} />
      </Tabs>

      {/* Button to reset login */}
      <View style={{ position: "absolute", top: 50, right: 20 }}>
        <Button title="🔑 Login ändern" onPress={resetLogin} />
      </View>

      {/* Login modal */}
      <LoginModal
        isVisible={showLogin}
        onClose={() => setShowLogin(false)}
        onLoginSuccess={() => setIsLoggedIn(true)}
      />
    </>
  );
}
