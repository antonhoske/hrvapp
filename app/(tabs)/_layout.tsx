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
    checkLogin();
  }, []);

  const triggerRefresh = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  const checkLogin = async () => {
    const email = await SecureStore.getItemAsync("garmin_email");
    const password = await SecureStore.getItemAsync("garmin_password");

    if (email && password) {
      setIsLoggedIn(true);
    } else {
      setShowLogin(true);
    }
  };

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
        <Tabs.Screen
          name="explore"
          options={{ title: "Explore" }}
          initialParams={{ refreshTrigger }}
        />
        <Tabs.Screen name="index" options={{ title: "Training" }} />
      </Tabs>

      {/* Login Button - Now properly positioned */}
      {isLoggedIn && (
        <SafeAreaView style={{ position: "absolute", top: 50, right: 20, zIndex: 100 }}>
          <Button title="🔑 Login ändern" onPress={resetLogin} />
        </SafeAreaView>
      )}

      {/* Login Modal */}
      <LoginModal
        isVisible={showLogin}
        onClose={() => setShowLogin(false)}
        onLoginSuccess={() => {
          setIsLoggedIn(true);
          triggerRefresh();
        }}
      />
    </>
  );
}
