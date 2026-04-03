
import React, { useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { WebView } from "react-native-webview";
import { API_URL } from "../../config";

export default function MapPickerScreen({ navigation }) {
  const webviewRef = useRef(null);
  const [selectedCoord, setSelectedCoord] = useState(null);
  const [loading, setLoading] = useState(true);

  const handleMessage = (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      setSelectedCoord(data);
    } catch (e) {
      console.log("MapPicker message error:", e);
    }
  };

  const saveLocation = () => {
    if (!selectedCoord) return;
    navigation.navigate("Profile", {
      newLocation: selectedCoord,
      locationTarget: "observed",
      pickedAt: Date.now(),
    });
  };

  return (
    <View style={{ flex: 1 }}>
      {loading && (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color="#222" />
          <Text style={{ marginTop: 10 }}>Ładowanie mapy HERE...</Text>
        </View>
      )}

      <WebView
        ref={webviewRef}
        originWhitelist={["*"]}
        source={{ uri: `${API_URL}/map` }}
        onMessage={handleMessage}
        onLoadEnd={() => setLoading(false)}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="always"
        style={{ flex: 1 }}
      />

      <View style={styles.bottom}>
        {selectedCoord ? (
          <Text style={styles.coordText}>
            📍 {selectedCoord.lat.toFixed(5)}, {selectedCoord.lng.toFixed(5)}
          </Text>
        ) : (
          <Text style={styles.hint}>Kliknij na mapie aby wybrać lokalizację</Text>
        )}

        <TouchableOpacity
          style={[styles.button, !selectedCoord && styles.buttonDisabled]}
          onPress={saveLocation}
          disabled={!selectedCoord}
        >
          <Text style={styles.buttonText}>Zapisz lokalizację</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
    zIndex: 10,
  },
  bottom: {
    position: "absolute",
    bottom: 20,
    left: 15,
    right: 15,
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 12,
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  hint: {
    color: "#555",
    marginBottom: 10,
  },
  coordText: {
    fontWeight: "600",
    marginBottom: 10,
  },
  button: {
    backgroundColor: "#222",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  buttonDisabled: {
    backgroundColor: "#aaa",
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
  },
});
