import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Card from '@/components/Card';
import Header from '@/components/Header';
import Button from '@/components/Button';
import ApprovalActions from '@/components/ApprovalActions';

export default function JobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [jobCard, setJobCard] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadJobCard();
  }, [id]);

  const loadJobCard = async () => {
    if (!id) return;

    try {
      setLoading(true);
      const docRef = doc(db, 'jobCards', id);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        setJobCard({
          id: docSnap.id,
          ...docSnap.data(),
          createdAt: docSnap.data().createdAt?.toDate() || new Date(),
          updatedAt: docSnap.data().updatedAt?.toDate() || new Date(),
          approvedAt: docSnap.data().approvedAt?.toDate() || undefined,
        });
      } else {
        setError('Job card not found');
      }
    } catch (err: any) {
      console.error('Error loading job card:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

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

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(date);
  };

  const handleStatusChange = (newStatus: string) => {
    setJobCard({ ...jobCard, status: newStatus, updatedAt: new Date() });
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#00A63E" />
      </View>
    );
  }

  if (error || !jobCard) {
    return (
      <View style={styles.container}>
        <Header title="Job Details" showBack={true} />
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>{error || 'Job card not found'}</Text>
          <Button onPress={() => router.back()} style={styles.backButton}>
            Go Back
          </Button>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Job Details" showBack={true} onBackPress={() => router.back()} />
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <Card elevation="md" style={styles.card}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.jobNumber}>{jobCard.jobNumber}</Text>
              <Text style={styles.title}>{jobCard.title}</Text>
              <Text style={styles.client}>{jobCard.client}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(jobCard.status) }]}>
              <Text style={styles.statusText}>{jobCard.status}</Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Description</Text>
            <Text style={styles.description}>{jobCard.description}</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Financial Summary</Text>
            <View style={styles.financialGrid}>
              <View style={styles.financialItem}>
                <Text style={styles.financialLabel}>IRD Revenue</Text>
                <Text style={styles.financialValue}>{formatCurrency(jobCard.irdRevenue)}</Text>
              </View>
              <View style={styles.financialItem}>
                <Text style={styles.financialLabel}>Net Profit</Text>
                <Text style={[styles.financialValue, { color: (jobCard.netProfit || 0) >= 0 ? '#00A63E' : '#FF4444' }]}>
                  {formatCurrency(jobCard.netProfit)}
                </Text>
              </View>
              <View style={styles.financialItem}>
                <Text style={styles.financialLabel}>TWID Amount</Text>
                <Text style={styles.financialValue}>{formatCurrency(jobCard.twidAmount)}</Text>
              </View>
              <View style={styles.financialItem}>
                <Text style={styles.financialLabel}>Total Revenue</Text>
                <Text style={styles.financialValue}>{formatCurrency(jobCard.totalRevenue)}</Text>
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Timeline</Text>
            <View style={styles.timelineItem}>
              <Text style={styles.timelineLabel}>Created:</Text>
              <Text style={styles.timelineValue}>{formatDate(jobCard.createdAt)}</Text>
            </View>
            <View style={styles.timelineItem}>
              <Text style={styles.timelineLabel}>Last Updated:</Text>
              <Text style={styles.timelineValue}>{formatDate(jobCard.updatedAt)}</Text>
            </View>
            {jobCard.approvedAt && (
              <View style={styles.timelineItem}>
                <Text style={styles.timelineLabel}>Approved:</Text>
                <Text style={styles.timelineValue}>{formatDate(jobCard.approvedAt)}</Text>
              </View>
            )}
            {jobCard.approvedBy && (
              <View style={styles.timelineItem}>
                <Text style={styles.timelineLabel}>Approved By:</Text>
                <Text style={styles.timelineValue}>{jobCard.approvedBy}</Text>
              </View>
            )}
          </View>

          <ApprovalActions
            itemId={jobCard.id}
            collection="jobCards"
            currentStatus={jobCard.status}
            onStatusChange={handleStatusChange}
          />
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
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  jobNumber: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  client: {
    fontSize: 16,
    color: '#666',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  section: {
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  description: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  financialGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -8,
  },
  financialItem: {
    width: '50%',
    paddingHorizontal: 8,
    marginBottom: 16,
  },
  financialLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  financialValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  timelineItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  timelineLabel: {
    fontSize: 14,
    color: '#666',
  },
  timelineValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  errorText: {
    fontSize: 16,
    color: '#FF4444',
    marginBottom: 16,
  },
  backButton: {
    minWidth: 120,
  },
});
