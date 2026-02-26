/**
 * Push notification registration for Expo.
 *
 * Requests permission, obtains the Expo push token, and registers it
 * with the Project Knox API so the server can target this device.
 */

import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import { Platform } from 'react-native'

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001'

// How to display notifications while the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
})

/**
 * Request permission and register this device for push notifications.
 * Sends the Expo push token to the API if `jwtToken` is provided (user is logged in).
 *
 * Safe to call on every app start — silently no-ops on simulators.
 */
export async function registerForPushNotifications(jwtToken: string | null): Promise<void> {
  // Push notifications only work on real devices
  if (!Device.isDevice) {
    return
  }

  // Set up Android notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Project Knox',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#1e3a8a',
    })
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync()
  let finalStatus = existingStatus

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }

  if (finalStatus !== 'granted') {
    console.log('[Notifications] Permission not granted')
    return
  }

  try {
    const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync({
      projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID,
    })

    // Only register with the API when the user is authenticated
    if (jwtToken && expoPushToken) {
      await fetch(`${API_URL}/api/users/me/push-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwtToken}`,
        },
        body: JSON.stringify({
          token: expoPushToken,
          platform: Platform.OS,
        }),
      })
    }
  } catch (err) {
    // Don't crash the app on push registration failure
    console.warn('[Notifications] Push registration failed:', err)
  }
}
