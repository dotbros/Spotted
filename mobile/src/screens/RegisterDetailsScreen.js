import React, { useContext, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
} from "react-native";
import { AuthContext } from "../context/AuthContext";

export default function RegisterDetailsScreen({ navigation }) {
  const { register } = useContext(AuthContext);

  const [step, setStep] = useState(1);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");

  const [pseudonym, setPseudonym] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [profession, setProfession] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canContinue = useMemo(() => {
    return String(identifier).trim().length > 0 && String(password).length >= 6;
  }, [identifier, password]);

  const handleRegister = async () => {
    if (isSubmitting) return;
    try {
      setIsSubmitting(true);

      const isEmail = identifier.includes("@");

      await register({
        email: isEmail ? identifier.trim() : null,
        phone: !isEmail ? identifier.trim() : null,
        password,

        // backend najprawdopodobniej wymaga pseudonimu → fallback
        pseudonym: pseudonym.trim() || identifier.trim(),
        nickname: pseudonym.trim() || identifier.trim(),
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        profession: profession.trim() || null,
        city: city.trim() || null,
        country: country.trim() || null,
      });

      navigation.goBack();
    } catch (err) {
      console.log("REGISTER ERROR:", err);
      Alert.alert("Błąd", err?.message || "Nie udało się utworzyć konta");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {step === 1 ? (
        <>
          <Text style={styles.title}>Rejestracja</Text>

          <TextInput
            placeholder="E-mail lub numer telefonu"
            placeholderTextColor="#999"
            value={identifier}
            onChangeText={setIdentifier}
            autoCapitalize="none"
            style={styles.input}
          />

          <TextInput
            placeholder="Hasło (min. 6 znaków)"
            placeholderTextColor="#999"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            style={styles.input}
          />

          <TouchableOpacity
            style={[styles.button, !canContinue && styles.buttonDisabled]}
            onPress={() => {
              if (!canContinue) {
                Alert.alert(
                  "Uzupełnij dane",
                  "Podaj e-mail lub telefon oraz hasło (min. 6 znaków)."
                );
                return;
              }
              setStep(2);
            }}
          >
            <Text style={styles.buttonText}>Dalej</Text>
          </TouchableOpacity>

          <Text style={styles.infoText}>
            Zarejestrowane osoby uzyskują możliwość dodawania komentarzy, mają większy wpływ na ocenę wydarzenia, mogą kontaktować się z autorami postów i innymi użytkownikami, zdobywają rangi, dzięki którym są nagradzani.
          </Text>
        </>
      ) : (
        <>
          <Text style={styles.title}>Dane użytkownika</Text>

          <TextInput
            placeholder="Pseudonim"
            placeholderTextColor="#999"
            value={pseudonym}
            onChangeText={setPseudonym}
            style={styles.input}
          />
          <TextInput
            placeholder="Imię"
            placeholderTextColor="#999"
            value={firstName}
            onChangeText={setFirstName}
            style={styles.input}
          />
          <TextInput
            placeholder="Nazwisko"
            placeholderTextColor="#999"
            value={lastName}
            onChangeText={setLastName}
            style={styles.input}
          />
          <TextInput
            placeholder="Zawód"
            placeholderTextColor="#999"
            value={profession}
            onChangeText={setProfession}
            style={styles.input}
          />
          <TextInput
            placeholder="Miasto"
            placeholderTextColor="#999"
            value={city}
            onChangeText={setCity}
            style={styles.input}
          />
          <TextInput
            placeholder="Kraj"
            placeholderTextColor="#999"
            value={country}
            onChangeText={setCountry}
            style={styles.input}
          />

          <View style={styles.row}>
            <TouchableOpacity style={[styles.secondaryButton, { flex: 1 }]} onPress={() => setStep(1)}>
              <Text style={styles.secondaryButtonText}>Wstecz</Text>
            </TouchableOpacity>
            <View style={{ width: 12 }} />
            <TouchableOpacity style={[styles.button, { flex: 1 }]} onPress={handleRegister}>
              <Text style={styles.buttonText}>
                {isSubmitting ? "Rejestracja..." : "Zarejestruj"}
              </Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const GREEN = "#296f2a";

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#141414" },
  content: { padding: 20, paddingTop: 40 },
  title: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 20,
  },
  input: {
    backgroundColor: "#1f1f1f",
    color: "#fff",
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  button: {
    backgroundColor: GREEN,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 6,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "700",
  },
  secondaryButton: {
    backgroundColor: "#2b2b2b",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#fff",
    fontWeight: "700",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  infoText: {
    color: "#aaa",
    marginTop: 16,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
});