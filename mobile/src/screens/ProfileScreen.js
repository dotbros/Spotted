import React, { useEffect, useState, useContext, useRef, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Image,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
  ActivityIndicator,
  BackHandler,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useFocusEffect } from "@react-navigation/native";
import { AuthContext } from "../context/AuthContext";
import { API_URL } from "../../config";

export default function ProfileScreen({ navigation, route }) {
  const { token } = useContext(AuthContext);

  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({});
  const [preferences, setPreferences] = useState([]);
  const [addresses, setAddresses] = useState({});
  const [editMode, setEditMode] = useState(false);
  const [defaultLocation, setDefaultLocation] = useState(null);
  const [defaultRadius, setDefaultRadius] = useState("10");
  const [newRadius, setNewRadius] = useState("10");
  const [editLocations, setEditLocations] = useState(false);
  const [isDefaultLocationLoading, setIsDefaultLocationLoading] = useState(false);
  const lastHandledPickAtRef = useRef(null);

  const reverseLabel = async (lat, lng) => {
    const geoRes = await fetch(`${API_URL}/geo/reverse?lat=${lat}&lng=${lng}`);
    const geo = await geoRes.json();
    return geo?.label || geo?.city || `${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`;
  };

  useEffect(() => {
    if (!token) {
      setProfile(null);
      setForm({});
      setPreferences([]);
      setAddresses({});
      return;
    }

    fetchProfile();
    fetchPreferences();
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      if (token) {
        fetchProfile();
        fetchPreferences();
      }

      const onBackPress = () => {
        navigation.navigate("Feed");
        navigation.openDrawer();
        return true;
      };

      const sub = BackHandler.addEventListener("hardwareBackPress", onBackPress);
      return () => sub.remove();
    }, [navigation, token])
  );

  // Odbieramy lokalizację wybraną na mapie HERE (tylko dla observed)
  useEffect(() => {
    const loc = route.params?.newLocation;
    const locationTarget = route.params?.locationTarget;
    const pickedAt = route.params?.pickedAt;

    if (!loc || locationTarget !== "observed" || !pickedAt) return;
    if (lastHandledPickAtRef.current === pickedAt) return;
    lastHandledPickAtRef.current = pickedAt;

    const exists = preferences.some(
      (p) =>
        Math.abs(Number(p.lat) - Number(loc.lat)) < 0.00001 &&
        Math.abs(Number(p.lng) - Number(loc.lng)) < 0.00001
    );

    if (!exists) {
      fetch(`${API_URL}/user/preferences`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          lat: loc.lat,
          lng: loc.lng,
          radius_km: Number(newRadius) || 10,
          use_current_location: false,
        }),
      })
        .then(() => fetchPreferences())
        .catch(console.log);
    }

    // czyścimy params żeby nie duplikować przy ponownym wejściu
    navigation.setParams({
      newLocation: undefined,
      locationTarget: undefined,
      pickedAt: undefined,
    });
  }, [route.params?.pickedAt, token, newRadius, preferences]);

  const fetchProfile = async () => {
    const res = await fetch(`${API_URL}/user/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setProfile(data);
    setForm(data);
  };

  const fetchPreferences = async () => {
    const res = await fetch(`${API_URL}/user/preferences`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    const prefs = Array.isArray(data) ? data : [];

    const defaultPref = prefs.find((p) => p.use_current_location === true);
    const observed = prefs.filter((p) => p.use_current_location !== true);

    setPreferences(observed);

    if (defaultPref) {
      try {
        const defaultLabel = await reverseLabel(defaultPref.lat, defaultPref.lng);
        setDefaultLocation({
          id: defaultPref.id,
          lat: defaultPref.lat,
          lng: defaultPref.lng,
          label: defaultLabel,
          radius_km: defaultPref.radius_km,
        });
      } catch {
        setDefaultLocation({
          id: defaultPref.id,
          lat: defaultPref.lat,
          lng: defaultPref.lng,
          label: `${Number(defaultPref.lat).toFixed(4)}, ${Number(defaultPref.lng).toFixed(4)}`,
          radius_km: defaultPref.radius_km,
        });
      }
    } else {
      setDefaultLocation(null);
    }

    const addressEntries = await Promise.all(
      observed.map(async (p) => {
        try {
          const label = await reverseLabel(p.lat, p.lng);
          return [p.id, label];
        } catch {
          return [p.id, `${Number(p.lat).toFixed(4)}, ${Number(p.lng).toFixed(4)}`];
        }
      })
    );

    setAddresses(Object.fromEntries(addressEntries));
  };

  const saveProfile = async () => {
    await fetch(`${API_URL}/user/profile`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(form),
    });
    setEditMode(false);
    fetchProfile();
  };

  const pickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
    });

    if (!result.canceled) {
      const formData = new FormData();
      formData.append("avatar", {
        uri: result.assets[0].uri,
        name: "avatar.jpg",
        type: "image/jpeg",
      });

      const res = await fetch(`${API_URL}/user/avatar`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await res.json();
      setProfile({ ...profile, avatar_url: data.avatar_url });
    }
  };

  const setMyLocation = async () => {
    const proceed = () => {
      Alert.alert(
        "Dostęp do lokalizacji",
        "Czy zgadzasz się na użycie lokalizacji GPS?",
        [
          { text: "Nie", style: "cancel" },
          {
            text: "Tak",
            onPress: async () => {
              try {
                setIsDefaultLocationLoading(true);
                const { status } =
                  await Location.requestForegroundPermissionsAsync();

                if (status !== "granted") {
                  Alert.alert("Brak zgody", "Włącz lokalizację, aby ustawić domyślną lokalizację.");
                  return;
                }

                if (Platform.OS === "android") {
                  try {
                    await Location.enableNetworkProviderAsync();
                  } catch {}
                }

                const loc = await Location.getCurrentPositionAsync({
                  accuracy: Location.Accuracy.High,
                  mayShowUserSettingsDialog: true,
                });
                const { latitude, longitude } = loc.coords;

                const geoRes = await fetch(
                  `${API_URL}/geo/reverse?lat=${latitude}&lng=${longitude}`
                );
                const geo = await geoRes.json();

                await fetch(`${API_URL}/user/preferences`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                  },
                  body: JSON.stringify({
                    lat: latitude,
                    lng: longitude,
                    radius_km: Number(defaultRadius) || 10,
                    use_current_location: true,
                  }),
                });

                setDefaultLocation({
                  ...geo,
                  lat: latitude,
                  lng: longitude,
                  radius_km: Number(defaultRadius) || 10,
                });

                // Czyścimy cache lokalizacyjny – zachowujemy tylko dane sesji
                try {
                  const savedToken = await AsyncStorage.getItem("token");
                  const savedUser = await AsyncStorage.getItem("user");
                  await AsyncStorage.clear();
                  if (savedToken) await AsyncStorage.setItem("token", savedToken);
                  if (savedUser) await AsyncStorage.setItem("user", savedUser);
                } catch {}

                await fetchPreferences();
              } catch (e) {
                console.log(e);
                Alert.alert(
                  "Błąd lokalizacji",
                  "Nie udało się pobrać świeżej lokalizacji GPS. Upewnij się, że GPS jest włączony i spróbuj ponownie."
                );
              } finally {
                setIsDefaultLocationLoading(false);
              }
            },
          },
        ]
      );
    };

    if (defaultLocation) {
      Alert.alert(
        "Aktualizacja lokalizacji",
        "Masz już ustawioną lokalizację. Czy chcesz ją zaktualizować?",
        [
          { text: "Nie", style: "cancel" },
          { text: "Tak", onPress: proceed },
        ]
      );
    } else {
      proceed();
    }
  };

  if (!profile) return <Text style={{ padding: 20 }}>Loading...</Text>;

  const avatarSource = profile.avatar_url
    ? { uri: `${API_URL}${profile.avatar_url}` }
    : { uri: "https://cdn-icons-png.flaticon.com/512/149/149071.png" };

  return (
    <ScrollView style={styles.container}>
      <TouchableOpacity
        style={styles.backBtn}
        onPress={() => {
          navigation.navigate("Feed");
          navigation.openDrawer();
        }}
      >
        <Text style={styles.backBtnText}>←</Text>
      </TouchableOpacity>

      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={pickAvatar}>
          <Image source={avatarSource} style={styles.avatar} />
        </TouchableOpacity>

        <View style={{ marginLeft: 15 }}>
          <Text style={styles.name}>
            {profile.pseudonym || profile.nickname || profile.email || profile.phone}
          </Text>
          <Text style={styles.points}>Punkty: {profile.points}</Text>
          <Text style={styles.rank}>Ranga: {profile.rank}</Text>
        </View>
      </View>

      <View style={styles.divider} />

      {/* DANE OSOBOWE */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>DANE OSOBOWE</Text>
        <TouchableOpacity onPress={() => setEditMode(!editMode)}>
          <Text style={styles.editIcon}>✏️</Text>
        </TouchableOpacity>
      </View>

      {editMode ? (
        <>
          <TextInput
            style={styles.input}
            placeholder="Pseudonim"
            value={form.pseudonym || ""}
            onChangeText={(t) => setForm({ ...form, pseudonym: t })}
          />
          <TextInput
            style={styles.input}
            placeholder="Imię"
            value={form.first_name || ""}
            onChangeText={(t) => setForm({ ...form, first_name: t })}
          />
          <TextInput
            style={styles.input}
            placeholder="Nazwisko"
            value={form.last_name || ""}
            onChangeText={(t) => setForm({ ...form, last_name: t })}
          />
          <TextInput
            style={styles.input}
            placeholder="Telefon"
            value={form.phone || ""}
            onChangeText={(t) => setForm({ ...form, phone: t })}
          />
          <TextInput
            style={styles.input}
            placeholder="Zawód"
            value={form.profession || ""}
            onChangeText={(t) => setForm({ ...form, profession: t })}
          />
          <TextInput
            style={styles.input}
            placeholder="Miasto"
            value={form.city || ""}
            onChangeText={(t) => setForm({ ...form, city: t })}
          />
          <TextInput
            style={styles.input}
            placeholder="Kraj"
            value={form.country || ""}
            onChangeText={(t) => setForm({ ...form, country: t })}
          />

          <TouchableOpacity style={styles.saveButton} onPress={saveProfile}>
            <Text style={styles.saveButtonText}>Zapisz</Text>
          </TouchableOpacity>
        </>
      ) : (
        <View style={{ paddingVertical: 10 }}>
          <Text>Pseudonim: {profile.pseudonym || "-"}</Text>
          <Text>Imię: {profile.first_name || "-"}</Text>
          <Text>Nazwisko: {profile.last_name || "-"}</Text>
          <Text>Telefon: {profile.phone || "-"}</Text>
          <Text>Zawód: {profile.profession || "-"}</Text>
          <Text>Miasto: {profile.city || "-"}</Text>
          <Text>Kraj: {profile.country || "-"}</Text>
        </View>
      )}

      <View style={styles.divider} />

      {/* PERSONALIZACJA */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>PERSONALIZACJA</Text>
        <TouchableOpacity onPress={() => setEditLocations(!editLocations)}>
          <Text style={styles.editIcon}>✏️</Text>
        </TouchableOpacity>
      </View>

      {/* DEFAULT LOCATION */}
      <View style={{ marginTop: 10 }}>
        <Text style={{ fontWeight: "600" }}>Moja domyślna lokalizacja</Text>

        {defaultLocation && (
          <Text style={{ marginTop: 5 }}>
            📍 {defaultLocation.label || `${defaultLocation.city}`} ({defaultLocation.radius_km} km)
          </Text>
        )}

        {isDefaultLocationLoading && (
          <View style={styles.loaderRow}>
            <ActivityIndicator size="small" color="#222" />
            <Text style={styles.loaderText}>Pobieranie aktualnej lokalizacji...</Text>
          </View>
        )}

        {editLocations && (
          <TextInput
            style={styles.input}
            placeholder="Promień (km)"
            value={defaultRadius}
            onChangeText={setDefaultRadius}
            keyboardType="numeric"
          />
        )}

        {editLocations && !defaultLocation && (
          <TouchableOpacity onPress={setMyLocation}>
            <Text style={styles.addButton}>＋ Dodaj</Text>
          </TouchableOpacity>
        )}

        {editLocations && defaultLocation && (
          <View style={{ flexDirection: "row", marginTop: 8 }}>
            <TouchableOpacity onPress={setMyLocation} style={{ marginRight: 15 }}>
              <Text style={styles.addButton}>✏️ Zmień</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                Alert.alert(
                  "Usuń lokalizację",
                  "Czy na pewno chcesz usunąć domyślną lokalizację?",
                  [
                    { text: "Nie", style: "cancel" },
                    {
                      text: "Tak",
                      style: "destructive",
                      onPress: async () => {
                        if (defaultLocation?.id) {
                          try {
                            await fetch(`${API_URL}/user/preferences/${defaultLocation.id}`, {
                              method: "DELETE",
                              headers: { Authorization: `Bearer ${token}` },
                            });
                          } catch (e) {
                            console.log(e);
                          }
                        }
                        setDefaultLocation(null);
                        fetchPreferences();
                      },
                    },
                  ]
                );
              }}
            >
              <Text style={{ color: "red" }}>
                Usuń
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* OBSERVED LOCATIONS */}
      <View style={{ marginTop: 20 }}>
        <Text style={{ fontWeight: "600" }}>
          Obserwowane lokalizacje
        </Text>

        {preferences.length === 0 && (
          <Text style={{ marginTop: 5, color: "gray" }}>
            Brak lokalizacji
          </Text>
        )}

        {preferences.map((p) => (
          <View
            key={p.id}
            style={{ marginTop: 5 }}
          >
            <Text>
              📍 {addresses[p.id] || "Ładowanie..."} ({p.radius_km} km)
            </Text>

            {editLocations && (
              <TextInput
                style={styles.input}
                placeholder="Promień (km)"
                value={newRadius}
                onChangeText={setNewRadius}
                keyboardType="numeric"
              />
            )}

            <View style={{ flexDirection: "row", alignItems: "center" }}>

            {editLocations && (
              <TouchableOpacity
                onPress={() =>
                  (async () => {
                    try {
                      await fetch(`${API_URL}/user/preferences/${p.id}`, {
                        method: "DELETE",
                        headers: { Authorization: `Bearer ${token}` },
                      });
                    } catch (e) {
                      console.log(e);
                    }

                    setPreferences((prev) => prev.filter((x) => x.id !== p.id));
                    setAddresses((prev) => {
                      const next = { ...prev };
                      delete next[p.id];
                      return next;
                    });
                  })()
                }
              >
                <Text style={{ color: "red", marginLeft: 10 }}>✕</Text>
              </TouchableOpacity>
            )}
            </View>
          </View>
        ))}

        {editLocations && (
          <TouchableOpacity
            onPress={() => navigation.navigate("MapPicker")}
          >
            <Text style={styles.addButton}>＋ Dodaj lokalizację</Text>
          </TouchableOpacity>
        )}
      </View>

      {editLocations && (
        <TouchableOpacity style={styles.saveButton} onPress={() => setEditLocations(false)}>
          <Text style={styles.saveButtonText}>Zapisz</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: "#fff",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
  },
  name: {
    fontSize: 18,
    fontWeight: "bold",
  },
  points: {
    marginTop: 5,
  },
  rank: {
    color: "gray",
  },
  divider: {
    height: 1,
    backgroundColor: "#ddd",
    marginVertical: 20,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
  },
  editIcon: {
    fontSize: 18,
  },
  input: {
    borderBottomWidth: 1,
    borderBottomColor: "#ccc",
    paddingVertical: 8,
    marginTop: 10,
  },
  saveButton: {
    backgroundColor: "#222",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    marginTop: 20,
    alignItems: "center",
    alignSelf: "flex-start",
  },
  saveButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
  addButton: {
    fontSize: 16,
    fontWeight: "600",
    color: "#222",
    marginTop: 8,
  },
  loaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
  },
  loaderText: {
    marginLeft: 8,
    color: "#555",
    fontSize: 13,
  },
  backBtn: {
    position: "absolute",
    right: 20,
    top: 16,
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#111",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    zIndex: 5,
  },
  backBtnText: {
    color: "#111",
    fontSize: 20,
    fontWeight: "700",
    marginTop: -2,
  },
});
