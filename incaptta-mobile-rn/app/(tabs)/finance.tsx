import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useFinanceStore } from '@/stores/financeStore';
import Header from '@/components/Header';
import Card from '@/components/Card';

export default function FinanceScreen() {
  const { opexList, fundTransfers, loading } = useFinanceStore();

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount || 0);
  };

  const totalOpex = opexList.reduce((sum, opex) => sum + (opex.amount || 0), 0);
  const totalTransfers = fundTransfers.reduce((sum, transfer) => sum + (transfer.amount || 0), 0);

  return (
    <View style={styles.container}>
      <Header title="Finance" showNotifications={false} />
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <Card elevation="md" style={styles.card}>
          <Text style={styles.cardTitle}>Financial Overview</Text>
          
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Total OpEx</Text>
              <Text style={styles.summaryValue}>{formatCurrency(totalOpex)}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Total Transfers</Text>
              <Text style={styles.summaryValue}>{formatCurrency(totalTransfers)}</Text>
            </View>
          </View>

          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Net Flow</Text>
              <Text style={[styles.summaryValue, { color: totalTransfers - totalOpex >= 0 ? '#00A63E' : '#FF4444' }]}>
                {formatCurrency(totalTransfers - totalOpex)}
              </Text>
            </View>
          </View>
        </Card>

        <Card elevation="md" style={styles.card}>
          <Text style={styles.cardTitle}>Recent Expenses</Text>
          {opexList.length === 0 ? (
            <Text style={styles.emptyText}>No expenses recorded</Text>
          ) : (
            opexList.slice(0, 5).map((opex) => (
              <View key={opex.id} style={styles.listItem}>
                <View style={styles.listItemMain}>
                  <Text style={styles.listItemTitle}>{opex.description}</Text>
                  <Text style={styles.listItemSubtitle}>{opex.category}</Text>
                </View>
                <Text style={styles.listItemAmount}>{formatCurrency(opex.amount)}</Text>
              </View>
            ))
          )}
        </Card>

        <Card elevation="md" style={styles.card}>
          <Text style={styles.cardTitle}>Recent Transfers</Text>
          {fundTransfers.length === 0 ? (
            <Text style={styles.emptyText}>No transfers recorded</Text>
          ) : (
            fundTransfers.slice(0, 5).map((transfer) => (
              <View key={transfer.id} style={styles.listItem}>
                <View style={styles.listItemMain}>
                  <Text style={styles.listItemTitle}>{transfer.description}</Text>
                  <Text style={styles.listItemSubtitle}>{transfer.fromAccount} → {transfer.toAccount}</Text>
                </View>
                <Text style={styles.listItemAmount}>{formatCurrency(transfer.amount)}</Text>
              </View>
            ))
          )}
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  card: {
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  summaryItem: {
    flex: 1,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  listItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  listItemMain: {
    flex: 1,
  },
  listItemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  listItemSubtitle: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  listItemAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#00A63E',
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    paddingVertical: 16,
  },
});
