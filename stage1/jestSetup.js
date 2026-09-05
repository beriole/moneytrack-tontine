// jestSetup.js
import "react-native-gesture-handler/jestSetup";
import { NativeModules } from "react-native";

// Supprimer les warnings Animated
jest.mock("react-native/Libraries/Animated/NativeAnimatedHelper");

// Mock des modules manquants
NativeModules.SettingsManager = {};
NativeModules.PushNotificationManager = {};
NativeModules.Clipboard = {};
