import React from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { updateDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthStore } from '../stores/authStore';
import Button from './Button';

interface ApprovalActionsProps {
  itemId: string;
  collection: 'jobCards' | 'opex' | 'fundTransfers';
  currentStatus: string;
  onStatusChange?: (newStatus: string) => void;
}

export default function ApprovalActions({
  itemId,
  collection,
  currentStatus,
  onStatusChange,
}: ApprovalActionsProps) {
  const { profile, hasRole } = useAuthStore();

  const canApprove = hasRole('manager') || hasRole('finance') || hasRole('admin');
  const isCreator = profile?.uid; // Would need to compare with createdBy field

  const handleApprove = async () => {
    try {
      const docRef = doc(db, collection, itemId);
      await updateDoc(docRef, {
        status: 'APPROVED',
        approvedBy: profile?.uid,
        approvedAt: new Date(),
        updatedAt: new Date(),
      });

      onStatusChange?.('APPROVED');
      Alert.alert('Success', 'Item has been approved');
    } catch (error: any) {
      console.error('Error approving item:', error);
      Alert.alert('Error', 'Failed to approve item');
    }
  };

  const handleReject = async () => {
    Alert.prompt(
      'Reject Item',
      'Please provide a reason for rejection:',
      async (reason) => {
        if (!reason) return;

        try {
          const docRef = doc(db, collection, itemId);
          await updateDoc(docRef, {
            status: 'REJECTED',
            rejectionReason: reason,
            approvedBy: profile?.uid,
            approvedAt: new Date(),
            updatedAt: new Date(),
          });

          onStatusChange?.('REJECTED');
          Alert.alert('Success', 'Item has been rejected');
        } catch (error: any) {
          console.error('Error rejecting item:', error);
          Alert.alert('Error', 'Failed to reject item');
        }
      },
      'plain-text'
    );
  };

  const handleSubmit = async () => {
    try {
      const docRef = doc(db, collection, itemId);
      await updateDoc(docRef, {
        status: 'SUBMITTED',
        updatedAt: new Date(),
      });

      onStatusChange?.('SUBMITTED');
      Alert.alert('Success', 'Item has been submitted for approval');
    } catch (error: any) {
      console.error('Error submitting item:', error);
      Alert.alert('Error', 'Failed to submit item');
    }
  };

  const handleComplete = async () => {
    try {
      const docRef = doc(db, collection, itemId);
      await updateDoc(docRef, {
        status: 'COMPLETED',
        updatedAt: new Date(),
      });

      onStatusChange?.('COMPLETED');
      Alert.alert('Success', 'Item has been marked as completed');
    } catch (error: any) {
      console.error('Error completing item:', error);
      Alert.alert('Error', 'Failed to complete item');
    }
  };

  if (currentStatus === 'DRAFT') {
    return (
      <View style={styles.container}>
        <Button onPress={handleSubmit} variant="primary" style={styles.button}>
          Submit for Approval
        </Button>
      </View>
    );
  }

  if (currentStatus === 'SUBMITTED' && canApprove) {
    return (
      <View style={styles.container}>
        <Button onPress={handleApprove} variant="primary" style={styles.button}>
          Approve
        </Button>
        <Button onPress={handleReject} variant="danger" style={styles.button}>
          Reject
        </Button>
      </View>
    );
  }

  if (currentStatus === 'APPROVED' && canApprove) {
    return (
      <View style={styles.container}>
        <Button onPress={handleComplete} variant="primary" style={styles.button}>
          Mark as Completed
        </Button>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  button: {
    flex: 1,
  },
});
