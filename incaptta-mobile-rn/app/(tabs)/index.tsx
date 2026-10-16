import React, { useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { useJobCardsStore } from '@/stores/jobCardsStore';
import Card from '@/components/Card';
import Header from '@/components/Header';

export default function JobCardsScreen() {
  const { jobCards, loading, error, subscribeToJobCards } = useJobCardsStore();

  useEffect(() => {
    const unsubscribe = subscribeToJobCards();
    return () => {
      unsubscribe();
    };
  }, [subscribeToJobCards]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return '#999';
      case 'SUBMITTED':
        return '#FFA500';
      case 'APPROVED':
        return '#00A63E';
      case 'COMPLETED':
        return '#2196F3';
      case 'REJECTED':
        return '#FF4444';
      default:
        return '#999';
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount || 0);
  };

  const renderJobCard = ({ item }: { item: any }) => (
    <TouchableOpacity onPress={() => router.push(`/job-details/${item.id}`)}>
      <Card elevation="md" style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.jobNumber}>{item.jobNumber}</Text>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
            <Text style={styles.statusText}>{item.status}</Text>
          </View>
        </View>
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.client}>{item.client}</Text>
        <View style={styles.financialRow}>
          <View style={styles.financialItem}>
            <Text style={styles.financialLabel}>Revenue</Text>
            <Text style={styles.financialValue}>{formatCurrency(item.totalRevenue)}</Text>
          </View>
          <View style={styles.financialItem}>
            <Text style={styles.financialLabel}>Net Profit</Text>
            <Text style={[styles.financialValue, { color: (item.netProfit || 0) >= 0 ? '#00A63E' : '#FF4444' }]}>
              {formatCurrency(item.netProfit)}
            </Text>
          </View>
        </View>
      </Card>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Header title="Job Cards" />
      <FlatList
        data={jobCards}
        renderItem={renderJobCard}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={subscribeToJobCards}
            tintColor="#00A63E"
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No job cards found</Text>
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
    alignItems: 'center',
    marginBottom: 8,
  },
  jobNumber: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  client: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  financialRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    paddingTop: 12,
  },
  financialItem: {
    flex: 1,
  },
  financialLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  financialValue: {
    fontSize: 16,
    fontWeight: 'bold',
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
