import React, { useState, useContext } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";
import { AuthContext } from "../context/AuthContext";

export default function LoginScreen({ navigation }) {
  const { login, register } = useContext(AuthContext);

  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");

  const handleSubmit = async () => {
    try {
      if (isRegister) {
        await register(email, password, nickname);
      } else {
        await login(email, password);
      }

      navigation.goBack();
    } catch (err) {
      Alert.alert("Błąd", err.message);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        {isRegister ? "Rejestracja" : "Logowanie"}
      </Text>

      {isRegister && (
        <TextInput
          placeholder="Nick"
          placeholderTextColor="#999"
          value={nickname}
          onChangeText={setNickname}
          style={styles.input}
        />
      )}

      <TextInput
        placeholder="Email"
        placeholderTextColor="#999"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        style={styles.input}
      />

      <TextInput
        placeholder="Hasło"
        placeholderTextColor="#999"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        style={styles.input}
      />

      <TouchableOpacity
        style={styles.button}
        onPress={handleSubmit}
      >
        <Text style={styles.buttonText}>
          {isRegister ? "Zarejestruj" : "Zaloguj"}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() =>
          setIsRegister((prev) => !prev)
        }
      >
        <Text style={styles.switchText}>
          {isRegister
            ? "Masz konto? Zaloguj się"
            : "Nie masz konta? Zarejestruj się"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#111",
    justifyContent: "center",
    padding: 20,
  },

  title: {
    fontSize: 24,
    color: "#fff",
    marginBottom: 30,
    textAlign: "center",
    fontWeight: "bold",
  },

  input: {
    backgroundColor: "#222",
    color: "#fff",
    padding: 12,
    marginBottom: 15,
    borderRadius: 8,
  },

  button: {
    backgroundColor: "#c00",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 20,
  },

  buttonText: {
    color: "#fff",
    fontWeight: "bold",
  },

  switchText: {
    color: "#ccc",
    textAlign: "center",
  },
});