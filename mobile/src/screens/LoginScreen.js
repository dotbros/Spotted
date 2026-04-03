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
  const { login } = useContext(AuthContext);

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async () => {
    try {
      await login(identifier, password);
      navigation.goBack();
    } catch (err) {
      Alert.alert("Błąd", err.message);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Logowanie</Text>

      <TextInput
        placeholder="E-mail lub numer telefonu"
        placeholderTextColor="#999"
        value={identifier}
        onChangeText={setIdentifier}
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

      <TouchableOpacity style={styles.button} onPress={handleSubmit}>
        <Text style={styles.buttonText}>Zaloguj się</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() =>
          Alert.alert(
            "Przypomnienie hasła",
            "Skontaktuj się z administratorem, aby zresetować hasło."
          )
        }
      >
        <Text style={styles.forgotText}>Nie pamiętasz hasła?</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "transparent",
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
    backgroundColor: "#064e3b",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 20,
  },

  buttonText: {
    color: "#fff",
    fontWeight: "bold",
  },

  forgotText: {
    color: "#7da7ff",
    textAlign: "center",
    marginTop: 4,
  },
});