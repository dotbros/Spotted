import React, {
  useRef,
  useState,
  useEffect,
  useContext,
  useMemo,
  useCallback,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Dimensions,
  Platform,
  FlatList,
  SafeAreaView,
  StatusBar,
  Alert,
  TextInput,
  Modal,
  Animated,
  Easing,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import * as MediaLibrary from "expo-media-library";
import { AuthContext } from "../context/AuthContext";
import { useDrawerStatus } from "@react-navigation/drawer";
import { useFocusEffect } from "@react-navigation/native";
import { API_URL } from "../../config";

const { width, height } = Dimensions.get("window");
const STATS_BAR_HEIGHT = height * 0.6;
const TYCHY_COORDS = { lat: 50.1276, lng: 18.9867 };

const toNumber = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const distanceKm = (lat1, lng1, lat2, lng2) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const getStatus2Label = (trueVotesRaw, falseVotesRaw) => {
  const trueVotes = Number(trueVotesRaw || 0);
  const falseVotes = Number(falseVotesRaw || 0);
  const totalVotes = trueVotes + falseVotes;

  if (totalVotes === 0) return "NIEZWERYFIKOWANE";

  const truePercent = Math.round((trueVotes / totalVotes) * 100);

  if (truePercent <= 15) return "TO JEST FAKE";
  if (truePercent <= 35) return "MAŁO PRAWDOPODOBNE";
  if (truePercent <= 60) return "USTALANIE FAKTÓW";
  if (truePercent <= 85) return "PRAWIE PEWNE";
  return "TO SĄ FAKTY";
};

const getStatus2Theme = (status2Label) => {
  const normalized = String(status2Label || "").toLowerCase();

  if (normalized.includes("niezweryfikowane")) {
    return { bg: "rgba(93,103,120,0.95)", border: "#b6c0d0" };
  }
  if (normalized.includes("to są fakty")) {
    return { bg: "rgba(12,133,44,0.95)", border: "#45cf73" };
  }
  if (normalized.includes("prawie pewne")) {
    return { bg: "rgba(88,177,69,0.95)", border: "#9ae77e" };
  }
  if (normalized.includes("ustalanie faktów") || normalized.includes("ustalanie faktow")) {
    return { bg: "rgba(173,140,24,0.95)", border: "#f0d56a" };
  }
  if (normalized.includes("mało prawdopodobne") || normalized.includes("malo prawdopodobne")) {
    return { bg: "rgba(201,118,19,0.95)", border: "#ffbf66" };
  }

  if (normalized.includes("to jest fake")) {
    return { bg: "rgba(164,16,30,0.95)", border: "#d95263" };
  }

  return { bg: "rgba(164,16,30,0.95)", border: "#d95263" };
};

const truncateDescription = (text, maxLength = 110) => {
  const value = String(text || "").trim();
  if (value.length <= maxLength) {
    return { text: value, truncated: false };
  }

  return {
    text: `${value.slice(0, maxLength).trimEnd()}...`,
    truncated: true,
  };
};

const FeedItem = React.memo(({ imageUrl }) => (
  <View style={{ height, width }}>
    <Image
      source={{ uri: imageUrl }}
      style={feedItemStyles.fullBackground}
    />
  </View>
));

const feedItemStyles = StyleSheet.create({
  fullBackground: {
    position: "absolute",
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
});

export default function FeedScreen({ navigation }) {
  const { user, token, anonId } = useContext(AuthContext);
  const viewSentAtRef = useRef({});
  const drawerStatus = useDrawerStatus();
  const feedListRef = useRef(null);
  const [posts, setPosts] = useState([]);
  const fetchRequestIdRef = useRef(0);
  const [userCoords, setUserCoords] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentAddress, setCurrentAddress] = useState(null);
  const [isAddressLoading, setIsAddressLoading] = useState(false);
  const lastGeocodeKeyRef = useRef(null);

  const [modalVisible, setModalVisible] = useState(false);
  const [newImage, setNewImage] = useState(null);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newImageSourceType, setNewImageSourceType] = useState(null); // camera | gallery | url
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [isDescLocked, setIsDescLocked] = useState(false);
  const [isResolvingLinkPreview, setIsResolvingLinkPreview] = useState(false);
  const [postLocationConsentVisible, setPostLocationConsentVisible] = useState(false);
  const [sharePostLocation, setSharePostLocation] = useState(null);
  const [postLocationCoords, setPostLocationCoords] = useState(null);

  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("forYou");
  const [hasForYouPreferences, setHasForYouPreferences] = useState(false);
  const truthRatioAnim = useRef(new Animated.Value(0)).current;
  const statsPulseAnim = useRef(new Animated.Value(1)).current;
  const statsFlashAnim = useRef(new Animated.Value(0)).current;
  const titleFlashAnim = useRef(new Animated.Value(0)).current;

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }) => {
      if (!viewableItems?.length || posts.length === 0) return;

      const virtualIndex = viewableItems[0].index ?? 0;

      if (posts.length === 1) {
        setCurrentIndex(0);
        return;
      }

      let realIndex = 0;

      if (virtualIndex === 0) {
        realIndex = posts.length - 1;
      } else if (virtualIndex === posts.length + 1) {
        realIndex = 0;
      } else {
        realIndex = virtualIndex - 1;
      }

      setCurrentIndex(realIndex);
    },
    [posts.length]
  );

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 60,
  }).current;

  const loopedPosts = useMemo(() => {
    if (!Array.isArray(posts) || posts.length === 0) return [];
    if (posts.length === 1) return posts;

    return [
      posts[posts.length - 1],
      ...posts,
      posts[0],
    ];
  }, [posts]);

  const parseJsonResponse = async (res) => {
    const text = await res.text();

    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  };

  const buildUrlWithAnon = useCallback((url) => {
    if (!anonId) return url;
    const joiner = url.includes("?") ? "&" : "?";
    return `${url}${joiner}anon_id=${encodeURIComponent(anonId)}`;
  }, [anonId]);

  const transitionCoverAnim = useRef(new Animated.Value(0)).current;

  const switchTabSmooth = useCallback((nextTab) => {
    if (!nextTab || nextTab === activeTab) return;

    Animated.timing(transitionCoverAnim, {
      toValue: 1,
      duration: 120,
      useNativeDriver: true,
    }).start(() => {
      // Unieważnij wszystkie trwające requesty poprzedniej zakładki,
      // żeby ich opóźniona odpowiedź nie powodowała „mignięcia” starych postów.
      fetchRequestIdRef.current += 1;

      setCurrentAddress(null);
      setPosts([]);
      setCurrentIndex(0);
      setActiveTab(nextTab);
    });
  }, [activeTab, transitionCoverAnim]);

  const refreshUserLocation = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setUserCoords(null);
        return;
      }

      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        setUserCoords(null);
        return;
      }

      const lastKnown = await Location.getLastKnownPositionAsync({
        maxAge: 5 * 60 * 1000,
        requiredAccuracy: 1000,
      });

      if (lastKnown?.coords) {
        setUserCoords({
          lat: lastKnown.coords.latitude,
          lng: lastKnown.coords.longitude,
        });
      }

      try {
        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        if (current?.coords) {
          setUserCoords({
            lat: current.coords.latitude,
            lng: current.coords.longitude,
          });
        }
      } catch {
        // getCurrentPositionAsync can fail on emulators or when GPS is off –
        // lastKnown position (if any) is sufficient, so we silently ignore this.
      }
    } catch (err) {
      // Ignore permission / services errors silently
    }
  }, []);

  const fetchPosts = async (tab = activeTab) => {
    const requestId = ++fetchRequestIdRef.current;

    const applyPostsIfCurrent = (nextPosts) => {
      if (requestId !== fetchRequestIdRef.current) return;
      setPosts(nextPosts);
      setCurrentIndex(0);

      Animated.timing(transitionCoverAnim, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }).start();
    };

    try {
      if (tab === "forYou") {
        // Pobierz posty oraz preferencje lokalizacyjne usera.
        const res = await fetch(buildUrlWithAnon(`${API_URL}/posts`));
        const data = await parseJsonResponse(res);

        const postsArray = Array.isArray(data) ? data : [];

        let userPrefs = [];
        if (token) {
          try {
            const prefRes = await fetch(`${API_URL}/user/preferences`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            const prefData = await parseJsonResponse(prefRes);
            if (Array.isArray(prefData)) userPrefs = prefData;
          } catch {}
        }

        const validPrefs = userPrefs
          .map((p) => ({
            lat: toNumber(p.lat),
            lng: toNumber(p.lng),
            radius_km: Math.max(0, Number(p.radius_km || 10)),
          }))
          .filter((p) => p.lat != null && p.lng != null);

        const hasPrefs = validPrefs.length > 0;
        setHasForYouPreferences(hasPrefs);

        // Brak ustawionych lokalizacji (domyślnej i obserwowanych):
        // nie pokazujemy postów w "Dla Ciebie", tylko dedykowany ekran CTA.
        if (!hasPrefs) {
          applyPostsIfCurrent([]);
          return;
        }

        const distance = (lat1, lng1, lat2, lng2) => {
          if (lat1 == null || lng1 == null) return Infinity;
          const dx = lat1 - lat2;
          const dy = lng1 - lng2;
          return Math.sqrt(dx * dx + dy * dy);
        };

        const nearestPrefDistance = (post) => {
          const postLat = toNumber(post?.lat);
          const postLng = toNumber(post?.lng);
          if (postLat == null || postLng == null || validPrefs.length === 0) {
            return Infinity;
          }

          let min = Infinity;
          for (const pref of validPrefs) {
            const d = distanceKm(postLat, postLng, pref.lat, pref.lng);
            if (d < min) min = d;
          }
          return min;
        };

        const withinPreferences = (post) => {
          const postLat = toNumber(post?.lat);
          const postLng = toNumber(post?.lng);
          if (postLat == null || postLng == null) return false;

          return validPrefs.some((pref) => {
            const d = distanceKm(postLat, postLng, pref.lat, pref.lng);
            return d <= pref.radius_km;
          });
        };

        const baseCoords = userCoords || TYCHY_COORDS;

        const scopedPosts =
          validPrefs.length > 0
            ? postsArray.filter(withinPreferences)
            : postsArray;

        const sorted = scopedPosts.sort((a, b) => {
          if (validPrefs.length > 0) {
            const da = nearestPrefDistance(a);
            const db = nearestPrefDistance(b);
            return da - db;
          }

          const da = distance(a.lat, a.lng, baseCoords.lat, baseCoords.lng);
          const db = distance(b.lat, b.lng, baseCoords.lat, baseCoords.lng);
          return da - db;
        });

        applyPostsIfCurrent(sorted);
        return;
      }

      // "Nowe wydarzenia": preferuj nowy endpoint /posts/all,
      // a jeśli backend jeszcze nie został zrestartowany i zwraca HTML/404,
      // spróbuj starszego /posts bez parametrów.
      const globalUrls = [
        buildUrlWithAnon(`${API_URL}/posts`),
        buildUrlWithAnon(`${API_URL}/posts/all`),
      ];

      for (const url of globalUrls) {
        try {
          const res = await fetch(url);
          const data = await parseJsonResponse(res);

          if (Array.isArray(data)) {
            applyPostsIfCurrent(data);
            return;
          }
        } catch {}
      }

      applyPostsIfCurrent([]);
    } catch (err) {
      console.warn("fetchPosts warning:", err?.message);
      applyPostsIfCurrent([]);
    }
  };

  const fetchAddressForCoords = async (lat, lng) => {
    if (lat == null || lng == null) {
      setCurrentAddress(null);
      return;
    }

    const key = `${lat},${lng}`;
    if (lastGeocodeKeyRef.current === key) return;

    lastGeocodeKeyRef.current = key;
    setIsAddressLoading(true);

    try {
      const res = await fetch(
        `${API_URL}/geo/reverse?lat=${lat}&lng=${lng}`
      );
      const data = await res.json();

      if (!res.ok || data?.error) {
        throw new Error(data?.error || "Reverse geocoding failed");
      }

      setCurrentAddress(data);
    } catch (err) {
      console.error("fetchAddressForCoords error:", err);
      setCurrentAddress(null);
    } finally {
      setIsAddressLoading(false);
    }
  };

  useEffect(() => {
    refreshUserLocation();
    fetchPosts(activeTab);
  }, [anonId]);

  // Odświeżamy posty przy każdym powrocie na ten ekran (np. po zmianie
  // obserwowanych lokalizacji w Profilu) – dzięki temu filtry "Dla Ciebie"
  // natychmiast uwzględniają nowe/usunięte lokalizacje.
  useFocusEffect(
    useCallback(() => {
      fetchPosts(activeTab);
      if (activeTab === "forYou") {
        refreshUserLocation();
      }
    }, [activeTab, token])
  );

  useEffect(() => {
    if (activeTab === "forYou") {
      refreshUserLocation();
    }
    fetchPosts(activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === "forYou") {
      fetchPosts("forYou");
    }
  }, [userCoords]);

  useEffect(() => {
    if (!feedListRef.current) return;

    const listLength = loopedPosts.length;
    if (listLength === 0) return;

    const targetIndex = listLength > 2 ? 1 : 0;

    requestAnimationFrame(() => {
      try {
        feedListRef.current?.scrollToIndex({
          index: targetIndex,
          animated: false,
        });
      } catch {}
      setCurrentIndex(0);
    });
  }, [posts, activeTab]);

  useEffect(() => {
    const rightDrawerNavigation = navigation.getParent();

    if (!rightDrawerNavigation?.setOptions) return;

    // Gdy lewe MENU jest otwarte, wyłączamy gest prawego drawer (DETAILS),
    // żeby swipe w lewo zamykał MENU zamiast otwierać DETAILS.
    rightDrawerNavigation.setOptions({
      swipeEnabled: drawerStatus !== "open",
    });
  }, [drawerStatus, navigation]);

  const [voteModalVisible, setVoteModalVisible] = useState(false);
  const [isSubmittingVote, setIsSubmittingVote] = useState(false);
  const [voteType, setVoteType] = useState(null);
  const [voteComment, setVoteComment] = useState("");
  const [voteMedia, setVoteMedia] = useState(null);
  const [voteMediaType, setVoteMediaType] = useState(null);

  const [isOnPlace, setIsOnPlace] = useState(false);
  const [onPlaceLocation, setOnPlaceLocation] = useState(null);
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
      if (!anonId) {
        Alert.alert("Chwila", "Trwa inicjalizacja sesji anonimowej. Spróbuj ponownie za moment.");
        return;
      }

      const post = posts[currentIndex];
      if (post?.anon_voted) {
        Alert.alert("Głos oddany", "NIEZAREJESTROWANY może oddać tylko jeden głos na ten post.");
        return;
      }

      setIsSubmittingVote(true);

      try {
        const formData = new FormData();
        formData.append("post_id", String(post.id));
        formData.append("value", type === "true" ? "true" : "false");
        formData.append("anon_id", anonId);

        const res = await fetch(`${API_URL}/vote`, {
          method: "POST",
          headers: {
            "x-anon-id": anonId,
          },
          body: formData,
        });

        const votePayload = await parseJsonResponse(res);

        if (!res.ok) {
          throw new Error(votePayload?.error || "Vote failed");
        }

        setPosts((prev) =>
          prev.map((p) => {
            if (p.id !== post.id) return p;
            return {
              ...p,
              true_votes: String(votePayload?.true_votes ?? p.true_votes ?? 0),
              false_votes: String(votePayload?.false_votes ?? p.false_votes ?? 0),
              true_points: String(votePayload?.true_points ?? p.true_points ?? 0),
              false_points: String(votePayload?.false_points ?? p.false_points ?? 0),
              anon_voted: true,
            };
          })
        );
      } catch (err) {
        Alert.alert("Błąd", err?.message || "Nie udało się oddać głosu.");
      } finally {
        setIsSubmittingVote(false);
      }

      return;
    }

    setVoteType(type);
    setIsOnPlace(false);
    setOnPlaceLocation(null);
    setWillSendPhoto(false);
    setHasOtherProof(false);
    setVoteModalVisible(true);
  };

  const confirmOnPlace = async () => {
    const post = posts[currentIndex];
    if (!post?.id) return;

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Brak zgody", "Aby oznaczyć 'Jestem na miejscu', włącz lokalizację.");
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const lat = location?.coords?.latitude;
      const lng = location?.coords?.longitude;

      if (lat == null || lng == null) {
        Alert.alert("Błąd", "Nie udało się pobrać Twojej lokalizacji.");
        return;
      }

      const res = await fetch(`${API_URL}/posts/${post.id}/on-place-check`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ lat, lng }),
      });

      const payload = await parseJsonResponse(res);

      if (!res.ok) {
        Alert.alert(
          "Nie jesteś na miejscu",
          payload?.error || "Musisz być w promieniu 100m od miejsca publikacji."
        );
        setIsOnPlace(false);
        setOnPlaceLocation(null);
        setLocationConfirmVisible(false);
        return;
      }

      setIsOnPlace(true);
      setOnPlaceLocation({ lat, lng });
      setLocationConfirmVisible(false);
    } catch (err) {
      Alert.alert("Błąd", "Nie udało się zweryfikować lokalizacji.");
      setIsOnPlace(false);
      setOnPlaceLocation(null);
      setLocationConfirmVisible(false);
    }
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
    if (!post || isSubmittingVote) return;

    setIsSubmittingVote(true);

    try {
      // 📍 Lokalizacja jest opcjonalna (chyba że zaznaczono 'Jestem na miejscu')
      let lat = null;
      let lng = null;

      if (isOnPlace && onPlaceLocation?.lat != null && onPlaceLocation?.lng != null) {
        lat = onPlaceLocation.lat;
        lng = onPlaceLocation.lng;
      }

      if (!isOnPlace) {
        try {
        const locationPromise = (async () => {
          const { status } =
            await Location.requestForegroundPermissionsAsync();

          if (status !== "granted") return null;

          return Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
        })();

        const timeoutPromise = new Promise((resolve) =>
          setTimeout(() => resolve(null), 1500)
        );

        const location = await Promise.race([
          locationPromise,
          timeoutPromise,
        ]);

        if (location?.coords) {
          lat = location.coords.latitude;
          lng = location.coords.longitude;
        }
        } catch {}
      }

      const formData = new FormData();
      formData.append("post_id", String(post.id));
      formData.append(
        "value",
        voteType === "true" ? "true" : "false"
      );
      formData.append("comment", voteComment || "");
      formData.append("is_on_place", isOnPlace ? "true" : "false");

      if (lat && lng) {
        formData.append("lat", String(lat));
        formData.append("lng", String(lng));
      }

      if (voteMedia) {
        formData.append("media", {
          uri: voteMedia,
          name: "vote.jpg",
          type: "image/jpeg",
        });
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(`${API_URL}/vote`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const votePayload = await parseJsonResponse(res);

      if (!res.ok) {
        throw new Error(votePayload?.error || "Vote failed");
      }

      setPosts((prev) =>
        prev.map((p) => {
          if (p.id !== post.id) return p;

          if (
            votePayload &&
            votePayload.true_votes != null &&
            votePayload.false_votes != null
          ) {
            return {
              ...p,
              true_votes: String(votePayload.true_votes),
              false_votes: String(votePayload.false_votes),
              true_points: String(votePayload.true_points ?? p.true_points ?? 0),
              false_points: String(votePayload.false_points ?? p.false_points ?? 0),
            };
          }

          const trueVotes = Number(p.true_votes || 0);
          const falseVotes = Number(p.false_votes || 0);

          return {
            ...p,
            true_votes: String(trueVotes + (voteType === "true" ? 1 : 0)),
            false_votes: String(falseVotes + (voteType === "false" ? 1 : 0)),
            true_points: String(
              Number(p.true_points || 0) + (voteType === "true" ? Number(votePayload?.points_awarded_initial || 0) : 0)
            ),
            false_points: String(
              Number(p.false_points || 0) + (voteType === "false" ? Number(votePayload?.points_awarded_initial || 0) : 0)
            ),
          };
        })
      );

      setVoteModalVisible(false);
      setVoteComment("");
      setVoteMedia(null);
      setVoteMediaType(null);
      setIsOnPlace(false);
      setOnPlaceLocation(null);
    } catch (err) {
      Alert.alert(
        "Błąd",
        err?.message || "Nie udało się zapisać komentarza. Sprawdź backend/API i spróbuj ponownie."
      );
      console.error("submitVote error:", err);
    } finally {
      setIsSubmittingVote(false);
    }
  };

  const openCamera = async () => {
    if (!user) {
      Alert.alert(
        "NIEZAREJESTROWANY",
        "Aby dodawać posty, zaloguj się lub zarejestruj konto."
      );
      return;
    }

    setModalVisible(true);
  };

  const takePostPhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Brak zgody", "Aby dodać zdjęcie, włącz dostęp do aparatu.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!result.canceled) {
      setNewImage(result.assets[0].uri);
      setNewImageSourceType("camera");
      setIsDescLocked(false);
      setPostLocationConsentVisible(true);
    }
  };

  const pickPostPhotoFromGallery = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Brak zgody", "Aby wybrać zdjęcie, włącz dostęp do galerii.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsEditing: true,
      aspect: [9, 16],
      allowsMultipleSelection: false,
      selectionLimit: 1,
    });

    if (!result.canceled) {
      setNewImage(result.assets[0].uri);
      setNewImageSourceType("gallery");
      setIsDescLocked(false);
      setPostLocationConsentVisible(true);
    }
  };

  const applyPostLocationConsent = async (accepted) => {
    setPostLocationConsentVisible(false);

    if (!accepted) {
      setSharePostLocation(false);
      setPostLocationCoords(null);
      return;
    }

    setSharePostLocation(true);
    const locationResult = await resolveCoordsForPost();
    if (locationResult?.lat != null && locationResult?.lng != null) {
      setPostLocationCoords({
        lat: locationResult.lat,
        lng: locationResult.lng,
      });
    } else {
      setPostLocationCoords(null);
    }
  };

  const importImageFromLink = async () => {
    const normalized = String(newLinkUrl || "").trim();
    if (!normalized) {
      Alert.alert("Brak linku", "Wpisz adres internetowy.");
      return;
    }

    try {
      setIsResolvingLinkPreview(true);

      const res = await fetch(
        `${API_URL}/link-preview?url=${encodeURIComponent(normalized)}`
      );
      const data = await parseJsonResponse(res);

      if (!res.ok || !data?.image_url) {
        Alert.alert(
          "Nie udało się pobrać zdjęcia",
          data?.error || "Nie znaleziono zdjęcia wiodącego na stronie."
        );
        return;
      }

      setNewImage(data.image_url);
      setNewImageSourceType("url");
      setNewDesc(normalized);
      setIsDescLocked(true);
      setSharePostLocation(false);
      setPostLocationCoords(null);

      if (!newTitle?.trim() && data?.title) {
        setNewTitle(data.title);
      }
    } catch {
      Alert.alert("Błąd", "Nie udało się pobrać podglądu linku.");
    } finally {
      setIsResolvingLinkPreview(false);
    }
  };

  const resolveCoordsForPost = async () => {
    const fallback = {
      lat: 52.2297,
      lng: 21.0122,
      usedFallback: true,
      reason: "fallback_default",
    };

    try {
      const { status } =
        await Location.requestForegroundPermissionsAsync();

      if (status !== "granted") {
        return { ...fallback, reason: "permission_denied" };
      }

      const servicesEnabled =
        await Location.hasServicesEnabledAsync();

      if (!servicesEnabled) {
        return { ...fallback, reason: "services_disabled" };
      }

      // Android: dopilnuj providera sieci/GPS (często pomaga na emulatorze)
      if (Platform.OS === "android") {
        try {
          await Location.enableNetworkProviderAsync();
        } catch {}
      }

      const lastKnown =
        await Location.getLastKnownPositionAsync({
          maxAge: 10 * 60 * 1000,
          requiredAccuracy: 1000,
        });

      if (lastKnown?.coords) {
        return {
          lat: lastKnown.coords.latitude,
          lng: lastKnown.coords.longitude,
          usedFallback: false,
          reason: "last_known",
        };
      }

      const currentPositionPromise =
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
          mayShowUserSettingsDialog: true,
        });

      const timeoutPromise = new Promise((resolve) =>
        setTimeout(() => resolve(null), 8000)
      );

      const current = await Promise.race([
        currentPositionPromise,
        timeoutPromise,
      ]);

      if (current?.coords) {
        return {
          lat: current.coords.latitude,
          lng: current.coords.longitude,
          usedFallback: false,
          reason: "current_fix",
        };
      }

      return { ...fallback, reason: "no_fix" };
    } catch (err) {
      console.warn("resolveCoordsForPost warning:", err?.message);
      return { ...fallback, reason: "exception" };
    }
  };

  const submitPost = async () => {
    if (!user) {
      navigation.navigate("Login");
      return;
    }

    const trimmedTitle = (newTitle || "").trim();
    const trimmedDesc = (newDesc || "").trim();

    if (!trimmedTitle) {
      Alert.alert("Brak tytułu", "Tytuł posta jest wymagany.");
      return;
    }

    try {
      let finalLat = null;
      let finalLng = null;

      // ✅ zgodnie z wymaganiem:
      // lokalizacja tylko gdy user wyraził zgodę (TAK)
      if (sharePostLocation === true) {
        if (postLocationCoords?.lat != null && postLocationCoords?.lng != null) {
          finalLat = postLocationCoords.lat;
          finalLng = postLocationCoords.lng;
        } else {
          const locationResult = await resolveCoordsForPost();
          finalLat = locationResult.lat;
          finalLng = locationResult.lng;
        }
      } else {
        finalLat = null;
        finalLng = null;
      }

      const res = await fetch(`${API_URL}/posts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          text: trimmedTitle,
          description: trimmedDesc,
          image_url: newImage,
          lat: finalLat,
          lng: finalLng,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || "Create post failed");
      }

      const createdPost = await res.json();

      if (createdPost?.id && activeTab === "newEvents") {
        setPosts((prev) => [
          {
            ...createdPost,
            true_votes: "0",
            false_votes: "0",
          },
          ...prev.filter((p) => p.id !== createdPost.id),
        ]);
        setCurrentIndex(0);
      }

      setModalVisible(false);
      setNewTitle("");
      setNewDesc("");
      setNewImage(null);
      setNewLinkUrl("");
      setIsDescLocked(false);
      setNewImageSourceType(null);
      setSharePostLocation(null);
      setPostLocationCoords(null);
      fetchPosts(activeTab);
    } catch (err) {
      console.error("submitPost error:", err);
      Alert.alert(
        "Błąd",
        "Nie udało się dodać posta. Sprawdź połączenie z backendem i spróbuj ponownie."
      );
    }
  };

  const emptyFadeAnim = useRef(new Animated.Value(1)).current;

  const renderItem = useCallback(({ item }) => (
    <FeedItem imageUrl={item.image_url} />
  ), []);

  const normalizedSearch = (searchQuery || "").trim().toLowerCase();
  const isSearchResultsVisible = isSearching && normalizedSearch.length > 0;

  const filteredSearchResults = useMemo(() => {
    if (!normalizedSearch) return [];

    const titleMatches = [];
    const descriptionMatches = [];

    for (const post of posts) {
      const title = String(post?.text || "").toLowerCase();
      const description = String(post?.description || "").toLowerCase();

      if (title.includes(normalizedSearch)) {
        titleMatches.push(post);
        continue;
      }

      if (description.includes(normalizedSearch)) {
        descriptionMatches.push(post);
      }
    }

    return [...titleMatches, ...descriptionMatches];
  }, [posts, normalizedSearch]);

  const currentPost = posts[currentIndex];
  const isCurrentPostVotingClosed = !!currentPost && (
    currentPost.evaluation_processed === true ||
    (currentPost.evaluation_deadline && new Date(currentPost.evaluation_deadline) <= new Date())
  );
  const isAnonymousUser = !user;
  const isAnonVoteLockedOnCurrentPost =
    isAnonymousUser && !!currentPost?.anon_voted;
  const isOwnCurrentPost =
    !!currentPost && !!user && String(currentPost.user_id) === String(user.id);
  const currentUserDisplayName = [
    user?.first_name,
    user?.last_name,
  ]
    .filter(Boolean)
    .join(" ") || user?.nickname || user?.email || "Użytkownik";

  const currentUserAvatar = `https://i.pravatar.cc/160?u=${user?.id || user?.email || "anon"}`;

  const currentPostStatus2 = currentPost
    ? getStatus2Label(currentPost.true_votes, currentPost.false_votes)
    : null;

  const displayedTrueVotesCount = Number(currentPost?.true_votes || 0);
  const displayedFalseVotesCount = Number(currentPost?.false_votes || 0);
  const displayedTotalVotesCount = displayedTrueVotesCount + displayedFalseVotesCount;

  const displayedTruePoints = Number(currentPost?.true_points || 0);
  const displayedFalsePoints = Number(currentPost?.false_points || 0);
  const displayedTotalPoints = displayedTruePoints + displayedFalsePoints;

  const truthRatio = displayedTotalPoints > 0
    ? displayedTruePoints / displayedTotalPoints
    : 0;

  const greenHeightAnim = truthRatioAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, STATS_BAR_HEIGHT],
  });

  const redHeightAnim = truthRatioAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [STATS_BAR_HEIGHT, 0],
  });

  const currentPostStatusTheme = getStatus2Theme(currentPostStatus2);
  const formattedLocation = currentAddress
    ? `[${currentAddress.countryCode || "--"}] ${
        currentAddress.city || "-"
      }, ${currentAddress.street || "-"}, ${
        currentAddress.houseNumber || "-"
      }`
    : null;

  useEffect(() => {
    if (!currentPost) {
      setCurrentAddress(null);
      return;
    }

    fetchAddressForCoords(currentPost.lat, currentPost.lng);
  }, [currentPost]);

  useEffect(() => {
    if (!currentPost?.id) return;
    if (isSearchResultsVisible) return;

    const key = String(currentPost.id);
    const now = Date.now();
    const lastSentAt = Number(viewSentAtRef.current[key] || 0);

    // Cooldown, żeby szybkie przewijanie góra/dół nie nabijało sztucznie wyświetleń.
    if (now - lastSentAt < 20000) return;

    viewSentAtRef.current[key] = now;

    const sendView = async () => {
      try {
        const headers = {
          "Content-Type": "application/json",
        };

        if (token) {
          headers.Authorization = `Bearer ${token}`;
        } else if (anonId) {
          headers["x-anon-id"] = anonId;
        }

        await fetch(`${API_URL}/posts/${currentPost.id}/view`, {
          method: "POST",
          headers,
          body: JSON.stringify({ anon_id: anonId || null }),
        });
      } catch {
        // Brak blokowania UI przy błędzie zliczania view
      }
    };

    sendView();
  }, [currentPost?.id, isSearchResultsVisible, token, anonId]);

  useEffect(() => {
    statsFlashAnim.setValue(0);
    titleFlashAnim.setValue(0);

    Animated.sequence([
      Animated.delay(100),
      Animated.timing(statsFlashAnim, {
        toValue: 0.85,
        duration: 140,
        useNativeDriver: true,
      }),
      Animated.timing(statsFlashAnim, {
        toValue: 0,
        duration: 260,
        useNativeDriver: true,
      }),
    ]).start();

    Animated.sequence([
      Animated.delay(100),
      Animated.timing(titleFlashAnim, {
        toValue: 0.85,
        duration: 140,
        useNativeDriver: true,
      }),
      Animated.timing(titleFlashAnim, {
        toValue: 0,
        duration: 260,
        useNativeDriver: true,
      }),
    ]).start();

    truthRatioAnim.stopAnimation((currentRatio) => {
      const phase1Target = currentRatio + (truthRatio - currentRatio) * 0.35;
      const phase2Target = currentRatio + (truthRatio - currentRatio) * 0.8;

      Animated.sequence([
        Animated.delay(450),
        Animated.timing(truthRatioAnim, {
          toValue: phase1Target,
          duration: 800,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.timing(truthRatioAnim, {
          toValue: phase2Target,
          duration: 1500,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: false,
        }),
        Animated.timing(truthRatioAnim, {
          toValue: truthRatio,
          duration: 800,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: false,
        }),
      ]).start();
    });

    Animated.sequence([
      Animated.delay(450),
      Animated.timing(statsPulseAnim, {
        toValue: 1.05,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.spring(statsPulseAnim, {
        toValue: 1,
        tension: 80,
        friction: 9,
        useNativeDriver: true,
      }),
    ]).start();
  }, [currentPost?.id, displayedTruePoints, displayedFalsePoints]);

  useEffect(() => {
    const directParent = navigation.getParent?.();
    const rightDrawerNavigation =
      directParent?.setParams
        ? directParent
        : directParent?.getParent?.();

    if (!rightDrawerNavigation?.setParams || !currentPost?.id) return;

    rightDrawerNavigation.setParams({
      selectedPostId: currentPost.id,
      selectedPost: currentPost,
    });
  }, [currentPost, navigation]);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />

      {/* FlatList renderuje się PRZED topBar → ma niższy z-order, topBar go przykrywa */}
      {!isSearchResultsVisible && (loopedPosts.length > 0 || activeTab !== "forYou") && (
        <FlatList
          ref={feedListRef}
          data={loopedPosts}
          renderItem={renderItem}
          keyExtractor={(item, index) => `${item.id}-${index}`}
          pagingEnabled
          snapToInterval={height}
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          getItemLayout={(_, index) => ({
            length: height,
            offset: height * index,
            index,
          })}
          onMomentumScrollEnd={(event) => {
            if (
              posts.length <= 1 ||
              !feedListRef.current
            )
              return;

            const virtualIndex = Math.round(
              event.nativeEvent.contentOffset.y / height
            );

            // [0] = sztuczny ostatni, [1..n] = prawdziwe, [n+1] = sztuczny pierwszy
            if (virtualIndex === 0) {
              feedListRef.current.scrollToIndex({
                index: posts.length,
                animated: false,
              });
            } else if (virtualIndex === posts.length + 1) {
              feedListRef.current.scrollToIndex({
                index: 1,
                animated: false,
              });
            }
          }}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          style={StyleSheet.absoluteFill}
        />
      )}

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
          <View style={styles.tabsWrapper}>
            <TouchableOpacity
              style={styles.tabButton}
              onPress={() => switchTabSmooth("forYou")}
            >
              <Text
                style={[
                  styles.tabLabel,
                  activeTab === "forYou" &&
                    styles.tabLabelActive,
                ]}
              >
                Dla Ciebie
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.tabButton}
              onPress={() => switchTabSmooth("newEvents")}
            >
              <Text
                style={[
                  styles.tabLabel,
                  activeTab === "newEvents" &&
                    styles.tabLabelActive,
                ]}
              >
                Nowe wydarzenia
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity
          onPress={() => setIsSearching((prev) => !prev)}
        >
          <Text style={styles.search}>
            {isSearching ? "✖" : "🔍"}
          </Text>
        </TouchableOpacity>
      </View>

      {isSearchResultsVisible && (
        <View style={styles.searchResultsContainer}>
          <FlatList
            data={filteredSearchResults}
            keyExtractor={(item) => `search-${item.id}`}
            contentContainerStyle={styles.searchResultsContent}
            ListEmptyComponent={
              <View style={styles.searchEmptyBox}>
                <Text style={styles.searchEmptyTitle}>Brak wyników</Text>
                <Text style={styles.searchEmptyDesc}>
                  Nie znaleziono postów dla frazy: "{searchQuery}"
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              const title = String(item?.text || "");
              const description = String(item?.description || "");
              const { text: previewDescription, truncated } =
                truncateDescription(description, 96);

              const trueVotes = Number(item?.true_votes || 0);
              const falseVotes = Number(item?.false_votes || 0);
              const truePoints = Number(item?.true_points || 0);
              const falsePoints = Number(item?.false_points || 0);
              const totalPoints = truePoints + falsePoints;
              const hasEnoughVotes = totalPoints > 0;
              const truePercent = hasEnoughVotes
                ? Math.round((truePoints / totalPoints) * 100)
                : 0;
              const falsePercent = hasEnoughVotes ? 100 - truePercent : 0;

              return (
                <TouchableOpacity
                  style={styles.searchResultCard}
                  onPress={() => {
                    const targetIndex = posts.findIndex((p) => p.id === item.id);
                    if (targetIndex >= 0) {
                      setCurrentIndex(targetIndex);

                      if (posts.length > 1) {
                        const virtualTarget = targetIndex + 1;
                        requestAnimationFrame(() => {
                          try {
                            feedListRef.current?.scrollToIndex({
                              index: virtualTarget,
                              animated: false,
                            });
                          } catch {}
                        });
                      }
                    }

                    setSearchQuery("");
                    setIsSearching(false);
                  }}
                >
                  <View
                    style={[
                      styles.searchTruthBar,
                      !hasEnoughVotes && styles.searchTruthBarPending,
                    ]}
                  >
                    {hasEnoughVotes && (
                      <View style={styles.searchTruthSegments}>
                        {truePercent > 0 && (
                          <View
                            style={[
                              styles.searchTruthGreen,
                              { flex: truePoints || 1 },
                            ]}
                          >
                            <View style={styles.segmentCenter}>
                              <Text style={[styles.segmentText, { color: "#fff" }]}>
                                {truePercent}%
                              </Text>
                            </View>
                          </View>
                        )}
                        {falsePercent > 0 && (
                          <View
                            style={[
                              styles.searchTruthRed,
                              { flex: falsePoints || 1 },
                            ]}
                          >
                            <View style={styles.segmentCenter}>
                              <Text style={[styles.segmentText, { color: "yellow" }]}>
                                {falsePercent}%
                              </Text>
                            </View>
                          </View>
                        )}
                      </View>
                    )}

                    {!hasEnoughVotes && (
                      <View style={styles.searchTruthLabelWrap}>
                        <Text
                          style={[
                            styles.searchTruthLabel,
                            styles.searchTruthLabelPending,
                          ]}
                          numberOfLines={1}
                        >
                          znasz tą sprawę ? oznacz wydarzenie PRAWDA lub FAŁSZ
                        </Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.searchResultMainRow}>
                  <Image
                    source={{ uri: item?.image_url || "" }}
                    style={styles.searchResultThumb}
                  />

                  <View style={styles.searchResultBody}>
                    <Text style={styles.searchResultTitle} numberOfLines={1}>
                      {title || "(bez tytułu)"}
                    </Text>

                    {!!description && (
                      <Text style={styles.searchResultDesc} numberOfLines={2}>
                        {previewDescription}
                        {truncated && (
                          <Text style={styles.searchResultMore}> więcej</Text>
                        )}
                      </Text>
                    )}
                  </View>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        </View>
      )}

      {/* EMPTY STATE 1: brak ustawionych lokalizacji */}
      {!isSearchResultsVisible && loopedPosts.length === 0 && activeTab === "forYou" && !hasForYouPreferences && (
        <Animated.View style={[styles.emptyState, { opacity: emptyFadeAnim }]}>
          <Text style={styles.emptyStateIcon}>🧭</Text>
          <Text style={styles.emptyStateTitle}>Nie wybrałeś żadnej lokalizacji</Text>
          <Text style={styles.emptyStateDesc}>
            Nie wybrałeś żadnej lokalizacji, z której chciałbyś oglądać wydarzenia.{"\n"}
            Dodaj lokalizację, aby móc przeglądać wydarzenia z Twojej okolicy.
          </Text>
          <TouchableOpacity
            style={styles.emptyStateBtn}
            onPress={() => switchTabSmooth("newEvents")}
          >
            <Text style={styles.emptyStateBtnText}>Przenieś do wszystkich wiadomości</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* EMPTY STATE 2: lokalizacje są, ale brak postów w promieniu */}
      {!isSearchResultsVisible && loopedPosts.length === 0 && activeTab === "forYou" && hasForYouPreferences && (
        <Animated.View style={[styles.emptyState, { opacity: emptyFadeAnim }]}>
          <Text style={styles.emptyStateIcon}>📍</Text>
          <Text style={styles.emptyStateTitle}>Brak wiadomości w Twojej okolicy</Text>
          <Text style={styles.emptyStateDesc}>
            Nie znaleźliśmy żadnych postów w obrębie Twoich lokalizacji.{"\n"}
            Możesz przejrzeć wszystkie dostępne posty.
          </Text>
          <TouchableOpacity
            style={styles.emptyStateBtn}
            onPress={() => switchTabSmooth("newEvents")}
          >
            <Text style={styles.emptyStateBtnText}>Przeglądaj wszystkie posty</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* TITLE */}
      {currentPost && !isSearchResultsVisible && (
        <View style={styles.titleBar}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.titleFlashOverlay,
              { opacity: titleFlashAnim },
            ]}
          />
          <Text
            style={[
              styles.status2Badge,
              {
                backgroundColor: currentPostStatusTheme.bg,
                borderColor: currentPostStatusTheme.border,
              },
            ]}
          >
            {currentPostStatus2}
          </Text>
          <Text style={styles.title}>
            {currentPost.text}
          </Text>
        </View>
      )}

      {/* META */}
      {currentPost && !isSearchResultsVisible && (
        <View style={styles.metaBar}>
          <Text style={styles.metaText}>
            {isAddressLoading
              ? "Ustalanie adresu..."
              : formattedLocation ||
                `${currentPost.lat}, ${currentPost.lng}`}
          </Text>
          <Text style={styles.metaText}>
            {new Date(
              currentPost.created_at
            ).toLocaleTimeString()}
          </Text>
        </View>
      )}

      {/* STATS */}
      {currentPost && !isSearchResultsVisible && (
        <View style={styles.statsWrapper}>
          <Animated.View
            style={[
              styles.statsBar,
              { opacity: displayedTotalVotesCount < 3 ? 0.5 : 1 },
              { transform: [{ scale: statsPulseAnim }] },
            ]}
          >
            <Animated.View
              pointerEvents="none"
              style={[
                styles.statsFlashOverlay,
                { opacity: statsFlashAnim },
              ]}
            />

            {displayedTotalPoints === 0 ? (
              <View style={styles.grayFill} />
            ) : (
              <>
                <Animated.View
                  style={[
                    styles.greenFill,
                    { height: greenHeightAnim },
                  ]}
                />
                <Animated.View
                  style={[
                    styles.redFill,
                    { height: redHeightAnim },
                  ]}
                />
              </>
            )}
          </Animated.View>

          <Text style={styles.percentText}>
            ✅ {displayedTruePoints} pkt
          </Text>
          <Text style={styles.percentText}>
            ❌ {displayedFalsePoints} pkt
          </Text>
        </View>
      )}

      {/* BOTTOM */}
      {currentPost && !isSearchResultsVisible && (
        <View style={styles.bottomBar}>
          <View style={styles.sideVoteSlot}>
            {!isOwnCurrentPost && (
              <TouchableOpacity
                style={[
                  styles.falseBtn,
                  isCurrentPostVotingClosed && styles.voteBtnDisabled,
                  isAnonVoteLockedOnCurrentPost && styles.voteBtnDisabled,
                ]}
                onPress={() => vote("false")}
                disabled={isSubmittingVote || isAnonVoteLockedOnCurrentPost || isCurrentPostVotingClosed}
              >
                <Text style={styles.btnText}>
                  NIEPRAWDA
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {!isAnonymousUser && (
            <TouchableOpacity
              style={styles.cameraBtn}
              onPress={openCamera}
            >
              <Image
                source={require("../../assets/camera.png")}
                style={{ width: 40, height: 40 }}
              />
            </TouchableOpacity>
          )}

          <View style={styles.sideVoteSlot}>
            {!isOwnCurrentPost && (
              <TouchableOpacity
                style={[
                  styles.trueBtn,
                  isCurrentPostVotingClosed && styles.voteBtnDisabled,
                  isAnonVoteLockedOnCurrentPost && styles.voteBtnDisabled,
                ]}
                onPress={() => vote("true")}
                disabled={isSubmittingVote || isAnonVoteLockedOnCurrentPost || isCurrentPostVotingClosed}
              >
                <Text style={styles.btnText}>
                  PRAWDA
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      <Animated.View
        pointerEvents="none"
        style={[
          styles.transitionOverlay,
          { opacity: transitionCoverAnim },
        ]}
      />

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
                disabled={isSubmittingVote}
              >
                <Text style={{ color: "#fff" }}>
                  {isSubmittingVote ? "Zapisywanie..." : "Zatwierdź"}
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
                  confirmOnPlace();
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
        <SafeAreaView style={styles.createSafeArea}>
          <View style={styles.createHeaderRow}>
            <Image source={{ uri: currentUserAvatar }} style={styles.createAvatar} />
            <View style={{ flex: 1 }}>
              <Text style={styles.createUserName}>{currentUserDisplayName}</Text>
              <Text style={styles.createUserMeta}>Nowy post</Text>
            </View>

            <TouchableOpacity onPress={submitPost}>
              <Text style={{ color: "#2f6fd6", fontWeight: "700" }}>
                Opublikuj
              </Text>
            </TouchableOpacity>
          </View>

          {newImage ? (
            <Image
              source={{ uri: newImage }}
              style={styles.createImagePreview}
            />
          ) : (
            <View style={styles.mediaChoicesWrap}>
              <TouchableOpacity style={styles.mediaChoiceBtn} onPress={takePostPhoto}>
                <Text style={styles.mediaChoiceText}>📷 Zrób zdjęcie</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.mediaChoiceBtn} onPress={pickPostPhotoFromGallery}>
                <Text style={styles.mediaChoiceText}>🖼 Dodaj zdjęcie z galerii</Text>
              </TouchableOpacity>
              <View style={styles.linkImportBox}>
                <TextInput
                  placeholder="Wklej adres internetowy"
                  value={newLinkUrl}
                  onChangeText={setNewLinkUrl}
                  autoCapitalize="none"
                  style={styles.linkImportInput}
                />
                <TouchableOpacity
                  style={styles.linkImportBtn}
                  onPress={importImageFromLink}
                  disabled={isResolvingLinkPreview}
                >
                  <Text style={styles.linkImportBtnText}>
                    {isResolvingLinkPreview ? "Pobieranie..." : "🔗 Dodaj adres internetowy"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <TextInput
            placeholder="Tytuł *"
            value={newTitle}
            onChangeText={setNewTitle}
            style={styles.createTitleInput}
          />

          <TextInput
            placeholder="Treść"
            value={newDesc}
            onChangeText={setNewDesc}
            multiline
            textAlignVertical="top"
            editable={!isDescLocked}
            style={styles.createContentInput}
          />

          <TouchableOpacity
            onPress={submitPost}
            style={styles.createSubmitBtn}
          >
            <Text style={styles.createSubmitBtnText}>
              Opublikuj
            </Text>
          </TouchableOpacity>

          {newImage ? (
            <View style={styles.changeMediaRow}>
              <TouchableOpacity onPress={takePostPhoto} style={styles.changePhotoBtn}>
                <Text style={styles.changePhotoBtnText}>Zrób zdjęcie</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={pickPostPhotoFromGallery} style={styles.changePhotoBtn}>
                <Text style={styles.changePhotoBtnText}>Wybierz z galerii</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <TouchableOpacity
            onPress={() => {
              setModalVisible(false);
              setNewTitle("");
              setNewDesc("");
              setNewImage(null);
              setNewImageSourceType(null);
              setNewLinkUrl("");
              setIsDescLocked(false);
              setSharePostLocation(null);
              setPostLocationCoords(null);
            }}
            style={styles.createCancelBtn}
          >
            <Text style={styles.createCancelBtnText}>Anuluj</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </Modal>

      <Modal visible={postLocationConsentVisible} transparent animationType="fade">
        <View style={styles.centerModalOverlay}>
          <View style={styles.centerModalBox}>
            <Text style={styles.locationTitle}>Czy chcesz udostępnić lokalizację swojego posta?</Text>

            <View style={styles.locationButtonsRow}>
              <TouchableOpacity
                style={styles.confirmSmallBtn}
                onPress={() => applyPostLocationConsent(true)}
              >
                <Text style={styles.locationBtnText}>TAK</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelSmallBtn}
                onPress={() => applyPostLocationConsent(false)}
              >
                <Text style={styles.locationBtnText}>NIE</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.locationInfoText}>
              Tak jak przy komentarzu, lokalizacja jest opcjonalna i zwiększa wiarygodność wpisu.
            </Text>
          </View>
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
  tabsWrapper: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginHorizontal: 8,
  },
  tabButton: {
    marginHorizontal: 8,
  },
  tabLabel: {
    color: "#bdbdbd",
    fontSize: 13,
    fontWeight: "600",
  },
  tabLabelActive: {
    color: "#fff",
    textDecorationLine: "underline",
  },

  searchResultsContainer: {
    flex: 1,
    backgroundColor: "#070707",
  },
  searchResultsContent: {
    padding: 14,
    paddingBottom: 24,
  },
  searchResultCard: {
    backgroundColor: "#151515",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
    height: 100,
    justifyContent: "space-between",
  },
  searchTruthBar: {
    width: "100%",
    height: 20,
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: "rgba(0,0,0,0.35)",
    position: "relative",
    marginBottom: 6,
  },
  searchTruthBarPending: {
    backgroundColor: "#000",
    borderWidth: 1,
    borderColor: "#6e6e6e",
  },
  searchTruthSegments: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
  },
  searchTruthGreen: {
    backgroundColor: "green",
    justifyContent: "center",
    alignItems: "center",
  },
  searchTruthRed: {
    backgroundColor: "red",
    justifyContent: "center",
    alignItems: "center",
  },
  searchTruthLabelWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 8,
  },
  searchTruthLabel: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
  },
  searchTruthLabelPending: {
    color: "#d0d0d0",
  },
  segmentCenter: {
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
    height: "100%",
  },
  segmentText: {
    color: "yellow",
    fontSize: 10,
    fontWeight: "800",
  },
  searchResultMainRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    flex: 1,
  },
  searchResultThumb: {
    width: 62,
    height: 62,
    borderRadius: 10,
    backgroundColor: "#303030",
    marginRight: 10,
  },
  searchResultBody: {
    flex: 1,
    height: 62,
    justifyContent: "flex-start",
  },
  searchResultTitle: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 2,
  },
  searchResultDesc: {
    color: "#b5b5b5",
    fontSize: 12,
    lineHeight: 16,
    marginTop: 1,
  },
  searchResultMore: {
    color: "#fff",
    fontWeight: "800",
  },
  searchEmptyBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 50,
  },
  searchEmptyTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
  },
  searchEmptyDesc: {
    color: "#aaa",
    fontSize: 13,
  },

  titleBar: {
    height: 40,
    flexDirection: "row",
    backgroundColor: "rgba(200,0,0,0.7)",
    borderTopWidth: 2,
    borderBottomWidth: 3,
    borderColor: "rgba(255,215,0,0.9)",
    paddingHorizontal: 15,
    alignItems: "center",
    position: "relative",
    overflow: "hidden",
  },

  titleFlashOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#fff",
    zIndex: 3,
  },

  status2Badge: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
    backgroundColor: "rgba(0,0,0,0.35)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 8,
    overflow: "hidden",
  },

  title: {
    color: "#fff",
    fontWeight: "bold",
    flexShrink: 1,
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
    height: STATS_BAR_HEIGHT,
    width: 26,
    backgroundColor: "rgba(0,0,0,0.4)",
    borderRadius: 13,
    overflow: "hidden",
    position: "relative",
  },

  greenFill: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "green",
  },
  redFill: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    backgroundColor: "red",
  },
  grayFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#808080",
  },
  statsFlashOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#fff",
    zIndex: 3,
  },

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

  sideVoteSlot: {
    width: "30%",
    alignItems: "center",
  },

  falseBtn: {
    backgroundColor: "rgba(200,0,0,0.85)",
    borderWidth: 1.5,
    borderColor: "#880000",
    paddingVertical: 15,
    borderRadius: 14,
    width: "100%",
    alignItems: "center",
  },

  trueBtn: {
    backgroundColor: "rgba(0,150,0,0.85)",
    borderWidth: 1.5,
    borderColor: "#004d00",
    paddingVertical: 15,
    borderRadius: 14,
    width: "100%",
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
  voteBtnDisabled: {
    opacity: 0.45,
  },

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

  createSafeArea: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 18,
  },
  createHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  createAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 10,
  },
  createUserName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111",
  },
  createUserMeta: {
    fontSize: 12,
    color: "#666",
    marginTop: 2,
  },
  createImagePreview: {
    width: "100%",
    height: 260,
    borderRadius: 12,
    marginBottom: 14,
    backgroundColor: "#f0f0f0",
  },
  mediaChoicesWrap: {
    marginBottom: 14,
  },
  mediaChoiceBtn: {
    width: "100%",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d9d9d9",
    paddingVertical: 11,
    paddingHorizontal: 12,
    backgroundColor: "#fafafa",
    marginBottom: 8,
  },
  mediaChoiceText: {
    color: "#303030",
    fontSize: 14,
    fontWeight: "600",
  },
  linkImportBox: {
    borderWidth: 1,
    borderColor: "#e1e1e1",
    borderRadius: 10,
    padding: 10,
    backgroundColor: "#fcfcfc",
  },
  linkImportInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: "#111",
    marginBottom: 8,
  },
  linkImportBtn: {
    borderRadius: 8,
    backgroundColor: "#2f6fd6",
    alignItems: "center",
    paddingVertical: 9,
  },
  linkImportBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  createTitleInput: {
    borderWidth: 1,
    borderColor: "#d6d6d6",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    color: "#111",
    fontSize: 16,
    fontWeight: "600",
  },
  createContentInput: {
    borderWidth: 0,
    paddingHorizontal: 2,
    paddingVertical: 6,
    marginBottom: 20,
    minHeight: 120,
    color: "#222",
    fontSize: 15,
    lineHeight: 21,
    backgroundColor: "transparent",
  },
  createSubmitBtn: {
    backgroundColor: "#0f8f35",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  createSubmitBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  createCancelBtn: {
    marginTop: 10,
    alignItems: "center",
    paddingVertical: 10,
  },
  createCancelBtnText: {
    color: "#666",
    fontSize: 14,
    fontWeight: "600",
  },
  changeMediaRow: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "center",
    gap: 16,
  },
  changePhotoBtn: {
    alignItems: "center",
  },
  changePhotoBtnText: {
    color: "#2f6fd6",
    fontSize: 13,
    fontWeight: "700",
  },

  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#111",
    paddingHorizontal: 30,
  },
  emptyStateIcon: {
    fontSize: 54,
    marginBottom: 18,
  },
  emptyStateTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 12,
  },
  emptyStateDesc: {
    color: "#aaa",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 28,
  },
  emptyStateBtn: {
    backgroundColor: "#1e90ff",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  emptyStateBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  transitionOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
    zIndex: 20,
  },
});
