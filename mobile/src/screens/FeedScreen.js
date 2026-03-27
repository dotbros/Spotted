import React, { useRef, useState, useEffect, useContext } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Dimensions,
  FlatList,
  SafeAreaView,
  StatusBar,
  Alert,
  TextInput,
  Modal,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { AuthContext } from "../context/AuthContext";

const { width, height } = Dimensions.get("window");
const API_URL = "http://10.0.2.2:4000";

export default function FeedScreen({ navigation }) {
  const { user, token } = useContext(AuthContext);
  const [posts, setPosts] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const [modalVisible, setModalVisible] = useState(false);
  const [newImage, setNewImage] = useState(null);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchPosts = async () => {
    try {
      const res = await fetch(
        `${API_URL}/posts?lat=52.2297&lng=21.0122`
      );
      const data = await res.json();
      setPosts(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchPosts();
  }, []);

  const vote = async (type) => {
    if (!user) {
      navigation.navigate("Login");
      return;
    }

    const post = posts[currentIndex];
    if (!post) return;

    await fetch(`${API_URL}/vote`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        post_id: post.id,
        value: type === "true",
      }),
    });

    fetchPosts();
  };

  const openCamera = async () => {
    if (!user) {
      navigation.navigate("Login");
      return;
    }

    const permission =
      await ImagePicker.requestCameraPermissionsAsync();

    if (!permission.granted) return;

    const result =
      await ImagePicker.launchCameraAsync({
        quality: 0.8,
      });

    if (!result.canceled) {
      setNewImage(result.assets[0].uri);
      setModalVisible(true);
    }
  };

  const submitPost = async () => {
    if (!user) {
      navigation.navigate("Login");
      return;
    }

    await fetch(`${API_URL}/posts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        text: newTitle,
        image_url: newImage,
        lat: 52.2297,
        lng: 21.0122,
      }),
    });

    setModalVisible(false);
    setNewTitle("");
    setNewDesc("");
    setNewImage(null);
    fetchPosts();
  };

  const renderItem = ({ item }) => (
    <View style={{ height, width }}>
      <Image
        source={{ uri: item.image_url }}
        style={styles.fullBackground}
      />
    </View>
  );

  const currentPost = posts[currentIndex];

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />

      <FlatList
        data={posts}
        renderItem={renderItem}
        keyExtractor={(item) => item.id.toString()}
        pagingEnabled
        snapToInterval={height}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        onViewableItemsChanged={useRef(
          ({ viewableItems }) => {
            if (viewableItems?.length > 0) {
              setCurrentIndex(
                viewableItems[0].index
              );
            }
          }
        ).current}
        style={StyleSheet.absoluteFill}
      />

      {/* TOP */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => navigation.openDrawer()}
        >
          <Text style={styles.menuIcon}>☰</Text>
        </TouchableOpacity>

        {isSearching ? (
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Szukaj..."
            placeholderTextColor="#ccc"
            style={{
              flex: 1,
              marginHorizontal: 10,
              color: "#fff",
              borderBottomWidth: 1,
              borderColor: "#fff",
              paddingVertical: 2,
            }}
            autoFocus
          />
        ) : (
          <Text style={styles.logo}>MIELNO</Text>
        )}

        <TouchableOpacity
          onPress={() => setIsSearching((prev) => !prev)}
        >
          <Text style={styles.search}>
            {isSearching ? "✖" : "🔍"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* TITLE */}
      {currentPost && (
        <View style={styles.titleBar}>
          <Text style={styles.title}>
            {currentPost.text}
          </Text>
        </View>
      )}

      {/* META */}
      {currentPost && (
        <View style={styles.metaBar}>
          <Text style={styles.metaText}>
            {currentPost.lat},{" "}
            {currentPost.lng}
          </Text>
          <Text style={styles.metaText}>
            {new Date(
              currentPost.created_at
            ).toLocaleTimeString()}
          </Text>
        </View>
      )}

      {/* STATS */}
      {currentPost && (
        <View style={styles.statsWrapper}>
          <View style={styles.statsBar}>
            <View
              style={[
                styles.greenFill,
                {
                  flex:
                    Number(
                      currentPost.true_votes
                    ) || 0,
                },
              ]}
            />
            <View
              style={[
                styles.redFill,
                {
                  flex:
                    Number(
                      currentPost.false_votes
                    ) || 0,
                },
              ]}
            />
          </View>

          <Text style={styles.percentText}>
            ✅ {currentPost.true_votes || 0}
          </Text>
          <Text style={styles.percentText}>
            ❌ {currentPost.false_votes || 0}
          </Text>
        </View>
      )}

      {/* BOTTOM */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.falseBtn}
          onPress={() => vote("false")}
        >
          <Text style={styles.btnText}>
            NIEPRAWDA
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.cameraBtn}
          onPress={openCamera}
        >
          <Image
            source={require("../../assets/camera.png")}
            style={{ width: 40, height: 40 }}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.trueBtn}
          onPress={() => vote("true")}
        >
          <Text style={styles.btnText}>
            PRAWDA
          </Text>
        </TouchableOpacity>
      </View>

      {/* MODAL DODAWANIA POSTA */}
      <Modal visible={modalVisible} animationType="slide">
        <View style={{ padding: 20 }}>
          <Image
            source={{ uri: newImage }}
            style={{
              width: "100%",
              height: 300,
              marginBottom: 20,
            }}
          />

          <TextInput
            placeholder="Tytuł"
            value={newTitle}
            onChangeText={setNewTitle}
            style={{
              borderWidth: 1,
              marginBottom: 10,
              padding: 10,
            }}
          />

          <TextInput
            placeholder="Opis"
            value={newDesc}
            onChangeText={setNewDesc}
            style={{
              borderWidth: 1,
              marginBottom: 20,
              padding: 10,
            }}
          />

          <TouchableOpacity
            onPress={submitPost}
            style={{
              backgroundColor: "green",
              padding: 15,
            }}
          >
            <Text style={{ color: "#fff" }}>
              Dodaj post
            </Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#000" },

  fullBackground: {
    position: "absolute",
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },

  topBar: {
    height: 50,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 15,
    backgroundColor: "rgba(0,0,0,0.6)",
  },

  menuIcon: { color: "#fff", fontSize: 20 },
  logo: { color: "#fff", fontWeight: "bold" },
  search: { color: "#fff", fontSize: 18 },

  titleBar: {
    height: 40,
    backgroundColor: "rgba(200,0,0,0.7)",
    borderTopWidth: 2,
    borderBottomWidth: 3,
    borderColor: "rgba(255,215,0,0.9)",
    paddingHorizontal: 15,
    justifyContent: "center",
  },

  title: {
    color: "#fff",
    fontWeight: "bold",
  },

  metaBar: {
    height: 30,
    backgroundColor: "rgba(0,0,0,0.4)",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 15,
  },

  metaText: { color: "#fff", fontSize: 12 },

  statsWrapper: {
    position: "absolute",
    right: 15,
    top: height * 0.2,
    alignItems: "center",
  },

  statsBar: {
    borderWidth: 1.5,
    borderColor: "#000",
    height: height * 0.6,
    width: 26,
    backgroundColor: "rgba(0,0,0,0.4)",
    borderRadius: 13,
    overflow: "hidden",
  },

  greenFill: { backgroundColor: "green" },
  redFill: { backgroundColor: "red" },

  percentText: {
    color: "#fff",
    fontSize: 12,
    marginTop: 6,
  },

  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 120,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
  },

  falseBtn: {
    backgroundColor: "rgba(200,0,0,0.85)",
    borderWidth: 1.5,
    borderColor: "#880000",
    paddingVertical: 15,
    borderRadius: 14,
    width: "30%",
    alignItems: "center",
  },

  trueBtn: {
    backgroundColor: "rgba(0,150,0,0.85)",
    borderWidth: 1.5,
    borderColor: "#004d00",
    paddingVertical: 15,
    borderRadius: 14,
    width: "30%",
    alignItems: "center",
  },

  cameraBtn: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "#1e90ff",
    borderWidth: 1.5,
    borderColor: "#0f4c91",
    alignItems: "center",
    justifyContent: "center",
  },

  btnText: { color: "#fff", fontWeight: "bold" },
});