import React from 'react';
import { Tabs } from 'expo-router';
import { useColorScheme } from '@/components/useColorScheme';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';
import { Briefcase, CheckSquare, DollarSign, Users } from 'lucide-react-native';

import Colors from '@/constants/Colors';

function TabBarIcon({ Icon, color, size = 24 }: {
  Icon: any;
  color: string;
  size?: number;
}) {
  return <Icon size={size} color={color} style={{ marginBottom: -3 }} />;
}

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        tabBarInactiveTintColor: Colors[colorScheme ?? 'light'].tabIconDefault,
        headerShown: useClientOnlyValue(false, true),
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Job Cards',
          tabBarIcon: ({ color }) => <TabBarIcon Icon={Briefcase} color={color} />,
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: 'Tasks',
          tabBarIcon: ({ color }) => <TabBarIcon Icon={CheckSquare} color={color} />,
        }}
      />
      <Tabs.Screen
        name="finance"
        options={{
          title: 'Finance',
          tabBarIcon: ({ color }) => <TabBarIcon Icon={DollarSign} color={color} />,
        }}
      />
      <Tabs.Screen
        name="hr"
        options={{
          title: 'HR',
          tabBarIcon: ({ color }) => <TabBarIcon Icon={Users} color={color} />,
        }}
      />
    </Tabs>
  );
}
