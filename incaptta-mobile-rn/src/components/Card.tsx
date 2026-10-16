import React from 'react';
import { View, StyleSheet, ViewStyle, Pressable } from 'react-native';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
  elevation?: 'sm' | 'md' | 'lg';
  padding?: number;
}

export default function Card({
  children,
  style,
  onPress,
  elevation = 'md',
  padding = 16,
}: CardProps) {
  const cardStyle: ViewStyle = {
    ...styles.card,
    ...styles[elevation],
    padding,
  };

  if (onPress) {
    return (
      <Pressable style={[cardStyle, style]} onPress={onPress}>
        {children}
      </Pressable>
    );
  }

  return <View style={[cardStyle, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
  },
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
});
