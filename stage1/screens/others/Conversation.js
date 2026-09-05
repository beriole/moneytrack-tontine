import React from 'react';
import { View, Text, FlatList, TouchableOpacity, Image, StyleSheet } from 'react-native';

const conversations = [
  {
    id: '1',
    name: 'Alice',
    lastMessage: 'Salut, comment tu vas ?',
    time: '14:32',
    avatar: 'https://i.pravatar.cc/150?img=1',
  },
  {
    id: '2',
    name: 'Bob',
    lastMessage: 'On se voit demain ?',
    time: '13:10',
    avatar: 'https://i.pravatar.cc/150?img=2',
  },
  {
    id: '3',
    name: 'Charlie',
    lastMessage: 'Merci beaucoup !',
    time: '11:45',
    avatar: 'https://i.pravatar.cc/150?img=3',
  },
];

export default function ConversationsScreen({ navigation }) {
  return (
    <View style={styles.container}>
      <Text style={styles.header}>Conversations</Text>
      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.conversationCard}
            onPress={() => navigation.navigate('Chat', { user: item })}
          >
            <Image source={{ uri: item.avatar }} style={styles.avatar} />
            <View style={styles.textContainer}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.lastMessage} numberOfLines={1}>
                {item.lastMessage}
              </Text>
            </View>
            <Text style={styles.time}>{item.time}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7f8fa', padding: 15 },
  header: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, color: '#222' },
  conversationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  avatar: { width: 50, height: 50, borderRadius: 25, marginRight: 12 },
  textContainer: { flex: 1 },
  name: { fontSize: 16, fontWeight: '600', color: '#333' },
  lastMessage: { fontSize: 14, color: '#777', marginTop: 2 },
  time: { fontSize: 12, color: '#aaa' },
});