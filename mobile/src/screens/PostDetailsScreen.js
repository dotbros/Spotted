import React, { useMemo, useEffect, useState, useCallback, useContext, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  PanResponder,
  StyleSheet,
  Image,
  ImageBackground,
  ScrollView,
  SafeAreaView,
  Dimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useDrawerStatus } from "@react-navigation/drawer";
import { API_URL } from "../../config";
import { AuthContext } from "../context/AuthContext";

const BACKEND_BASE = API_URL.replace(/\/$/, "");
const { width } = Dimensions.get("window");

const fallbackBg =
  "https://images.unsplash.com/photo-1617471346061-5d329ab9c574?q=80&w=1200&auto=format&fit=crop";

const parseResponseSafely = async (res) => {
  const raw = await res.text();
  try {
    return { data: JSON.parse(raw), raw };
  } catch {
    return { data: null, raw };
  }
};

const toAbsoluteMediaUrl = (url) => {
  if (!url) return null;
  if (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("file://") ||
    url.startsWith("content://") ||
    url.startsWith("data:")
  ) {
    return url;
  }
  return `${BACKEND_BASE}${url}`;
};

const toAbsoluteAvatarUrl = (avatarUrl) => {
  if (!avatarUrl) return null;
  if (avatarUrl.startsWith("http://") || avatarUrl.startsWith("https://")) {
    return avatarUrl;
  }
  return `${BACKEND_BASE}${avatarUrl}`;
};

const formatRelativeTime = (dateString) => {
  if (!dateString) return "przed chwilą";
  const date = new Date(dateString);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.max(1, Math.floor(diffMs / 60000));
  if (diffMin < 60) return `${diffMin} min temu`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH} h temu`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD} dni temu`;
};

const getMainRouteParams = (state) => {
  const mainRoute = state?.routes?.find((r) => r.name === "Main");
  return mainRoute?.params || {};
};

const CHART_HOURS = 12;
const CHART_HEIGHT = 170;
const CHART_AXIS_LEFT = 34;
const CHART_AXIS_RIGHT = 8;
const CHART_AXIS_TOP = 10;
const CHART_AXIS_BOTTOM = 34;

const toHourLabel = (date) =>
  `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes()
  ).padStart(2, "0")}`;

const segmentStyle = (x1, y1, x2, y2, color) => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx);

  return {
    position: "absolute",
    left: (x1 + x2) / 2 - length / 2,
    top: (y1 + y2) / 2 - 1,
    width: length,
    height: 2,
    backgroundColor: color,
    transform: [{ rotateZ: `${angle}rad` }],
  };
};

const getStatusTheme = (statusTitle, statusSubtitle, truePercent) => {
  const combined = `${statusTitle || ""} ${statusSubtitle || ""}`.toLowerCase();

  if (combined.includes("niezweryfikowane") || combined.includes("nikt jeszcze nie potwierdził")) {
    return { bg: "rgba(93,103,120,0.95)", border: "#b6c0d0" };
  }

  if (combined.includes("to są fakty") || combined.includes("informacja prawdziwa")) {
    return { bg: "rgba(12,133,44,0.95)", border: "#45cf73" };
  }
  if (combined.includes("prawie prawda")) {
    return { bg: "rgba(88,177,69,0.95)", border: "#9ae77e" };
  }
  if (combined.includes("sprzeczne") || combined.includes("ustalanie")) {
    return { bg: "rgba(173,140,24,0.95)", border: "#f0d56a" };
  }
  if (combined.includes("prawie fałsz") || combined.includes("prawie falsz")) {
    return { bg: "rgba(201,118,19,0.95)", border: "#ffbf66" };
  }
  if (combined.includes("to jest fake")) {
    return { bg: "rgba(164,16,30,0.95)", border: "#d95263" };
  }
  if (combined.includes("fałsz") || combined.includes("falsz")) {
    return { bg: "rgba(164,16,30,0.95)", border: "#d95263" };
  }

  if (truePercent >= 80) return { bg: "rgba(12,133,44,0.95)", border: "#45cf73" };
  if (truePercent >= 60) return { bg: "rgba(88,177,69,0.95)", border: "#9ae77e" };
  if (truePercent >= 40) return { bg: "rgba(173,140,24,0.95)", border: "#f0d56a" };
  if (truePercent >= 20) return { bg: "rgba(201,118,19,0.95)", border: "#ffbf66" };
  return { bg: "rgba(164,16,30,0.95)", border: "#d95263" };
};

