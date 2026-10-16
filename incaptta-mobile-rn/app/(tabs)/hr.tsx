import React, { useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { useHRStore } from '@/stores/hrStore';
import { useAuthStore } from '@/stores/authStore';
import Header from '@/components/Header';
import Card from '@/components/Card';

export default function HRScreen() {
  const { employees, loading, error, subscribeToEmployees } = useHRStore();
  const { user } = useAuthStore();

  useEffect(() => {
    const unsubscribe = subscribeToEmployees();
    return () => {
      unsubscribe();
    };
  }, [subscribeToEmployees]);

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin':
        return '#FF4444';
      case 'manager':
        return '#FFA500';
      case 'finance':
        return '#2196F3';
      case 'staff':
        return '#00A63E';
      default:
        return '#999';
    }
  };

  const renderEmployee = ({ item }: { item: any }) => (
    <Card elevation="md" style={styles.card}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.email}>{item.email}</Text>
        </View>
        <View style={[styles.roleBadge, { backgroundColor: getRoleColor(item.role) }]}>
          <Text style={styles.roleText}>{item.role}</Text>
        </View>
      </View>
      <View style={styles.cardFooter}>
        <Text style={styles.footerLabel}>Department:</Text>
        <Text style={styles.footerValue}>{item.department || 'N/A'}</Text>
      </View>
      {item.phone && (
        <View style={styles.cardFooter}>
          <Text style={styles.footerLabel}>Phone:</Text>
          <Text style={styles.footerValue}>{item.phone}</Text>
        </View>
      )}
    </Card>
  );

  return (
    <View style={styles.container}>
      <Header title="HR Directory" showNotifications={false} />
      <FlatList
        data={employees}
        renderItem={renderEmployee}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={subscribeToEmployees}
            tintColor="#00A63E"
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No employees found</Text>
          </View>
        }
      />
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  listContent: {
    padding: 16,
  },
  card: {
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  name: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  email: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  roleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
    textTransform: 'uppercase',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    paddingTop: 12,
  },
  footerLabel: {
    fontSize: 14,
    color: '#999',
  },
  footerValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
  },
  errorText: {
    fontSize: 14,
    color: '#FF4444',
    textAlign: 'center',
    padding: 16,
  },
});
