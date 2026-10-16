import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { z } from 'zod';
import Button from '@/components/Button';
import Input from '@/components/Input';
import Card from '@/components/Card';

const expenseSchema = z.object({
  description: z.string().min(1, 'Description is required'),
  category: z.string().min(1, 'Category is required'),
  amount: z.string().min(1, 'Amount is required').refine((val) => !isNaN(parseFloat(val)), {
    message: 'Amount must be a valid number',
  }),
});

type ExpenseFormData = z.infer<typeof expenseSchema>;

interface AddExpenseModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (expense: ExpenseFormData) => Promise<void>;
}

export default function AddExpenseModal({
  visible,
  onClose,
  onSubmit,
}: AddExpenseModalProps) {
  const [formData, setFormData] = useState<ExpenseFormData>({
    description: '',
    category: '',
    amount: '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof ExpenseFormData, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const categories = [
    'Materials',
    'Labor',
    'Transportation',
    'Equipment',
    'Utilities',
    'Other',
  ];

  const handleSubmit = async () => {
    // Reset errors
    setErrors({});

    // Validate with Zod
    const result = expenseSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof ExpenseFormData, string>> = {};
      result.error.errors.forEach((error) => {
        const field = error.path[0] as keyof ExpenseFormData;
        fieldErrors[field] = error.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(result.data);
      // Reset form
      setFormData({ description: '', category: '', amount: '' });
      onClose();
    } catch (error: any) {
      console.error('Error submitting expense:', error);
      alert('Failed to submit expense: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Add Expense</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.closeButton}>Cancel</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content}>
          <Card elevation="md" style={styles.card}>
            <Input
              label="Description"
              placeholder="Enter expense description"
              value={formData.description}
              onChangeText={(text) => setFormData({ ...formData, description: text })}
              error={errors.description}
            />

            <Input
              label="Category"
              placeholder="Select category"
              value={formData.category}
              onChangeText={(text) => setFormData({ ...formData, category: text })}
              error={errors.category}
            />

            <View style={styles.categorySection}>
              <Text style={styles.categoryLabel}>Quick Select:</Text>
              <View style={styles.categoryGrid}>
                {categories.map((category) => (
                  <TouchableOpacity
                    key={category}
                    style={[
                      styles.categoryChip,
                      formData.category === category && styles.categoryChipActive,
                    ]}
                    onPress={() => setFormData({ ...formData, category })}
                  >
                    <Text
                      style={[
                        styles.categoryChipText,
                        formData.category === category && styles.categoryChipTextActive,
                      ]}
                    >
                      {category}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <Input
              label="Amount"
              placeholder="0.00"
              value={formData.amount}
              onChangeText={(text) => setFormData({ ...formData, amount: text })}
              keyboardType="decimal-pad"
              error={errors.amount}
            />

            <Button
              onPress={handleSubmit}
              disabled={isSubmitting}
              variant="primary"
              style={styles.submitButton}
            >
              {isSubmitting ? 'Submitting...' : 'Submit Expense'}
            </Button>
          </Card>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#00A63E',
  },
  closeButton: {
    fontSize: 16,
    color: '#666',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  card: {
    padding: 16,
  },
  categorySection: {
    marginBottom: 16,
  },
  categoryLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
  },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#F5F5F5',
    marginHorizontal: 4,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  categoryChipActive: {
    backgroundColor: '#00A63E',
    borderColor: '#00A63E',
  },
  categoryChipText: {
    fontSize: 12,
    color: '#666',
  },
  categoryChipTextActive: {
    color: '#FFFFFF',
  },
  submitButton: {
    marginTop: 16,
  },
});
