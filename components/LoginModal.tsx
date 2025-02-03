import React, { useState, useEffect } from "react";
import { View, Text, TextInput, Button, StyleSheet } from "react-native";
import Modal from "react-native-modal";
import * as SecureStore from "expo-secure-store";
import axios from 'axios';  // Import axios to make API requests

interface LoginModalProps {
  isVisible: boolean;
  onClose: () => void;
  onLoginSuccess: () => void;
}

export default function LoginModal({ isVisible, onClose, onLoginSuccess }: LoginModalProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    loadCredentials();
  }, []);

  // Load stored credentials (if any) from secure store
  const loadCredentials = async () => {
    const storedEmail = await SecureStore.getItemAsync("garmin_email");
    const storedPassword = await SecureStore.getItemAsync("garmin_password");

    if (storedEmail && storedPassword) {
      setEmail(storedEmail);
      setPassword(storedPassword);
      onLoginSuccess(); // Auto login if credentials are already stored
    }
  };

  // Handle login
  const handleLogin = async () => {
    try {
      const response = await fetch("http://172.18.31.35:5000/stress", {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'your_garmin_email',
          password: 'your_garmin_password'
        })
      });

      // If login is successful, store the credentials securely
      if (response.status === 200) {
        await SecureStore.setItemAsync("garmin_email", email);
        await SecureStore.setItemAsync("garmin_password", password);
        onLoginSuccess();
        onClose();
      } else {
        setErrorMessage("Login failed. Please check your credentials.");
      }
    } catch (error) {
      // Handle any errors during the login process
      if (axios.isAxiosError(error)) {
        setErrorMessage(error.response?.data?.error || "An error occurred during login.");
      } else {
        setErrorMessage("An error occurred during login.");
      }
    }
  };

  return (
    <Modal isVisible={isVisible}>
      <View style={styles.modalContainer}>
        <Text style={styles.title}>Garmin Login</Text>
        <TextInput
          style={styles.input}
          placeholder="E-Mail"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          placeholder="Passwort"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        <Button title="Login speichern" onPress={handleLogin} />
        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    backgroundColor: "white",
    padding: 20,
    borderRadius: 10,
    alignItems: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 10,
  },
  input: {
    width: "100%",
    borderBottomWidth: 1,
    marginBottom: 10,
    padding: 8,
  },
  errorText: {
    color: "red",
    marginTop: 10,
    fontSize: 14,
  },
});
