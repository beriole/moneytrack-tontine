  import React, { useState } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

export default function ChatScreen({ route }) {
  const user  = {
    id: '1',
    name: 'Alice',
    lastMessage: 'Salut, comment tu vas ?',
    time: '14:32',
    avatar: 'https://i.pravatar.cc/150?img=1',
  };

  const [messages, setMessages] = useState([
    { id: '1', text: 'Salut 👋', sender: 'me' },
    { id: '2', text: 'Hey ! Comment ça va ?', sender: 'other' },
    { id: '3', text: 'Très bien et toi ?', sender: 'me' },
  ]);

  const [input, setInput] = useState('');

  const sendMessage = () => {
    if (input.trim()) {
      setMessages([...messages, { id: Date.now().toString(), text: input, sender: 'me' }]);
      setInput('');
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Text style={styles.headerText}>{user.name}</Text>
      </View>

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        style={styles.messagesList}
        renderItem={({ item }) => (
          <View
            style={[
              styles.messageBubble,
              item.sender === 'me' ? styles.myMessage : styles.otherMessage,
            ]}
          >
            <Text style={styles.messageText}>{item.text}</Text>
          </View>
        )}
      />

      {/* Input */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Écrire un message..."
          placeholderTextColor='#000'
          value={input}
          onChangeText={setInput}
        />
        <TouchableOpacity onPress={sendMessage} style={styles.sendButton}>
          <Ionicons name="send" size={22} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#eef1f5' },
  header: {
    backgroundColor: '#4A90E2',
    padding: 15,
    alignItems: 'center',
  },
  headerText: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  messagesList: { flex: 1, padding: 10 },
  messageBubble: {
    padding: 10,
    borderRadius: 12,
    marginBottom: 10,
    maxWidth: '75%',
  },
  myMessage: { backgroundColor: '#4A90E2', alignSelf: 'flex-end' },
  otherMessage: { backgroundColor: '#fff', alignSelf: 'flex-start', borderWidth: 1, borderColor: '#ddd' },
  messageText: { fontSize: 15, color: '#333' },
  inputContainer: {
    flexDirection: 'row',
    padding: 10,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  input: { flex: 1, fontSize: 16, padding: 10,    color:'#000'
 },
  sendButton: {
    backgroundColor: '#4A90E2',
    padding: 12,
    borderRadius: 30,
    marginLeft: 8,
  },
});