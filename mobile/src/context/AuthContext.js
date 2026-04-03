import React, { createContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const AuthContext = createContext();

const API_URL = "http://10.0.2.2:4000";

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [anonId, setAnonId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const storedToken = await AsyncStorage.getItem("token");
        const storedUser = await AsyncStorage.getItem("user");
        let storedAnonId = await AsyncStorage.getItem("anon_id");

        if (!storedAnonId) {
          storedAnonId = `anon_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
          await AsyncStorage.setItem("anon_id", storedAnonId);
        }

        setAnonId(storedAnonId);

        if (storedToken && storedUser) {
          setToken(storedToken);
          setUser(JSON.parse(storedUser));
        }
      } catch (err) {
        console.error("Auth load error:", err);
      } finally {
        setLoading(false);
      }
    };

    loadUser();
  }, []);

  const login = async (identifier, password) => {
    const prevAnonId = anonId || (await AsyncStorage.getItem("anon_id"));

    try {
      const keys = await AsyncStorage.getAllKeys();
      if (keys?.length) {
        await AsyncStorage.multiRemove(keys);
      }
    } catch {}

    if (prevAnonId) {
      await AsyncStorage.setItem("anon_id", prevAnonId);
      setAnonId(prevAnonId);
    }

    const res = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, password }),
    });

    const data = await res.json();

    if (res.ok) {
      setUser(data.user);
      setToken(data.token);

      await AsyncStorage.setItem("token", data.token);
      await AsyncStorage.setItem(
        "user",
        JSON.stringify(data.user)
      );
    } else {
      throw new Error(data.error);
    }
  };

  const register = async (payload) => {
    const {
      email,
      phone,
      password,
      nickname,
      pseudonym,
      first_name,
      last_name,
      profession,
      city,
      country,
    } = payload || {};

    const prevAnonId = anonId || (await AsyncStorage.getItem("anon_id"));

    try {
      const keys = await AsyncStorage.getAllKeys();
      if (keys?.length) {
        await AsyncStorage.multiRemove(keys);
      }
    } catch {}

    if (prevAnonId) {
      await AsyncStorage.setItem("anon_id", prevAnonId);
      setAnonId(prevAnonId);
    }

    const res = await fetch(`${API_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        phone,
        password,
        nickname,
        pseudonym,
        first_name,
        last_name,
      }),
    });

    const data = await res.json();

    if (res.ok) {
      setUser(data.user);
      setToken(data.token);

      if (data?.token) {
        try {
          await fetch(`${API_URL}/user/profile`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${data.token}`,
            },
            body: JSON.stringify({
              first_name,
              last_name,
              phone,
              profession,
              city,
              country,
              pseudonym,
            }),
          });
        } catch {}
      }

      await AsyncStorage.setItem("token", data.token);
      await AsyncStorage.setItem(
        "user",
        JSON.stringify(data.user)
      );
    } else {
      throw new Error(data.error);
    }
  };

  const logout = async () => {
    const prevAnonId = anonId || (await AsyncStorage.getItem("anon_id"));

    setUser(null);
    setToken(null);
    // Czyścimy dane sesji + pozostały cache aplikacji
    try {
      await AsyncStorage.removeItem("token");
      await AsyncStorage.removeItem("user");
      const keys = await AsyncStorage.getAllKeys();
      if (keys?.length) {
        await AsyncStorage.multiRemove(keys);
      }

      if (prevAnonId) {
        await AsyncStorage.setItem("anon_id", prevAnonId);
        setAnonId(prevAnonId);
      }
    } catch (err) {
      console.log("Logout storage cleanup error:", err);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        anonId,
        loading,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};