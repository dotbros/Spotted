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
import * as Location from "expo-location";
import * as MediaLibrary from "expo-media-library";
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

  const [voteModalVisible, setVoteModalVisible] = useState(false);
  const [voteType, setVoteType] = useState(null);
  const [voteComment, setVoteComment] = useState("");
  const [voteMedia, setVoteMedia] = useState(null);
  const [voteMediaType, setVoteMediaType] = useState(null);

  const [isOnPlace, setIsOnPlace] = useState(false);
  const [willSendPhoto, setWillSendPhoto] = useState(false);
  const [hasOtherProof, setHasOtherProof] = useState(false);

  const [locationConfirmVisible, setLocationConfirmVisible] =
    useState(false);
  const [galleryVisible, setGalleryVisible] =
    useState(false);
  const [galleryPhotos, setGalleryPhotos] =
    useState([]);

  const vote = async (type) => {
    if (!user) {
      navigation.navigate("Login");
      return;
    }

    setVoteType(type);
    setVoteModalVisible(true);
  };

  const loadGalleryPhotos = async () => {
    const { status } =
      await MediaLibrary.requestPermissionsAsync();

    if (status !== "granted") return;

    const media = await MediaLibrary.getAssetsAsync({
      mediaType: "photo",
      first: 20,
      sortBy: [["creationTime", false]],
    });

    setGalleryPhotos(media.assets);
  };

  const openVoteCamera = async () => {
    const permission =
      await ImagePicker.requestCameraPermissionsAsync();

    if (!permission.granted) return;

    const result =
      await ImagePicker.launchCameraAsync({
        mediaTypes:
          ImagePicker.MediaTypeOptions.All,
        quality: 0.8,
        videoMaxDuration: 30,
      });

    if (!result.canceled) {
      setVoteMedia(result.assets[0].uri);
      setVoteMediaType(result.assets[0].type);
    }
  };

  const submitVote = async () => {
    const post = posts[currentIndex];
    if (!post) return;

    // 📍 Pobranie aktualnej lokalizacji
    const { status } =
      await Location.requestForegroundPermissionsAsync();

    let lat = null;
    let lng = null;

    if (status === "granted") {
      const location =
        await Location.getCurrentPositionAsync({});
      lat = location.coords.latitude;
      lng = location.coords.longitude;
    }

    const formData = new FormData();
    formData.append("post_id", post.id);
    formData.append(
      "value",
      voteType === "true"
    );
    formData.append("comment", voteComment || "");

    if (lat && lng) {
      formData.append("lat", lat);
      formData.append("lng", lng);
    }

    if (voteMedia) {
      formData.append("media", {
        uri: voteMedia,
        name: "vote.jpg",
        type: "image/jpeg",
      });
    }

    await fetch(`${API_URL}/vote`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    setVoteModalVisible(false);
    setVoteComment("");
    setVoteMedia(null);
    setVoteMediaType(null);
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

      {/* MODAL GŁOSU (PÓŁ EKRANU) */}
      <Modal
        visible={voteModalVisible}
        animationType="slide"
        transparent
      >
        <View style={styles.voteOverlay}>
          <View style={styles.voteContainer}>
            <Text style={styles.voteTitle}>
              Bądź bardziej wiarygodny wybierając opcje
            </Text>

            <View style={styles.proofButtonsWrapper}>
              <TouchableOpacity
                style={[
                  styles.proofBtn,
                  isOnPlace && styles.proofBtnActive,
                ]}
                onPress={() =>
                  setLocationConfirmVisible(true)
                }
              >
                <Text>Jestem na miejscu</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.proofBtn,
                  willSendPhoto &&
                    styles.proofBtnActive,
                ]}
                onPress={async () => {
                  setWillSendPhoto(true);
                  await loadGalleryPhotos();
                  setGalleryVisible(true);
                }}
              >
                <Text>Prześlę zdjęcie</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.proofBtn,
                  hasOtherProof &&
                    styles.proofBtnActive,
                ]}
                onPress={() =>
                  setHasOtherProof((prev) => !prev)
                }
              >
                <Text>Mam inny dowód</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              placeholder="Napisz komentarz..."
              value={voteComment}
              onChangeText={setVoteComment}
              multiline
              style={styles.voteInput}
            />

            {/* MAŁE IKONY */}
            <View style={styles.iconRow}>
              <TouchableOpacity
                onPress={() =>
                  setVoteMediaType("camera_panel")
                }
                style={styles.smallIconBtn}
              >
                <Text style={styles.smallIcon}>
                  📷
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() =>
                  setVoteMediaType("emoji_panel")
                }
                style={styles.smallIconBtn}
              >
                <Text style={styles.smallIcon}>
                  😀
                </Text>
              </TouchableOpacity>
            </View>

            {/* PANEL APARAT / GALERIA */}
            {voteMediaType ===
              "camera_panel" && (
              <View style={styles.extraPanel}>
                <View style={styles.tabRow}>
                  <Text style={styles.tab}>
                    Galeria
                  </Text>
                  <Text style={styles.tab}>
                    Aparat
                  </Text>
                  <Text style={styles.tab}>
                    Dokumenty
                  </Text>
                </View>

                <View style={styles.galleryGrid}>
                  <Text>
                    (Miniatury galerii tutaj)
                  </Text>
                </View>
              </View>
            )}

            {/* PANEL EMOJI */}
            {voteMediaType ===
              "emoji_panel" && (
              <View style={styles.extraPanel}>
                <View style={styles.tabRow}>
                  <Text style={styles.tab}>
                    😊
                  </Text>
                  <Text style={styles.tab}>
                    😡
                  </Text>
                  <Text style={styles.tab}>
                    👍
                  </Text>
                </View>
              </View>
            )}

            <View style={styles.voteActions}>
              <TouchableOpacity
                onPress={submitVote}
                style={styles.confirmBtn}
              >
                <Text style={{ color: "#fff" }}>
                  Zatwierdź
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() =>
                  setVoteModalVisible(false)
                }
                style={styles.cancelBtn}
              >
                <Text style={{ color: "#fff" }}>
                  Anuluj
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL LOKALIZACJI */}
      <Modal
        visible={locationConfirmVisible}
        transparent
        animationType="fade"
      >
        <View style={styles.centerModalOverlay}>
          <View style={styles.centerModalBox}>
            <Text style={styles.locationTitle}>
              Czy zgadzasz się udostępnić swoją lokalizację?
            </Text>

            <View style={styles.locationButtonsRow}>
              <TouchableOpacity
                style={styles.confirmSmallBtn}
                onPress={() => {
                  setIsOnPlace(true);
                  setLocationConfirmVisible(false);
                }}
              >
                <Text style={styles.locationBtnText}>
                  TAK
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelSmallBtn}
                onPress={() =>
                  setLocationConfirmVisible(false)
                }
              >
                <Text style={styles.locationBtnText}>
                  NIE
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.locationInfoText}>
              Twoja lokalizacja nie będzie widoczna publicznie.
              Opcja ta zapewni większą rangę Twojej opinii.
            </Text>
          </View>
        </View>
      </Modal>

      {/* MODAL GALERII */}
      <Modal
        visible={galleryVisible}
        animationType="slide"
      >
        <View style={{ flex: 1, padding: 15 }}>
          <FlatList
            data={galleryPhotos}
            numColumns={3}
            keyExtractor={(item) => item.id}
            ListHeaderComponent={
              <TouchableOpacity
                style={styles.cameraTile}
                onPress={openVoteCamera}
              >
                <Text style={{ fontSize: 28 }}>
                  📷
                </Text>
              </TouchableOpacity>
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => {
                  setVoteMedia(item.uri);
                  setGalleryVisible(false);
                }}
              >
                <Image
                  source={{ uri: item.uri }}
                  style={styles.galleryImage}
                />
              </TouchableOpacity>
            )}
          />

          <TouchableOpacity
            onPress={() =>
              setGalleryVisible(false)
            }
            style={styles.closeGalleryBtn}
          >
            <Text style={{ color: "#fff" }}>
              Zamknij
            </Text>
          </TouchableOpacity>
        </View>
      </Modal>

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

  voteOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.5)",
  },

  voteContainer: {
    height: height * 0.55,
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
  },

  voteTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 15,
  },

  voteInput: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 10,
    height: 90,
    marginBottom: 10,
  },

  iconRow: {
    flexDirection: "row",
    marginBottom: 10,
  },

  smallIconBtn: {
    marginRight: 15,
  },

  smallIcon: {
    fontSize: 22,
  },

  extraPanel: {
    backgroundColor: "#f0f0f0",
    padding: 10,
    borderRadius: 10,
    marginBottom: 10,
  },

  tabRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 10,
  },

  tab: {
    fontWeight: "bold",
  },

  galleryGrid: {
    height: 80,
    justifyContent: "center",
    alignItems: "center",
  },

  voteActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
  },

  confirmBtn: {
    backgroundColor: "green",
    padding: 12,
    borderRadius: 8,
    width: "48%",
    alignItems: "center",
  },

  cancelBtn: {
    backgroundColor: "red",
    padding: 12,
    borderRadius: 8,
    width: "48%",
    alignItems: "center",
  },

  proofButtonsWrapper: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 15,
  },

  proofBtn: {
    flex: 1,
    backgroundColor: "#fff",
    paddingVertical: 10,
    borderRadius: 8,
    marginHorizontal: 4,
    alignItems: "center",
  },

  proofBtnActive: {
    backgroundColor: "#cce5ff",
  },

  centerModalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
  },

  centerModalBox: {
    width: "85%",
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 12,
  },

  confirmSmallBtn: {
    flex: 1,
    backgroundColor: "green",
    paddingVertical: 12,
    borderRadius: 8,
    marginRight: 10,
    alignItems: "center",
  },

  cancelSmallBtn: {
    flex: 1,
    backgroundColor: "red",
    paddingVertical: 12,
    borderRadius: 8,
    marginLeft: 10,
    alignItems: "center",
  },

  locationTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
  },

  locationButtonsRow: {
    flexDirection: "row",
    marginBottom: 20,
  },

  locationBtnText: {
    color: "#fff",
    fontWeight: "bold",
  },

  locationInfoText: {
    fontSize: 13,
    color: "#555",
    textAlign: "center",
    lineHeight: 18,
  },

  cameraTile: {
    width: 100,
    height: 100,
    backgroundColor: "#eee",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    alignSelf: "center",
  },

  galleryImage: {
    width: width / 3 - 10,
    height: width / 3 - 10,
    margin: 5,
    borderRadius: 8,
  },

  closeGalleryBtn: {
    marginTop: 30,
    backgroundColor: "black",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
});
