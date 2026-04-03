import React, { useCallback, useContext, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { AuthContext } from "../context/AuthContext";
import { API_URL } from "../../config";

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const parseResponseSafely = async (res) => {
  const raw = await res.text();

  try {
    return { data: JSON.parse(raw), raw };
  } catch {
    return { data: null, raw };
  }
};

export default function MyPostsScreen({ navigation }) {
  const { user, token } = useContext(AuthContext);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState(null);
  const [posts, setPosts] = useState([]);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [resolvedUserId, setResolvedUserId] = useState(user?.id ?? null);

  React.useEffect(() => {
    setResolvedUserId(user?.id ?? null);
  }, [user?.id]);

  const loadMyAvatar = useCallback(async () => {
    if (!token) {
      setAvatarUrl(null);
      return;
    }

    try {
      const res = await fetch(`${API_URL}/user/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const { data } = await parseResponseSafely(res);
      setAvatarUrl(data?.avatar_url || null);
      if (data?.id != null) {
        setResolvedUserId(data.id);
      }
    } catch {
      setAvatarUrl(null);
    }
  }, [token]);

  const resolveCurrentUserId = useCallback(async () => {
    if (resolvedUserId != null) return resolvedUserId;
    if (!token) return null;

    try {
      const res = await fetch(`${API_URL}/user/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const { data } = await parseResponseSafely(res);
      const id = data?.id ?? null;
      if (id != null) setResolvedUserId(id);
      return id;
    } catch {
      return null;
    }
  }, [resolvedUserId, token]);

  const buildSummaryFromPosts = useCallback((items) => {
    const safePosts = Array.isArray(items) ? items : [];

    return {
      total_views: safePosts.reduce(
        (acc, p) => acc + toNumber(p.views_count),
        0
      ),
      total_comments: safePosts.reduce(
        (acc, p) => acc + toNumber(p.comments_count),
        0
      ),
      total_photos: safePosts.reduce(
        (acc, p) =>
          acc + (p.image_url ? 1 : 0),
        0
      ),
      total_true_votes: safePosts.reduce(
        (acc, p) => acc + toNumber(p.true_votes),
        0
      ),
      total_false_votes: safePosts.reduce(
        (acc, p) => acc + toNumber(p.false_votes),
        0
      ),
    };
  }, []);

  const tryFetchMineFallback = useCallback(async () => {
    const currentUserId = await resolveCurrentUserId();

    const fallbackRes = await fetch(`${API_URL}/posts/all`);
    const { data: allPostsData } = await parseResponseSafely(
      fallbackRes
    );

    if (!fallbackRes.ok || !Array.isArray(allPostsData)) {
      throw new Error(
        "Endpoint /posts/mine niedostępny i nie udało się pobrać fallbacku /posts/all"
      );
    }

    const mine = allPostsData.filter((post) => {
      if (currentUserId == null) return false;
      return String(post.user_id) === String(currentUserId);
    });

    setPosts(mine);
    setSummary(buildSummaryFromPosts(mine));
  }, [buildSummaryFromPosts, resolveCurrentUserId]);

  const fetchMine = useCallback(async () => {
    if (!token) {
      setSummary(null);
      setPosts([]);
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`${API_URL}/posts/mine`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const { data, raw } = await parseResponseSafely(res);

      // Gdy backend nie został jeszcze zrestartowany po dodaniu endpointu,
      // Express może zwrócić HTML 404 (stąd "Unexpected character: <").
      // Wtedy używamy fallbacku /posts/all i filtrujemy po user_id.
      const gotHtml =
        typeof raw === "string" &&
        raw.trimStart().startsWith("<");

      if (gotHtml || !data) {
        await tryFetchMineFallback();
        return;
      }

      if (!res.ok) {
        throw new Error(data?.error || "Nie udało się pobrać Twoich postów");
      }

      setSummary(data?.summary || null);
      setPosts(Array.isArray(data?.posts) ? data.posts : []);
    } catch (err) {
      try {
        await tryFetchMineFallback();
      } catch {
        Alert.alert(
          "Błąd",
          err.message || "Nie udało się pobrać Twoich postów"
        );
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, tryFetchMineFallback]);

  React.useEffect(() => {
    loadMyAvatar();
    fetchMine();
  }, [fetchMine, loadMyAvatar]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchMine();
  }, [fetchMine]);

  const totalTrue = toNumber(summary?.total_true_votes);
  const totalFalse = toNumber(summary?.total_false_votes);

  const trustComment = useMemo(() => {
    if (totalTrue === 0 && totalFalse === 0) {
      return "Dodaj więcej aktywności, aby zbudować ranking wiarygodności.";
    }
    if (totalTrue >= totalFalse) {
      return "Twoje posty częściej są oceniane jako PRAWDA. Świetna robota!";
    }
    return "Twoje posty częściej są oceniane jako NIEPRAWDA. Popracuj nad jakością zgłoszeń.";
  }, [totalFalse, totalTrue]);

  const deletePost = useCallback(
    async (postId) => {
      try {
        const res = await fetch(`${API_URL}/posts/${postId}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const { data } = await parseResponseSafely(res);

        if (!res.ok) {
          if (res.status === 404) {
            throw new Error(
              "Endpoint usuwania nie jest dostępny na aktualnie uruchomionym backendzie. Zrestartuj backend po aktualizacji kodu."
            );
          }
          throw new Error(data?.error || "Nie udało się usunąć posta");
        }

        setPosts((prev) => prev.filter((p) => p.id !== postId));
        fetchMine();
      } catch (err) {
        Alert.alert("Błąd", err.message || "Nie udało się usunąć posta");
      }
    },
    [fetchMine, token]
  );

  const openPostMenu = useCallback(
    (post) => {
      Alert.alert("Menu posta", "Wybierz akcję", [
        {
          text: "Usuń post",
          style: "destructive",
          onPress: () => deletePost(post.id),
        },
        { text: "Anuluj", style: "cancel" },
      ]);
    },
    [deletePost]
  );

  const openPostDetails = useCallback(
    (post) => {
      if (!post?.id) return;

      const directParent = navigation.getParent?.();
      const rightDrawerNavigation =
        directParent?.setParams
          ? directParent
          : directParent?.getParent?.();

      rightDrawerNavigation?.setParams?.({
        selectedPostId: post.id,
        selectedPost: post,
      });

      rightDrawerNavigation?.openDrawer?.();
    },
    [navigation]
  );

  const renderPost = ({ item }) => {
    const truePoints = toNumber(item.true_points);
    const falsePoints = toNumber(item.false_points);
    const allPoints = truePoints + falsePoints;
    const truthPercent = allPoints > 0 ? Math.round((truePoints / allPoints) * 100) : 0;

    return (
      <View style={styles.postCard}>
        <View style={styles.postHeader}>
          <Text numberOfLines={1} style={styles.postTitle}>
            {item.text || "Bez tytułu"}
          </Text>
          <TouchableOpacity onPress={() => openPostMenu(item)}>
            <Text style={styles.menuDots}>⋯</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={() => openPostDetails(item)} activeOpacity={0.9}>
          {item.image_url ? (
            <Image source={{ uri: item.image_url }} style={styles.postImageHalf} />
          ) : (
            <View style={[styles.postImageHalf, styles.noImageBox]}>
              <Text style={styles.noImageText}>Brak zdjęcia</Text>
            </View>
          )}
        </TouchableOpacity>

        <View style={styles.postBottomRow}>
          <Text style={styles.rankText}>Ranking prawdy: {truthPercent}%</Text>
          <View style={styles.iconStatsWrap}>
            <Text style={styles.iconStat}>👁 {toNumber(item.views_count)}</Text>
            <Text style={styles.iconStat}>💬 {toNumber(item.comments_count)}</Text>
            <Text style={styles.iconStat}>🔁 {toNumber(item.shares_count)}</Text>
          </View>
        </View>
      </View>
    );
  };

  if (!user) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>Zaloguj się, aby zobaczyć swoje posty.</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.summarySection}>
        <View style={styles.topNavRow}>
          <TouchableOpacity
            style={styles.topNavBtn}
            onPress={() => navigation.navigate("Feed")}
          >
            <Text style={styles.topNavIcon}>🏠</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.topNavBtn}>
            <Text style={styles.topNavIcon}>🔔</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.topNavBtn}>
            <Text style={styles.topNavIcon}>⚙️</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.topNavBtn}>
            <Text style={styles.topNavIcon}>❓</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.userRow}>
          <Image
            source={
              avatarUrl
                ? { uri: `${API_URL}${avatarUrl}` }
                : { uri: "https://cdn-icons-png.flaticon.com/512/149/149071.png" }
            }
            style={styles.avatar}
          />
          <Text style={styles.accountComment}>{trustComment}</Text>
        </View>

        <Text style={styles.summaryTitle}>Twój udział</Text>
        <View style={styles.summaryStatsRow}>
          <Text style={styles.summaryStat}>Wyświetlenia: {toNumber(summary?.total_views)}</Text>
          <Text style={styles.summaryStat}>Komentarze: {toNumber(summary?.total_comments)}</Text>
          <Text style={styles.summaryStat}>Zdjęcia: {toNumber(summary?.total_photos)}</Text>
        </View>
      </View>

      <View style={styles.listSection}>
        <FlatList
          data={posts}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderPost}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
          ListEmptyComponent={
            !loading ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyText}>Brak opublikowanych postów.</Text>
              </View>
            ) : null
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#000",
  },
  summarySection: {
    height: "35%",
    backgroundColor: "#101010",
    paddingHorizontal: 16,
    paddingTop: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#242424",
  },
  topNavRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
    backgroundColor: "#1c1c1c",
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  topNavBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2a2a2a",
  },
  topNavIcon: {
    fontSize: 17,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  avatar: {
    width: 62,
    height: 62,
    borderRadius: 31,
    marginRight: 12,
  },
  accountComment: {
    color: "#fff",
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  summaryTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 10,
  },
  summaryStatsRow: {
    gap: 6,
  },
  summaryStat: {
    color: "#dcdcdc",
    fontSize: 14,
  },
  listSection: {
    flex: 1,
  },
  listContent: {
    padding: 12,
    paddingBottom: 80,
  },
  postCard: {
    backgroundColor: "#161616",
    borderRadius: 12,
    marginBottom: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#272727",
  },
  postHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  postTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    flex: 1,
    marginRight: 8,
  },
  menuDots: {
    color: "#fff",
    fontSize: 24,
    lineHeight: 24,
  },
  postImageHalf: {
    width: "100%",
    height: 140,
    resizeMode: "cover",
    backgroundColor: "#222",
  },
  noImageBox: {
    alignItems: "center",
    justifyContent: "center",
  },
  noImageText: {
    color: "#a5a5a5",
    fontSize: 12,
  },
  postBottomRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  rankText: {
    color: "#fff",
    fontWeight: "700",
  },
  iconStatsWrap: {
    flexDirection: "row",
    gap: 12,
  },
  iconStat: {
    color: "#d0d0d0",
    fontSize: 13,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000",
    paddingHorizontal: 20,
  },
  emptyWrap: {
    alignItems: "center",
    marginTop: 28,
  },
  emptyText: {
    color: "#bbb",
    textAlign: "center",
  },
});