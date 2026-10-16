import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Bell, User, ArrowLeft } from 'lucide-react-native';
import { useAuthStore } from '../stores/authStore';

interface HeaderProps {
  title?: string;
  showProfile?: boolean;
  showNotifications?: boolean;
  showBack?: boolean;
  onProfilePress?: () => void;
  onNotificationPress?: () => void;
  onBackPress?: () => void;
}

export default function Header({
  title = 'InCaptta',
  showProfile = true,
  showNotifications = true,
  showBack = false,
  onProfilePress,
  onNotificationPress,
  onBackPress,
}: HeaderProps) {
  const { profile } = useAuthStore();

  return (
    <View style={styles.container}>
      <View style={styles.leftContainer}>
        {showBack && (
          <Pressable
            style={styles.iconButton}
            onPress={onBackPress}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <ArrowLeft size={24} color="#00A63E" />
          </Pressable>
        )}
      </View>

      <View style={styles.titleContainer}>
        <Text style={styles.title}>{title}</Text>
      </View>

      <View style={styles.iconContainer}>
        {showNotifications && (
          <Pressable
            style={styles.iconButton}
            onPress={onNotificationPress}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Bell size={24} color="#00A63E" />
          </Pressable>
        )}
        {showProfile && (
          <Pressable
            style={styles.iconButton}
            onPress={onProfilePress}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <User size={24} color="#00A63E" />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  leftContainer: {
    width: 40,
  },
  titleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#00A63E',
  },
  iconContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: 80,
    justifyContent: 'flex-end',
  },
  iconButton: {
    padding: 4,
  },
});
