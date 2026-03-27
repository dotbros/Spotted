import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createDrawerNavigator } from "@react-navigation/drawer";
import { Dimensions } from "react-native";

import FeedScreen from "../screens/FeedScreen";
import ProfileScreen from "../screens/ProfileScreen";
import PostDetailsScreen from "../screens/PostDetailsScreen";
import UserDrawerContent from "../components/UserDrawerContent";
import LoginScreen from "../screens/LoginScreen";

const Stack = createNativeStackNavigator();
const Drawer = createDrawerNavigator();

function DrawerNavigator() {
  const screenWidth = Dimensions.get("window").width;

  return (
    <Drawer.Navigator
      drawerContent={(props) => (
        <UserDrawerContent {...props} />
      )}
      screenOptions={{
        headerShown: false,
        swipeEnabled: true,
        swipeEdgeWidth: screenWidth, // swipe z całej szerokości
        drawerType: "slide",
        drawerStyle: {
          backgroundColor: "#111",
          width: "80%",
        },
      }}
    >
      <Drawer.Screen name="Feed" component={FeedScreen} />
      <Drawer.Screen name="Profile" component={ProfileScreen} />
    </Drawer.Navigator>
  );
}

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Root" component={DrawerNavigator} />
        <Stack.Screen name="PostDetails" component={PostDetailsScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}