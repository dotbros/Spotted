import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  PanResponder,
  TextInput,
  Alert,
} from "react-native";
import { DrawerContentScrollView } from "@react-navigation/drawer";
import { useFocusEffect } from "@react-navigation/native";
import { AuthContext } from "../context/AuthContext";
import { API_URL } from "../../config";

export default function UserDrawerContent(props) {
  const { user, token, logout, login } = useContext(AuthContext);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [profileData, setProfileData] = useState(null);
  const [userStats, setUserStats] = useState({
    posts: 0,
    votes: 0,
    rank: "NOWY",
    points: 0,
  });
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  useEffect(() => {
    // Przy zmianie konta czyścimy lokalny stan drawer'a,
    // aby nie migały dane poprzedniego użytkownika.
    setAvatarUrl(null);
    setProfileData(null);
    setUserStats({ posts: 0, votes: 0, rank: "NOWY", points: 0 });
    setUnreadNotifications(0);
  }, [token]);

  const loadDrawerData = useCallback(async () => {
    if (!token) {
      setAvatarUrl(null);
      setProfileData(null);
      setUserStats({ posts: 0, votes: 0, rank: "NOWY", points: 0 });
      setUnreadNotifications(0);
      return;
    }

    try {
      const [profileResult, postsResult, notificationsResult] = await Promise.allSettled([
        fetch(`${API_URL}/user/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_URL}/posts/mine`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_URL}/notifications`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      let profileJson = null;
      if (profileResult.status === "fulfilled") {
        try {
          profileJson = await profileResult.value.json();
        } catch {}
      }

      let postsJson = null;
      if (postsResult.status === "fulfilled") {
        try {
          postsJson = await postsResult.value.json();
        } catch {}
      }

      let notificationsJson = null;
      if (notificationsResult.status === "fulfilled") {
        try {
          notificationsJson = await notificationsResult.value.json();
        } catch {}
      }

      if (profileJson) {
        setAvatarUrl(profileJson?.avatar_url || null);
        setProfileData(profileJson || null);
      }

      const summary = postsJson?.summary || {};
      const trueVotes = Number(summary.total_true_votes || 0);
      const falseVotes = Number(summary.total_false_votes || 0);

      setUserStats((prev) => ({
        posts: Number(summary.total_posts || prev.posts || 0),
        votes: trueVotes + falseVotes,
        rank: profileJson?.rank || prev.rank || "NOWY",
        points: Number(profileJson?.points ?? prev.points ?? 0),
      }));

      if (Array.isArray(notificationsJson)) {
        const unreadCount = notificationsJson.filter((n) => !n?.is_read).length;
        setUnreadNotifications(unreadCount);
      }
    } catch (e) {
      console.log("Drawer load error:", e);
    }
  }, [token]);

  useEffect(() => {
    loadDrawerData();
  }, [loadDrawerData]);

  useEffect(() => {
    const unsub = props.navigation.addListener("drawerOpen", loadDrawerData);
    return unsub;
  }, [props.navigation, loadDrawerData]);

  useEffect(() => {
    if (!token) return;

    const interval = setInterval(() => {
      loadDrawerData();
    }, 5000);

    return () => clearInterval(interval);
  }, [token, loadDrawerData]);

  useFocusEffect(
    useCallback(() => {
      loadDrawerData();
    }, [loadDrawerData])
  );

  const lineProgress = (index, points) => {
    const current = RANK_STEPS[index];
    const next = RANK_STEPS[index + 1];
    if (!current || !next) return 0;
    const range = next.min - current.min;
    if (range <= 0) return 0;
    const value = (points - current.min) / range;
    return Math.max(0, Math.min(1, value));
  };

  const closeMenuPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > Math.abs(gesture.dy) &&
          Math.abs(gesture.dx) > 8,
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dx < -40) {
            props.navigation.closeDrawer();
          }
        },
      }),
    [props.navigation]
  );

  return (
    <DrawerContentScrollView
      {...props}
      {...closeMenuPanResponder.panHandlers}
      contentContainerStyle={styles.container}
    >
      <View style={styles.profileSection}>
        <Image
          source={
            avatarUrl
              ? { uri: `${API_URL}${avatarUrl}` }
              : { uri: "https://cdn-icons-png.flaticon.com/512/149/149071.png" }
          }
          style={styles.avatar}
        />
        {user ? (
          <View style={styles.userInfoBox}>
            <Text style={styles.name}>
              {profileData?.pseudonym || profileData?.nickname || user.pseudonym || user.nickname || user.email || user.phone}
            </Text>
            <Text style={styles.userMeta}>opublikowanych postów: {userStats.posts}</Text>
            <Text style={styles.userMeta}>zebranych głosów do postów: {userStats.votes}</Text>
            <Text style={styles.userMeta}>ranga: {userStats.rank}</Text>
          </View>
        ) : (
          <Text style={styles.name}>Witaj!</Text>
        )}
      </View>

      {user && (
        <>
          <TouchableOpacity style={styles.logoutTopBtn} onPress={logout}>
            <Text style={styles.logoutTopText}>⎋ Wyloguj</Text>
          </TouchableOpacity>

          <View style={styles.rankProgressWrap}>
            <View style={styles.rankRow}>
              {RANK_STEPS.map((step, index) => {
                const activeNode = userStats.points >= step.min;
                const progress = lineProgress(index, userStats.points);

                return (
                  <View
                    key={step.key}
                    style={[
                      styles.rankStepGroup,
                      index === RANK_STEPS.length - 1 && styles.rankStepGroupLast,
                    ]}
                  >
                    <View style={[styles.rankNode, activeNode && styles.rankNodeActive]}>
                      <Text style={[styles.rankNodeIcon, activeNode && styles.rankNodeIconActive]}>
                        {step.icon}
                      </Text>
                    </View>

                    {index < RANK_STEPS.length - 1 && (
                      <View style={styles.rankLineWrap}>
                        <View style={styles.rankLineBg} />
                        <View
                          style={[
                            styles.rankLineFill,
                            { width: `${Math.round(progress * 100)}%` },
                          ]}
                        />
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
            <Text style={styles.rankProgressText}>Punkty: {userStats.points}</Text>
          </View>
        </>
      )}

      {!user && (
        <>
          <Text style={styles.sectionTitle}>LOGOWANIE</Text>

          <View style={styles.loginPanel}>
            <TextInput
              value={identifier}
              onChangeText={setIdentifier}
              placeholder="E-mail lub numer telefonu"
              placeholderTextColor="#8e8e8e"
              autoCapitalize="none"
              style={styles.loginInput}
            />
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Hasło"
              placeholderTextColor="#8e8e8e"
              secureTextEntry
              style={styles.loginInput}
            />

            <TouchableOpacity
              style={styles.loginBtn}
              onPress={async () => {
                try {
                  await login(identifier, password);
                  props.navigation.closeDrawer();
                } catch (err) {
                  Alert.alert("Błąd", err?.message || "Nie udało się zalogować");
                }
              }}
            >
              <Text style={styles.loginBtnText}>Zaloguj się</Text>
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

          <View style={{ flex: 1 }} />

          <TouchableOpacity
            style={styles.createAccountBtn}
            onPress={() => props.navigation.navigate("RegisterDetails")}
          >
            <Text style={styles.createAccountText}>Utwórz nowe konto</Text>
          </TouchableOpacity>
        </>
      )}

      {user && (
        <>
          <View style={styles.topSectionDivider} />
          <Text style={styles.sectionTitle}>MENU</Text>
          <MenuItem label="Profil" onPress={() => props.navigation.navigate("Profile")} />
          <MenuItem label="Moje posty" onPress={() => props.navigation.navigate("MyPosts")} />
          <MenuItem
            label="Powiadomienia"
            badgeCount={unreadNotifications}
            onPress={() => props.navigation.navigate("Notifications")}
          />
          <MenuItem label="Moi znajomi" />
        </>
      )}
    </DrawerContentScrollView>
  );
}

function MenuItem({ label, onPress, badgeCount = 0 }) {
  return (
    <TouchableOpacity style={styles.menuItem} onPress={onPress}>
      <View style={styles.menuItemInline}>
        <Text style={styles.menuText}>{label}</Text>
        {badgeCount > 0 && (
          <View style={styles.badgeInline}>
            <Text style={styles.badgeText}>{badgeCount > 99 ? "99+" : badgeCount}</Text>
          </View>
        )}
      </View>
      {badgeCount > 0 && (
        <View style={styles.badgeOverlap} pointerEvents="none" />
      )}
    </TouchableOpacity>
  );
}

const GREEN = "#296f2a";

const RANK_STEPS = [
  { key: "NOWY", min: 0, icon: "●" },
  { key: "CZŁONEK", min: 100, icon: "◆" },
  { key: "WERYFIKATOR", min: 500, icon: "✓" },
  { key: "REPORTER", min: 1500, icon: "✦" },
  { key: "EKSPERT", min: 5000, icon: "★" },
];

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#141414",
    paddingLeft: 20,
    paddingRight: 40,
  },
  profileSection: {
    marginTop: 26,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    position: "relative",
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: 0,
  },
  name: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "600",
    marginBottom: 6,
  },
  userInfoBox: {
    flex: 1,
    marginLeft: 12,
    paddingRight: 4,
  },
  userMeta: {
    color: "#b9b9b9",
    fontSize: 12,
    lineHeight: 17,
  },
  sectionTitle: {
    color: "#888",
    fontSize: 12,
    marginTop: 10,
    marginBottom: 10,
    textAlign: "center",
  },
  loginPanel: {
    padding: 10,
  },
  loginInput: {
    backgroundColor: "#1f1f1f",
    color: "#fff",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 12,
  },
  loginBtn: {
    backgroundColor: GREEN,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  loginBtnText: {
    color: "#fff",
    fontWeight: "700",
  },
  forgotText: {
    color: "#7da7ff",
    marginTop: 10,
    textAlign: "center",
  },
  createAccountBtn: {
    backgroundColor: "#141414",
    borderColor: GREEN,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 20,
  },
  createAccountText: {
    color: GREEN,
    fontWeight: "700",
  },
  menuItem: {
    paddingVertical: 12,
    alignSelf: "flex-start",
  },
  menuItemInline: {
    flexDirection: "row",
    alignItems: "center",
  },
  menuText: {
    color: "#fff",
    fontSize: 16,
  },
  logoutTopBtn: {
    position: "absolute",
    top: 3,
    right: 3,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  logoutTopText: {
    color: "#ff6b6b",
    fontWeight: "700",
    fontSize: 13,
  },
  rankProgressWrap: {
    marginBottom: 14,
    paddingTop: 2,
    marginHorizontal: 6,
  },
  rankRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  rankStepGroup: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  rankStepGroupLast: {
    flex: 0,
  },
  rankNode: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#666",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#141414",
  },
  rankNodeActive: {
    borderColor: GREEN,
  },
  rankNodeIcon: {
    color: "#8e8e8e",
    fontSize: 10,
    fontWeight: "700",
  },
  rankNodeIconActive: {
    color: GREEN,
  },
  rankLineWrap: {
    flex: 1,
    height: 4,
    marginHorizontal: 4,
    justifyContent: "center",
  },
  rankLineBg: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: "#666",
    borderRadius: 2,
  },
  rankLineFill: {
    height: 2,
    backgroundColor: GREEN,
    borderRadius: 2,
  },
  rankProgressText: {
    color: "#9a9a9a",
    fontSize: 12,
    marginTop: 8,
    textAlign: "center",
  },
  topSectionDivider: {
    height: 1,
    backgroundColor: "#2a2a2a",
    marginTop: 4,
    marginBottom: 10,
  },
  badgeInline: {
    marginLeft: -2,
    marginTop: -10,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#d83131",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  badgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  badgeOverlap: {
    position: "absolute",
    width: 0,
    height: 0,
  },
});