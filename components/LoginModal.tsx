import React from "react";
import { Modal, View, Text, TextInput, TouchableOpacity } from "react-native";

interface LoginModalProps {
  isVisible: boolean;
  onClose: () => void;
  onLoginSuccess: () => void;
}

const LoginModal: React.FC<LoginModalProps> = ({ isVisible, onClose, onLoginSuccess }) => {
  return (
    <Modal visible={isVisible} animationType="slide" transparent>
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.5)" }}>
        <View style={{ backgroundColor: "white", padding: 20, borderRadius: 10, width: "80%", alignItems: "center" }}>
          <Text style={{ fontSize: 20, fontWeight: "bold", marginBottom: 10 }}>Login erforderlich</Text>
          <TextInput placeholder="Email" style={{ width: "100%", padding: 10, borderWidth: 1, borderRadius: 5, marginBottom: 10 }} />
          <TextInput placeholder="Passwort" secureTextEntry style={{ width: "100%", padding: 10, borderWidth: 1, borderRadius: 5, marginBottom: 10 }} />
          <TouchableOpacity style={{ backgroundColor: "#007AFF", padding: 10, borderRadius: 5 }} onPress={onLoginSuccess}>
            <Text style={{ color: "white", fontSize: 18, fontWeight: "bold" }}>Login</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} style={{ marginTop: 10 }}>
            <Text style={{ color: "red" }}>Abbrechen</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

export default LoginModal;
