import React, { useState } from "react";
import API_BASE_URL from "../../utils/config";
import api from "../../utils/axiosApi";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import axios from "axios";

export default function ChatbotScreen() {
  const [messages, setMessages] = useState([
    { id: "1", text: "Bonjour 👋 Je suis ton assistant BudgetManager  virtuel. Comment puis-je t’aider gerer ton budget aujourd'hui ?", sender: "bot" },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  const sendMessage =async () => {
    if (!input.trim()) return;

    const userMessage = { id: Date.now().toString(), text: input, sender: "me" };
    console.log(input)
    const reponse= await api.post(`${API_BASE_URL}/loans/chatBot`,{
        message:input
    })
    console.log(reponse.data[0].reponse);
    setMessages((prev) => [...prev, userMessage]);
    setInput("");

    simulateBotResponse(reponse.data[0].reponse);
  };

  const simulateBotResponse = (fullText) => {
    setIsTyping(true);
    let index = 0;
    const botMessage = { id: Date.now().toString(), text: "", sender: "bot" };
    setMessages((prev) => [...prev, botMessage]);

    const interval = setInterval(() => {
      index++;
      if (index <= fullText.length) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === botMessage.id ? { ...msg, text: fullText.slice(0, index) } : msg
          )
        );
      } else {
        clearInterval(interval);
        setIsTyping(false);
      }
    }, 40); 
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.header}>
        <Ionicons name="chatbubble-ellipses" size={22} color="#fff" />
        <Text style={styles.headerText}>ChatBot</Text>
      </View>
      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        style={styles.messagesList}
        renderItem={({ item }) => (
          <View
            style={[
              styles.messageBubble,
              item.sender === "me" ? styles.myMessage : styles.botMessage,
            ]}
          >
            <Text
              style={[
                styles.messageText,
                item.sender === "me" ? styles.myMessageText : styles.botMessageText,
              ]}
            >
              {item.text}
            </Text>
          </View>
        )}
      />
      {isTyping && (
        <View style={styles.typing}>
          <Text style={{ color: "#777", fontStyle: "italic" }}>Le bot écrit...</Text>
        </View>
      )}

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Écrire un message..."
          value={input}
          onChangeText={setInput}
          placeholderTextColor={'black'}
        />
        <TouchableOpacity onPress={sendMessage} style={styles.sendButton}>
          <Ionicons name="send" size={22} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F2F5F9" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0D1B2A",
    padding: 15,
    justifyContent: "center",
  },
  headerText: { fontSize: 18, fontWeight: "bold", color: "#fff", marginLeft: 10 },
  messagesList: { flex: 1, padding: 10 },
  messageBubble: {
    padding: 12,
    borderRadius: 16,
    marginBottom: 10,
    maxWidth: "75%",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  myMessage: {
    backgroundColor: "#0D1B2A",
    alignSelf: "flex-end",
    borderBottomRightRadius: 4,
  },
  botMessage: {
    backgroundColor: "#fff",
    alignSelf: "flex-start",
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  messageText: { fontSize: 15 },
  myMessageText: { color: "#fff" },
  botMessageText: { color: "#333" },
  inputContainer: {
    flexDirection: "row",
    padding: 12,
    backgroundColor: "#fff",
    marginBottom:75,
    borderTopWidth: 1,
    borderColor: "#ddd",
    alignItems: "center",
  },
  input: { flex: 1, fontSize: 16, padding: 10, color:'#111' },
  sendButton: {
    backgroundColor: "#0D1B2A",
    padding: 12,
    borderRadius: 30,
    marginLeft: 8,
    
  },
  typing: {
    paddingHorizontal: 15,
    paddingBottom: 5,
  },
});