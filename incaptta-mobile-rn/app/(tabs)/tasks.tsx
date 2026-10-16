import React, { useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity } from 'react-native';
import { useTasksStore } from '@/stores/tasksStore';
import { useAuthStore } from '@/stores/authStore';
import Card from '@/components/Card';
import Header from '@/components/Header';

export default function TasksScreen() {
  const { tasks, loading, error, subscribeToTasks, updateTaskStatus } = useTasksStore();
  const { user } = useAuthStore();

  useEffect(() => {
    if (user) {
      const unsubscribe = subscribeToTasks(user.uid);
      return () => {
        unsubscribe();
      };
    }
  }, [user, subscribeToTasks]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return '#999';
      case 'in_progress':
        return '#FFA500';
      case 'completed':
        return '#00A63E';
      default:
        return '#999';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'low':
        return '#2196F3';
      case 'medium':
        return '#FFA500';
      case 'high':
        return '#FF4444';
      default:
        return '#999';
    }
  };

  const formatDate = (date: Date) => {
    if (!date) return 'No due date';
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
    }).format(date);
  };

  const renderTask = ({ item }: { item: any }) => (
    <TouchableOpacity onPress={() => updateTaskStatus(item.id, item.status === 'completed' ? 'pending' : 'completed')}>
      <Card elevation="md" style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.priorityBadge, { backgroundColor: getPriorityColor(item.priority) }]}>
            <Text style={styles.priorityText}>{item.priority}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
            <Text style={styles.statusText}>{item.status}</Text>
          </View>
        </View>
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.description}>{item.description}</Text>
        <View style={styles.footer}>
          <Text style={styles.jobCard}>Job: {item.jobCardId}</Text>
          <Text style={styles.dueDate}>Due: {formatDate(item.dueDate)}</Text>
        </View>
      </Card>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Header title="My Tasks" showNotifications={false} />
      <FlatList
        data={tasks}
        renderItem={renderTask}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => user && subscribeToTasks(user.uid)}
            tintColor="#00A63E"
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No tasks assigned to you</Text>
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
    marginBottom: 12,
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  priorityText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFFFFF',
    textTransform: 'uppercase',
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
  description: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    paddingTop: 12,
  },
  jobCard: {
    fontSize: 12,
    color: '#999',
  },
  dueDate: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
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
