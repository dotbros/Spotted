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
import RegisterDetailsScreen from "../screens/RegisterDetailsScreen";
import MyPostsScreen from "../screens/MyPostsScreen";
import MapPickerScreen from "../screens/MapPickerScreen";
import NotificationsScreen from "../screens/NotificationsScreen";

const Drawer = createDrawerNavigator();
const RightDrawer = createDrawerNavigator();

/*
KOŃCOWA ARCHITEKTURA:

RightDrawer (DETAILS)
        ↕
LeftDrawer (MENU + MAIN)

Czyli:
[1 MENU] <-> [2 MAIN] <-> [3 DETAILS]
*/

function LeftDrawerNavigator() {
  const screenWidth = Dimensions.get("window").width;

  return (
    <Drawer.Navigator
      drawerContent={(props) => (
        <UserDrawerContent {...props} />
      )}
      screenOptions={{
        headerShown: false,
        swipeEnabled: true,
        swipeEdgeWidth: screenWidth, // pełny ekran dla MENU
        drawerType: "slide",
        drawerPosition: "left",
        gestureHandlerProps: {
          activeOffsetX: [-1000, 10], // aktywuj głównie przy swipe w prawo
        },
        drawerStyle: {
          backgroundColor: "#111",
          width: "80%",
        },
      }}
    >
      <Drawer.Screen name="Feed" component={FeedScreen} />
      <Drawer.Screen name="Profile" component={ProfileScreen} />
      <Drawer.Screen name="MyPosts" component={MyPostsScreen} />
      <Drawer.Screen name="Notifications" component={NotificationsScreen} />
      <Drawer.Screen name="MapPicker" component={MapPickerScreen} />
    </Drawer.Navigator>
  );
}

export default function AppNavigator() {
  const screenWidth = Dimensions.get("window").width;

  return (
    <NavigationContainer>
      <RightDrawer.Navigator
        screenOptions={{
          headerShown: false,
          swipeEnabled: true,
          swipeEdgeWidth: screenWidth, // pełny ekran dla DETAILS
          drawerType: "slide",
          drawerPosition: "right",
          gestureHandlerProps: {
            activeOffsetX: [-10, 1000], // aktywuj głównie przy swipe w lewo
          },
          overlayColor: "transparent",
          drawerStyle: {
            width: "100%",
            backgroundColor: "#000",
          },
        }}
        drawerContent={(props) => <PostDetailsScreen {...props} />}
      >
        <RightDrawer.Screen name="Main" component={LeftDrawerNavigator} />
        <RightDrawer.Screen name="Login" component={LoginScreen} />
        <RightDrawer.Screen name="RegisterDetails" component={RegisterDetailsScreen} />
      </RightDrawer.Navigator>
    </NavigationContainer>
  );
}
