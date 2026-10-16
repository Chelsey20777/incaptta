import React from 'react';
import { Pressable, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps {
  children: React.ReactNode;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export default function Button({
  children,
  onPress,
  variant = 'primary',
  disabled = false,
  style,
  textStyle,
}: ButtonProps) {
  const getButtonStyle = (): ViewStyle => {
    const baseStyle: ViewStyle = {
      ...styles.button,
      ...styles[variant],
    };

    if (disabled) {
      return {
        ...baseStyle,
        ...styles.disabled,
      };
    }

    return baseStyle;
  };

  const getTextStyle = (): TextStyle => {
    const baseStyle: TextStyle = {
      ...styles.buttonText,
      ...styles[`${variant}Text`],
    };

    if (disabled) {
      return {
        ...baseStyle,
        ...styles.disabledText,
      };
    }

    return baseStyle;
  };

  return (
    <Pressable
      style={[getButtonStyle(), style]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={[getTextStyle(), textStyle]}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  primary: {
    backgroundColor: '#00A63E',
  },
  primaryText: {
    color: '#FFFFFF',
  },
  secondary: {
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  secondaryText: {
    color: '#00A63E',
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  ghostText: {
    color: '#00A63E',
  },
  danger: {
    backgroundColor: '#FF4444',
  },
  dangerText: {
    color: '#FFFFFF',
  },
  disabled: {
    opacity: 0.5,
  },
  disabledText: {
    opacity: 0.5,
  },
});
