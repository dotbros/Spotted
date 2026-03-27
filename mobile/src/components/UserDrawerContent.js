import React, { useContext } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Switch,
} from "react-native";
import { DrawerContentScrollView } from "@react-navigation/drawer";
import { AuthContext } from "../context/AuthContext";

export default function UserDrawerContent(props) {
  const { user, logout } = useContext(AuthContext);

  return (
    <DrawerContentScrollView
      {...props}
      contentContainerStyle={styles.container}
    >
      <View style={styles.profileSection}>
        <Image
          source={{
            uri: "https://i.pravatar.cc/150?img=32",
          }}
          style={styles.avatar}
        />
        {user ? (
          <Text style={styles.name}>
            {user.nickname || user.email}
          </Text>
        ) : (
          <TouchableOpacity
            onPress={() => {
              props.navigation.navigate("Login");
            }}
          >
            <Text style={[styles.name, { color: "#c00" }]}>
              Zaloguj się
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.sectionTitle}>MENU</Text>

      {user && <MenuItem label="Profil" />}
      <MenuItem label="Historia" />
      <MenuItem label="Moje posty" />
      <MenuItem label="Powiadomienia" />
      <MenuItem label="Ulubione" />
      <MenuItem label="Zaproś znajomych" />
      <MenuItem label="Szukaj" />

      <View style={styles.separator} />
      {user && (
        <TouchableOpacity
          style={styles.menuItem}
          onPress={logout}
        >
          <Text style={[styles.menuText, { color: "#c00" }]}>
            Wyloguj
          </Text>
        </TouchableOpacity>
      )}

      <Text style={styles.sectionTitle}>
        USTAWIENIA I WSPARCIE
      </Text>

      <MenuItem label="Ustawienia prywatności" />
      <MenuItem label="Centrum pomocy" />

      <View style={styles.darkModeRow}>
        <Text style={styles.menuText}>
          Styl ciemny
        </Text>
        <Switch value={true} />
      </View>
    </DrawerContentScrollView>
  );
}

function MenuItem({ label }) {
  return (
    <TouchableOpacity style={styles.menuItem}>
      <Text style={styles.menuText}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#111",
    paddingLeft: 20,
    paddingRight: 40, // większy odstęp od prawej krawędzi
  },
  profileSection: {
    alignItems: "center",
    marginVertical: 30,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: 15,
  },
  name: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
  sectionTitle: {
    color: "#888",
    fontSize: 12,
    marginTop: 20,
    marginBottom: 10,
  },
  menuItem: {
    paddingVertical: 12,
  },
  menuText: {
    color: "#fff",
    fontSize: 16,
  },
  separator: {
    height: 1,
    backgroundColor: "#222",
    marginVertical: 20,
  },
  darkModeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
  },
});