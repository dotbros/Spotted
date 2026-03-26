import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Dimensions,
  TouchableOpacity,
  TextInput,
  Image,
  SafeAreaView,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as Location from "expo-location";
import { io } from "socket.io-client";

const { height } = Dimensions.get("window");

// ⚠️ ZMIEŃ NA IP SWOJEGO KOMPUTERA W SIECI LOKALNEJ
const API_URL = "http://83.168.71.159:4000";
const socket = io(API_URL);

export default function App() {
  const [posts, setPosts] = useState([]);
  const [location, setLocation] = useState(null);
  const [nickname, setNickname] = useState("User" + Math.floor(Math.random() * 1000));
  const [userId, setUserId] = useState(null);
  const [newPostText, setNewPostText] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  const flatListRef = useRef(null);

  useEffect(() => {
    initUser();
    getLocation();
  }, []);

  useEffect(() => {
    socket.on("vote_update", (data) => {
      setPosts((prev) =>
        prev.map((p) =>
          p.id === data.post_id
            ? { ...p, true_votes: data.true_votes, false_votes: data.false_votes }
            : p
        )
      );
    });

    return () => {
      socket.off("vote_update");
    };
  }, []);

  const initUser = async () => {
    const res = await fetch(API_URL + "/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname }),
    });
    const data = await res.json();
    setUserId(data.id);
  };

  const getLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return;

    const loc = await Location.getCurrentPositionAsync({});
    setLocation(loc.coords);
    fetchPosts(loc.coords.latitude, loc.coords.longitude);
  };

  const fetchPosts = async (lat, lng) => {
    const res = await fetch(
      API_URL + `/posts?lat=${lat}&lng=${lng}`
    );
    const data = await res.json();
    setPosts(data);
  };

  const addPost = async () => {
    if (!location || !userId) return;

    await fetch(API_URL + "/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        text: newPostText,
        image_url: null,
        lat: location.latitude,
        lng: location.longitude,
      }),
    });

    setNewPostText("");
    setShowAdd(false);
    fetchPosts(location.latitude, location.longitude);
  };

  const vote = async (postId, value) => {
    await fetch(API_URL + "/vote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        post_id: postId,
        user_id: userId,
        value,
      }),
    });
  };

  const renderItem = ({ item }) => {
    const total =
      Number(item.true_votes) + Number(item.false_votes);

    const truePercent =
      total === 0 ? 0 : Math.round((item.true_votes / total) * 100);

    return (
      <View style={styles.card}>
        <Text style={styles.text}>{item.text}</Text>

        {item.image_url && (
          <Image source={{ uri: item.image_url }} style={styles.image} />
        )}

        <View style={styles.votes}>
          <Text style={styles.result}>
            ✅ {truePercent}% PRAWDA / ❌ {100 - truePercent}% FAŁSZ
          </Text>
          <Text style={styles.count}>{total} głosów</Text>

          <View style={styles.buttons}>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: "#2ecc71" }]}
              onPress={() => vote(item.id, true)}
            >
              <Text style={styles.btnText}>PRAWDA</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btn, { backgroundColor: "#e74c3c" }]}
              onPress={() => vote(item.id, false)}
            >
              <Text style={styles.btnText}>FAŁSZ</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  if (!location) {
    return (
      <View style={styles.center}>
        <Text>Pobieranie lokalizacji...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      {showAdd && (
        <View style={styles.addContainer}>
          <TextInput
            placeholder="Co się dzieje?"
            value={newPostText}
            onChangeText={setNewPostText}
            style={styles.input}
          />
          <TouchableOpacity style={styles.addBtn} onPress={addPost}>
            <Text style={{ color: "#fff" }}>Dodaj</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        ref={flatListRef}
        data={posts}
        renderItem={renderItem}
        keyExtractor={(item) => item.id.toString()}
        pagingEnabled
        showsVerticalScrollIndicator={false}
      />

      <TouchableOpacity
        style={styles.floating}
        onPress={() => setShowAdd(!showAdd)}
      >
        <Text style={{ color: "#fff", fontSize: 24 }}>+</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#111",
  },
  card: {
    height,
    padding: 20,
    justifyContent: "center",
  },
  text: {
    color: "#fff",
    fontSize: 22,
    marginBottom: 20,
  },
  image: {
    width: "100%",
    height: 200,
    marginBottom: 20,
  },
  votes: {
    marginTop: 20,
  },
  result: {
    color: "#fff",
    fontSize: 18,
  },
  count: {
    color: "#aaa",
    marginBottom: 10,
  },
  buttons: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  btn: {
    padding: 15,
    borderRadius: 10,
    width: "48%",
    alignItems: "center",
  },
  btnText: {
    color: "#fff",
    fontWeight: "bold",
  },
  floating: {
    position: "absolute",
    bottom: 40,
    right: 20,
    backgroundColor: "#3498db",
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  addContainer: {
    position: "absolute",
    bottom: 110,
    left: 20,
    right: 20,
    backgroundColor: "#222",
    padding: 15,
    borderRadius: 10,
    zIndex: 10,
  },
  input: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  addBtn: {
    backgroundColor: "#3498db",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});