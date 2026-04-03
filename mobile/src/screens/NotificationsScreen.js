import React, { useCallback, useContext, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  BackHandler,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { AuthContext } from "../context/AuthContext";
import { API_URL } from "../../config";

export default function NotificationsScreen({ navigation }) {
  const { token } = useContext(AuthContext);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadNotifications = useCallback(async () => {
    if (!token) {
      setItems([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/notifications`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      console.log("Notifications load error:", err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      loadNotifications();

      const onBackPress = () => {
        navigation.navigate("Feed");
        navigation.openDrawer();
        return true;
      };

      const sub = BackHandler.addEventListener("hardwareBackPress", onBackPress);
      return () => sub.remove();
    }, [loadNotifications, navigation])
  );

  const markAsRead = async (id) => {
    try {
      await fetch(`${API_URL}/notifications/${id}/read`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      setItems((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
    } catch (err) {
      console.log("Notification read error:", err);
    }
  };

  const markAllAsRead = async () => {
    try {
      await fetch(`${API_URL}/notifications/read-all`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch (err) {
      console.log("Notifications read-all error:", err);
    }
  };

  const deleteNotification = async (id) => {
    try {
      await fetch(`${API_URL}/notifications/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setItems((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      console.log("Notification delete error:", err);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="small" color="#222" />
        <Text style={styles.loadingText}>Ładowanie powiadomień...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Powiadomienia</Text>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => {
            navigation.navigate("Feed");
            navigation.openDrawer();
          }}
        >
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={markAllAsRead}>
          <Text style={styles.markAll}>Oznacz wszystkie jako przeczytane</Text>
        </TouchableOpacity>
      </View>

      {items.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>Brak powiadomień</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingBottom: 20 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              activeOpacity={0.8}
              style={[styles.card, !item.is_read && styles.cardUnread]}
              onPress={() => !item.is_read && markAsRead(item.id)}
            >
              <View style={styles.cardTopRow}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                {!item.is_read && <View style={styles.dot} />}
              </View>
              <Text style={styles.cardMessage}>{item.message}</Text>
              <TouchableOpacity
                onPress={() => deleteNotification(item.id)}
                style={styles.deleteBtn}
              >
                <Text style={styles.deleteBtnText}>Usuń</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingTop: 18,
  },
  headerRow: {
    marginBottom: 12,
    position: "relative",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 6,
    color: "#111",
  },
  markAll: {
    color: "#295fd1",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 2,
  },
  backBtn: {
    position: "absolute",
    right: 0,
    top: 0,
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#111",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  backBtnText: {
    color: "#111",
    fontSize: 20,
    fontWeight: "700",
    marginTop: -2,
  },
  card: {
    borderWidth: 1,
    borderColor: "#e2e2e2",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    backgroundColor: "#fafafa",
  },
  cardUnread: {
    borderColor: "#d1defc",
    backgroundColor: "#f4f8ff",
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  cardTitle: {
    fontWeight: "700",
    color: "#1d1d1d",
    flex: 1,
    marginRight: 8,
  },
  cardMessage: {
    color: "#2d2d2d",
    lineHeight: 19,
    fontSize: 13,
  },
  deleteBtn: {
    marginTop: 10,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#d83131",
  },
  deleteBtnText: {
    color: "#d83131",
    fontSize: 12,
    fontWeight: "700",
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#d83131",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: 8,
    color: "#666",
  },
  emptyText: {
    color: "#666",
  },
});