const isTrueVote = (value) => {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  return (
    value === true ||
    value === 1 ||
    raw === "true" ||
    raw === "t" ||
    raw === "yes"
  );
};

export default function PostDetailsScreen({ navigation, state }) {
  const { user, token, anonId } = useContext(AuthContext);
  const drawerStatus = useDrawerStatus();
  const viewSentAtRef = useRef({});
  const [detailPost, setDetailPost] = useState(null);
  const [votes, setVotes] = useState([]);
  const [statusInfo, setStatusInfo] = useState(null);
  const [truthInfo, setTruthInfo] = useState(null);
  const [addressLabel, setAddressLabel] = useState(null);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [isDescriptionTruncated, setIsDescriptionTruncated] = useState(false);
  const [myAvatarUrl, setMyAvatarUrl] = useState(null);

  const [groupTab, setGroupTab] = useState("all"); // all | confirms | denies
  const [sortTab, setSortTab] = useState("newest"); // newest | onsite | credible

  const routeParams = getMainRouteParams(state);
  const selectedPostId = routeParams?.selectedPostId;
  const selectedPost = routeParams?.selectedPost;

  const resolvedDescription = useMemo(() => {
    const raw = detailPost?.description ?? "";
    return typeof raw === "string" ? raw.trim() : "";
  }, [detailPost?.description]);
  const shouldShowDescriptionToggle =
    isDescriptionTruncated || resolvedDescription.length > 140;

  useEffect(() => {
    setIsDescriptionExpanded(false);
    setIsDescriptionTruncated(false);
  }, [detailPost?.id, resolvedDescription]);

  useEffect(() => {
    if (selectedPost) {
      setDetailPost(selectedPost);
    }
  }, [selectedPost]);

  useEffect(() => {
    const loadMyAvatar = async () => {
      if (!token) {
        setMyAvatarUrl(null);
        return;
      }

      try {
        const res = await fetch(`${API_URL}/user/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const { data } = await parseResponseSafely(res);
        setMyAvatarUrl(data?.avatar_url || null);
      } catch {
        setMyAvatarUrl(null);
      }
    };

    loadMyAvatar();
  }, [token]);

  const fetchAddress = useCallback(async (lat, lng) => {
    if (lat == null || lng == null) {
      setAddressLabel(null);
      return;
    }

    try {
      const res = await fetch(`${API_URL}/geo/reverse?lat=${lat}&lng=${lng}`);
      const { data } = await parseResponseSafely(res);
      if (!res.ok || !data) {
        setAddressLabel(`${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`);
        return;
      }

      const label =
        data?.label ||
        [data?.city, data?.street, data?.houseNumber].filter(Boolean).join(", ");

      setAddressLabel(
        label || `${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`
      );
    } catch {
      setAddressLabel(`${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`);
    }
  }, []);

  const fetchDetails = useMemo(
    () => async (postId) => {
      if (!postId) return;
      try {
        const res = await fetch(`${API_URL}/posts/${postId}/details`);
        const { data } = await parseResponseSafely(res);

        if (!res.ok || !data || data?.error) return;

        const post = data.post || null;
        setDetailPost(post);
        setVotes(Array.isArray(data.votes) ? data.votes : []);
        setStatusInfo(data.status || null);
        setTruthInfo(data.truth || null);

        if (post?.lat != null && post?.lng != null) {
          fetchAddress(post.lat, post.lng);
        } else {
          setAddressLabel(null);
        }
      } catch (err) {
        console.warn("Details fetch warning:", err?.message);
      }
    },
    [fetchAddress]
  );

  useEffect(() => {
    if (!selectedPostId) return;
    fetchDetails(selectedPostId);
  }, [selectedPostId, fetchDetails]);

  useEffect(() => {
    if (!selectedPostId) return;
    if (drawerStatus !== "open") return;

    const key = String(selectedPostId);
    const now = Date.now();
    const lastSentAt = Number(viewSentAtRef.current[key] || 0);

    // Lokalny cooldown, by nie nabijać wyświetleń przez szybkie
    // ponowne otwarcia/zamknięcia tego samego posta.
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

        await fetch(`${API_URL}/posts/${selectedPostId}/view`, {
          method: "POST",
          headers,
          body: JSON.stringify({ anon_id: anonId || null }),
        });
      } catch {
        // Brak blokowania UI przy błędzie zliczania view
      }
    };

    sendView();
  }, [selectedPostId, drawerStatus, token, anonId]);

  useEffect(() => {
    if (!selectedPostId) return;
    const interval = setInterval(() => {
      fetchDetails(selectedPostId);
    }, 4000);
    return () => clearInterval(interval);
  }, [selectedPostId, fetchDetails]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > Math.abs(gesture.dy) && Math.abs(gesture.dx) > 8,
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dx > 60) {
            navigation?.closeDrawer?.();
          }
        },
      }),
    [navigation]
  );

  const normalizedVotes = useMemo(
    () =>
      (votes || []).map((v) => {
        const voteIsTrue = isTrueVote(v.value);
        const hasLocation =
          v.lat !== null && v.lat !== undefined && v.lng !== null && v.lng !== undefined;
        const hasMediaEvidence = Boolean(v.media_url);
        const isOnPlaceVerified = Boolean(v.is_on_place) && hasMediaEvidence;

        return {
          ...v,
          voteIsTrue,
          hasLocation,
          isOnPlaceVerified,
          hasMediaEvidence,
          author: v.nickname || v.email || `Użytkownik #${v.user_id}`,
          comment: v.comment || "Brak komentarza",
          createdLabel: formatRelativeTime(v.created_at),
          mediaAbsolute: toAbsoluteMediaUrl(v.media_url),
          credibility:
            (hasLocation ? 3 : 0) +
            (v.media_url ? 2 : 0) +
            (v.comment ? 1 : 0),
        };
      }),
    [votes]
  );

  const groupedVotes = useMemo(() => {
    if (groupTab === "confirms") {
      return normalizedVotes.filter((v) => v.voteIsTrue);
    }
    if (groupTab === "denies") {
      return normalizedVotes.filter((v) => !v.voteIsTrue);
    }
    return normalizedVotes;
  }, [groupTab, normalizedVotes]);

  const displayedVotes = useMemo(() => {
    let data = [...groupedVotes];

    if (sortTab === "onsite") {
      data = data.filter((v) => v.isOnPlaceVerified);
    }

    if (sortTab === "credible") {
      data.sort((a, b) => b.credibility - a.credibility);
      return data;
    }

    data.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return data;
  }, [groupedVotes, sortTab]);

  const trueCount = normalizedVotes.filter((v) => v.voteIsTrue).length;
  const falseCount = normalizedVotes.filter((v) => !v.voteIsTrue).length;
  const onsiteCount = groupedVotes.filter((v) => v.isOnPlaceVerified).length;
  const totalVotesCount = trueCount + falseCount;
  const truePointsTotal = Number(truthInfo?.true_points ?? detailPost?.true_points ?? 0);
  const falsePointsTotal = Number(truthInfo?.false_points ?? detailPost?.false_points ?? 0);
  const totalPointsCount = truePointsTotal + falsePointsTotal;

  const chartData = useMemo(() => {
    const publicationDate = detailPost?.created_at
      ? new Date(detailPost.created_at)
      : null;

    const trueHourly = Array.from({ length: CHART_HOURS + 1 }, () => 0);
    const falseHourly = Array.from({ length: CHART_HOURS + 1 }, () => 0);

    if (publicationDate) {
      for (const vote of votes) {
        if (!vote?.created_at) continue;

        const voteDate = new Date(vote.created_at);
        const diffHours =
          (voteDate.getTime() - publicationDate.getTime()) / 3600000;

        if (diffHours < 0) continue;

        const bucketIndex = Math.min(CHART_HOURS, Math.floor(diffHours) + 1);
        if (isTrueVote(vote.value)) {
          trueHourly[bucketIndex] += 1;
        } else {
          falseHourly[bucketIndex] += 1;
        }
      }
    }

    const maxY = Math.max(1, ...trueHourly, ...falseHourly);
    const yTicks = Array.from({ length: 5 }, (_, i) =>
      Math.round((maxY * (4 - i)) / 4)
    );

    const chartWidth = width - 32 - 28;
    const plotWidth = chartWidth - CHART_AXIS_LEFT - CHART_AXIS_RIGHT;
    const plotHeight = CHART_HEIGHT - CHART_AXIS_TOP - CHART_AXIS_BOTTOM;

    const x = (index) => CHART_AXIS_LEFT + (index / CHART_HOURS) * plotWidth;
    const y = (value) => CHART_AXIS_TOP + ((maxY - value) / maxY) * plotHeight;

    const truePoints = trueHourly.map((value, index) => ({
      index,
      value,
      x: x(index),
      y: y(value),
    }));

    const falsePoints = falseHourly.map((value, index) => ({
      index,
      value,
      x: x(index),
      y: y(value),
    }));

    const labels = Array.from({ length: CHART_HOURS + 1 }, (_, index) => {
      if (index === 0 || !publicationDate) return "Publikacja";
      const labelDate = new Date(publicationDate.getTime() + index * 3600000);
      return toHourLabel(labelDate);
    });

    return {
      yTicks,
      truePoints,
      falsePoints,
      trueTotal: trueHourly.reduce((sum, n) => sum + n, 0),
      falseTotal: falseHourly.reduce((sum, n) => sum + n, 0),
      labels,
      x,
      plotHeight,
    };
  }, [detailPost?.created_at, votes]);

  const isUnverifiedUi = totalVotesCount === 0;
  const statusTitle = isUnverifiedUi
    ? "NIEZWERYFIKOWANE"
    : statusInfo?.status_2 || statusInfo?.status_1 || "USTALANIE FAKTÓW";
  const statusSubtitle = isUnverifiedUi
    ? "Nikt jeszcze nie potwierdził tej informacji"
    : statusInfo?.status_1 || "Sprzeczne relacje";
  const truePercent =
    totalPointsCount > 0
      ? Math.round((truePointsTotal / totalPointsCount) * 100)
      : 0;
  const falsePercent =
    totalPointsCount > 0
      ? Math.round((falsePointsTotal / totalPointsCount) * 100)
      : 0;
  const statusTheme = getStatusTheme(statusTitle, statusSubtitle, truePercent);

  const toggleGroupTab = (type) => {
    setGroupTab((prev) => (prev === type ? "all" : type));
  };

  return (
    <View {...panResponder.panHandlers} style={styles.screen}>
      <ImageBackground
        source={{ uri: toAbsoluteMediaUrl(detailPost?.image_url) || fallbackBg }}
        style={styles.background}
      >
        <View style={styles.overlay}>
          <LinearGradient
            pointerEvents="none"
            colors={[
              "rgba(0,0,0,0.12)",
              "rgba(0,0,0,0.35)",
              "rgba(0,0,0,0.65)",
              "rgba(0,0,0,0.92)",
              "rgba(0,0,0,1)",
            ]}
            locations={[0, 0.32, 0.58, 0.84, 1]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.gradientOverlay}
          />

          <SafeAreaView style={styles.safeArea}>
            <ScrollView contentContainerStyle={styles.scrollContent}>
              <View style={styles.topRow}>
                <TouchableOpacity
                  onPress={() => navigation?.closeDrawer?.()}
                  style={styles.iconBtn}
                >
                  <Text style={styles.iconText}>←</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.iconBtn}>
                  <Text style={styles.iconText}>⋯</Text>
                </TouchableOpacity>
              </View>

              <View
                style={[
                  styles.statusPill,
                  { backgroundColor: statusTheme.bg, borderColor: statusTheme.border },
                ]}
              >
                <Text style={styles.statusTitle}>⚠ {statusTitle}</Text>
                <Text style={styles.statusSub}>{statusSubtitle}</Text>
              </View>

              <Text style={styles.title}>{detailPost?.text || "Szczegóły zgłoszenia"}</Text>

              <Text style={styles.subtitle}>
                {addressLabel || "Ustalanie lokalizacji..."}
                {` • ${formatRelativeTime(detailPost?.created_at)}`}
              </Text>

              {resolvedDescription.length > 0 ? (
                <View style={styles.descriptionBox}>
                  <Text
                    style={styles.description}
                    numberOfLines={isDescriptionExpanded ? undefined : 3}
                    onTextLayout={(e) => {
                      if (!isDescriptionExpanded) {
                        const linesCount = e?.nativeEvent?.lines?.length || 0;
                        if (linesCount > 3) {
                          setIsDescriptionTruncated(true);
                        }
                      }
                    }}
                  >
                    {resolvedDescription}
                  </Text>

                  {shouldShowDescriptionToggle && (
                    <TouchableOpacity
                      onPress={() => setIsDescriptionExpanded((prev) => !prev)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.moreLinkText}>
                        {isDescriptionExpanded ? "zwiń" : "więcej"}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                <Text style={styles.descriptionMuted}>Brak opisu</Text>
              )}

              <View style={styles.card}>
                <View style={styles.cardTitleRow}>
                  <Text style={styles.cardTitle}>Głosy w czasie</Text>
                  <Text style={styles.cardTitleRight}>Publikacja +12h</Text>
                </View>

                <View style={styles.chartArea}>
                  {chartData.yTicks.map((tick, idx) => {
                    const top = CHART_AXIS_TOP + (idx / 4) * chartData.plotHeight;

                    return (
                      <View key={`grid-${idx}`}>
                        <View style={[styles.gridLine, { top, left: CHART_AXIS_LEFT }]} />
                        <Text style={[styles.yLabel, { top: top - 7 }]}>{tick}</Text>
                      </View>
                    );
                  })}

                  {chartData.trueTotal > 0 &&
                    chartData.truePoints.slice(0, -1).map((p, i) => {
                      const p2 = chartData.truePoints[i + 1];
                      return (
                        <View
                          key={`true-line-${i}`}
                          style={segmentStyle(p.x, p.y, p2.x, p2.y, "#85e464")}
                        />
                      );
                    })}

                  {chartData.falseTotal > 0 &&
                    chartData.falsePoints.slice(0, -1).map((p, i) => {
                      const p2 = chartData.falsePoints[i + 1];
                      return (
                        <View
                          key={`false-line-${i}`}
                          style={segmentStyle(p.x, p.y, p2.x, p2.y, "#ff5f5f")}
                        />
                      );
                    })}

                  {chartData.trueTotal > 0 &&
                    chartData.truePoints.map((p, i) => (
                      <View
                        key={`true-dot-${i}`}
                        style={[styles.dot, styles.greenDot, { left: p.x - 4, top: p.y - 4 }]}
                      />
                    ))}

                  {chartData.falseTotal > 0 &&
                    chartData.falsePoints.map((p, i) => (
                      <View
                        key={`false-dot-${i}`}
                        style={[styles.dot, styles.redDot, { left: p.x - 4, top: p.y - 4 }]}
                      />
                    ))}

                  {chartData.labels.map((label, i) => (
                    <Text
                      key={`label-${i}`}
                      style={[
                        styles.timeLabel,
                        {
                          left: chartData.x(i) - (i === 0 ? 28 : 14),
                          width: i === 0 ? 58 : 30,
                        },
                        i === 0 && styles.timeLabelPublication,
                      ]}
                      numberOfLines={1}
                    >
                      {label}
                    </Text>
                  ))}
                </View>

                <View style={styles.statsRow}>
                  <Text style={styles.trueStat}>{truePercent}% PRAWDA</Text>
                  <Text style={styles.falseStat}>{falsePercent}% FAŁSZ</Text>
                </View>

                <Text style={styles.votesCount}>{totalVotesCount} głosów</Text>
              </View>

              <Text style={styles.onsiteText}>{onsiteCount} osób na miejscu</Text>

              <View style={styles.segmentTabs}>
                <TouchableOpacity
                  style={[styles.segmentBtn, groupTab === "confirms" && styles.segmentBtnGreen]}
                  onPress={() => toggleGroupTab("confirms")}
                >
                  <Text style={styles.segmentText}>Potwierdza ({trueCount})</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.segmentBtn, groupTab === "denies" && styles.segmentBtnRed]}
                  onPress={() => toggleGroupTab("denies")}
                >
                  <Text style={styles.segmentText}>Zaprzecza ({falseCount})</Text>
                </TouchableOpacity>
              </View>

              {groupTab === "all" && (
                <Text style={styles.allInfo}>Wszystkie komentarze ({normalizedVotes.length})</Text>
              )}

              <View style={styles.filterRow}>
                <TouchableOpacity onPress={() => setSortTab("credible")}> 
                  <Text style={[styles.filterChip, sortTab === "credible" && styles.filterChipActive]}>
                    Najbardziej wiarygodne
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setSortTab("onsite")}> 
                  <Text style={[styles.filterChip, sortTab === "onsite" && styles.filterChipActive]}>
                    Na miejscu
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setSortTab("newest")}> 
                  <Text style={[styles.filterChip, sortTab === "newest" && styles.filterChipActive]}>
                    Najnowsze
                  </Text>
                </TouchableOpacity>
              </View>

              {displayedVotes.map((item) => (
                <View key={item.id || `${item.user_id}-${item.created_at}`} style={styles.voteCard}>
                  <View
                    style={[
                      styles.voteHeader,
                      item.voteIsTrue ? styles.voteHeaderGreen : styles.voteHeaderRed,
                    ]}
                  >
                    <Text style={styles.voteHeaderText}>
                      {item.voteIsTrue ? "✔ POTWIERDZA" : "✖ ZAPRZECZA"}
                    </Text>
                  </View>

                  <View style={styles.voteBody}>
                    {(() => {
                      const directAvatar = toAbsoluteAvatarUrl(item.avatar_url);
                      const ownAvatar =
                        user && String(item.user_id) === String(user.id)
                          ? toAbsoluteAvatarUrl(myAvatarUrl)
                          : null;

                      const finalAvatar =
                        directAvatar ||
                        ownAvatar ||
                        "https://cdn-icons-png.flaticon.com/512/149/149071.png";

                      return (
                    <Image
                      source={{ uri: finalAvatar }}
                      style={styles.avatar}
                    />
                      );
                    })()}

                    <View style={{ flex: 1 }}>
                      <Text style={styles.authorLine}>
                        <Text style={styles.authorName}>{item.author}</Text>
                        <Text style={styles.authorMeta}> {item.isOnPlaceVerified ? "📍 Na miejscu" : ""}</Text>
                      </Text>
                      <Text style={styles.comment}>{item.comment}</Text>
                    </View>

                    <Text style={styles.time}>{item.createdLabel.replace(" temu", "")}</Text>
                  </View>
                </View>
              ))}

              {displayedVotes.length === 0 && (
                <Text style={styles.emptyText}>Brak komentarzy dla wybranego filtra.</Text>
              )}
            </ScrollView>
          </SafeAreaView>
        </View>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000" },
  background: { flex: 1 },
  overlay: { flex: 1 },
  gradientOverlay: { ...StyleSheet.absoluteFillObject },
  safeArea: { flex: 1 },
  scrollContent: { paddingHorizontal: 14, paddingBottom: 26 },

  topRow: {
    marginTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  iconText: { color: "#fff", fontSize: 22, fontWeight: "800" },

  statusPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "rgba(164,16,30,0.95)",
    borderWidth: 1,
    borderColor: "#d95263",
    marginBottom: 10,
  },
  statusTitle: { color: "#fff", fontWeight: "800", fontSize: 15 },
  statusSub: { color: "#ffe5e5", fontWeight: "700", fontSize: 12 },

  title: {
    color: "#fff",
    fontSize: 28,
    lineHeight: 32,
    fontWeight: "900",
    marginBottom: 6,
  },
  description: {
    color: "#ececec",
    fontSize: 14,
    lineHeight: 18,
  },
  descriptionBox: {
    marginBottom: 6,
  },
  moreLinkText: {
    marginTop: 4,
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 13,
    alignSelf: "flex-end",
    textAlign: "right",
    textDecorationLine: "underline",
  },
  descriptionMuted: {
    color: "#b9b9b9",
    fontSize: 13,
    marginBottom: 6,
    fontStyle: "italic",
  },
  subtitle: {
    color: "#d5d5d5",
    fontSize: 13,
    marginBottom: 12,
  },
  allInfo: {
    color: "#d6d6d6",
    fontSize: 12,
    marginBottom: 8,
  },

  segmentTabs: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 8,
    backgroundColor: "rgba(0,0,0,0.35)",
    borderRadius: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.2)",
    padding: 4,
  },
  segmentBtn: {
    flex: 1,
    backgroundColor: "transparent",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    alignItems: "center",
  },
  segmentBtnGreen: {
    borderBottomWidth: 2,
    borderBottomColor: "#7ee471",
    backgroundColor: "rgba(60,145,60,0.35)",
  },
  segmentBtnRed: {
    borderBottomWidth: 2,
    borderBottomColor: "#ff8b8b",
    backgroundColor: "rgba(165,44,44,0.35)",
  },
  segmentText: { color: "#fff", fontWeight: "700", fontSize: 12 },

  onsiteText: { color: "#f0f0f0", fontWeight: "700", marginBottom: 8 },
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  filterChip: {
    color: "#ddd",
    fontSize: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  filterChipActive: {
    color: "#fff",
    borderWidth: 1,
    borderColor: "#c4ff79",
    backgroundColor: "rgba(72,92,40,0.45)",
    overflow: "hidden",
  },

  card: {
    backgroundColor: "rgba(18,20,30,0.75)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    padding: 14,
    marginBottom: 16,
  },
  cardTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  cardTitle: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "700",
  },
  cardTitleRight: {
    color: "#d0d0d0",
    fontSize: 17,
  },
  chartArea: {
    height: CHART_HEIGHT,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.03)",
    overflow: "hidden",
    marginBottom: 14,
    position: "relative",
  },
  gridLine: {
    position: "absolute",
    left: CHART_AXIS_LEFT,
    right: 0,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  yLabel: {
    position: "absolute",
    left: 2,
    width: CHART_AXIS_LEFT - 6,
    textAlign: "right",
    color: "#bfbfbf",
    fontSize: 10,
  },
  dot: {
    position: "absolute",
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  greenDot: {
    backgroundColor: "#87e76b",
  },
  redDot: {
    backgroundColor: "#ff6666",
  },
  timeLabel: {
    position: "absolute",
    bottom: 6,
    color: "#bfbfbf",
    fontSize: 9,
    textAlign: "center",
  },
  timeLabelPublication: {
    fontSize: 8,
    color: "#d6d6d6",
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  trueStat: {
    color: "#9bef74",
    fontSize: 19,
    fontWeight: "800",
  },
  falseStat: {
    color: "#ff6c6c",
    fontSize: 19,
    fontWeight: "800",
  },
  votesCount: {
    textAlign: "center",
    color: "#f4f4f4",
    fontSize: 17,
    fontWeight: "700",
  },

  voteCard: {
    backgroundColor: "rgba(15,16,22,0.78)",
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    marginBottom: 10,
  },
  voteHeader: { paddingHorizontal: 10, paddingVertical: 6 },
  voteHeaderGreen: { backgroundColor: "rgba(70,155,70,0.9)" },
  voteHeaderRed: { backgroundColor: "rgba(185,55,55,0.9)" },
  voteHeaderText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  voteBody: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  avatar: { width: 38, height: 38, borderRadius: 19, marginRight: 9 },
  authorLine: { marginBottom: 3 },
  authorName: { color: "#fff", fontWeight: "700", fontSize: 14 },
  authorMeta: { color: "#c7e6c7", fontSize: 11 },
  comment: { color: "#ececec", fontSize: 13, lineHeight: 17 },
  time: { color: "#bbb", fontSize: 11, marginLeft: 8, marginTop: 2 },
  emptyText: { color: "#c6c6c6", textAlign: "center", marginTop: 12 },
});